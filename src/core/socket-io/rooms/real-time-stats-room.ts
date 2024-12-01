import dayjs from "dayjs";
import { desc } from "drizzle-orm";
import cron from "node-cron";
import { Server } from "socket.io";
import { z } from "zod";
import db from "../../../db/index.js";
import { userTable } from "../../../db/schema.js";
import redis, { redisLock, redisSubscriber } from "../../../lib/redis.js";
import { sleepRpc } from "../../../lib/utils/sleep.js";
import getAta from "../../../lib/utils/solana/get-ata.js";
import Room from "./room.js";

const MAX_RICHEST = 10;
const MAX_NEWEST = 7;
const MAX_TOP_HOLDERS = 7;

/** NOTE
There is two types of possible logics applied here, for each data.

1. For data that must be refreshed upon action:
-> manually trigger fetchData somewhere in the backend app
-> fetchData will be done in this instance, then spread through the others through redis pub-sub
-> other instances will listen to the event and trigger updateData function

2. For data that must be refresh periodically:
-> every instance has a cronjob that the fetchData function and stores the result locally and on redis
-> inside the fetchData function, it will have a redis lock that will make it so data only has to be fetched by
   one instance, while others wait for the data

3. Exceptions:
-> top kazui holders
*/

type NewestAccountsData = {
  address: string | null;
  date: number;
}[];

const newestAccountsDataSchema = z
  .object({
    address: z.string().nullable(),
    date: z.number(),
  })
  .array();

type RichestData = {
  address: string | null;
  rubies: number;
}[];

const richestDataSchema = z
  .object({
    address: z.string().nullable(),
    rubies: z.number(),
  })
  .array();

type TopHoldersData = {
  address: string;
  kazui: number;
}[];

const topHoldersDataSchema = z
  .object({
    address: z.string(),
    kazui: z.number(),
  })
  .array();

class RealTimeStatsRoom {
  private room: Room;
  newestAccounts: {
    data: NewestAccountsData;
    lastUpdated: number | null;
  };
  richest: {
    data: RichestData;
    lastUpdated: number | null;
  };
  topHolders: {
    data: TopHoldersData;
    lastUpdated: number | null;
  };

  constructor(sv: Server) {
    this.room = new Room(sv, "real-time-stats");
    this.newestAccounts = {
      lastUpdated: null,
      data: [],
    };
    this.richest = {
      lastUpdated: null,
      data: [],
    };
    this.topHolders = {
      lastUpdated: null,
      data: [],
    };
  }

  // MARK: newest accounts
  // actually fetches the last newest accounts from database (also publishes on redis for subscribers)
  // you must lock redis manually from outside the function
  async fetchNewestAccountsData() {
    if (process.env.NODE_ENV !== "production")
      console.log("Updating real-time stats: newest accounts");
    const newestAccounts = await db
      .select({ address: userTable.address, date: userTable.created_at })
      .from(userTable)
      .orderBy(desc(userTable.created_at))
      .limit(MAX_NEWEST);

    this.newestAccounts.data = newestAccounts.map((data) => {
      return { ...data, date: new Date(data.date).getTime() };
    });
    this.newestAccounts.lastUpdated = new Date().getTime();

    redis.set(
      "rts:newest-accounts:last-update",
      JSON.stringify(this.newestAccounts.lastUpdated)
    );
    redis.set(
      "rts:newest-accounts:data",
      JSON.stringify(this.newestAccounts.data)
    );

    await redis.publish("subs:rts", "new-account");
  }

  // loads cached data from redis instance, or fetches if not available
  // then, emits the data to the client
  async updateNewestAccounts() {
    const done = await redisLock("lock:rts:newest-accounts");

    const lastUpdate = await redis
      .get("rts:newest-accounts:last-update")
      .then((data) =>
        z
          .number()
          .nullable()
          .parse(JSON.parse(data ?? "null"))
      )
      .catch(() => null);
    const currentData = await redis
      .get("rts:newest-accounts:data")
      .then((data) =>
        newestAccountsDataSchema.parse(JSON.parse(data ?? "null"))
      )
      .catch(() => null);

    if (lastUpdate && currentData) {
      this.newestAccounts.lastUpdated = lastUpdate;
      this.newestAccounts.data = currentData;
    } else {
      await this.fetchNewestAccountsData();
    }
    await done();

    this.room.emit("rts:newest-accounts", this.newestAccounts.data);
  }

  // MARK: richest
  // actually fetches the richest accounts from database (also publishes on redis for subscribers)
  async fetchRichestData(force?: boolean) {
    const done = await redisLock("cron:rts:richest");
    const lastUpdate = await redis
      .get("rts:richest:last-update")
      .then((data) =>
        z
          .number()
          .nullable()
          .parse(JSON.parse(data ?? "null"))
      )
      .catch(() => null);

    if (
      force ||
      (lastUpdate && dayjs(new Date()).diff(lastUpdate, "seconds") >= 15)
    ) {
      // This if condition, together with the lock, assure the data is only fetched by a single instance
      // of the server while the others just read the data from the redis instance
      if (process.env.NODE_ENV !== "production")
        console.log("Updating real-time stats: richest");
      const richest = await db
        .select({ address: userTable.address, rubies: userTable.rubies })
        .from(userTable)
        .orderBy(desc(userTable.rubies))
        .limit(MAX_RICHEST);

      this.richest.data = richest.map((data) => {
        return data;
      });
      this.richest.lastUpdated = new Date().getTime();

      redis.set(
        "rts:richest:last-update",
        JSON.stringify(this.richest.lastUpdated)
      );
      redis.set("rts:richest:data", JSON.stringify(this.richest.data));
    }
    await done();
  }

  // loads cached data from redis instance, or fetches if not available
  // then, emits the data to the client
  async updateRichest(forced?: boolean) {
    const done = await redisLock("lock:rts:richest");

    const lastUpdate = await redis
      .get("rts:richest:last-update")
      .then((data) =>
        z
          .number()
          .nullable()
          .parse(JSON.parse(data ?? "null"))
      )
      .catch(() => null);

    const currentData = await redis
      .get("rts:richest:data")
      .then((data) => richestDataSchema.parse(JSON.parse(data ?? "null")))
      .catch(() => null);

    if (!forced && lastUpdate && currentData) {
      this.richest.lastUpdated = lastUpdate;
      this.richest.data = currentData;
    } else {
      await this.fetchRichestData(forced);
    }
    await done();

    this.room.emit("rts:richest", this.newestAccounts.data);
  }

  // MARK: top holders
  // this function shall be triggered by a websocket client, and it competes with the cronjob
  // NOTE: despite competing with the cronjob, this one doesn't set the value "lastUpdated"
  async claimSpot(address: string) {
    if (process.env.NODE_ENV !== "production")
      console.log("Top holders spot is being claimed by:", address);
    const done = await redisLock("lock:rts:top-holders");

    const currentData = await redis
      .get("rts:top-holders:data")
      .then((data) => topHoldersDataSchema.parse(JSON.parse(data ?? "[]")))
      .catch(() => [] as TopHoldersData);

    const account = await getAta(address)
      .then((val) => val)
      .catch(() => null);

    let isUpdate = false;

    if (account === false) {
      const inLeaderboardIndex = currentData.findIndex(
        (val) => val.address === address
      );
      const inLeaderboard = inLeaderboardIndex !== -1;
      const leaderboardNotFull = currentData.length < MAX_TOP_HOLDERS;

      if (!inLeaderboard && leaderboardNotFull) {
        isUpdate = true;
        currentData.push({
          address: address,
          kazui: 0,
        });
      }
    }

    if (account) {
      // is it an update on the leaderboard?

      const inLeaderboardIndex = currentData.findIndex(
        (val) => val.address === address
      );
      const inLeaderboard = inLeaderboardIndex !== -1;
      const newBalance = Number(account.amount) / 1e9;
      const balanceUpdated = inLeaderboard
        ? currentData[inLeaderboardIndex].kazui !== newBalance
        : false;

      if (balanceUpdated) {
        isUpdate = true;
        currentData[inLeaderboardIndex].kazui = Number(account.amount) / 1e9;
      }
      if (!inLeaderboard) {
        isUpdate = true;
        currentData.push({
          address: address,
          kazui: Number(account.amount) / 1e9,
        });
      }
    }

    if (isUpdate) {
      currentData.sort((a, b) => b.kazui - a.kazui); // order descending
      currentData.slice(0, 50); // cap to 50 elements

      this.topHolders.data = currentData;

      redis.set("rts:top-holders:data", JSON.stringify(this.topHolders.data));

      await redis.publish("subs:rts", "topholders-update");
    }
    await done();
  }

  // shall be triggered by the cronjob
  async refreshTopholders(force: boolean = false) {
    if (process.env.NODE_ENV !== "production")
      console.log("Updating real-time stats: top-holders");
    // verify the top 5 accounts balance
    // re-sort the leaderboard
    // verify if there is anyone new in the top 5
    // if there is, check its balance and update it if needed and repeat the process until:
    // all the current people in top 5 have their balance fresh

    const done = await redisLock("lock:rts:top-holders");
    const currentData = await redis
      .get("rts:top-holders:data")
      .then((data) => topHoldersDataSchema.parse(JSON.parse(data ?? "[]")))
      .catch(() => [] as TopHoldersData);
    const lastUpdate = await redis
      .get("rts:top-holders:last-update")
      .then((data) =>
        z
          .number()
          .nullable()
          .parse(JSON.parse(data ?? "null"))
      )
      .catch(() => null);

    if (
      force ||
      (lastUpdate && dayjs(new Date()).diff(lastUpdate, "minutes") >= 5) ||
      !lastUpdate
    ) {
      // This if condition, together with the lock, assure the data is only fetched by a single instance
      // of the server while the others just read the data from the redis instance

      const freshBalances = new Set<string>();
      const topPositions = Math.min(currentData.length, MAX_TOP_HOLDERS);
      let allTopFresh = false;
      let attempts = 1;
      let failedDueToError = false;
      while (!allTopFresh && attempts < 5) {
        if (failedDueToError) {
          if (process.env.NODE_ENV !== "production")
            console.log("Trying again.");
          attempts++;
          failedDueToError = false;
        }
        try {
          const top = currentData.slice(0, topPositions);

          // go through top 5, update their balances
          for (const [index, holder] of top.entries()) {
            if (freshBalances.has(holder.address)) break; // no need to fetch if already fresh

            if (process.env.NODE_ENV !== "production")
              console.log("Trying to fetch ATA of", holder.address);

            const account = await getAta(holder.address);

            currentData[index].kazui = account
              ? Number(account.amount) / 1e9
              : 0;
            freshBalances.add(holder.address);

            await sleepRpc();
          }

          // re-sort
          currentData.sort((a, b) => b.kazui - a.kazui); // order descending
          // check if all top 5 are includd in freshBalances
          const newTop = currentData.slice(0, topPositions);
          allTopFresh = newTop.every((holder) =>
            freshBalances.has(holder.address)
          );
          // if allTopFresh was set to true, it means success refreshing leaderboard
        } catch (err) {
          if (process.env.NODE_ENV !== "production")
            console.log(
              "Failed refreshing leaderboard " +
                attempts +
                " time(s) due to error."
            );
          await sleepRpc();
        }
      }
      if (allTopFresh) {
        // update in reddis
        this.topHolders.data = currentData;
        this.topHolders.lastUpdated = new Date().getTime();
        redis.set(
          "rts:top-holders:last-update",
          JSON.stringify(this.topHolders.lastUpdated)
        );
        redis.set("rts:top-holders:data", JSON.stringify(this.topHolders.data));
        await this.updateTopHolders();
      }
      await done();
    }
  }

  // this shall be called by listening to subs:rts topholders-update event,
  // only after the values are already sent to redis. (therefore, after either claimSpot() or the cronjob)
  // redis lock key <lock:rts:top-holders> must be locked when this is called
  async updateTopHolders() {
    const lastUpdate = await redis
      .get("rts:top-holders:last-update")
      .then((data) =>
        z
          .number()
          .nullable()
          .parse(JSON.parse(data ?? "null"))
      )
      .catch(() => null);
    const currentData = await redis
      .get("rts:top-holders:data")
      .then((data) => topHoldersDataSchema.parse(JSON.parse(data ?? "null")))
      .catch(() => null);

    if (lastUpdate && currentData) {
      this.topHolders.data = currentData;
      this.topHolders.lastUpdated = lastUpdate;
      this.room.emit("rts:top-holders", this.topHolders.data);
    }
  }

  // MARK: Init
  async init() {
    // SECTION - init all the data on server start

    // first fill the object data
    const done = await redisLock("lock:rts:newest-accounts");
    await this.fetchNewestAccountsData();
    done();
    await this.updateNewestAccounts();
    await this.updateRichest(true);
    await this.refreshTopholders(true);

    // then subscribe to new updates by any instance of the application
    redisSubscriber.subscribe("subs:rts", (err, count) => {
      if (err) {
        console.error("Failed to subscribe: subs:rts", err);
        return;
      }
      console.log(`Subscribed to subs:rts. Listening for updates...`);
    });
    // on new updates, call update functions that will also emit to the fresh data to the client
    redisSubscriber.on("message", async (channel, message) => {
      if (channel === "subs:rts") {
        if (message === "new-account") this.updateNewestAccounts();
        if (message === "topholders-update") {
          const done = await redisLock("lock:rts:top-holders");
          this.updateTopHolders();
          await done();
        }
      }
    });

    // SECTION - setup cron jobs
    cron.schedule("0,15,30,45 * * * * *", async () => {
      // execute each 15 seconds
      await this.fetchRichestData();
      this.updateRichest();
    });
    cron.schedule("0,5,10,15,20,25,30,35,40,45,50,55 * * * *", async () => {
      // execute each 5 minutes
      await this.refreshTopholders();
    });
  }
}

export default RealTimeStatsRoom;

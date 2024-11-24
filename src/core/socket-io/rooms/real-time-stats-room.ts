import dayjs from "dayjs";
import { desc } from "drizzle-orm";
import cron from "node-cron";
import { Server } from "socket.io";
import { z } from "zod";
import db from "../../../db/index.js";
import { userTable } from "../../../db/schema.js";
import redis, { redisLock, redisSubscriber } from "../../../lib/redis.js";
import Room from "./room.js";

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
  }

  // actually fetches the last newest accounts from database (also publishes on redis for subscribers)
  // you must lock redis manually from outside the function
  async fetchNewestAccountsData() {
    if (process.env.NODE_ENV !== "production")
      console.log("Updating real-time stats: newest accounts");
    const newestAccounts = await db
      .select({ address: userTable.address, date: userTable.created_at })
      .from(userTable)
      .orderBy(desc(userTable.created_at))
      .limit(5);

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

  // actually fetches the richest accounts from database (also publishes on redis for subscribers)
  // you must lock redis manually from outside the function
  async fetchRichestData() {
    const done = await redisLock("cron:rts:richest");
    const lastUpdate = await redis
      .get("rts:newest-accounts:last-update")
      .then((data) =>
        z
          .number()
          .nullable()
          .parse(JSON.parse(data ?? "null"))
      )
      .catch(() => null);

    if (lastUpdate && dayjs(new Date()).diff(lastUpdate, "seconds") > 15) {
      // This if condition, together with the lock, assure the data is only fetched by a single instance
      // of the server while the others just read the data from the redis instance
      if (process.env.NODE_ENV !== "production")
        console.log("Updating real-time stats: richest");
      const richest = await db
        .select({ address: userTable.address, rubies: userTable.rubies })
        .from(userTable)
        .orderBy(desc(userTable.rubies))
        .limit(5);

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

  // loads cached data from redis instance, or fetches if not available
  // then, emits the data to the client
  async updateRichest() {
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

    if (lastUpdate && currentData) {
      this.richest.lastUpdated = lastUpdate;
      this.richest.data = currentData;
    } else {
      await this.fetchRichestData();
    }
    await done();

    this.room.emit("rts:richest", this.newestAccounts.data);
  }

  async init() {
    // SECTION - init all the data on server start

    // first fill the object data
    await this.updateNewestAccounts();
    await this.updateRichest();

    // then subscribe to new updates by any instance of the application
    redisSubscriber.subscribe("subs:rts", (err, count) => {
      if (err) {
        console.error("Failed to subscribe: subs:rts", err);
        return;
      }
      console.log(`Subscribed to subs:rts. Listening for updates...`);
    });
    // on new updates, call update functions that will also emit to the fresh data to the client
    redisSubscriber.on("message", (channel, message) => {
      if (channel === "subs:rts") {
        if (message === "new-account") this.updateNewestAccounts();
      }
    });

    // SECTION - setup cron jobs
    cron.schedule("0,15,30,45 * * * * *", async () => {
      // execute each 15 seconds
      await this.fetchRichestData();
      this.updateRichest();
    });
  }
}

export default RealTimeStatsRoom;

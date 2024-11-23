import { desc } from "drizzle-orm";
import { Server } from "socket.io";
import { z } from "zod";
import db from "../../../db/index.js";
import { userTable } from "../../../db/schema.js";
import redis, { redisLock, redisSubscriber } from "../../../lib/redis.js";
import Room from "./room.js";

const dataSchema = z
  .object({
    address: z.string().nullable(),
    date: z.number(),
  })
  .array();

class RealTimeStatsRoom {
  private room: Room;
  newestAccounts: {
    data: {
      address: string | null;
      date: number;
    }[];
    lastUpdated: number | null;
  };

  constructor(sv: Server) {
    this.room = new Room(sv, "real-time-stats");
    this.newestAccounts = {
      lastUpdated: null,
      data: [],
    };
  }

  // actually fetches the last newest accounts from database (also publishes on redis for subscribers)
  // you must lock redis manually from outside the function
  async fetchData() {
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
      .then((data) => dataSchema.parse(JSON.parse(data ?? "null")))
      .catch(() => null);

    if (lastUpdate && currentData) {
      this.newestAccounts.lastUpdated = lastUpdate;
      this.newestAccounts.data = currentData;
    } else {
      await this.fetchData();
    }
    await done();

    this.room.emit("rts:newest-accounts", this.newestAccounts.data);
  }

  async init() {
    // first fill the object data
    await this.updateNewestAccounts();

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
      if (channel === "subs:rts" && message === "new-account") {
        this.updateNewestAccounts();
      }
    });
  }
}

export default RealTimeStatsRoom;

import { Redis } from "ioredis";
import redisClient from "redis";
import redisLockLib from "redis-lock";

// normal redis instance that will be used only for locks
const client = redisClient.createClient({
  url: "redis://" + process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  database: process.env.NODE_ENV === "production" ? 0 : 15,
});

// ioredis
const redis = new Redis({
  host: process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  db: process.env.NODE_ENV === "production" ? 0 : 15,
  // maxRetriesPerRequest: 0, // NOTE: read: https://github.com/redis/ioredis/issues/1686#issuecomment-1335957159
});

// ioredis
export const redisSubscriber = new Redis({
  host: process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  db: process.env.NODE_ENV === "production" ? 0 : 15,
  // maxRetriesPerRequest: 0, // NOTE: read: https://github.com/redis/ioredis/issues/1686#issuecomment-1335957159
});

export const redisLock = redisLockLib(client);
client
  .on("error", (err) =>
    console.log("Redis Lock Client Error:", err.message ? err.message : err)
  )
  .connect();

export default redis;

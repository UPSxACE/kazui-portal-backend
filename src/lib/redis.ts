import { Redis } from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  db: process.env.NODE_ENV === "production" ? 0 : 15,
  maxRetriesPerRequest: 0, // NOTE: read: https://github.com/redis/ioredis/issues/1686#issuecomment-1335957159
});

export default redis;

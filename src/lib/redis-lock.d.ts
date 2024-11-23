declare module "redis-lock" {
  import redisClient from "redis";

  export default function redisLock(
    client: ReturnType<typeof redisClient.createClient>
  ): RedisLock;

  type Done = () => Promise<void>;

  type RedisLock = (key: string) => Promise<Done>;
}

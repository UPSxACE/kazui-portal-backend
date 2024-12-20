import { and, eq } from "drizzle-orm";
import { z } from "zod";
import createRouter from "../core/create-router.js";
import { realTimeStatsRoom } from "../core/socket-io/socket-io.js";
import db from "../db/index.js";
import { uploadTable, userTable } from "../db/schema.js";
import { redisLock } from "../lib/redis.js";

function sliceBaseUrl(url: string) {
  return url.slice(process.env.BASE_URL?.length);
}

const userRouter = {
  private: createRouter(),
  public: createRouter(),
};

userRouter.private.get("/", async (req, res) => {
  const address = req.user!.address;

  const user = await db
    .select({
      username: userTable.username,
      nickname: userTable.nickname,
      address: userTable.address,
      picture: userTable.picture,
      rubies: userTable.rubies,
      interaction_points: userTable.interaction_points,
      banned_at: userTable.banned_at,
      banned_fee_kazui: userTable.banned_fee_kazui,
      banned_fee_sol: userTable.banned_fee_sol,
      banned_reason: userTable.banned_reason,
      banned_until: userTable.banned_until,
      permissions: userTable.permissions,
    })
    .from(userTable)
    .where(eq(userTable.address, address))
    .limit(1)
    .then((users) => {
      return users.length > 0 ? users[0] : null;
    });

  if (!user) {
    res.send(false);
    return;
  }

  res.send(user);
});

userRouter.private.post("/create-profile", async (req, res, next) => {
  const address = req.user!.address;

  // check if user already has profile
  const [user] = await db
    .select({
      username: userTable.username,
      nickname: userTable.nickname,
      address: userTable.address,
      picture: userTable.picture,
      rubies: userTable.rubies,
      interaction_points: userTable.interaction_points,
      banned_at: userTable.banned_at,
      banned_fee_kazui: userTable.banned_fee_kazui,
      banned_fee_sol: userTable.banned_fee_sol,
      banned_reason: userTable.banned_reason,
      banned_until: userTable.banned_until,
      permissions: userTable.permissions,
    })
    .from(userTable)
    .where(eq(userTable.address, address))
    .limit(1);

  if (user) {
    next("FORBIDDEN");
    return;
  }

  const { success, data, error } = z
    .object({
      username: z
        .string()
        .min(2)
        .max(15)
        .regex(/^[a-zA-Z0-9]?([a-z0-9_.-]*[a-z0-9])?$/), //FIXME
      nickname: z.string(),
      picture: z.string(),
    })
    .safeParse(req.body);

  if (!success) {
    res.status(400).send(error);
    return;
  }

  const userUploadPath =
    process.env.BASE_URL + "/uploads/" + req.user!.address + "/";
  const validImagePath =
    data.picture.startsWith("/") || data.picture.startsWith(userUploadPath);
  if (!validImagePath) {
    res.status(400).send(error);
    return;
  }

  await db.transaction(async (tx) => {
    const customPicture = data.picture.startsWith(userUploadPath);
    if (customPicture) {
      const [upload] = await tx
        .select()
        .from(uploadTable)
        .where(
          and(
            eq(uploadTable.owner_address, req.user!.address),
            eq(uploadTable.path, sliceBaseUrl(data.picture))
          )
        );

      if (!upload) {
        // image doesnt exist
        res.status(400).send(error);
        tx.rollback();
        return;
      }
      if (upload) {
        // update
        await tx
          .update(uploadTable)
          .set({
            used_in: "profile_picture",
          })
          .where(
            and(
              eq(uploadTable.owner_address, req.user!.address),
              eq(uploadTable.path, sliceBaseUrl(data.picture))
            )
          );
      }
    }

    await tx.insert(userTable).values({ address, rubies: 20, ...data });
    const done = await redisLock("lock:rts:newest-accounts");
    await realTimeStatsRoom?.fetchNewestAccountsData();
    await done();
    res.status(200).send(true);
  });
});

userRouter.public.get("/profile", async (req, res) => {
  const { success, data, error } = z
    .object({
      address: z.string(),
    })
    .safeParse(req.query);

  if (!success) {
    res.status(400).send("Bad Request");
    return;
  }

  const [user] = await db
    .select({
      username: userTable.username,
      nickname: userTable.nickname,
      address: userTable.address,
      picture: userTable.picture,
      rubies: userTable.rubies,
      interaction_points: userTable.interaction_points,
      created_at: userTable.created_at,
    })
    .from(userTable)
    .where(eq(userTable.address, data.address))
    .limit(1);

  if (!user) {
    res.status(404).send("Not Found");
    return;
  }

  res.status(200).send(user);
});

export default userRouter;

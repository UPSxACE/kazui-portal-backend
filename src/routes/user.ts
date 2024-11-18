import { eq } from "drizzle-orm";
import { z } from "zod";
import createRouter from "../core/create-router.js";
import db from "../db/index.js";
import { uploadTable, userTable } from "../db/schema.js";

const userRouter = createRouter();

userRouter.get("/", async (req, res) => {
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

userRouter.post("/create-profile", async (req, res, next) => {
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
      username: z.string(), //FIXME
      nickname: z.string(),
      picture: z.string(),
    })
    .safeParse(req.body);

  if (!success) {
    res.status(400).send(error);
    return;
  }

  const validImagePath =
    data.picture.startsWith("/") ||
    data.picture.startsWith(process.env.BASE_URL ?? "");
  if (!validImagePath) {
    res.status(400).send(error);
    return;
  }

  await db.transaction(async (tx) => {
    const customPicture = data.picture.startsWith(process.env.BASE_URL ?? "");
    if (customPicture) {
      await tx.insert(uploadTable).values({
        owner_address: req.user!.address,
        path: data.picture,
        used_in: "profile_picture",
      });
    }
    // TODO: check query result!
    await tx.insert(userTable).values({ address, ...data });
  });

  res.status(200).send(true);
});

export default userRouter;

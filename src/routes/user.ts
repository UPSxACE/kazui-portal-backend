import { and, eq } from "drizzle-orm";
import { z } from "zod";
import createRouter from "../core/create-router.js";
import db from "../db/index.js";
import { uploadTable, userTable } from "../db/schema.js";

function sliceBaseUrl(url: string) {
  return url.slice(process.env.BASE_URL?.length);
}

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

  const userUploadPath =
    process.env.BASE_URL + "/uploads/" + req.user!.address + "/";
  const validImagePath =
    data.picture.startsWith("/") || data.picture.startsWith(userUploadPath);
  if (!validImagePath) {
    res.status(400).send(error);
    return;
  }

  await db
    .transaction(async (tx) => {
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

      await tx.insert(userTable).values({ address, ...data });
      res.status(200).send(true);
    })
    .catch((e) => {
      console.log("Error: ", e?.message);
    });
});

export default userRouter;

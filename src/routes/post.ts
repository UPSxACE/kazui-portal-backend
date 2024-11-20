import { and, desc, eq, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import createRouter from "../core/create-router.js";
import db from "../db/index.js";
import {
  postImageTable,
  postTable,
  uploadTable,
  userTable,
} from "../db/schema.js";
import cursorEncoding from "../lib/utils/cursor-encoding.js";
import unifyOwner from "../lib/utils/unify-owner.js";

function sliceBaseUrl(url: string) {
  return url.slice(process.env.BASE_URL?.length);
}

const postRouter = {
  private: createRouter(),
  public: createRouter(),
};

postRouter.public.get("/", async (req, res) => {
  const cursorSchema = z.object({
    date: z.string().refine((data) => !isNaN(new Date(data).getTime())),
    id: z.number().int(),
  });
  const cursor = await z
    .string()
    .parseAsync(req.query.cursor)
    .catch((e) => null)
    .then(async (data) => {
      if (data) {
        return cursorEncoding.decode(cursorSchema, data);
      }
      return null;
    })
    .catch((e) => null);

  const limit = 10;
  const posts = await db.query.postTable
    .findMany({
      orderBy: [desc(postTable.created_at), desc(postTable.id)],
      columns: {
        id: true,
        comments_count: true,
        created_at: true,
        likes_count: true,
        text: true,
        views_count: true,
      },
      limit: limit + 1,
      with: {
        images: {
          columns: {
            path: true,
          },
        },
        owner_address: {
          columns: {
            address: true,
            nickname: true,
            username: true,
            picture: true,
          },
        },
        owner_id: {
          columns: {
            address: true,
            nickname: true,
            username: true,
            picture: true,
          },
        },
      },
      where: cursor
        ? and(
            isNull(postTable.deleted_at),
            // created_at, id < date, id
            or(
              lte(postTable.created_at, cursor.date),
              and(
                eq(postTable.created_at, cursor.date),
                lte(postTable.id, cursor.id)
              )
            )
          )
        : undefined,
    })
    .then((data) => data.map((post) => unifyOwner(post)));

  const nextPagePost = posts.length > limit ? posts[posts.length - 1] : null;
  const newCursor = nextPagePost
    ? { date: nextPagePost.created_at, id: nextPagePost.id }
    : null;
  if (newCursor) {
    res.setHeader("X-Cursor", cursorEncoding.encode(cursorSchema, newCursor));
  }

  res.status(200).send(posts.length > limit ? posts.slice(0, -1) : posts);
});

postRouter.private.post("/", async (req, res) => {
  const { success, data, error } = z
    .object({
      text: z.string().optional(),
      picture: z.string(),
    })
    .or(
      z.object({
        text: z.string(),
        picture: z.string().optional(),
      })
    )
    .safeParse(req.body);

  if (!success) {
    res.status(400).send(error);
    return;
  }

  const jwtUser = req.user;
  await db
    .transaction(async (tx) => {
      // check if user profile exists
      const [user] = await tx
        .select({ address: userTable.address })
        .from(userTable)
        .where(eq(userTable.address, jwtUser!.address));

      if (!user) {
        res.status(400).send("Bad Request");
        return;
      }

      // create post
      const [post] = await tx
        .insert(postTable)
        .values({
          owner_address: jwtUser?.address,
          text: data.text,
        })
        .returning({ id: postTable.id });

      if (data.picture) {
        // validate image path
        const userUploadPath =
          process.env.BASE_URL + "/uploads/" + jwtUser!.address + "/";
        const validImagePath =
          data.picture.startsWith("/") ||
          data.picture.startsWith(userUploadPath);
        if (!validImagePath) {
          res.status(400).send(error);
          tx.rollback();
          return;
        }
        const customPicture = data.picture.startsWith(userUploadPath);
        if (customPicture) {
          // if custom, make sure to register upload/is already registered
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
                used_in: "post",
              })
              .where(
                and(
                  eq(uploadTable.owner_address, req.user!.address),
                  eq(uploadTable.path, sliceBaseUrl(data.picture))
                )
              );
          }
        }

        // create post_image entry in database that links image to post
        await tx
          .insert(postImageTable)
          .values({ path: data.picture, post_id: post.id });

        res.status(200).send(true);
      }
    })
    .catch((e) => {
      console.log("Error: ", e?.message);
    });
});

export default postRouter;

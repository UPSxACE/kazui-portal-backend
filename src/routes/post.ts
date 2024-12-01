import dayjs from "dayjs";
import { and, desc, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import createRouter from "../core/create-router.js";
import db from "../db/index.js";
import {
  postCommentTable,
  postImageTable,
  postLikeTable,
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

  const data = posts.length > limit ? posts.slice(0, -1) : posts;

  if (req.user) {
    const ids = posts.map((p) => p.id);
    const likes = await db.query.postLikeTable
      .findMany({
        columns: { post_id: true },
        where: and(
          eq(postLikeTable.owner_address, req.user.address),
          inArray(postLikeTable.post_id, ids)
        ),
      })
      .then((x) => x.map((like) => like.post_id));
    const dataWithLikes = data.map((data) => {
      return { ...data, liked: likes.includes(data.id) };
    });

    res.status(200).send(dataWithLikes);
    return;
  }

  res.status(200).send(data);
});

postRouter.public.get("/:id", async (req, res) => {
  const param = z.number().safeParse(Number(req.params?.id));

  if (!param.success || param.data < 1) {
    res.status(400).send("Bad Request");
    return;
  }

  const postId = param.data;

  const query = z
    .object({
      comments: z.string().optional(),
    })
    .optional()
    .nullable()
    .safeParse(req.query);

  const comments = query.data?.comments === "true" ? true : false;

  const post = await db.query.postTable
    .findFirst({
      orderBy: [desc(postTable.created_at), desc(postTable.id)],
      columns: {
        id: true,
        comments_count: true,
        created_at: true,
        likes_count: true,
        text: true,
        views_count: true,
      },
      with: {
        comments: comments
          ? {
              orderBy: [
                desc(postCommentTable.created_at),
                desc(postCommentTable.id),
              ],
              columns: {
                id: true,
                created_at: true,
                text: true,
              },
              with: {
                owner_address: {
                  columns: {
                    address: true,
                    picture: true,
                    username: true,
                    nickname: true,
                  },
                },
                owner_id: {
                  columns: {
                    address: true,
                    picture: true,
                    username: true,
                    nickname: true,
                  },
                },
              },
            }
          : undefined,
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
      where: eq(postTable.id, postId),
    })
    .then((post) => {
      if (!post) return null;

      const postUnified = unifyOwner(post);

      // FIXME - Waiting for drizzle types on conditional queries bug to be fixed - https://github.com/drizzle-team/drizzle-orm/issues/824
      type CommentsTypeFixed = (Omit<
        (typeof postUnified.comments)[0],
        "owner_address" | "owner_id"
      > & {
        owner_address: {
          address: string;
          username: string;
          nickname: string;
          picture: string | null;
        } | null;
        owner_id: {
          address: string;
          username: string;
          nickname: string;
          picture: string | null;
        } | null;
      })[];

      return {
        ...postUnified,
        comments: (postUnified.comments as CommentsTypeFixed | undefined)
          ? (postUnified.comments as CommentsTypeFixed).map((comment) =>
              unifyOwner(comment)
            )
          : undefined,
      };
    });

  if (!post) {
    res.status(404).send("Not Found.");
    return;
  }

  if (req.user) {
    const like = await db.query.postLikeTable.findFirst({
      where: and(
        eq(postLikeTable.post_id, postId),
        eq(postLikeTable.owner_address, req.user.address)
      ),
    });

    res.status(200).send({ ...post, liked: Boolean(like) });
    return;
  }

  res.status(200).send(post);
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

      // FIXME - daily mission
      const lastPost = await tx.query.postTable.findFirst({
        where: eq(postTable.owner_address, user.address),
        orderBy: [desc(postTable.created_at)],
      });
      const today = new Date();
      if (
        !lastPost ||
        dayjs(lastPost.created_at).day() !== dayjs(today).day()
      ) {
        const userAcc = await db.query.userTable.findFirst({
          where: eq(userTable.address, user.address),
        });
        if (userAcc) {
          // reward first post of the day
          await tx
            .update(userTable)
            .set({ rubies: userAcc.rubies + 10 })
            .where(eq(userTable.id, userAcc.id));
        }
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
      }
      res.status(200).send(true);
    })
    .catch((e) => {
      console.log("Error: ", e?.message);
      throw e;
    });
});

postRouter.private.post("/:id/comment", async (req, res) => {
  const param = z.number().safeParse(Number(req.params?.id));

  if (!param.success || param.data < 1) {
    res.status(400).send("Bad Request");
    return;
  }

  const postId = param.data;

  const { success, data, error } = z
    .object({
      text: z.string(),
    })
    .safeParse(req.body);

  if (!success) {
    res.status(400).send(error);
    return;
  }

  const post = await db.query.postTable.findFirst({
    where: eq(postTable.id, postId),
  });
  if (!post) {
    res.status(400).send("Bad Request.");
    return;
  }

  const jwtUser = req.user;
  await db
    .transaction(async (tx) => {
      // check if user profile exists
      const [user] = await tx
        .select({
          address: userTable.address,
          id: userTable.id,
          rubies: userTable.rubies,
        })
        .from(userTable)
        .where(eq(userTable.address, jwtUser!.address));

      if (!user) {
        res.status(400).send("Bad Request.");
        return;
      }

      const post = await tx.query.postTable.findFirst({
        where: eq(postTable.id, postId),
      });

      if (!post) {
        res.status(400).send("Bad Request.");
        return;
      }

      // FIXME - daily mission
      const lastComment = await tx.query.postCommentTable.findFirst({
        with: {
          post: true,
        },
        where: and(
          eq(postCommentTable.owner_address, user.address),
          eq(postCommentTable.post_id, post.id),
          ne(postTable.owner_address, user.address) // TODO: owner_id situation
        ),
        orderBy: [desc(postCommentTable.created_at)],
      });
      const today = new Date();
      if (
        post.owner_address !== user.address &&
        (!lastComment ||
          dayjs(lastComment.created_at).day() !== dayjs(today).day())
      ) {
        // reward first comment of the day
        await tx
          .update(userTable)
          .set({ rubies: user.rubies + 5 })
          .where(eq(userTable.id, user.id));
      }

      await tx
        .update(postTable)
        .set({
          comments_count: post.comments_count + 1,
        })
        .where(eq(postTable.id, post.id));

      // create post comment
      await tx.insert(postCommentTable).values({
        post_id: post.id,
        owner_address: jwtUser!.address,
        text: data.text,
      });

      res.status(200).send(true);
    })
    .catch((e) => {
      console.log("Error: ", e?.message);
      throw e;
    });
});

postRouter.private.post("/:id/like", async (req, res) => {
  const param = z.number().safeParse(Number(req.params?.id));

  if (!param.success || param.data < 1) {
    res.status(400).send("Bad Request");
    return;
  }

  const postId = param.data;
  const userAddress = req.user!.address;

  db.transaction(async (tx) => {
    const like = await tx.query.postLikeTable.findFirst({
      where: and(
        eq(postLikeTable.post_id, postId),
        eq(postLikeTable.owner_address, userAddress)
      ),
    });

    if (!like) {
      const post = await tx.query.postTable.findFirst({
        where: eq(postTable.id, postId),
      });
      if (!post) {
        res.status(400).send("Bad Request.");
        return;
      }
      await tx.insert(postLikeTable).values({
        post_id: postId,
        owner_address: userAddress,
      });
      await tx
        .update(postTable)
        .set({
          likes_count: post.likes_count + 1,
        })
        .where(eq(postTable.id, post.id));
    }

    res.send(true);
    return;
  });
});

postRouter.private.post("/:id/dislike", async (req, res) => {
  const param = z.number().safeParse(Number(req.params?.id));

  if (!param.success || param.data < 1) {
    res.status(400).send("Bad Request");
    return;
  }

  const postId = param.data;
  const userAddress = req.user!.address;

  db.transaction(async (tx) => {
    const like = await tx.query.postLikeTable.findFirst({
      where: and(
        eq(postLikeTable.post_id, postId),
        eq(postLikeTable.owner_address, userAddress)
      ),
    });

    if (like) {
      const post = await tx.query.postTable.findFirst({
        where: eq(postTable.id, postId),
      });
      if (!post) {
        res.status(400).send("Bad Request.");
        return;
      }
      await tx
        .delete(postLikeTable)
        .where(
          and(
            eq(postLikeTable.post_id, postId),
            eq(postLikeTable.owner_address, userAddress)
          )
        );
      await tx
        .update(postTable)
        .set({
          likes_count: post.likes_count - 1,
        })
        .where(eq(postTable.id, post.id));
    }

    res.send(true);
    return;
  });
});

export default postRouter;

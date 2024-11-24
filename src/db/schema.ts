import { relations, sql } from "drizzle-orm";
import {
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// FIXME make sure all search/get API methods don't return things when deleted_at is set
// FIXME sort _ indexes

// MARK: Tables
export const userTable = pgTable(
  "user",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    updated_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull()
      .$onUpdate(() => sql`(now() AT TIME ZONE 'utc'::text)`),
    deleted_at: timestamp({ withTimezone: true, mode: "string" }),
    address: text().notNull(),
    username: text().notNull(),
    nickname: text().notNull(),
    picture: text(),
    rubies: integer().default(0).notNull(),
    interaction_points: integer().default(0).notNull(),
    last_active: timestamp({ withTimezone: true, mode: "string" }),
    telegram_id: integer(),
    permissions: integer().default(0).notNull(),
    banned_at: timestamp({ withTimezone: true, mode: "string" }),
    banned_until: timestamp({ withTimezone: true, mode: "string" }),
    banned_reason: text(),
    banned_fee_kazui: decimal(),
    banned_fee_sol: decimal(),
  },
  (table) => [
    index("user_address_idx").on(table.address),
    index("user_username_idx").on(table.username),
    index("user_nickname_idx").on(table.nickname),
    index("user_rubies_idx").on(table.rubies),
    index("user_interaction_points_idx").on(table.interaction_points),
    index("user_telegram_id_idx").on(table.telegram_id),
    index("user_created_at_idx").on(table.created_at),
    index("user_deleted_at_idx").on(table.deleted_at),
  ]
);

export const uploadTable = pgTable(
  "upload",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    owner_id: integer(),
    owner_address: text(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    updated_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull()
      .$onUpdate(() => sql`(now() AT TIME ZONE 'utc'::text)`),
    deleted_at: timestamp({ withTimezone: true, mode: "string" }),
    path: text().notNull(),
    used_in: text(),
  },
  (table) => [
    index("upload_owner_id_idx").on(table.owner_id),
    index("upload_owner_address_idx").on(table.owner_address),
    index("upload_path_idx").on(table.path),
    index("upload_used_in_idx").on(table.used_in),
  ]
);

export const postTable = pgTable(
  "post",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    owner_id: integer(),
    owner_address: text(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    updated_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull()
      .$onUpdate(() => sql`(now() AT TIME ZONE 'utc'::text)`),
    deleted_at: timestamp({ withTimezone: true, mode: "string" }),
    text: text(),
    likes_count: integer().default(0).notNull(),
    views_count: integer().default(0).notNull(),
    comments_count: integer().default(0).notNull(),
  },
  (table) => [
    index("post_owner_id_idx").on(table.owner_id),
    index("post_owner_address_idx").on(table.owner_address),
    index("post_created_at_idx").on(table.created_at),
    index("post_deleted_at_idx").on(table.deleted_at),
    index("post_likes_count_idx").on(table.likes_count),
    index("post_views_count_idx").on(table.views_count),
    index("post_comments_count_idx").on(table.comments_count),
    index("post_text_idx").on(table.text),
  ]
);

export const postImageTable = pgTable(
  "post_image",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    post_id: integer().notNull(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    updated_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull()
      .$onUpdate(() => sql`(now() AT TIME ZONE 'utc'::text)`),
    deleted_at: timestamp({ withTimezone: true, mode: "string" }),
    path: text().notNull(),
  },
  (table) => [
    index("post_image_post_id_idx").on(table.post_id),
    index("post_image_created_at_idx").on(table.created_at),
    index("post_image_deleted_at_idx").on(table.deleted_at),
    index("post_image_path_idx").on(table.path),
  ]
);

export const postCommentTable = pgTable(
  "post_comment",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    post_id: integer(),
    owner_id: integer(),
    owner_address: text(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    updated_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull()
      .$onUpdate(() => sql`(now() AT TIME ZONE 'utc'::text)`),
    deleted_at: timestamp({ withTimezone: true, mode: "string" }),
    text: text(),
  },
  (table) => [
    index("post_comment_owner_id_idx").on(table.owner_id),
    index("post_comment_owner_address_idx").on(table.owner_address),
    index("post_comment_created_at_idx").on(table.created_at),
    index("post_comment_deleted_at_idx").on(table.deleted_at),
    index("post_comment_text_idx").on(table.text),
  ]
);

export const postCommentImageTable = pgTable(
  "post_comment_image",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    post_comment_id: integer().notNull(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    updated_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull()
      .$onUpdate(() => sql`(now() AT TIME ZONE 'utc'::text)`),
    deleted_at: timestamp({ withTimezone: true, mode: "string" }),
    path: text().notNull(),
  },
  (table) => [
    index("post_comment_image_post_comment_id_idx").on(table.post_comment_id),
    index("post_comment_image_created_at_idx").on(table.created_at),
    index("post_comment_image_deleted_at_idx").on(table.deleted_at),
    index("post_comment_image_path_idx").on(table.path),
  ]
);
export const postViewTable = pgTable(
  "post_view",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    post_id: integer().notNull(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    owner_address: text(),
    owner_id: integer(),
  },
  (table) => [
    index("post_view_created_at_idx").on(table.created_at),
    index("post_view_post_id_idx").on(table.post_id),
    index("post_view_owner_address_idx").on(table.owner_address),
    index("post_view_owner_id_idx").on(table.owner_id),
  ]
);
export const postLikeTable = pgTable(
  "post_like",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    post_id: integer().notNull(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    owner_address: text(),
    owner_id: integer(),
  },
  (table) => [
    index("post_like_created_at_idx").on(table.created_at),
    index("post_like_post_id_idx").on(table.post_id),
    index("post_like_owner_address_idx").on(table.owner_address),
    index("post_like_owner_id_idx").on(table.owner_id),
  ]
);
export const postCommentLikeTable = pgTable(
  "post_comment_like",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    post_comment_id: integer().notNull(),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`(now() AT TIME ZONE 'utc'::text)`)
      .notNull(),
    owner_address: text(),
    owner_id: integer(),
  },
  (table) => [
    index("post_comment_like_created_at_idx").on(table.created_at),
    index("post_comment_like_post_comment_id_idx").on(table.post_comment_id),
    index("post_comment_like_owner_address_idx").on(table.owner_address),
    index("post_comment_like_owner_id_idx").on(table.owner_id),
  ]
);

// MARK: Relations
export const userRelations = relations(userTable, ({ many }) => {
  return {
    posts_by_id: many(postTable, {
      relationName: "posts_by_id",
    }),
    posts_by_address: many(postTable, {
      relationName: "posts_by_address",
    }),
    // posts_by_id: many(postTable),
    // posts_by_address: many(postTable),
  };
});
export const postRelations = relations(postTable, ({ one, many }) => {
  return {
    owner_id: one(userTable, {
      fields: [postTable.owner_id],
      references: [userTable.id],
      relationName: "posts_by_id",
    }),
    owner_address: one(userTable, {
      fields: [postTable.owner_address],
      references: [userTable.address],
      relationName: "posts_by_address",
    }),
    images: many(postImageTable),
    likes: many(postLikeTable),
    views: many(postViewTable),
    comments: many(postCommentTable),
  };
});
export const postImageRelations = relations(postImageTable, ({ one }) => {
  return {
    post: one(postTable, {
      fields: [postImageTable.post_id],
      references: [postTable.id],
    }),
  };
});
export const postLikeRelations = relations(postLikeTable, ({ one }) => {
  return {
    post: one(postTable, {
      fields: [postLikeTable.post_id],
      references: [postTable.id],
    }),
  };
});
export const postViewRelations = relations(postViewTable, ({ one }) => {
  return {
    post: one(postTable, {
      fields: [postViewTable.post_id],
      references: [postTable.id],
    }),
  };
});
export const postCommentRelations = relations(
  postCommentTable,
  ({ one, many }) => {
    return {
      post: one(postCommentTable, {
        fields: [postCommentTable.post_id],
        references: [postCommentTable.id],
      }),
      likes: many(postCommentLikeTable),
      images: many(postCommentImageTable),
    };
  }
);
export const postCommentImageRelations = relations(
  postCommentImageTable,
  ({ one }) => {
    return {
      comment: one(postCommentTable, {
        fields: [postCommentImageTable.post_comment_id],
        references: [postCommentTable.id],
      }),
    };
  }
);
export const postCommentLikeRelations = relations(
  postCommentLikeTable,
  ({ one }) => {
    return {
      comment: one(postCommentTable, {
        fields: [postCommentLikeTable.post_comment_id],
        references: [postCommentTable.id],
      }),
    };
  }
);

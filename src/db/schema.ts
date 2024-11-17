import { sql } from "drizzle-orm";
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
    last_login_reward: timestamp({ withTimezone: true, mode: "string" }),
    telegram_id: integer(),
    permissions: integer().default(0).notNull(),
    banned_at: timestamp({ withTimezone: true, mode: "string" }),
    banned_until: timestamp({ withTimezone: true, mode: "string" }),
    banned_reason: text(),
    banned_fee_kazui: decimal(),
    banned_fee_sol: decimal(),
  },
  (table) => [
    index("address_idx").on(table.address),
    index("username_idx").on(table.username),
    index("nickname_idx").on(table.nickname),
    index("rubies_idx").on(table.rubies),
    index("interaction_points_idx").on(table.interaction_points),
    index("telegram_id_idx").on(table.telegram_id),
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
    index("owner_id_idx").on(table.owner_id),
    index("owner_address_idx").on(table.owner_address),
    index("path_idx").on(table.path),
    index("used_in_idx").on(table.used_in),
  ]
);

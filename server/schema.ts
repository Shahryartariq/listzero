/**
 * Database tables.
 *
 * The first block is what Better Auth needs (users, sessions, sign-in methods, two-factor,
 * passkeys, rate limits); property names must stay as they are because Better Auth looks them up
 * by name. The second block is Listzero's own: each signed-in person's tasks and lists.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () =>
  uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey();

export const user = pgTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // username plugin
  username: text("username").unique(),
  displayUsername: text("display_username"),
  // two-factor plugin
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  // admin plugin
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: id(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: id(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (table) => [index("two_factor_secret_idx").on(table.secret), index("two_factor_user_id_idx").on(table.userId)],
);

export const passkey = pgTable(
  "passkey",
  {
    id: id(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at"),
    aaguid: text("aaguid"),
  },
  (table) => [index("passkey_user_id_idx").on(table.userId), index("passkey_credential_id_idx").on(table.credentialID)],
);

export const rateLimit = pgTable("rate_limit", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------- Listzero's own

/**
 * One row per signed-in person: the number of the last change made to their data.
 * Locking this row is what makes two devices syncing at once take turns.
 */
export const syncState = pgTable("sync_state", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  rev: bigint("rev", { mode: "number" }).notNull().default(0),
});

/**
 * A task or a list. `data` is the item as the app stores it; a deleted item keeps its row with
 * `deleted` set, so other devices learn that it is gone. `rev` is the change number it was last
 * written at: a device asks for everything after the number it last saw.
 */
export const syncItem = pgTable(
  "sync_item",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    itemId: text("item_id").notNull(),
    data: jsonb("data"),
    deleted: boolean("deleted").notNull().default(false),
    rev: bigint("rev", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.kind, table.itemId] }),
    index("sync_item_user_rev_idx").on(table.userId, table.rev),
  ],
);

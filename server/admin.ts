/**
 * What the admin panel shows. Only signed-in admins get here: server/app.ts answers everyone else
 * with the same 404 as an address that doesn't exist. Admins see who has an account, when they were
 * last here and how they sign in, never what is in anyone's tasks or lists (counts only).
 *
 * "Online" means a device of theirs synced in the last few minutes: an open app syncs at least once
 * a minute while it is on screen (src/shared/runner.tsx), and each sync calls `touch`.
 */
import { and, asc, count, desc, eq, ilike, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Database } from "./auth";
import { isListedAdmin } from "./env";
import { account, activity, passkey, session, sharedMember, syncItem, user } from "./schema";

export const ONLINE_MINUTES = 3;
export const ADMIN_PAGE = 25;
const ONLINE = sql.raw(`interval '${ONLINE_MINUTES} minutes'`);

export class AdminError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- who is an admin

/**
 * ADMIN_EMAILS is the only way to be an admin: a listed address (confirmed, or from Google) is an
 * admin, everyone else is a user. Nobody can make someone an admin from the app (server/auth.ts
 * refuses role changes), so the list in the environment is the whole truth.
 */
export const isAdminRole = (role: string | null | undefined): boolean => (role ?? "").split(",").includes("admin");

export function roleFor(
  person: { email: string; emailVerified: boolean },
  adminEmails: string[],
  verificationRequired: boolean,
): "admin" | "user" {
  return isListedAdmin(person, adminEmails, verificationRequired) ? "admin" : "user";
}

/** Brings one person's role in line with ADMIN_EMAILS (each time they sign in). */
export async function checkRole(db: Database, userId: string, adminEmails: string[], verificationRequired: boolean) {
  const [row] = await db
    .select({ email: user.email, emailVerified: user.emailVerified, role: user.role })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) return;
  const role = roleFor(row, adminEmails, verificationRequired);
  if (isAdminRole(row.role) !== (role === "admin")) await db.update(user).set({ role }).where(eq(user.id, userId));
}

/**
 * Brings everyone's role in line with ADMIN_EMAILS, once per server start, so changing the list (and
 * redeploying) takes effect at once: removed admins become users, newly listed ones admins.
 */
export async function checkRoles(db: Database, adminEmails: string[], verificationRequired: boolean) {
  const listed = adminEmails.map((email) => sql`${email}`);
  const isListed = listed.length > 0 ? sql`lower(${user.email}) in (${sql.join(listed, sql`, `)})` : sql`false`;
  await db
    .update(user)
    .set({ role: "user" })
    .where(and(sql`coalesce(${user.role}, '') like '%admin%'`, sql`not (${isListed})`));
  await db
    .update(user)
    .set({ role: "admin" })
    .where(
      and(
        isListed,
        sql`coalesce(${user.role}, '') not like '%admin%'`,
        verificationRequired ? undefined : eq(user.emailVerified, true),
      ),
    );
}

/** How a session was started, from the Better Auth endpoint that started it. */
export function signInMethodOf(path: string | undefined): "google" | "passkey" | "password" | "other" {
  if (!path) return "other";
  if (path === "/callback/:id" || path === "/callback/google" || path === "/one-tap/callback") return "google";
  if (path.includes("/passkey/verify-authentication")) return "passkey";
  if (path.startsWith("/sign-in/") || path.startsWith("/two-factor/")) return "password";
  return "other";
}

/**
 * Whether this session may use the admin tools: an admin, and, when Google sign-in is on, signed in
 * with Google. So a guessed or leaked Listzero password never opens them; Google's own sign-in (with
 * its two-step verification) guards the admin account.
 */
export function mayAdmin(
  session: { user: { role?: string | null }; session: { signInMethod?: string | null } },
  googleOn: boolean,
): boolean {
  return isAdminRole(session.user.role) && (!googleOn || session.session.signInMethod === "google");
}

// ---------------------------------------------------------------- online now

/** Notes that this device is still here. Writes at most every 30 seconds per device. */
export async function touch(db: Database, sessionId: string, userId: string): Promise<void> {
  await db
    .insert(activity)
    .values({ sessionId, userId, seenAt: sql`now()` })
    .onConflictDoUpdate({
      target: activity.sessionId,
      set: { seenAt: sql`now()` },
      setWhere: sql`${activity.seenAt} < now() - interval '30 seconds'`,
    });
}

const iso = (value: Date | string | null | undefined): string | null =>
  value === null || value === undefined ? null : new Date(value).toISOString();

/**
 * A stored time as an ISO string, worked out by Postgres. Times are stored without a zone, in the
 * database's (UTC); a driver reading one could take it for the server's local time, so it is never
 * left to the driver.
 */
const isoOf = (time: SQL | SQL.Aliased | AnyColumn) =>
  sql<string | null>`to_char(${time}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export interface OnlinePerson {
  id: string;
  name: string;
  email: string;
  seenAt: string;
  devices: number;
}

export interface Overview {
  people: number;
  admins: number;
  suspended: number;
  unconfirmed: number;
  newThisWeek: number;
  activeToday: number;
  onlineMinutes: number;
  /** Everyone online now, most recent first (at most 100). */
  online: OnlinePerson[];
}

export async function overview(db: Database): Promise<Overview> {
  const [totals] = await db
    .select({
      people: count(),
      admins: sql<number>`count(*) filter (where ${user.role} like '%admin%')`.mapWith(Number),
      suspended: sql<number>`count(*) filter (where ${user.banned})`.mapWith(Number),
      unconfirmed: sql<number>`count(*) filter (where not ${user.emailVerified})`.mapWith(Number),
      newThisWeek: sql<number>`count(*) filter (where ${user.createdAt} > now() - interval '7 days')`.mapWith(Number),
    })
    .from(user);
  const [today] = await db
    .select({ n: sql<number>`count(distinct ${activity.userId})`.mapWith(Number) })
    .from(activity)
    .where(sql`${activity.seenAt} > now() - interval '24 hours'`);
  const online = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      seenAt: isoOf(sql`max(${activity.seenAt})`),
      devices: count(activity.sessionId),
    })
    .from(activity)
    .innerJoin(user, eq(user.id, activity.userId))
    .innerJoin(session, eq(session.id, activity.sessionId))
    .where(and(sql`${activity.seenAt} > now() - ${ONLINE}`, sql`${session.expiresAt} > now()`))
    .groupBy(user.id, user.name, user.email)
    .orderBy(sql`max(${activity.seenAt}) desc`)
    .limit(100);
  return {
    people: totals?.people ?? 0,
    admins: totals?.admins ?? 0,
    suspended: totals?.suspended ?? 0,
    unconfirmed: totals?.unconfirmed ?? 0,
    newThisWeek: totals?.newThisWeek ?? 0,
    activeToday: today?.n ?? 0,
    onlineMinutes: ONLINE_MINUTES,
    online: online.map((p) => ({ ...p, seenAt: p.seenAt ?? "" })),
  };
}

export type PeopleFilter = "all" | "online" | "admins" | "suspended" | "unconfirmed";
const FILTERS: PeopleFilter[] = ["all", "online", "admins", "suspended", "unconfirmed"];

export interface PersonRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  emailVerified: boolean;
  createdAt: string;
  /** When a device of theirs last synced; null when none has (or they are signed out everywhere). */
  seenAt: string | null;
  online: boolean;
}

/** Last time each person was here, across their signed-in devices. */
const lastSeen = (db: Database) =>
  db
    .select({ userId: activity.userId, seenAt: sql<Date>`max(${activity.seenAt})`.as("seen_at") })
    .from(activity)
    .groupBy(activity.userId)
    .as("last_seen");

const like = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function people(
  db: Database,
  body: Record<string, unknown>,
): Promise<{ people: PersonRow[]; total: number; page: number; pages: number }> {
  const page = Number.isInteger(body.page) && (body.page as number) >= 0 ? (body.page as number) : 0;
  const search = typeof body.search === "string" ? body.search.trim().slice(0, 100) : "";
  const filter = FILTERS.includes(body.filter as PeopleFilter) ? (body.filter as PeopleFilter) : "all";
  const seen = lastSeen(db);
  const isOnline = sql<boolean>`coalesce(${seen.seenAt} > now() - ${ONLINE}, false)`;

  const conditions: (SQL | undefined)[] = [];
  if (search) {
    conditions.push(
      or(ilike(user.email, like(search)), ilike(user.name, like(search)), ilike(user.username, like(search))),
    );
  }
  if (filter === "online") conditions.push(sql`${seen.seenAt} > now() - ${ONLINE}`);
  if (filter === "admins") conditions.push(sql`${user.role} like '%admin%'`);
  if (filter === "suspended") conditions.push(eq(user.banned, true));
  if (filter === "unconfirmed") conditions.push(eq(user.emailVerified, false));
  const where = and(...conditions);

  const [total] = await db.select({ n: count() }).from(user).leftJoin(seen, eq(seen.userId, user.id)).where(where);
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      seenAt: isoOf(seen.seenAt),
      online: isOnline,
    })
    .from(user)
    .leftJoin(seen, eq(seen.userId, user.id))
    .where(where)
    // Online first when looking at who is online; otherwise newest accounts first.
    .orderBy(...(filter === "online" ? [desc(seen.seenAt)] : [desc(user.createdAt)]), asc(user.email))
    .limit(ADMIN_PAGE)
    .offset(page * ADMIN_PAGE);

  const n = total?.n ?? 0;
  return {
    people: rows.map((r) => ({
      ...r,
      role: r.role ?? "user",
      banned: r.banned === true,
      banExpires: iso(r.banExpires),
      createdAt: iso(r.createdAt) ?? "",
      seenAt: iso(r.seenAt),
      online: r.online === true,
    })),
    total: n,
    page,
    pages: Math.max(1, Math.ceil(n / ADMIN_PAGE)),
  };
}

export interface Device {
  id: string;
  userAgent: string | null;
  signedInAt: string;
  expiresAt: string;
  seenAt: string | null;
  online: boolean;
}

export interface PersonDetails extends PersonRow {
  twoFactor: boolean;
  /** How they can sign in: "password", "google", "passkey". */
  methods: string[];
  passkeys: number;
  lastLoginMethod: string | null;
  updatedAt: string;
  devices: Device[];
  counts: { tasks: number; openTasks: number; lists: number; sharedOwned: number; sharedIn: number };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function personDetails(db: Database, body: Record<string, unknown>): Promise<PersonDetails> {
  const id = typeof body.userId === "string" && UUID.test(body.userId) ? body.userId : null;
  if (!id) throw new AdminError(404, "NOT_FOUND", "No such account");
  const seen = lastSeen(db);
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      twoFactor: user.twoFactorEnabled,
      lastLoginMethod: user.lastLoginMethod,
      seenAt: isoOf(seen.seenAt),
      online: sql<boolean>`coalesce(${seen.seenAt} > now() - ${ONLINE}, false)`,
    })
    .from(user)
    .leftJoin(seen, eq(seen.userId, user.id))
    .where(eq(user.id, id));
  if (!row) throw new AdminError(404, "NOT_FOUND", "No such account");

  const providers = await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, id));
  const [keys] = await db.select({ n: count() }).from(passkey).where(eq(passkey.userId, id));
  const devices = await db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      signedInAt: session.createdAt,
      expiresAt: session.expiresAt,
      seenAt: isoOf(activity.seenAt),
      online: sql<boolean>`coalesce(${activity.seenAt} > now() - ${ONLINE}, false)`,
    })
    .from(session)
    .leftJoin(activity, eq(activity.sessionId, session.id))
    .where(and(eq(session.userId, id), sql`${session.expiresAt} > now()`))
    .orderBy(sql`coalesce(${activity.seenAt}, ${session.createdAt}) desc`);
  const [items] = await db
    .select({
      tasks: sql<number>`count(*) filter (where ${syncItem.kind} = 'task')`.mapWith(Number),
      openTasks:
        sql<number>`count(*) filter (where ${syncItem.kind} = 'task' and ${syncItem.data}->>'completedAt' is null)`.mapWith(
          Number,
        ),
      lists: sql<number>`count(*) filter (where ${syncItem.kind} = 'list')`.mapWith(Number),
    })
    .from(syncItem)
    .where(and(eq(syncItem.userId, id), eq(syncItem.deleted, false)));
  const [shared] = await db
    .select({
      owned: sql<number>`count(*) filter (where ${sharedMember.role} = 'owner')`.mapWith(Number),
      all: count(),
    })
    .from(sharedMember)
    .where(eq(sharedMember.userId, id));

  const methods = new Set<string>();
  for (const p of providers) methods.add(p.providerId === "credential" ? "password" : p.providerId);
  if ((keys?.n ?? 0) > 0) methods.add("passkey");

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    role: row.role ?? "user",
    banned: row.banned === true,
    banReason: row.banReason,
    banExpires: iso(row.banExpires),
    emailVerified: row.emailVerified,
    createdAt: iso(row.createdAt) ?? "",
    updatedAt: iso(row.updatedAt) ?? "",
    seenAt: iso(row.seenAt),
    online: row.online === true,
    twoFactor: row.twoFactor === true,
    methods: [...methods].sort(),
    passkeys: keys?.n ?? 0,
    lastLoginMethod: row.lastLoginMethod,
    devices: devices.map((d) => ({
      id: d.id,
      userAgent: d.userAgent,
      signedInAt: iso(d.signedInAt) ?? "",
      expiresAt: iso(d.expiresAt) ?? "",
      seenAt: iso(d.seenAt),
      online: d.online === true,
    })),
    counts: {
      tasks: items?.tasks ?? 0,
      openTasks: items?.openTasks ?? 0,
      lists: items?.lists ?? 0,
      sharedOwned: shared?.owned ?? 0,
      sharedIn: (shared?.all ?? 0) - (shared?.owned ?? 0),
    },
  };
}

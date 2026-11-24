/**
 * Shared lists: lists that several people see and change together, kept apart from everyone's own
 * tasks (see claude/listzero-shared-lists.md in the project notes).
 *
 * - A list has one owner, and members who can edit or only view. Only the owner changes who is in
 *   it, how it is shared, its name and colour, or deletes it.
 * - Access is "restricted" (people added by email) or "link" (anyone signed in who opens the link
 *   joins, with the link's role).
 * - Its tasks are stored once. Every change gets the list's next number (`rev`), and each member's
 *   app asks for what changed after the number it last saw, list by list.
 * - Two people changing the same task: each field keeps the latest change. A device sends which
 *   fields it changed, and only those are written over what is stored.
 * - Who pressed Start (`doingBy`) and who ticked a task off (`doneBy`) are set here, never by a device.
 *
 * Every function checks the person's role itself; app.ts only makes sure someone is signed in.
 */
import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { MAX_TASKS, readTask } from "../src/lib/backup";
import { LIST_COLORS, type ListColor, type Task } from "../src/lib/types";
import type { Database } from "./auth";
import { sharedInvite, sharedItem, sharedList, sharedMember, user } from "./schema";

export type Role = "owner" | "edit" | "view";
export type Access = "restricted" | "link";

/** Limits for now: plenty for a team's day, small enough to keep every sync quick. */
export const MAX_PEOPLE = 10;
export const MAX_SHARED_LISTS = 50;
export const MAX_NAME = 60;
/** The most tasks one reply carries for one list; the app asks again for the rest. */
export const PAGE = 2000;

export class SharedError extends Error {
  constructor(
    readonly status: number,
    readonly code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "TOO_MANY_ITEMS" | "LIMIT",
    message: string,
  ) {
    super(message);
  }
}

const bad = (message: string) => new SharedError(400, "BAD_REQUEST", message);
const forbidden = (message = "You can't do that in this list") => new SharedError(403, "FORBIDDEN", message);
const notFound = () => new SharedError(404, "NOT_FOUND", "That list doesn't exist, or you aren't in it");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[\w-]{1,64}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const newToken = () => randomBytes(16).toString("base64url");
const isRole = (v: unknown): v is "edit" | "view" => v === "edit" || v === "view";
const readName = (v: unknown) => {
  const name = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
  if (!name) throw bad("Give the list a name");
  return name;
};
const readColor = (v: unknown): ListColor => (LIST_COLORS.includes(v as ListColor) ? (v as ListColor) : "slate");
const readListId = (v: unknown) => {
  if (typeof v !== "string" || !UUID.test(v)) throw notFound();
  return v;
};

// ---------------------------------------------------------------- what a member sees

export interface Person {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ListInfo {
  id: string;
  name: string;
  color: ListColor;
  /** Your own role in this list. */
  role: Role;
  access: Access;
  linkRole: "edit" | "view";
  /** Only the owner gets the link (and the people waiting to join). */
  link: string | null;
  people: Person[];
  invited: { email: string; role: "edit" | "view" }[];
}

async function roleOf(db: Database, listId: string, userId: string): Promise<Role | null> {
  const [row] = await db
    .select({ role: sharedMember.role })
    .from(sharedMember)
    .where(and(eq(sharedMember.listId, listId), eq(sharedMember.userId, userId)));
  return (row?.role as Role | undefined) ?? null;
}

async function requireRole(db: Database, listId: string, userId: string, allowed: Role[]): Promise<Role> {
  const role = await roleOf(db, listId, userId);
  if (!role) throw notFound();
  if (!allowed.includes(role)) throw forbidden();
  return role;
}

/** Everything the app shows about the lists a person is in. */
export async function listsFor(db: Database, userId: string, site: string): Promise<ListInfo[]> {
  const mine = await db
    .select({ listId: sharedMember.listId, role: sharedMember.role })
    .from(sharedMember)
    .where(eq(sharedMember.userId, userId));
  if (mine.length === 0) return [];
  const ids = mine.map((m) => m.listId);
  const lists = await db.select().from(sharedList).where(inArray(sharedList.id, ids)).orderBy(asc(sharedList.createdAt));
  const people = await db
    .select({ listId: sharedMember.listId, id: user.id, name: user.name, email: user.email, role: sharedMember.role })
    .from(sharedMember)
    .innerJoin(user, eq(user.id, sharedMember.userId))
    .where(inArray(sharedMember.listId, ids))
    .orderBy(asc(sharedMember.joinedAt));
  const invited = await db.select().from(sharedInvite).where(inArray(sharedInvite.listId, ids)).orderBy(asc(sharedInvite.createdAt));
  return lists.map((list) => {
    const role = mine.find((m) => m.listId === list.id)!.role as Role;
    return {
      id: list.id,
      name: list.name,
      color: readColor(list.color),
      role,
      access: list.access === "link" ? "link" : "restricted",
      linkRole: list.linkRole === "view" ? "view" : "edit",
      link: role === "owner" ? `${site}/join/${list.linkToken}` : null,
      people: people.filter((p) => p.listId === list.id).map(({ id, name, email, role: r }) => ({ id, name, email, role: r as Role })),
      invited:
        role === "owner"
          ? invited.filter((i) => i.listId === list.id).map((i) => ({ email: i.email, role: i.role === "view" ? "view" : "edit" }))
          : [],
    };
  });
}

/**
 * People invited by email before they had an account join when they first sync with a confirmed
 * email address that matches. Until it is confirmed, anyone could claim the address.
 */
export async function claimInvites(db: Database, userId: string, email: string, verified: boolean): Promise<void> {
  if (!verified) return;
  const address = email.trim().toLowerCase();
  const waiting = await db.select().from(sharedInvite).where(eq(sharedInvite.email, address));
  for (const invite of waiting) {
    await db.insert(sharedMember).values({ listId: invite.listId, userId, role: invite.role }).onConflictDoNothing();
    await db.delete(sharedInvite).where(and(eq(sharedInvite.listId, invite.listId), eq(sharedInvite.email, address)));
  }
}

async function countLists(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sharedMember)
    .where(eq(sharedMember.userId, userId));
  return row?.count ?? 0;
}

async function countPeople(db: Database, listId: string): Promise<number> {
  const [members] = await db.select({ count: sql<number>`count(*)::int` }).from(sharedMember).where(eq(sharedMember.listId, listId));
  const [invites] = await db.select({ count: sql<number>`count(*)::int` }).from(sharedInvite).where(eq(sharedInvite.listId, listId));
  return (members?.count ?? 0) + (invites?.count ?? 0);
}

// ---------------------------------------------------------------- owning and sharing

/** Makes a shared list, owned by the person, optionally starting with tasks (a list being turned into a shared one). */
export async function createList(db: Database, userId: string, body: Record<string, unknown>): Promise<string> {
  const name = readName(body.name);
  const color = readColor(body.color);
  if ((await countLists(db, userId)) >= MAX_SHARED_LISTS) {
    throw new SharedError(409, "LIMIT", `You can be in at most ${MAX_SHARED_LISTS} shared lists`);
  }
  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (tasks.length > MAX_TASKS) throw new SharedError(413, "TOO_MANY_ITEMS", `A list holds at most ${MAX_TASKS} tasks`);
  return db.transaction(async (tx) => {
    const [list] = await tx.insert(sharedList).values({ name, color, linkToken: newToken() }).returning({ id: sharedList.id });
    const listId = list!.id;
    await tx.insert(sharedMember).values({ listId, userId, role: "owner" });
    let rev = 0;
    const rows = tasks
      .map((raw) => readTask(raw, null))
      .filter((t): t is Task => t !== null)
      .map((t) => ({ listId, itemId: t.id, data: stamp({ ...t, listId }, userId, t), rev: ++rev, updatedBy: userId }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(sharedItem).values(rows.slice(i, i + 500)).onConflictDoNothing();
    await tx.update(sharedList).set({ rev }).where(eq(sharedList.id, listId));
    return listId;
  });
}

/** Name, colour, who can join, the link's role, a new link. Owner only. */
export async function updateList(db: Database, userId: string, body: Record<string, unknown>): Promise<void> {
  const listId = readListId(body.listId);
  await requireRole(db, listId, userId, ["owner"]);
  const patch: Partial<typeof sharedList.$inferInsert> = {};
  if (body.name !== undefined) patch.name = readName(body.name);
  if (body.color !== undefined) patch.color = readColor(body.color);
  if (body.access !== undefined) {
    if (body.access !== "restricted" && body.access !== "link") throw bad("access is restricted or link");
    patch.access = body.access;
  }
  if (body.linkRole !== undefined) {
    if (!isRole(body.linkRole)) throw bad("linkRole is edit or view");
    patch.linkRole = body.linkRole;
  }
  if (body.newLink === true) patch.linkToken = newToken();
  if (Object.keys(patch).length > 0) await db.update(sharedList).set(patch).where(eq(sharedList.id, listId));
}

/**
 * Adds someone by email. With an account (and a confirmed address) they are in at once and the
 * list shows under "Shared with me"; without one, the invite waits for them. Either way the reply is
 * the same, so this can't be used to find out who has an account. Returns the address to email.
 */
export async function invite(
  db: Database,
  userId: string,
  body: Record<string, unknown>,
): Promise<{ email: string; listName: string } | null> {
  const listId = readListId(body.listId);
  await requireRole(db, listId, userId, ["owner"]);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) throw bad("That doesn't look like an email address");
  const role = isRole(body.role) ? body.role : "edit";
  const [list] = await db.select({ name: sharedList.name }).from(sharedList).where(eq(sharedList.id, listId));
  const [person] = await db
    .select({ id: user.id, verified: user.emailVerified })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email));

  if (person?.id === userId) throw bad("That's you");
  if (person && (await roleOf(db, listId, person.id))) {
    await db.update(sharedMember).set({ role }).where(and(eq(sharedMember.listId, listId), eq(sharedMember.userId, person.id), sql`${sharedMember.role} <> 'owner'`));
    return null;
  }
  if ((await countPeople(db, listId)) >= MAX_PEOPLE) {
    throw new SharedError(409, "LIMIT", `A shared list holds at most ${MAX_PEOPLE} people`);
  }
  if (person?.verified) {
    await db.insert(sharedMember).values({ listId, userId: person.id, role }).onConflictDoNothing();
  } else {
    await db
      .insert(sharedInvite)
      .values({ listId, email, role })
      .onConflictDoUpdate({ target: [sharedInvite.listId, sharedInvite.email], set: { role } });
  }
  return { email, listName: list?.name ?? "a list" };
}

/** Changes someone's role, makes them the owner, or takes them (or a waiting invite) out. Owner only. */
export async function changeMember(db: Database, userId: string, body: Record<string, unknown>): Promise<void> {
  const listId = readListId(body.listId);
  await requireRole(db, listId, userId, ["owner"]);
  if (typeof body.email === "string") {
    // A waiting invite.
    await db.delete(sharedInvite).where(and(eq(sharedInvite.listId, listId), eq(sharedInvite.email, body.email.trim().toLowerCase())));
    return;
  }
  const target = typeof body.userId === "string" && UUID.test(body.userId) ? body.userId : null;
  if (!target || target === userId) throw bad("Choose someone else in the list");
  const theirs = await roleOf(db, listId, target);
  if (!theirs) throw notFound();
  if (body.remove === true) {
    await db.delete(sharedMember).where(and(eq(sharedMember.listId, listId), eq(sharedMember.userId, target)));
    return;
  }
  if (body.role === "owner") {
    await db.transaction(async (tx) => {
      await tx.update(sharedMember).set({ role: "edit" }).where(and(eq(sharedMember.listId, listId), eq(sharedMember.userId, userId)));
      await tx.update(sharedMember).set({ role: "owner" }).where(and(eq(sharedMember.listId, listId), eq(sharedMember.userId, target)));
    });
    return;
  }
  if (!isRole(body.role)) throw bad("role is owner, edit or view");
  await db.update(sharedMember).set({ role: body.role }).where(and(eq(sharedMember.listId, listId), eq(sharedMember.userId, target)));
}

/** Takes the list out of your sidebar. The owner has to hand it on, or delete it, first. */
export async function leave(db: Database, userId: string, body: Record<string, unknown>): Promise<void> {
  const listId = readListId(body.listId);
  const role = await requireRole(db, listId, userId, ["edit", "view", "owner"]);
  if (role === "owner") throw forbidden("Make someone else the owner first, or delete the list");
  await db.delete(sharedMember).where(and(eq(sharedMember.listId, listId), eq(sharedMember.userId, userId)));
}

/** Deletes the list and its tasks for everyone. Owner only. */
export async function deleteList(db: Database, userId: string, body: Record<string, unknown>): Promise<void> {
  const listId = readListId(body.listId);
  await requireRole(db, listId, userId, ["owner"]);
  await db.delete(sharedList).where(eq(sharedList.id, listId));
}

// ---------------------------------------------------------------- joining by link

const TOKEN = /^[\w-]{16,64}$/;

async function listByToken(db: Database, token: unknown) {
  if (typeof token !== "string" || !TOKEN.test(token)) throw notFound();
  const [list] = await db.select().from(sharedList).where(eq(sharedList.linkToken, token));
  if (!list) throw notFound();
  return list;
}

/** What the join page shows before someone joins: the list's name and owner, if the link is on. */
export async function peek(db: Database, userId: string, body: Record<string, unknown>) {
  const list = await listByToken(db, body.token);
  const role = await roleOf(db, list.id, userId);
  if (!role && list.access !== "link") throw notFound();
  const [owner] = await db
    .select({ name: user.name })
    .from(sharedMember)
    .innerJoin(user, eq(user.id, sharedMember.userId))
    .where(and(eq(sharedMember.listId, list.id), eq(sharedMember.role, "owner")));
  return { listId: list.id, name: list.name, owner: owner?.name ?? "", role: role ?? (list.linkRole === "view" ? "view" : "edit"), member: role !== null };
}

/** Joins with the link's role. Someone already in keeps their role. */
export async function join(db: Database, userId: string, body: Record<string, unknown>): Promise<string> {
  const list = await listByToken(db, body.token);
  if (await roleOf(db, list.id, userId)) return list.id;
  if (list.access !== "link") throw notFound();
  if ((await countPeople(db, list.id)) >= MAX_PEOPLE) throw new SharedError(409, "LIMIT", `A shared list holds at most ${MAX_PEOPLE} people`);
  if ((await countLists(db, userId)) >= MAX_SHARED_LISTS) throw new SharedError(409, "LIMIT", `You can be in at most ${MAX_SHARED_LISTS} shared lists`);
  await db.insert(sharedMember).values({ listId: list.id, userId, role: list.linkRole === "view" ? "view" : "edit" }).onConflictDoNothing();
  return list.id;
}

// ---------------------------------------------------------------- sync

export interface SharedChange {
  listId: string;
  id: string;
  /** The task, or null when it was deleted. */
  data: Task | null;
  /** The fields this device changed. Only these are written over what is stored. Absent: all of them. */
  fields?: string[];
}

export interface SharedSyncRequest {
  /** The last number seen, list by list. A list not mentioned starts from 0. */
  cursors: Record<string, number>;
  changes: SharedChange[];
}

export interface SharedSyncReply {
  lists: ListInfo[];
  /** List by list: the number to send next time, and what changed after the one that was sent. */
  items: Record<string, { cursor: number; changes: { id: string; data: Task | null }[]; more: boolean; reset: boolean }>;
}

const FIELDS = new Set<string>([
  "title", "notes", "due", "time", "priority", "estimate", "steps", "repeat", "doing", "completedAt", "order", "createdAt",
]);

export function readSharedSync(raw: unknown): SharedSyncRequest {
  if (typeof raw !== "object" || raw === null) throw bad("Expected an object");
  const body = raw as Record<string, unknown>;
  const cursors: Record<string, number> = {};
  if (typeof body.cursors === "object" && body.cursors !== null) {
    for (const [listId, cursor] of Object.entries(body.cursors as Record<string, unknown>)) {
      if (UUID.test(listId) && typeof cursor === "number" && Number.isSafeInteger(cursor) && cursor >= 0) cursors[listId] = cursor;
    }
  }
  if (!Array.isArray(body.changes)) throw bad("changes must be a list");
  if (body.changes.length > PAGE) throw new SharedError(413, "TOO_MANY_ITEMS", `Send at most ${PAGE} changes at a time`);
  const byKey = new Map<string, SharedChange>();
  for (const entry of body.changes) {
    if (typeof entry !== "object" || entry === null) continue;
    const { listId, id, data, fields } = entry as Record<string, unknown>;
    if (typeof listId !== "string" || !UUID.test(listId) || typeof id !== "string" || !ID.test(id)) continue;
    const named = Array.isArray(fields) ? fields.filter((f): f is string => typeof f === "string" && FIELDS.has(f)) : undefined;
    if (data === null) {
      byKey.set(`${listId}:${id}`, { listId, id, data: null });
      continue;
    }
    const task = readTask(data, null);
    if (!task || task.id !== id) continue;
    byKey.set(`${listId}:${id}`, { listId, id, data: task, ...(named ? { fields: named } : {}) });
  }
  return { cursors, changes: [...byKey.values()] };
}

/** Who pressed Start and who ticked it off, set from what changed and who changed it. */
function stamp(next: Task, userId: string, before: Task | null): Task {
  // What a device says about who did it is ignored: it is worked out here.
  const task: Task = { ...next };
  delete task.doingBy;
  delete task.doneBy;
  const doing = task.doing && task.completedAt === null;
  const startedNow = doing && !(before?.doing && before.completedAt === null);
  const doneNow = task.completedAt !== null && before?.completedAt == null;
  return {
    ...task,
    ...(doing ? { doingBy: startedNow || !before?.doingBy ? userId : before.doingBy } : {}),
    ...(task.completedAt !== null ? { doneBy: doneNow || !before?.doneBy ? userId : before.doneBy } : {}),
  };
}

/** Writes a device's changes (where it may) and sends back what changed in every list it is in. */
export async function syncShared(
  db: Database,
  userId: string,
  request: SharedSyncRequest,
  site: string,
): Promise<SharedSyncReply> {
  const lists = await listsFor(db, userId, site);
  const roles = new Map(lists.map((l) => [l.id, l.role]));
  const items: SharedSyncReply["items"] = {};

  for (const list of lists) {
    const changes = request.changes.filter((c) => c.listId === list.id);
    const canWrite = roles.get(list.id) !== "view";
    const result = await db.transaction(async (tx) => {
      // Locking the list's row makes members who sync at once take turns, so no change is missed.
      const [row] = await tx.select({ rev: sharedList.rev }).from(sharedList).where(eq(sharedList.id, list.id)).for("update");
      const before = row?.rev ?? 0;
      let rev = before;
      if (canWrite && changes.length > 0) {
        const stored = await tx
          .select({ id: sharedItem.itemId, data: sharedItem.data, deleted: sharedItem.deleted })
          .from(sharedItem)
          .where(and(eq(sharedItem.listId, list.id), inArray(sharedItem.itemId, changes.map((c) => c.id))));
        for (const change of changes) {
          const found = stored.find((s) => s.id === change.id);
          const current = found && !found.deleted ? readTask(found.data, null) : null;
          let data: Task | null = null;
          if (change.data) {
            // Only the fields this device changed go over what is stored; the rest stay as others left them.
            const merged: Task =
              current && change.fields
                ? { ...current, ...Object.fromEntries(change.fields.map((f) => [f, (change.data as unknown as Record<string, unknown>)[f]])) }
                : change.data;
            const checked = readTask({ ...merged, listId: list.id }, null);
            if (!checked) continue;
            if (found?.deleted && change.fields) continue; // Deleted by someone else meanwhile: it stays deleted.
            data = stamp(checked, userId, current);
          }
          await tx
            .insert(sharedItem)
            .values({ listId: list.id, itemId: change.id, data, deleted: data === null, rev: ++rev, updatedBy: userId })
            .onConflictDoUpdate({
              target: [sharedItem.listId, sharedItem.itemId],
              set: { data: sql`excluded.data`, deleted: sql`excluded.deleted`, rev: sql`excluded.rev`, updatedBy: userId, updatedAt: sql`now()` },
            });
        }
        await tx.update(sharedList).set({ rev }).where(eq(sharedList.id, list.id));
        const [count] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(sharedItem)
          .where(and(eq(sharedItem.listId, list.id), eq(sharedItem.deleted, false)));
        if ((count?.count ?? 0) > MAX_TASKS) throw new SharedError(413, "TOO_MANY_ITEMS", `A list holds at most ${MAX_TASKS} tasks`);
      }

      const sent = request.cursors[list.id] ?? 0;
      const reset = sent > before;
      const cursor = reset ? 0 : sent;
      const found = await tx
        .select({ id: sharedItem.itemId, data: sharedItem.data, deleted: sharedItem.deleted, rev: sharedItem.rev })
        .from(sharedItem)
        .where(and(eq(sharedItem.listId, list.id), gt(sharedItem.rev, cursor)))
        .orderBy(asc(sharedItem.rev))
        .limit(PAGE + 1);
      const more = found.length > PAGE;
      const page = more ? found.slice(0, PAGE) : found;
      return {
        cursor: more ? (page.at(-1)?.rev ?? cursor) : rev,
        changes: page.map((r) => ({ id: r.id, data: r.deleted ? null : readTask(r.data, null) })),
        more,
        reset,
      };
    });
    items[list.id] = result;
  }
  return { lists, items };
}

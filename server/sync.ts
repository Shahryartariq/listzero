/**
 * Sync: one request both sends a device's changes and fetches everyone else's.
 *
 * Every change to a person's data gets the next number in their own sequence (`rev`). A device
 * remembers the last number it has seen (its cursor) and asks for everything after it. Devices of
 * the same person take turns, because each sync locks that person's `sync_state` row first, so a
 * device can never miss a change that was being written while it asked.
 *
 * When two devices change the same task, the one that syncs last wins, one task at a time.
 * A deleted item keeps a row marked `deleted`, so other devices learn that it is gone.
 */
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import { MAX_LISTS, MAX_TASKS, readList, readTask } from "../src/lib/backup";
import type { Task, TaskList } from "../src/lib/types";
import type { Database } from "./auth";
import { syncItem, syncState } from "./schema";

export type Kind = "task" | "list";

export interface Change {
  kind: Kind;
  id: string;
  /** The item, or null when it was deleted. */
  data: Task | TaskList | null;
}

export interface SyncRequest {
  cursor: number;
  changes: Change[];
}

export interface SyncResponse {
  /** The number to send next time. */
  cursor: number;
  /** What other devices changed since the cursor that was sent. */
  changes: Change[];
  /** True when there was more than one reply can carry: ask again with the new cursor. */
  more: boolean;
  /** True when the cursor was ahead of the server (the account's data was replaced): start over. */
  reset: boolean;
}

/** The most items one request may send, and one reply may carry. */
export const MAX_PUSH = 2000;
export const PAGE = 2000;

export class SyncError extends Error {
  constructor(
    readonly status: number,
    readonly code: "BAD_REQUEST" | "TOO_MANY_ITEMS",
    message: string,
  ) {
    super(message);
  }
}

const ID = /^[\w-]{1,64}$/;

/** Checks a request body. Anything malformed is refused; a single bad item is dropped. */
export function readSyncRequest(raw: unknown): SyncRequest {
  if (typeof raw !== "object" || raw === null) throw new SyncError(400, "BAD_REQUEST", "Expected an object");
  const body = raw as Record<string, unknown>;
  const cursor = body.cursor;
  if (typeof cursor !== "number" || !Number.isSafeInteger(cursor) || cursor < 0) {
    throw new SyncError(400, "BAD_REQUEST", "cursor must be a whole number");
  }
  if (!Array.isArray(body.changes)) throw new SyncError(400, "BAD_REQUEST", "changes must be a list");
  if (body.changes.length > MAX_PUSH) {
    throw new SyncError(413, "TOO_MANY_ITEMS", `Send at most ${MAX_PUSH} changes at a time`);
  }

  // The last mention of an item wins, so one statement never writes the same row twice.
  const byKey = new Map<string, Change>();
  for (const entry of body.changes) {
    if (typeof entry !== "object" || entry === null) continue;
    const { kind, id, data } = entry as Record<string, unknown>;
    if ((kind !== "task" && kind !== "list") || typeof id !== "string" || !ID.test(id)) continue;
    if (data === null) {
      byKey.set(`${kind}:${id}`, { kind, id, data: null });
      continue;
    }
    const item = kind === "task" ? readTask(data, null) : readList(data);
    if (!item || item.id !== id) continue;
    byKey.set(`${kind}:${id}`, { kind, id, data: item });
  }
  return { cursor, changes: [...byKey.values()] };
}

export async function sync(db: Database, userId: string, request: SyncRequest): Promise<SyncResponse> {
  return db.transaction(async (tx) => {
    await tx.insert(syncState).values({ userId, rev: 0 }).onConflictDoNothing();
    const [state] = await tx.select().from(syncState).where(eq(syncState.userId, userId)).for("update");
    const before = state?.rev ?? 0;

    // A cursor from another life of this account (deleted and made again, say) means nothing here.
    const reset = request.cursor > before;
    const cursor = reset ? 0 : request.cursor;

    let rev = before;
    if (request.changes.length > 0) {
      const rows = request.changes.map((change) => ({
        userId,
        kind: change.kind,
        itemId: change.id,
        data: change.data,
        deleted: change.data === null,
        rev: ++rev,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await tx
          .insert(syncItem)
          .values(rows.slice(i, i + 500))
          .onConflictDoUpdate({
            target: [syncItem.userId, syncItem.kind, syncItem.itemId],
            set: {
              data: sql`excluded.data`,
              deleted: sql`excluded.deleted`,
              rev: sql`excluded.rev`,
              updatedAt: sql`now()`,
            },
          });
      }
      await tx.update(syncState).set({ rev }).where(eq(syncState.userId, userId));

      const counts = await tx
        .select({ kind: syncItem.kind, count: sql<number>`count(*)::int` })
        .from(syncItem)
        .where(and(eq(syncItem.userId, userId), eq(syncItem.deleted, false)))
        .groupBy(syncItem.kind);
      const count = (kind: Kind) => counts.find((c) => c.kind === kind)?.count ?? 0;
      if (count("task") > MAX_TASKS || count("list") > MAX_LISTS) {
        // Throwing rolls the whole request back.
        throw new SyncError(
          413,
          "TOO_MANY_ITEMS",
          `An account holds at most ${MAX_TASKS} tasks and ${MAX_LISTS} lists`,
        );
      }
    }

    // Everything others wrote after the device's cursor, up to (not including) what it just sent.
    const found = await tx
      .select({ kind: syncItem.kind, id: syncItem.itemId, data: syncItem.data, deleted: syncItem.deleted, rev: syncItem.rev })
      .from(syncItem)
      .where(and(eq(syncItem.userId, userId), gt(syncItem.rev, cursor), lte(syncItem.rev, before)))
      .orderBy(asc(syncItem.rev))
      .limit(PAGE + 1);

    const more = found.length > PAGE;
    const page = more ? found.slice(0, PAGE) : found;
    const changes: Change[] = [];
    for (const row of page) {
      const kind = row.kind === "list" ? "list" : "task";
      if (row.deleted) {
        changes.push({ kind, id: row.id, data: null });
        continue;
      }
      // Stored data was checked on the way in; checking again on the way out costs little and
      // means a device never has to trust the database.
      const item = kind === "task" ? readTask(row.data, null) : readList(row.data);
      if (item) changes.push({ kind, id: row.id, data: item });
    }

    return { cursor: more ? (page.at(-1)?.rev ?? cursor) : rev, changes, more, reset };
  });
}

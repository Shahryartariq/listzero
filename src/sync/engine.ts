/**
 * The thinking part of sync, with no network and no storage in it, so it can be tested alone.
 *
 * A device remembers a fingerprint of every task and list as the server last knew it. Whatever
 * differs from those fingerprints is what this device changed since: those are sent. Whatever the
 * server sends back is what other devices changed: those are applied. The reducer and the views
 * never need to know that sync exists.
 */
import { readList, readTask } from "../lib/backup";
import type { AppData, Task, TaskList } from "../lib/types";

export type Kind = "task" | "list";

export interface Change {
  kind: Kind;
  id: string;
  /** The item, or null when it was deleted. */
  data: Task | TaskList | null;
}

/** id → fingerprint, for tasks and for lists. */
export interface Fingerprints {
  task: Record<string, string>;
  list: Record<string, string>;
}

/** What a device remembers between syncs. Kept in localStorage. */
export interface SyncState {
  /** Whose data this device last synced. */
  userId: string;
  /** Shown when someone else signs in on this device and has to choose what happens to it. */
  email: string;
  /** The server's change number this device has seen up to. */
  cursor: number;
  known: Fingerprints;
}

export const emptyFingerprints = (): Fingerprints => ({ task: {}, list: {} });

/** JSON with keys in a fixed order, so the same item always gives the same text. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A short fingerprint of an item (cyrb53). Two different items sharing one is not a practical worry. */
export function fingerprint(item: Task | TaskList): string {
  const text = stable(item);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function fingerprintsOf(data: AppData): Fingerprints {
  const out = emptyFingerprints();
  for (const list of data.lists) out.list[list.id] = fingerprint(list);
  for (const task of data.tasks) out.task[task.id] = fingerprint(task);
  return out;
}

export const keyOf = (change: Pick<Change, "kind" | "id">) => `${change.kind}:${change.id}`;

/**
 * What this device changed since the server last heard from it: new and edited items, and
 * deletions. Lists come first, so a task never arrives before the list it belongs to.
 */
export function localChanges(data: AppData, known: Fingerprints): Change[] {
  const changes: Change[] = [];
  const current = fingerprintsOf(data);
  for (const list of data.lists) {
    if (known.list[list.id] !== current.list[list.id]) changes.push({ kind: "list", id: list.id, data: list });
  }
  for (const task of data.tasks) {
    if (known.task[task.id] !== current.task[task.id]) changes.push({ kind: "task", id: task.id, data: task });
  }
  for (const id of Object.keys(known.list)) {
    if (!(id in current.list)) changes.push({ kind: "list", id, data: null });
  }
  for (const id of Object.keys(known.task)) {
    if (!(id in current.task)) changes.push({ kind: "task", id, data: null });
  }
  return changes;
}

/** The keys of items that differ between two versions of the data (edited, added or removed in between). */
export function changedBetween(before: AppData, after: AppData): Set<string> {
  if (before === after) return new Set();
  const a = fingerprintsOf(before);
  const b = fingerprintsOf(after);
  const changed = new Set<string>();
  for (const kind of ["task", "list"] as const) {
    for (const id of new Set([...Object.keys(a[kind]), ...Object.keys(b[kind])])) {
      if (a[kind][id] !== b[kind][id]) changed.add(`${kind}:${id}`);
    }
  }
  return changed;
}

/**
 * The data with other devices' changes applied. Items named in `skip` are left alone: they were
 * edited here while the request was in the air, and this device's version goes out next time.
 * Whatever arrives is checked like any other untrusted input.
 */
export function applyChanges(data: AppData, changes: Change[], skip: ReadonlySet<string> = new Set()): AppData {
  const wanted = changes.filter((c) => !skip.has(keyOf(c)));
  if (wanted.length === 0) return data;

  const lists = new Map(data.lists.map((l) => [l.id, l]));
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  for (const change of wanted) {
    if (change.kind === "list") {
      const list = change.data === null ? null : readList(change.data);
      if (list && list.id === change.id) lists.set(list.id, list);
      else if (change.data === null) lists.delete(change.id);
    } else {
      const task = change.data === null ? null : readTask(change.data, null);
      if (task && task.id === change.id) tasks.set(task.id, task);
      else if (change.data === null) tasks.delete(change.id);
    }
  }

  // A task whose list is gone goes to the Inbox, the same as deleting a list does here.
  const nextTasks = [...tasks.values()].map((t) => (t.listId !== null && !lists.has(t.listId) ? { ...t, listId: null } : t));

  // Saved displays that point at a list that no longer exists are dropped with it.
  const display = Object.fromEntries(
    Object.entries(data.settings.display)
      .filter(([view]) => !view.startsWith("list:") || lists.has(view.slice(5)))
      .map(([view, d]) => [view, { ...d, filters: { ...d.filters, lists: d.filters.lists.filter((id) => id === "inbox" || lists.has(id)) } }]),
  );

  return { ...data, lists: [...lists.values()], tasks: nextTasks, settings: { ...data.settings, display } };
}

/** The fingerprints after a round trip: what was sent and what came back are now known to the server. */
export function settle(known: Fingerprints, sent: Change[], received: Change[]): Fingerprints {
  const next: Fingerprints = { task: { ...known.task }, list: { ...known.list } };
  for (const change of [...sent, ...received]) {
    if (change.data === null) delete next[change.kind][change.id];
    else next[change.kind][change.id] = fingerprint(change.data);
  }
  return next;
}

const STATE_KEY = "listzero:sync";

export function loadSyncState(storage: Pick<Storage, "getItem"> | null): SyncState | null {
  try {
    const raw = storage?.getItem(STATE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SyncState> | null;
    if (!v || typeof v.userId !== "string" || typeof v.cursor !== "number" || !v.known) return null;
    const table = (t: unknown): Record<string, string> =>
      t && typeof t === "object"
        ? Object.fromEntries(Object.entries(t as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"))
        : {};
    return {
      userId: v.userId,
      email: typeof v.email === "string" ? v.email : "",
      cursor: Number.isSafeInteger(v.cursor) && v.cursor >= 0 ? v.cursor : 0,
      known: { task: table(v.known.task), list: table(v.known.list) },
    };
  } catch {
    return null;
  }
}

export function saveSyncState(storage: Pick<Storage, "setItem" | "removeItem"> | null, state: SyncState | null): void {
  try {
    if (state) storage?.setItem(STATE_KEY, JSON.stringify(state));
    else storage?.removeItem(STATE_KEY);
  } catch {
    /* A device that cannot save this simply compares everything again next time. */
  }
}

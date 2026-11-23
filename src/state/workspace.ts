/**
 * Whose tasks are on screen. Someone who has not signed in is a guest; each account has its own
 * tasks, kept apart from the guest's and from other accounts' on the same browser.
 *
 *   listzero:v1                the guest's tasks and lists, and this device's settings (theme, text size…).
 *                              public/theme.js reads the settings from here before the first paint.
 *   listzero:account:<id>      a copy of one account's tasks and lists, for offline use and a fast start.
 *   listzero:sync:<id>         what this device knows the account already has (see sync/engine.ts).
 *   listzero:active            the account that was signed in here last, so the right tasks show
 *                              before the session has been checked.
 *
 * Settings are per device whoever is signed in: an account's copy holds only tasks and lists.
 */
import { STORAGE_KEY, readData } from "../lib/backup";
import { emptyData, type AppData, type Settings } from "../lib/types";

export type Workspace = { kind: "guest" } | { kind: "account"; userId: string };

export const GUEST: Workspace = { kind: "guest" };
export const ACTIVE_KEY = "listzero:active";
/** Until 1.1, one sync state for the whole browser, and the account's tasks in the guest's place. */
export const LEGACY_SYNC_KEY = "listzero:sync";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const accountKey = (userId: string) => `listzero:account:${userId}`;
export const syncKey = (userId: string) => `listzero:sync:${userId}`;
export const keyOf = (ws: Workspace) => (ws.kind === "guest" ? STORAGE_KEY : accountKey(ws.userId));
export const sameWorkspace = (a: Workspace, b: Workspace) =>
  a.kind === b.kind && (a.kind === "guest" || a.userId === (b as { userId: string }).userId);

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function attempt<T>(work: () => T, fallback: T): T {
  try {
    return work();
  } catch {
    return fallback;
  }
}

/** The account signed in here last, if any. The session check that follows has the final word. */
export function remembered(storage: Store | null): Workspace {
  const id = attempt(() => storage?.getItem(ACTIVE_KEY) ?? null, null);
  return id && ID.test(id) ? { kind: "account", userId: id } : GUEST;
}

export function remember(storage: Store | null, ws: Workspace): void {
  attempt(() => {
    if (ws.kind === "account") storage?.setItem(ACTIVE_KEY, ws.userId);
    else storage?.removeItem(ACTIVE_KEY);
  }, undefined);
}

/** An account's saved copy (as text), with this device's settings. Anything unreadable counts as empty. */
export function parseAccount(raw: string | null, settings: Settings): AppData {
  const parsed = raw ? attempt(() => readData(JSON.parse(raw)), null) : null;
  return { ...(parsed ?? emptyData()), settings };
}

/** An account's tasks and lists as kept on this device, with this device's settings. */
export function readAccount(storage: Store | null, userId: string, settings: Settings): AppData {
  return parseAccount(attempt(() => storage?.getItem(accountKey(userId)) ?? null, null), settings);
}

/**
 * What sync remembers about an account only holds next to that account's tasks. When the tasks are
 * missing or unreadable here (storage was full, or they were removed), forget it too: the next sync
 * then starts afresh and downloads everything, instead of reading the missing tasks as deleted and
 * deleting them from the account.
 */
export function checkAccountCopy(storage: Store | null, userId: string): void {
  if (!storage) return;
  attempt(() => {
    const raw = storage.getItem(accountKey(userId));
    const usable = raw !== null && attempt(() => readData(JSON.parse(raw)) !== null, false);
    if (!usable) storage.removeItem(syncKey(userId));
  }, undefined);
}

/** Saves an account's tasks and lists (not settings, which belong to the device). */
export function writeAccount(storage: Store | null, userId: string, data: AppData): boolean {
  if (!storage) return false;
  return attempt(() => {
    storage.setItem(accountKey(userId), JSON.stringify({ version: 1, tasks: data.tasks, lists: data.lists }));
    return true;
  }, false);
}

/** Saves this device's settings into the guest's record, where the pre-paint script finds them. */
export function writeSettings(storage: Store | null, settings: Settings): boolean {
  if (!storage) return false;
  return attempt(() => {
    const raw = storage.getItem(STORAGE_KEY);
    const guest = (raw ? readData(JSON.parse(raw)) : null) ?? emptyData();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...guest, settings }));
    return true;
  }, false);
}

/** The guest's tasks and lists, with the given settings. */
export function readGuest(storage: Store | null, settings: Settings): AppData {
  const raw = attempt(() => storage?.getItem(STORAGE_KEY) ?? null, null);
  const parsed = raw ? attempt(() => readData(JSON.parse(raw)), null) : null;
  return { ...(parsed ?? emptyData()), settings };
}

/** Takes away everything this device kept for an account. Its tasks stay in the account. */
export function forgetAccountCopy(storage: Store | null, userId: string): void {
  attempt(() => {
    storage?.removeItem(accountKey(userId));
    storage?.removeItem(syncKey(userId));
    if (storage?.getItem(ACTIVE_KEY) === userId) storage.removeItem(ACTIVE_KEY);
  }, undefined);
}

/**
 * Before 1.1 the signed-in account's tasks lived in the guest's place, with one sync state for the
 * browser. When that account signs in again, its tasks move to their own place and the guest
 * starts empty. Another account's leftover state is dropped; its tasks stay as the guest's.
 * Returns true when it moved something.
 */
export function moveLegacyAccount(storage: Store | null, userId: string): boolean {
  if (!storage) return false;
  return attempt(() => {
    const raw = storage.getItem(LEGACY_SYNC_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw) as { userId?: unknown } | null;
    storage.removeItem(LEGACY_SYNC_KEY);
    if (!state || state.userId !== userId || storage.getItem(syncKey(userId)) !== null) return false;
    const guestRaw = storage.getItem(STORAGE_KEY);
    const guest = (guestRaw ? readData(JSON.parse(guestRaw)) : null) ?? emptyData();
    storage.setItem(accountKey(userId), JSON.stringify({ version: 1, tasks: guest.tasks, lists: guest.lists }));
    storage.setItem(syncKey(userId), raw);
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...guest, tasks: [], lists: [] }));
    return true;
  }, false);
}

/**
 * The account's data with the guest's tasks and lists added: a guest list with the same name as one
 * of the account's joins it, and nothing already in the account is added twice.
 */
export function withGuestItems(account: AppData, guest: AppData): { data: AppData; tasks: number } {
  const byName = new Map(account.lists.map((l) => [l.name.trim().toLowerCase(), l.id]));
  const listIds = new Set(account.lists.map((l) => l.id));
  const mapped = new Map<string, string>();
  const lists = [...account.lists];
  for (const list of guest.lists) {
    const same = byName.get(list.name.trim().toLowerCase());
    if (same) {
      mapped.set(list.id, same);
    } else if (!listIds.has(list.id)) {
      lists.push(list);
      listIds.add(list.id);
      byName.set(list.name.trim().toLowerCase(), list.id);
      mapped.set(list.id, list.id);
    }
  }
  const taskIds = new Set(account.tasks.map((t) => t.id));
  const added = guest.tasks
    .filter((t) => !taskIds.has(t.id))
    .map((t) => ({ ...t, listId: t.listId === null ? null : (mapped.get(t.listId) ?? null) }));
  return { data: { ...account, lists, tasks: [...account.tasks, ...added] }, tasks: added.length };
}

/** Empties the guest's tasks and lists after they moved into an account. Settings stay. */
export function clearGuestItems(storage: Store | null): void {
  attempt(() => {
    const raw = storage?.getItem(STORAGE_KEY);
    const guest = (raw ? readData(JSON.parse(raw)) : null) ?? emptyData();
    storage?.setItem(STORAGE_KEY, JSON.stringify({ ...guest, tasks: [], lists: [] }));
  }, undefined);
}

/**
 * Shared lists on this device: the lists a signed-in person is in, their tasks, and what has not
 * reached the server yet. They live apart from the person's own tasks (the store), so nothing here
 * ever shows up in Today, Inbox, Upcoming, Focus or Done.
 *
 * A copy is kept per account (`listzero:shared:<id>`), so shared lists open offline and changes made
 * offline are sent later. The runner (SharedRunner, loaded only where accounts exist) does the
 * talking to the server; this module holds the state and the pure parts of sync.
 */
import { useSyncExternalStore } from "react";
import { readTask, safeStorage } from "../lib/backup";
import type { ListColor, Task, TaskList } from "../lib/types";

export type Role = "owner" | "edit" | "view";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface SharedList {
  id: string;
  name: string;
  color: ListColor;
  role: Role;
  access: "restricted" | "link";
  linkRole: "edit" | "view";
  link: string | null;
  people: Person[];
  invited: { email: string; role: "edit" | "view" }[];
}

export interface Space {
  userId: string;
  lists: SharedList[];
  tasks: Task[];
  /** The last change number seen, list by list. */
  cursors: Record<string, number>;
  /** Each task as the server last sent it, by `${listId}:${taskId}`: what local changes are measured against. */
  known: Record<string, Task>;
}

export interface SharedChange {
  listId: string;
  id: string;
  data: Task | null;
  fields?: string[];
}

export interface SharedReply {
  lists: SharedList[];
  items: Record<string, { cursor: number; changes: { id: string; data: Task | null }[]; more: boolean; reset: boolean }>;
}

const PREFIX = "listzero:shared:";
export const spaceKey = (userId: string) => `${PREFIX}${userId}`;
const keyOf = (listId: string, id: string) => `${listId}:${id}`;

/** The fields a person can change, in the order they are compared. */
const FIELDS = [
  "title", "notes", "due", "time", "priority", "estimate", "steps", "repeat", "doing", "completedAt", "order", "createdAt",
] as const;

// ---------------------------------------------------------------- state

let space: Space | null = null;
const listeners = new Set<() => void>();

export function readSpace(): Space | null {
  return space;
}

/** Puts a new state in place, keeps it on the device, and tells the screen. */
export function setSpace(next: Space | null) {
  space = next;
  if (next) {
    try {
      safeStorage()?.setItem(spaceKey(next.userId), JSON.stringify(next));
    } catch {
      /* Full storage: it still works for this visit, and the server has everything already sent. */
    }
  }
  for (const listener of listeners) listener();
}

export function useSpace(): Space | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => space,
  );
}

const emptySpace = (userId: string): Space => ({ userId, lists: [], tasks: [], cursors: {}, known: {} });

/** This account's copy from the device, checked, or an empty one. */
export function loadSpace(userId: string): Space {
  try {
    const raw = safeStorage()?.getItem(spaceKey(userId));
    if (!raw) return emptySpace(userId);
    const v = JSON.parse(raw) as Partial<Space>;
    const tasks = Array.isArray(v.tasks) ? v.tasks.map((t) => readTask(t, null)).filter((t): t is Task => t !== null) : [];
    const known: Record<string, Task> = {};
    for (const [key, t] of Object.entries(v.known ?? {})) {
      const task = readTask(t, null);
      if (task) known[key] = task;
    }
    return {
      userId,
      lists: Array.isArray(v.lists) ? (v.lists as SharedList[]) : [],
      tasks,
      cursors: typeof v.cursors === "object" && v.cursors ? (v.cursors as Record<string, number>) : {},
      known,
    };
  } catch {
    return emptySpace(userId);
  }
}

/** Forgets an account's copy (signing out), unless it holds changes the server hasn't had. */
export function forgetSpace(userId: string) {
  const copy = loadSpace(userId);
  if (pendingChanges(copy).length > 0) return;
  try {
    safeStorage()?.removeItem(spaceKey(userId));
  } catch {
    /* nothing to do */
  }
}

// ---------------------------------------------------------------- sync, the pure parts

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What this device changed since the server last sent each task: new, changed (with which fields) or deleted. */
export function pendingChanges(s: Space): SharedChange[] {
  const changes: SharedChange[] = [];
  const here = new Set<string>();
  for (const task of s.tasks) {
    const listId = task.listId;
    if (!listId) continue;
    const key = keyOf(listId, task.id);
    here.add(key);
    const before = s.known[key];
    if (!before) {
      changes.push({ listId, id: task.id, data: task });
      continue;
    }
    const fields = FIELDS.filter((f) => !same(task[f], before[f]));
    if (fields.length > 0) changes.push({ listId, id: task.id, data: task, fields });
  }
  for (const key of Object.keys(s.known)) {
    if (here.has(key)) continue;
    const [listId = "", id = ""] = key.split(":");
    if (s.lists.some((l) => l.id === listId && l.role !== "view")) changes.push({ listId, id, data: null });
  }
  return changes;
}

/**
 * Takes in the server's reply. `base` is the state the request was built from: a task changed here
 * while the request was away keeps the fields changed here, and they go out with the next sync.
 */
export function applyReply(now: Space, base: Space, reply: SharedReply): Space {
  const lists = reply.lists;
  const inList = new Set(lists.map((l) => l.id));
  let tasks = now.tasks.filter((t) => t.listId && inList.has(t.listId));
  const known = Object.fromEntries(Object.entries(now.known).filter(([key]) => inList.has(key.split(":")[0] ?? "")));
  const cursors: Record<string, number> = {};
  for (const list of lists) cursors[list.id] = now.cursors[list.id] ?? 0;

  const baseTasks = new Map(base.tasks.map((t) => [keyOf(t.listId ?? "", t.id), t]));
  for (const [listId, page] of Object.entries(reply.items)) {
    if (!inList.has(listId)) continue;
    cursors[listId] = page.cursor;
    for (const change of page.changes) {
      const key = keyOf(listId, change.id);
      const local = tasks.find((t) => t.listId === listId && t.id === change.id);
      const editedMeanwhile = local && !same(local, baseTasks.get(key));
      if (change.data === null) {
        delete known[key];
        if (!editedMeanwhile) tasks = tasks.filter((t) => !(t.listId === listId && t.id === change.id));
        continue;
      }
      const server: Task = { ...change.data, listId };
      known[key] = server;
      if (editedMeanwhile && local) {
        // Keep the fields changed here since the request left; take the rest from the server.
        const before = baseTasks.get(key);
        const mine = FIELDS.filter((f) => !same(local[f], before?.[f]));
        const merged = { ...server, ...Object.fromEntries(mine.map((f) => [f, local[f]])) } as Task;
        tasks = tasks.map((t) => (t === local ? merged : t));
      } else if (local) {
        tasks = tasks.map((t) => (t === local ? server : t));
      } else {
        tasks = [...tasks, server];
      }
    }
  }
  return { ...now, lists, tasks, known, cursors };
}

/** A shared list, shaped like one of the person's own lists, for the screens that show lists. */
export const asTaskList = (list: SharedList): TaskList => ({ id: list.id, name: list.name, color: list.color, createdAt: 0 });

/** Someone's first name, for "Abdullah is on it". */
export function nameOf(s: Space | null, userId: string | undefined): string {
  if (!s || !userId) return "Someone";
  if (userId === s.userId) return "You";
  for (const list of s.lists) {
    const person = list.people.find((p) => p.id === userId);
    if (person) return (person.name || person.email).split(/\s+/)[0] ?? "Someone";
  }
  return "Someone";
}

// ---------------------------------------------------------------- talking to the server

/** "ok" after a sync that worked; "offline" or "error" when the last one didn't (changes wait here). */
export type SharedStatus = "ok" | "offline" | "error";
let status: SharedStatus = "ok";
const statusListeners = new Set<() => void>();

export function setSharedStatus(next: SharedStatus) {
  if (next === status) return;
  status = next;
  for (const listener of statusListeners) listener();
}

export function useSharedStatus(): SharedStatus {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => status,
  );
}

let runner: (() => Promise<void>) | null = null;
let timer: number | undefined;

export const registerSharedRunner = (next: (() => Promise<void>) | null) => {
  runner = next;
};

/** Asks for a sync soon. Changes made in quick succession go out together. */
export function requestSharedSync(delay = 600) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void runner?.(), delay);
}

export class SharedCallError extends Error {}

/** Calls one of the /api/shared actions, takes in the lists it sends back, and syncs. */
export async function callShared<T = Record<string, unknown>>(action: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/shared/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    throw new SharedCallError("You're offline. Try again when you're connected.");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new SharedCallError(typeof data.message === "string" ? data.message : "That didn't work. Try again.");
  const current = readSpace();
  if (current && Array.isArray(data.lists)) setSpace({ ...current, lists: data.lists as SharedList[] });
  requestSharedSync(0);
  return data as T;
}

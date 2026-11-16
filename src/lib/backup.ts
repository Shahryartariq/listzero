/** Reading saved or imported data. Nothing from outside is trusted: every field is checked and clamped. */

import { isDay, isTime } from "./dates";
import { readDisplays } from "./display";
import {
  DEFAULT_SETTINGS,
  LIST_COLORS,
  PALETTES,
  emptyData,
  type AppData,
  type ListColor,
  type Palette,
  type Priority,
  type Repeat,
  type Settings,
  type Step,
  type Task,
  type TaskList,
} from "./types";

export const STORAGE_KEY = "listzero:v1";
export const MAX_TASKS = 5000;
export const MAX_TITLE = 300;
export const MAX_NOTES = 5000;
const MAX_STEPS = 50;
const MAX_LISTS = 100;
const REPEATS: Repeat[] = ["daily", "weekdays", "weekly", "monthly", "yearly"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function id(v: unknown): string | null {
  return typeof v === "string" && /^[\w-]{1,64}$/.test(v) ? v : null;
}

function timestamp(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function readStep(v: unknown): Step | null {
  if (!isObject(v)) return null;
  const stepId = id(v.id);
  const title = text(v.title, MAX_TITLE).trim();
  if (!stepId || !title) return null;
  return { id: stepId, title, done: v.done === true };
}

function readTask(v: unknown, listIds: Set<string>): Task | null {
  if (!isObject(v)) return null;
  const taskId = id(v.id);
  const title = text(v.title, MAX_TITLE).trim();
  if (!taskId || !title) return null;
  const due = isDay(v.due) ? v.due : null;
  const listId = id(v.listId);
  const estimate =
    typeof v.estimate === "number" && Number.isFinite(v.estimate) && v.estimate >= 1 && v.estimate <= 1440
      ? Math.round(v.estimate)
      : null;
  return {
    id: taskId,
    title,
    notes: text(v.notes, MAX_NOTES),
    listId: listId && listIds.has(listId) ? listId : null,
    due,
    time: due && isTime(v.time) ? v.time : null,
    priority: v.priority === 1 || v.priority === 2 || v.priority === 3 ? (v.priority as Priority) : 0,
    estimate,
    steps: Array.isArray(v.steps)
      ? v.steps.slice(0, MAX_STEPS).map(readStep).filter((s): s is Step => s !== null)
      : [],
    repeat: due && REPEATS.includes(v.repeat as Repeat) ? (v.repeat as Repeat) : null,
    color: LIST_COLORS.includes(v.color as ListColor) ? (v.color as ListColor) : null,
    doing: v.doing === true && timestamp(v.completedAt) === null,
    createdAt: timestamp(v.createdAt) ?? Date.now(),
    completedAt: timestamp(v.completedAt),
  };
}

function readList(v: unknown): TaskList | null {
  if (!isObject(v)) return null;
  const listId = id(v.id);
  const name = text(v.name, 60).trim();
  if (!listId || !name) return null;
  return {
    id: listId,
    name,
    color: LIST_COLORS.includes(v.color as ListColor) ? (v.color as ListColor) : "slate",
    createdAt: timestamp(v.createdAt) ?? Date.now(),
  };
}

function readSettings(v: unknown): Settings {
  if (!isObject(v)) return { ...DEFAULT_SETTINGS, display: {} };
  const limit = typeof v.dailyLimit === "number" && Number.isFinite(v.dailyLimit) ? Math.round(v.dailyLimit) : NaN;
  return {
    theme: v.theme === "light" || v.theme === "dark" ? v.theme : "system",
    palette: PALETTES.includes(v.palette as Palette) ? (v.palette as Palette) : DEFAULT_SETTINGS.palette,
    textSize: v.textSize === "large" ? "large" : "normal",
    quiet: v.quiet === true,
    display: readDisplays(v.display),
    dailyLimit: limit >= 1 && limit <= 20 ? limit : DEFAULT_SETTINGS.dailyLimit,
    calm: v.calm === true,
  };
}

/** Turns unknown JSON into valid app data, or returns null when it is not a Listzero file at all. */
export function readData(raw: unknown): AppData | null {
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.tasks)) return null;
  const seenLists = new Set<string>();
  const lists = (Array.isArray(raw.lists) ? raw.lists : [])
    .slice(0, MAX_LISTS)
    .map(readList)
    .filter((l): l is TaskList => {
      if (l === null || seenLists.has(l.id)) return false;
      seenLists.add(l.id);
      return true;
    });
  const seenTasks = new Set<string>();
  const tasks = raw.tasks
    .slice(0, MAX_TASKS)
    .map((t) => readTask(t, seenLists))
    .filter((t): t is Task => {
      if (t === null || seenTasks.has(t.id)) return false;
      seenTasks.add(t.id);
      return true;
    });
  return { version: 1, tasks, lists, settings: readSettings(raw.settings) };
}

export function parseBackup(json: string): AppData | null {
  try {
    return readData(JSON.parse(json));
  } catch {
    return null;
  }
}

export function serialize(data: AppData): string {
  return JSON.stringify(data);
}

export interface Loaded {
  data: AppData;
  /** False when the browser refuses storage (some private modes); the app then works for this visit only. */
  persistent: boolean;
  /** Saved text that could not be read. The caller keeps a copy before anything overwrites it. */
  damaged?: string;
}

export function load(storage: Pick<Storage, "getItem"> | null): Loaded {
  if (!storage) return { data: emptyData(), persistent: false };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { data: emptyData(), persistent: true };
    const data = parseBackup(raw);
    return data ? { data, persistent: true } : { data: emptyData(), persistent: true, damaged: raw };
  } catch {
    return { data: emptyData(), persistent: false };
  }
}

export function save(storage: Pick<Storage, "setItem"> | null, data: AppData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, serialize(data));
    return true;
  } catch {
    return false;
  }
}

export function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = "listzero:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

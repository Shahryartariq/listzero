/** How a view is shown: its layout, its sort order and which tasks are filtered out. Pure functions. */

import { compareTasks } from "./store";
import { LIST_COLORS, type ListColor, type Priority, type Task } from "./types";

export const LAYOUTS = ["list", "cards", "board", "calendar", "table"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const SORTS = ["smart", "priority", "day", "name", "newest", "length"] as const;
export type Sort = (typeof SORTS)[number];

export const QUICK_MINUTES = 15;

export interface Filters {
  /** Empty means every priority. 0 is "no priority". */
  priorities: Priority[];
  /** Empty means every colour. "none" is tasks without a colour. */
  colors: (ListColor | "none")[];
  /** Empty means every list. "inbox" is tasks without a list. */
  lists: string[];
  /** Only tasks in progress. */
  doing: boolean;
  /** Only tasks estimated at QUICK_MINUTES or less. */
  quick: boolean;
}

export interface Display {
  layout: Layout;
  sort: Sort;
  filters: Filters;
}

export const NO_FILTERS: Filters = { priorities: [], colors: [], lists: [], doing: false, quick: false };

export const DEFAULT_DISPLAY: Display = { layout: "list", sort: "smart", filters: NO_FILTERS };

export function matches(task: Task, f: Filters): boolean {
  if (f.priorities.length > 0 && !f.priorities.includes(task.priority)) return false;
  if (f.colors.length > 0 && !f.colors.includes(task.color ?? "none")) return false;
  if (f.lists.length > 0 && !f.lists.includes(task.listId ?? "inbox")) return false;
  if (f.doing && !task.doing) return false;
  if (f.quick && (task.estimate === null || task.estimate > QUICK_MINUTES)) return false;
  return true;
}

const byDay = (a: Task, b: Task) => {
  const da = a.due ?? "9999-99-99";
  const db = b.due ?? "9999-99-99";
  return da === db ? 0 : da < db ? -1 : 1;
};

/** Comparators for every sort except "smart", which keeps the order the view already chose. */
const COMPARE: Record<Exclude<Sort, "smart">, (a: Task, b: Task) => number> = {
  priority: (a, b) => {
    const pa = a.priority === 0 ? 4 : a.priority;
    const pb = b.priority === 0 ? 4 : b.priority;
    return pa - pb || byDay(a, b) || a.createdAt - b.createdAt;
  },
  day: (a, b) => byDay(a, b) || compareTasks(a, b),
  name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }) || a.createdAt - b.createdAt,
  newest: (a, b) => b.createdAt - a.createdAt,
  length: (a, b) => (a.estimate ?? Infinity) - (b.estimate ?? Infinity) || compareTasks(a, b),
};

export function sortTasks(tasks: Task[], sort: Sort): Task[] {
  return sort === "smart" ? tasks : [...tasks].sort(COMPARE[sort]);
}

/** Filters, then sorts. Never changes the array it is given. */
export function applyDisplay(tasks: Task[], display: Display): Task[] {
  return sortTasks(
    tasks.filter((t) => matches(t, display.filters)),
    display.sort,
  );
}

/** How many filter groups are switched on. */
export function activeFilters(f: Filters): number {
  return (
    Number(f.priorities.length > 0) +
    Number(f.colors.length > 0) +
    Number(f.lists.length > 0) +
    Number(f.doing) +
    Number(f.quick)
  );
}

export function isDefault(d: Display): boolean {
  return d.layout === "list" && d.sort === "smart" && activeFilters(d.filters) === 0;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function unique<T>(values: unknown, allowed: (v: unknown) => v is T, max: number): T[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(allowed))].slice(0, max);
}

/** Reads saved display settings, replacing anything unknown with the default. */
export function readDisplay(raw: unknown): Display {
  if (!isObject(raw)) return DEFAULT_DISPLAY;
  const f = isObject(raw.filters) ? raw.filters : {};
  return {
    layout: LAYOUTS.includes(raw.layout as Layout) ? (raw.layout as Layout) : "list",
    sort: SORTS.includes(raw.sort as Sort) ? (raw.sort as Sort) : "smart",
    filters: {
      priorities: unique(f.priorities, (v): v is Priority => v === 0 || v === 1 || v === 2 || v === 3, 4),
      colors: unique(
        f.colors,
        (v): v is ListColor | "none" => v === "none" || LIST_COLORS.includes(v as ListColor),
        LIST_COLORS.length + 1,
      ),
      lists: unique(f.lists, (v): v is string => typeof v === "string" && /^[\w-]{1,64}$/.test(v), 100),
      doing: f.doing === true,
      quick: f.quick === true,
    },
  };
}

/** Saved display settings for every view, keyed by "inbox", "today", "upcoming" or "list:<id>". */
export function readDisplays(raw: unknown): Record<string, Display> {
  if (!isObject(raw)) return {};
  const out: Record<string, Display> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 150)) {
    if (!/^(inbox|today|upcoming|list:[\w-]{1,64})$/.test(key)) continue;
    const display = readDisplay(value);
    if (!isDefault(display)) out[key] = display;
  }
  return out;
}

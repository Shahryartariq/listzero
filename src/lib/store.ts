/** The app's state transitions. Pure: ids and timestamps come in with the action. */

import { addDays, nextOccurrence } from "./dates";
import type { AppData, ListColor, Settings, Task, TaskList } from "./types";

export type TaskPatch = Partial<Omit<Task, "id" | "createdAt" | "completedAt">>;

export type Action =
  | { type: "replace"; data: AppData }
  | { type: "addTasks"; tasks: Task[] }
  | { type: "updateTask"; id: string; patch: TaskPatch }
  | { type: "completeTask"; id: string; at: number; today: string; logId: string }
  | { type: "reopenTask"; id: string }
  | { type: "deleteTask"; id: string }
  | { type: "setDue"; ids: string[]; due: string | null }
  | { type: "clearDone" }
  | { type: "addList"; list: TaskList }
  | { type: "updateList"; id: string; name?: string; color?: ListColor }
  | { type: "deleteList"; id: string }
  | { type: "updateSettings"; patch: Partial<Settings> };

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case "replace":
      return action.data;

    case "addTasks":
      return { ...state, tasks: [...state.tasks, ...action.tasks] };

    case "updateTask":
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t;
          const next = { ...t, ...action.patch };
          // A time or a repeat cannot exist without a day.
          if (next.due === null) {
            next.time = null;
            next.repeat = null;
          }
          return next;
        }),
      };

    case "completeTask": {
      const task = state.tasks.find((t) => t.id === action.id);
      if (!task || task.completedAt !== null) return state;
      if (task.repeat && task.due) {
        // A repeating task moves to its next day and leaves a finished copy in Done.
        const finished: Task = {
          ...task,
          id: action.logId,
          repeat: null,
          completedAt: action.at,
          steps: task.steps.map((s) => ({ ...s })),
        };
        const moved: Task = {
          ...task,
          due: nextOccurrence(task.due, task.repeat, action.today),
          steps: task.steps.map((s) => ({ ...s, done: false })),
        };
        return { ...state, tasks: [...state.tasks.map((t) => (t.id === task.id ? moved : t)), finished] };
      }
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, completedAt: action.at } : t)),
      };
    }

    case "reopenTask":
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, completedAt: null } : t)),
      };

    case "deleteTask":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };

    case "setDue": {
      const ids = new Set(action.ids);
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          ids.has(t.id)
            ? { ...t, due: action.due, time: action.due ? t.time : null, repeat: action.due ? t.repeat : null }
            : t,
        ),
      };
    }

    case "clearDone":
      return { ...state, tasks: state.tasks.filter((t) => t.completedAt === null) };

    case "addList":
      return { ...state, lists: [...state.lists, action.list] };

    case "updateList":
      return {
        ...state,
        lists: state.lists.map((l) =>
          l.id === action.id ? { ...l, name: action.name ?? l.name, color: action.color ?? l.color } : l,
        ),
      };

    case "deleteList":
      // Tasks are never deleted with their list; they fall back to the Inbox.
      return {
        ...state,
        lists: state.lists.filter((l) => l.id !== action.id),
        tasks: state.tasks.map((t) => (t.listId === action.id ? { ...t, listId: null } : t)),
      };

    case "updateSettings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
  }
}

/** Open tasks first by priority (1 is highest, 0 means none), then by time of day, then oldest first. */
export function compareTasks(a: Task, b: Task): number {
  const pa = a.priority === 0 ? 4 : a.priority;
  const pb = b.priority === 0 ? 4 : b.priority;
  if (pa !== pb) return pa - pb;
  const ta = a.time ?? "99:99";
  const tb = b.time ?? "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.createdAt - b.createdAt;
}

export const isOpen = (t: Task) => t.completedAt === null;

export interface TodayView {
  /** Open tasks whose day has passed. */
  carried: Task[];
  /** Open tasks due today. */
  due: Task[];
}

export function todayView(data: AppData, today: string): TodayView {
  const open = data.tasks.filter(isOpen);
  return {
    carried: open
      .filter((t) => t.due !== null && t.due < today)
      .sort((a, b) => (a.due === b.due ? compareTasks(a, b) : (a.due ?? "") < (b.due ?? "") ? -1 : 1)),
    due: open.filter((t) => t.due === today).sort(compareTasks),
  };
}

export interface DayGroup {
  day: string;
  tasks: Task[];
}

/** Open tasks after today, grouped by day, soonest first. */
export function upcomingView(data: AppData, today: string): DayGroup[] {
  const groups = new Map<string, Task[]>();
  for (const t of data.tasks) {
    if (!isOpen(t) || t.due === null || t.due <= today) continue;
    const list = groups.get(t.due);
    if (list) list.push(t);
    else groups.set(t.due, [t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, tasks]) => ({ day, tasks: tasks.sort(compareTasks) }));
}

export function inboxView(data: AppData): Task[] {
  return data.tasks.filter((t) => isOpen(t) && t.listId === null).sort(compareByDayThenRank);
}

export function listView(data: AppData, listId: string): Task[] {
  return data.tasks.filter((t) => isOpen(t) && t.listId === listId).sort(compareByDayThenRank);
}

/** Dated tasks first (soonest first), undated after, each by rank. */
function compareByDayThenRank(a: Task, b: Task): number {
  const da = a.due ?? "9999-99-99";
  const db = b.due ?? "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  return compareTasks(a, b);
}

/** Finished tasks grouped by the local day they were finished, newest first. */
export function doneView(data: AppData, dayOf: (timestamp: number) => string): DayGroup[] {
  const groups = new Map<string, Task[]>();
  for (const t of data.tasks) {
    if (t.completedAt === null) continue;
    const day = dayOf(t.completedAt);
    const list = groups.get(day);
    if (list) list.push(t);
    else groups.set(day, [t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, tasks]) => ({ day, tasks: tasks.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)) }));
}

export function totalEstimate(tasks: Task[]): number {
  return tasks.reduce((sum, t) => sum + (t.estimate ?? 0), 0);
}

/** How many tasks were finished today and in the last seven days (today included). */
export function doneCounts(data: AppData, today: string, dayOf: (timestamp: number) => string) {
  const weekStart = addDays(today, -6);
  let todayCount = 0;
  let weekCount = 0;
  for (const t of data.tasks) {
    if (t.completedAt === null) continue;
    const day = dayOf(t.completedAt);
    if (day === today) todayCount++;
    if (day >= weekStart && day <= today) weekCount++;
  }
  return { today: todayCount, week: weekCount };
}

export function searchTasks(data: AppData, query: string): Task[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const listNames = new Map(data.lists.map((l) => [l.id, l.name.toLowerCase()]));
  return data.tasks
    .filter((t) => {
      const haystack = [t.title, t.notes, ...t.steps.map((s) => s.title), listNames.get(t.listId ?? "") ?? ""]
        .join("\n")
        .toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => {
      if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
      return compareByDayThenRank(a, b);
    });
}

/** The first step still to do, shown under the task as "Next: …". */
export function nextStep(task: Task): string | null {
  return task.steps.find((s) => !s.done)?.title ?? null;
}

/** Case-insensitive match on a list name, exact first, then by prefix. */
export function findList(lists: TaskList[], name: string): TaskList | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return (
    lists.find((l) => l.name.toLowerCase() === wanted) ??
    lists.find((l) => l.name.toLowerCase().replace(/\s+/g, "") === wanted.replace(/\s+/g, "")) ??
    lists.find((l) => l.name.toLowerCase().startsWith(wanted)) ??
    null
  );
}

/** The app's state transitions. Pure: ids and timestamps come in with the action. */

import { addDays, nextOccurrence } from "./dates";
import type { Display } from "./display";
import { COLOR_NAME, type AppData, type ListColor, type Settings, type Task, type TaskList } from "./types";

export type TaskPatch = Partial<Omit<Task, "id" | "createdAt" | "completedAt">>;

export type Action =
  | { type: "replace"; data: AppData }
  | { type: "addTasks"; tasks: Task[] }
  | { type: "updateTask"; id: string; patch: TaskPatch }
  | { type: "completeTask"; id: string; at: number; today: string; logId: string }
  | { type: "reopenTask"; id: string }
  | { type: "deleteTask"; id: string }
  | { type: "setDue"; ids: string[]; due: string | null }
  | { type: "setOrders"; orders: Record<string, number> }
  | { type: "clearDone" }
  | { type: "addList"; list: TaskList }
  | { type: "updateList"; id: string; name?: string; color?: ListColor }
  | { type: "deleteList"; id: string }
  | { type: "updateSettings"; patch: Partial<Settings> }
  | { type: "setDisplay"; view: string; display: Display | null };

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
          doing: false,
          completedAt: action.at,
          steps: task.steps.map((s) => ({ ...s })),
        };
        const moved: Task = {
          ...task,
          doing: false,
          due: nextOccurrence(task.due, task.repeat, action.today),
          steps: task.steps.map((s) => ({ ...s, done: false })),
        };
        return { ...state, tasks: [...state.tasks.map((t) => (t.id === task.id ? moved : t)), finished] };
      }
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, doing: false, completedAt: action.at } : t)),
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

    case "setOrders":
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id in action.orders ? { ...t, order: action.orders[t.id] } : t)),
      };

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
        settings: {
          ...state.settings,
          // Forget how the deleted list was displayed, and stop filtering other views by it.
          display: Object.fromEntries(
            Object.entries(state.settings.display)
              .filter(([key]) => key !== `list:${action.id}`)
              .map(([key, d]) => [
                key,
                { ...d, filters: { ...d.filters, lists: d.filters.lists.filter((id) => id !== action.id) } },
              ]),
          ),
        },
      };

    case "updateSettings":
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case "setDisplay": {
      const display = { ...state.settings.display };
      if (action.display) display[action.view] = action.display;
      else delete display[action.view];
      return { ...state, settings: { ...state.settings, display } };
    }
  }
}

/** Tasks in progress first, then by priority (1 is highest, 0 means none), then time of day, then oldest first. */
export function compareTasks(a: Task, b: Task): number {
  if (a.doing !== b.doing) return a.doing ? -1 : 1;
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
      const haystack = [
        t.title,
        t.notes,
        ...t.steps.map((s) => s.title),
        listNames.get(t.listId ?? "") ?? "",
        t.color ? COLOR_NAME[t.color] : "",
      ]
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

export type BoardColumn = "todo" | "doing" | "done";

/** Where the board looks: today's tasks, the Inbox, everything open, or one list (its id). */
export type BoardScope = "today" | "inbox" | "all" | (string & {});

export interface BoardView {
  todo: Task[];
  doing: Task[];
  /** Finished today, newest first. Older finished tasks live in Done. */
  done: Task[];
}

export function boardView(
  data: AppData,
  scope: BoardScope,
  today: string,
  dayOf: (timestamp: number) => string,
): BoardView {
  const inScope = (t: Task): boolean => {
    if (scope === "all") return true;
    if (scope === "inbox") return t.listId === null;
    if (scope === "today") return t.completedAt !== null || (t.due !== null && t.due <= today);
    return t.listId === scope;
  };
  const view: BoardView = { todo: [], doing: [], done: [] };
  for (const t of data.tasks) {
    if (!inScope(t)) continue;
    if (t.completedAt !== null) {
      if (dayOf(t.completedAt) === today) view.done.push(t);
    } else if (t.doing) view.doing.push(t);
    else view.todo.push(t);
  }
  // Today is one day, so rank alone decides; wider scopes read soonest first.
  const order = scope === "today" ? compareTasks : compareByDayThenRank;
  view.todo.sort(order);
  view.doing.sort(order);
  view.done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return view;
}

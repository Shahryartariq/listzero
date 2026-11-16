/** 0 = none, 1 = highest. */
export type Priority = 0 | 1 | 2 | 3;

export type Repeat = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export type ThemeChoice = "system" | "light" | "dark";

export const LIST_COLORS = ["slate", "brick", "ochre", "moss", "teal", "blue", "plum"] as const;
export type ListColor = (typeof LIST_COLORS)[number];

export interface Step {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  /** null means the task lives in the Inbox. */
  listId: string | null;
  /** Local calendar day, YYYY-MM-DD. */
  due: string | null;
  /** Local time, HH:MM (24h). Only meaningful with a due day. */
  time: string | null;
  priority: Priority;
  /** Estimated minutes. */
  estimate: number | null;
  steps: Step[];
  repeat: Repeat | null;
  createdAt: number;
  completedAt: number | null;
}

export interface TaskList {
  id: string;
  name: string;
  color: ListColor;
  createdAt: number;
}

export interface Settings {
  theme: ThemeChoice;
  /** Above this many open tasks, Today suggests moving some to tomorrow. */
  dailyLimit: number;
  /** Turn off the small completion animations. */
  calm: boolean;
}

export interface AppData {
  version: 1;
  tasks: Task[];
  lists: TaskList[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { theme: "system", dailyLimit: 5, calm: false };

export function emptyData(): AppData {
  return { version: 1, tasks: [], lists: [], settings: { ...DEFAULT_SETTINGS } };
}

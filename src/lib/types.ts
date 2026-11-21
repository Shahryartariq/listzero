/** 0 = none, 1 = highest. */
export type Priority = 0 | 1 | 2 | 3;

export type Repeat = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export type ThemeChoice = "system" | "light" | "dark";

export const LIST_COLORS = ["slate", "brick", "ochre", "moss", "teal", "blue", "plum"] as const;
export type ListColor = (typeof LIST_COLORS)[number];

export const COLOR_NAME: Record<ListColor, string> = {
  slate: "Slate",
  brick: "Brick",
  ochre: "Ochre",
  moss: "Moss",
  teal: "Teal",
  blue: "Blue",
  plum: "Plum",
};

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
  /** A colour of the user's choosing, to tell tasks apart at a glance. */
  color: ListColor | null;
  /** In progress: sits in the "Doing" column of the board. */
  doing: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface TaskList {
  id: string;
  name: string;
  color: ListColor;
  createdAt: number;
}

export const PALETTES = ["chalk", "sage", "sky", "sand", "lilac", "rose"] as const;
export type Palette = (typeof PALETTES)[number];

export type TextSize = "normal" | "large";

export interface Settings {
  theme: ThemeChoice;
  /** The colour family. Each has a light and a dark side. */
  palette: Palette;
  textSize: TextSize;
  /** Show only task names in lists, hiding dates, lengths and list names. */
  quiet: boolean;
  /** Layout, sort and filters chosen per view. Views not listed use the defaults. */
  display: Record<string, import("./display").Display>;
  /** Above this many open tasks, Today suggests moving some to tomorrow. */
  dailyLimit: number;
  /** Turn off the small completion animations. */
  calm: boolean;
  /** Let the public site count page visits. Never includes task content. */
  analytics: boolean;
  /** On wide screens, show the sidebar as a narrow strip of icons. */
  sidebarCollapsed: boolean;
}

export interface AppData {
  version: 1;
  tasks: Task[];
  lists: TaskList[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  palette: "chalk",
  textSize: "normal",
  quiet: false,
  display: {},
  dailyLimit: 5,
  calm: false,
  analytics: true,
  sidebarCollapsed: false,
};

export function emptyData(): AppData {
  return { version: 1, tasks: [], lists: [], settings: { ...DEFAULT_SETTINGS, display: {} } };
}

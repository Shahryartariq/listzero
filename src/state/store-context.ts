import { createContext, useContext } from "react";
import type { TokenKind } from "../lib/parse";
import type { Display } from "../lib/display";
import type { TaskPatch } from "../lib/store";
import type { AppData, ListColor, Settings, Task } from "../lib/types";
import type { Workspace } from "./workspace";

export interface Toast {
  id: string;
  message: string;
  /**
   * The data as it was before the action, when the action can be undone.
   * It is withdrawn as soon as anything else changes, so Undo can never roll back unrelated work.
   */
  undo: AppData | null;
  /** Undo for something outside the person's own tasks (a shared list). */
  onUndo?: () => void;
  /** The data version this toast's Undo belongs to. */
  validAt: number;
  expiresAt: number;
}

export interface AddDefaults {
  listId?: string | null;
  due?: string | null;
}

export interface Store {
  data: AppData;
  /** The current local day, kept fresh across midnight. */
  today: string;
  /** False when the browser will not keep data after this visit. */
  persistent: boolean;
  /**
   * Why saving is failing, if it is: "blocked" when the browser refuses storage from the start
   * (some private modes), "full" when a save that used to work stopped working.
   */
  saving: "ok" | "blocked" | "full";
  /** Saved text that could not be read when the app opened. A copy is kept; the user can download it. */
  damaged: string | null;
  forgetDamaged(): void;
  toasts: Toast[];
  dismissToast(id: string): void;
  undoToast(id: string): void;
  notify(message: string): void;
  /** A message with an Undo that runs `onUndo` (for changes outside the person's own tasks). */
  notifyUndo(message: string, onUndo: () => void): void;
  addFromText(lines: string[], defaults?: AddDefaults, off?: ReadonlySet<TokenKind>): Task[];
  updateTask(id: string, patch: TaskPatch): void;
  toggleTask(id: string): void;
  deleteTask(id: string): void;
  setDue(ids: string[], due: string | null, message: string): void;
  clearDone(): void;
  addList(name: string, color?: ListColor): string;
  updateList(id: string, patch: { name?: string; color?: ListColor }): void;
  deleteList(id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  /**
   * Moves a task to position `to` among `shown` (a view's tasks, top to bottom), by hand. The view
   * switches to "My order" if it was sorted another way.
   */
  moveTask(view: string, shown: Task[], id: string, to: number): void;
  /** Saves how one view is displayed; null puts it back to the defaults. */
  setDisplay(view: string, display: Display | null): void;
  replaceAll(next: AppData, message: string): void;
  /** The data as it is this instant, even between renders. For code that runs outside React's flow (sync). */
  read(): AppData;
  /** Swaps in data that did not come from something the user just did (sync, signing out). No message, no Undo. */
  load(next: AppData): void;
  /** Whose tasks are shown: the guest's, or one signed-in account's. */
  workspace: Workspace;
  /** The same, this instant, even between renders (for sync, which must never cross between people). */
  readWorkspace(): Workspace;
  /** Shows the guest's tasks or an account's (and remembers it for the next visit). */
  switchWorkspace(next: Workspace): void;
  dayOf(timestamp: number): string;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

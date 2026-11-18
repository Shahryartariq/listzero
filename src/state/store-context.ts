import { createContext, useContext } from "react";
import type { TokenKind } from "../lib/parse";
import type { Display } from "../lib/display";
import type { TaskPatch } from "../lib/store";
import type { AppData, ListColor, Settings, Task } from "../lib/types";

export interface Toast {
  id: string;
  message: string;
  /**
   * The data as it was before the action, when the action can be undone.
   * It is withdrawn as soon as anything else changes, so Undo can never roll back unrelated work.
   */
  undo: AppData | null;
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
  /** Saves how one view is displayed; null puts it back to the defaults. */
  setDisplay(view: string, display: Display | null): void;
  replaceAll(next: AppData, message: string): void;
  /** The data as it is this instant, even between renders. For code that runs outside React's flow (sync). */
  read(): AppData;
  /** Swaps in data that did not come from something the user just did (sync, signing out). No message, no Undo. */
  load(next: AppData): void;
  dayOf(timestamp: number): string;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

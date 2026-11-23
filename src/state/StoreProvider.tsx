import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { STORAGE_KEY, load, parseBackup, safeStorage, save } from "../lib/backup";
import { today as todayOf, toDay } from "../lib/dates";
import { DEFAULT_DISPLAY, isDefault, placeTask } from "../lib/display";
import { newId } from "../lib/id";
import { parseTask, type TokenKind } from "../lib/parse";
import { findList, reducer, type TaskPatch } from "../lib/store";
import { LIST_COLORS, type AppData, type ListColor, type Settings, type Task } from "../lib/types";
import { StoreContext, type AddDefaults, type Store, type Toast } from "./store-context";
import {
  ACTIVE_KEY,
  checkAccountCopy,
  keyOf,
  parseAccount,
  readAccount,
  readGuest,
  remember,
  remembered,
  sameWorkspace,
  writeAccount,
  writeSettings,
  type Workspace,
} from "./workspace";

const TOAST_MS = 7000;
const PERSIST_KEY = "listzero:persist";

/**
 * Asks the browser to keep this site's data even when space runs low, once, after the first task
 * is saved (asking on load can show a prompt for nothing). A refusal is remembered, not repeated.
 */
function askToPersist(storage: Storage | null) {
  try {
    if (!navigator.storage?.persist || storage?.getItem(PERSIST_KEY)) return;
    storage?.setItem(PERSIST_KEY, "asked");
    void navigator.storage
      .persisted()
      .then((already) => (already ? true : navigator.storage.persist()))
      .then((granted) => storage?.setItem(PERSIST_KEY, granted ? "granted" : "refused"))
      .catch(() => undefined);
  } catch {
    /* Best effort: data is saved either way. */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const storage = useMemo(() => safeStorage(), []);
  const initial = useMemo(() => {
    const loaded = load(storage);
    if (loaded.damaged && storage) {
      // Keep whatever was there before the first save replaces it.
      try {
        storage.setItem(`${STORAGE_KEY}:unreadable`, loaded.damaged);
      } catch {
        /* nothing more we can do */
      }
    }
    // Someone was signed in here: start with their tasks while the session is checked.
    const workspace = remembered(storage);
    if (workspace.kind === "account") {
      checkAccountCopy(storage, workspace.userId);
      return { ...loaded, data: readAccount(storage, workspace.userId, loaded.data.settings), workspace };
    }
    return { ...loaded, workspace };
  }, [storage]);

  const [data, dispatch] = useReducer(reducer, initial.data);
  const [persistent, setPersistent] = useState(initial.persistent);
  const [damaged, setDamaged] = useState<string | null>(() => {
    if (initial.damaged) return initial.damaged;
    // A copy kept on an earlier visit is still offered until the user has dealt with it.
    try {
      return storage?.getItem(`${STORAGE_KEY}:unreadable`) ?? null;
    } catch {
      return null;
    }
  });
  const forgetDamaged = useCallback(() => {
    try {
      storage?.removeItem(`${STORAGE_KEY}:unreadable`);
    } catch {
      /* nothing to remove */
    }
    setDamaged(null);
  }, [storage]);
  const [today, setToday] = useState(() => todayOf());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dataRef = useRef(data);
  const [workspace, setWorkspace] = useState<Workspace>(initial.workspace);
  const workspaceRef = useRef<Workspace>(initial.workspace);
  const lastSaved = useRef<string | null>(null);
  const lastSettings = useRef<string | null>(null);

  // Counts every change to the data. An Undo is only good for the version right after its own action.
  const version = useRef(0);
  const seen = useRef(data);

  useEffect(() => {
    if (seen.current !== data) {
      seen.current = data;
      version.current += 1;
      const current = version.current;
      setToasts((list) =>
        list.some((t) => t.undo && t.validAt !== current)
          ? list.map((t) => (t.undo && t.validAt !== current ? { ...t, undo: null } : t))
          : list,
      );
    }
    dataRef.current = data;
    const ws = workspaceRef.current;
    const json = keyOf(ws) + JSON.stringify(data);
    if (json === lastSaved.current) return;
    lastSaved.current = json;
    const settings = JSON.stringify(data.settings);
    let ok: boolean;
    if (ws.kind === "guest") {
      ok = save(storage, data);
    } else {
      ok = writeAccount(storage, ws.userId, data);
      // Settings belong to the device, so they are kept with the guest's record either way.
      if (settings !== lastSettings.current) ok = writeSettings(storage, data.settings) && ok;
    }
    if (ok) lastSettings.current = settings;
    setPersistent(ok);
    if (ok && data.tasks.length > 0) askToPersist(storage);
  }, [data, storage]);

  /** Shows the guest's tasks, or one account's, keeping this device's settings. No message, no Undo. */
  const switchWorkspace = useCallback(
    (next: Workspace) => {
      remember(storage, next);
      if (sameWorkspace(next, workspaceRef.current)) return;
      const settings = dataRef.current.settings;
      if (next.kind === "account") checkAccountCopy(storage, next.userId);
      const loaded = next.kind === "guest" ? readGuest(storage, settings) : readAccount(storage, next.userId, settings);
      workspaceRef.current = next;
      lastSaved.current = keyOf(next) + JSON.stringify(loaded);
      dataRef.current = loaded;
      setWorkspace(next);
      dispatch({ type: "replace", data: loaded });
      // An Undo from one person's tasks must never land in another's.
      setToasts((list) => (list.some((t) => t.undo) ? list.map((t) => (t.undo ? { ...t, undo: null } : t)) : list));
    },
    [storage],
  );

  // Another tab changed the data, or signed in or out: follow it instead of overwriting it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      const ws = workspaceRef.current;
      if (e.key === ACTIVE_KEY) {
        switchWorkspace(remembered(storage));
        return;
      }
      if (e.newValue === null) return;
      let next: AppData | null = null;
      if (e.key === keyOf(ws)) {
        next =
          ws.kind === "guest"
            ? parseBackup(e.newValue)
            : parseAccount(e.newValue, dataRef.current.settings);
      } else if (ws.kind === "account" && e.key === STORAGE_KEY) {
        // Settings changed in a tab where nobody is signed in.
        const guest = parseBackup(e.newValue);
        if (guest && JSON.stringify(guest.settings) !== JSON.stringify(dataRef.current.settings)) {
          next = { ...dataRef.current, settings: guest.settings };
        }
      }
      if (!next) return;
      lastSaved.current = keyOf(ws) + JSON.stringify(next);
      lastSettings.current = JSON.stringify(next.settings);
      dataRef.current = next;
      dispatch({ type: "replace", data: next });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storage, switchWorkspace]);

  // The day changes while the tab stays open.
  useEffect(() => {
    const check = () => setToday((prev) => (prev === todayOf() ? prev : todayOf()));
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, undo?: AppData) => {
    const id = newId();
    setToasts((list) => [
      ...list.slice(-2),
      { id, message, undo: undo ?? null, validAt: version.current + 1, expiresAt: Date.now() + TOAST_MS },
    ]);
  }, []);

  const toastsRef = useRef(toasts);
  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const undoToast = useCallback((id: string) => {
    const toast = toastsRef.current.find((t) => t.id === id);
    if (toast?.undo) dispatch({ type: "replace", data: toast.undo });
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const store = useMemo<Store>(() => {
    const snapshot = () => dataRef.current;

    const makeTask = (title: string, extra: Partial<Task>, offset: number): Task => ({
      id: newId(),
      title,
      notes: "",
      listId: null,
      due: null,
      time: null,
      priority: 0,
      estimate: null,
      steps: [],
      repeat: null,
      color: null,
      doing: false,
      createdAt: Date.now() + offset,
      completedAt: null,
      ...extra,
    });

    const addList = (name: string, color?: ListColor): string => {
      const existing = dataRef.current.lists.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) return existing.id;
      const id = newId();
      const picked = color ?? LIST_COLORS[dataRef.current.lists.length % LIST_COLORS.length] ?? "slate";
      const list = { id, name: name.trim().slice(0, 60), color: picked, createdAt: Date.now() };
      dispatch({ type: "addList", list });
      dataRef.current = { ...dataRef.current, lists: [...dataRef.current.lists, list] };
      return id;
    };

    return {
      data,
      today,
      persistent,
      saving: persistent ? "ok" : initial.persistent ? "full" : "blocked",
      damaged,
      forgetDamaged,
      toasts,
      dismissToast,
      undoToast,
      notify: (message: string) => notify(message),

      addFromText(lines: string[], defaults: AddDefaults = {}, off: ReadonlySet<TokenKind> = new Set()) {
        const now = new Date();
        const created: Task[] = [];
        lines.forEach((line, i) => {
          const parsed = parseTask(line, now, off);
          if (!parsed.title) return;
          let listId = defaults.listId ?? null;
          if (parsed.listName) {
            const match = findList(dataRef.current.lists, parsed.listName);
            listId = match ? match.id : addList(parsed.listName.replace(/^./, (c) => c.toUpperCase()));
          }
          created.push(
            makeTask(
              parsed.title.slice(0, 300),
              {
                listId,
                due: parsed.due ?? defaults.due ?? null,
                time: parsed.time,
                priority: parsed.priority,
                estimate: parsed.estimate,
                repeat: parsed.repeat,
              },
              i,
            ),
          );
        });
        if (created.length > 0) dispatch({ type: "addTasks", tasks: created });
        return created;
      },

      updateTask(id: string, patch: TaskPatch) {
        dispatch({ type: "updateTask", id, patch });
      },

      toggleTask(id: string) {
        const before = snapshot();
        const task = before.tasks.find((t) => t.id === id);
        if (!task) return;
        if (task.completedAt !== null) {
          dispatch({ type: "reopenTask", id });
          notify("Back on the list.", before);
          return;
        }
        dispatch({ type: "completeTask", id, at: Date.now(), today: todayOf(), logId: newId() });
        notify(task.repeat ? "Done. It comes back on its next day." : "Done.", before);
      },

      deleteTask(id: string) {
        const before = snapshot();
        if (!before.tasks.some((t) => t.id === id)) return;
        dispatch({ type: "deleteTask", id });
        notify("Task deleted.", before);
      },

      setDue(ids: string[], due: string | null, message: string) {
        if (ids.length === 0) return;
        const before = snapshot();
        dispatch({ type: "setDue", ids, due });
        notify(message, before);
      },

      clearDone() {
        const before = snapshot();
        dispatch({ type: "clearDone" });
        notify("Finished tasks cleared.", before);
      },

      addList,

      updateList(id: string, patch: { name?: string; color?: ListColor }) {
        dispatch({ type: "updateList", id, ...patch });
      },

      deleteList(id: string) {
        const before = snapshot();
        dispatch({ type: "deleteList", id });
        notify("List deleted. Its tasks are in the Inbox.", before);
      },

      updateSettings(patch: Partial<Settings>) {
        dispatch({ type: "updateSettings", patch });
      },

      moveTask(view, shown, id, to) {
        const orders = placeTask(shown, id, to);
        if (Object.keys(orders).length === 0) return;
        const before = snapshot();
        dispatch({ type: "setOrders", orders });
        // Moving a task by hand only sticks in "My order": switch this view to it, once.
        const display = dataRef.current.settings.display[view] ?? DEFAULT_DISPLAY;
        if (display.sort !== "manual") {
          dispatch({ type: "setDisplay", view, display: { ...display, sort: "manual" } });
          notify("Sorted by your order now.", before);
        }
      },

      setDisplay(view, display) {
        dispatch({ type: "setDisplay", view, display: display && !isDefault(display) ? display : null });
      },

      replaceAll(next: AppData, message: string) {
        const before = snapshot();
        dispatch({ type: "replace", data: next });
        notify(message, before);
      },

      read: snapshot,

      workspace,
      readWorkspace: () => workspaceRef.current,
      switchWorkspace,

      load(next: AppData) {
        if (next === dataRef.current) return;
        dispatch({ type: "replace", data: next });
        // Visible to read() at once, before React has rendered.
        dataRef.current = next;
      },

      dayOf: (timestamp: number) => toDay(new Date(timestamp)),
    };
  }, [data, today, persistent, initial.persistent, damaged, forgetDamaged, toasts, dismissToast, undoToast, notify, workspace, switchWorkspace]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

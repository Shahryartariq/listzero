import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { STORAGE_KEY, load, parseBackup, safeStorage, save } from "../lib/backup";
import { today as todayOf, toDay } from "../lib/dates";
import { newId } from "../lib/id";
import { parseTask, type TokenKind } from "../lib/parse";
import { findList, reducer, type TaskPatch } from "../lib/store";
import { LIST_COLORS, type AppData, type ListColor, type Settings, type Task } from "../lib/types";
import { StoreContext, type AddDefaults, type Store, type Toast } from "./store-context";

const TOAST_MS = 7000;

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
    return loaded;
  }, [storage]);

  const [data, dispatch] = useReducer(reducer, initial.data);
  const [persistent, setPersistent] = useState(initial.persistent);
  const [today, setToday] = useState(() => todayOf());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dataRef = useRef(data);
  const lastSaved = useRef<string | null>(null);

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
    const json = JSON.stringify(data);
    if (json === lastSaved.current) return;
    lastSaved.current = json;
    setPersistent(save(storage, data));
  }, [data, storage]);

  // Another tab changed the data: follow it instead of overwriting it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      const next = parseBackup(e.newValue);
      if (!next) return;
      lastSaved.current = JSON.stringify(next);
      dispatch({ type: "replace", data: next });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

      replaceAll(next: AppData, message: string) {
        const before = snapshot();
        dispatch({ type: "replace", data: next });
        notify(message, before);
      },

      dayOf: (timestamp: number) => toDay(new Date(timestamp)),
    };
  }, [data, today, persistent, toasts, dismissToast, undoToast, notify]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

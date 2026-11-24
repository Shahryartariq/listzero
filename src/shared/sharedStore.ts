/**
 * One shared list, dressed as a store, so the screens built for a person's own lists (rows, cards,
 * board, calendar, table, the task sheet, quick add) work on it unchanged. Task changes go to the
 * shared space and out to the server; settings (how the list is displayed) stay the person's own.
 */
import { DEFAULT_DISPLAY, placeTask } from "../lib/display";
import { newId } from "../lib/id";
import { parseTask, type TokenKind } from "../lib/parse";
import { reducer, type Action } from "../lib/store";
import type { AppData, Task } from "../lib/types";
import type { AddDefaults, Store } from "../state/store-context";
import { asTaskList, callShared, readSpace, requestSharedSync, setSpace, type SharedList } from "./space";

/**
 * Shows who is on a task and who finished it straight away, as the server will once it hears of it
 * (the server works this out again and its answer is the one kept).
 */
export function stampHere(task: Task, before: Task | null, userId: string): Task {
  const next: Task = { ...task };
  const doing = next.doing && next.completedAt === null;
  if (!doing) delete next.doingBy;
  else if (!before?.doing || before.completedAt !== null || !next.doingBy) next.doingBy = userId;
  if (next.completedAt === null) delete next.doneBy;
  else if (before?.completedAt == null || !next.doneBy) next.doneBy = userId;
  return next;
}

export function sharedStore(personal: Store, list: SharedList): Store {
  const listId = list.id;
  const canEdit = list.role !== "view";

  const view = (): AppData => {
    const s = readSpace();
    return {
      ...personal.data,
      tasks: (s?.tasks ?? []).filter((t) => t.listId === listId),
      lists: [asTaskList(list)],
    };
  };

  const setTasks = (tasks: Task[]) => {
    const s = readSpace();
    if (!s) return;
    const was = new Map(s.tasks.map((t) => [t.id, t]));
    const mine = tasks.map((t) => stampHere({ ...t, listId }, was.get(t.id) ?? null, s.userId));
    setSpace({ ...s, tasks: [...s.tasks.filter((t) => t.listId !== listId), ...mine] });
    requestSharedSync();
  };

  /** Runs one of the store's own actions on this list's tasks. Returns the tasks as they were, for Undo. */
  const commit = (action: Action): Task[] | null => {
    if (!canEdit) {
      personal.notify("You can only view this list.");
      return null;
    }
    const before = view();
    setTasks(reducer(before, action).tasks);
    return before.tasks;
  };

  const withUndo = (message: string, before: Task[] | null) => {
    if (before) personal.notifyUndo(message, () => setTasks(before));
  };

  return {
    ...personal,
    readOnly: !canEdit,
    data: view(),
    read: view,
    addFromText(lines: string[], defaults: AddDefaults = {}, off: ReadonlySet<TokenKind> = new Set()) {
      if (!canEdit) {
        personal.notify("You can only view this list.");
        return [];
      }
      const now = new Date();
      const created: Task[] = [];
      lines.forEach((line, i) => {
        // A #name in a shared list is part of the title: tasks here stay here.
        const parsed = parseTask(line, now, new Set([...off, "list"]));
        if (!parsed.title) return;
        created.push({
          id: newId(),
          title: parsed.title.slice(0, 300),
          notes: "",
          listId,
          due: parsed.due ?? defaults.due ?? null,
          time: parsed.time,
          priority: parsed.priority,
          estimate: parsed.estimate,
          steps: [],
          repeat: parsed.repeat,
          color: null,
          doing: false,
          createdAt: Date.now() + i,
          completedAt: null,
        });
      });
      if (created.length > 0) commit({ type: "addTasks", tasks: created });
      return created;
    },
    updateTask(id, patch) {
      commit({ type: "updateTask", id, patch });
    },
    toggleTask(id) {
      const task = view().tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.completedAt !== null) {
        withUndo("Back on the list.", commit({ type: "reopenTask", id }));
        return;
      }
      const at = Date.now();
      const before = commit({ type: "completeTask", id, at, today: personal.dayOf(at), logId: newId() });
      withUndo(task.repeat ? "Done. It comes back on its next day." : "Done.", before);
    },
    deleteTask(id) {
      withUndo("Task deleted for everyone in this list.", commit({ type: "deleteTask", id }));
    },
    setDue(ids, due, message) {
      withUndo(message, commit({ type: "setDue", ids, due }));
    },
    clearDone() {
      withUndo("Finished tasks cleared for everyone in this list.", commit({ type: "clearDone" }));
    },
    moveTask(viewKey, shown, id, to) {
      const orders = placeTask(shown, id, to);
      if (Object.keys(orders).length === 0) return;
      const before = commit({ type: "setOrders", orders });
      const display = personal.data.settings.display[viewKey] ?? DEFAULT_DISPLAY;
      if (before && display.sort !== "manual") {
        personal.setDisplay(viewKey, { ...display, sort: "manual" });
        personal.notify("Sorted by your order now.");
      }
    },
    addList: () => listId,
    updateList(id, patch) {
      if (id !== listId || list.role !== "owner") return;
      void callShared("update", { listId, ...patch }).catch((e: Error) => personal.notify(e.message));
    },
    deleteList(id) {
      if (id !== listId || list.role !== "owner") return;
      void callShared("delete", { listId }).catch((e: Error) => personal.notify(e.message));
    },
    replaceAll: () => undefined,
    load: () => undefined,
  };
}

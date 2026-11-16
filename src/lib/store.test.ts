import { describe, expect, it } from "vitest";
import { toDay } from "./dates";
import {
  boardView,
  compareTasks,
  doneCounts,
  doneView,
  findList,
  inboxView,
  nextStep,
  reducer,
  searchTasks,
  todayView,
  totalEstimate,
  upcomingView,
} from "./store";
import { emptyData, type AppData, type Task, type TaskList } from "./types";

const TODAY = "2026-11-16";
const dayOf = (ts: number) => toDay(new Date(ts));
let seq = 0;

function task(title: string, extra: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
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
    createdAt: seq,
    completedAt: null,
    ...extra,
  };
}

const list = (id: string, name: string): TaskList => ({ id, name, color: "moss", createdAt: 1 });

function data(tasks: Task[], lists: TaskList[] = []): AppData {
  return { ...emptyData(), tasks, lists };
}

describe("reducer", () => {
  it("completes and reopens a task", () => {
    const a = task("A");
    let state = reducer(data([a]), { type: "completeTask", id: a.id, at: 1000, today: TODAY, logId: "log" });
    expect(state.tasks[0]?.completedAt).toBe(1000);
    state = reducer(state, { type: "reopenTask", id: a.id });
    expect(state.tasks[0]?.completedAt).toBeNull();
  });

  it("moves a repeating task forward and leaves a finished copy", () => {
    const a = task("Water plants", {
      due: TODAY,
      repeat: "weekly",
      steps: [{ id: "s1", title: "Fill the can", done: true }],
    });
    const state = reducer(data([a]), { type: "completeTask", id: a.id, at: 1000, today: TODAY, logId: "log" });
    expect(state.tasks).toHaveLength(2);
    const [open, finished] = state.tasks;
    expect(open).toMatchObject({ id: a.id, due: "2026-11-23", completedAt: null, repeat: "weekly" });
    expect(open?.steps[0]?.done).toBe(false);
    expect(finished).toMatchObject({ id: "log", completedAt: 1000, repeat: null });
    expect(finished?.steps[0]?.done).toBe(true);
  });

  it("ignores completing a task twice", () => {
    const a = task("A", { completedAt: 5 });
    const before = data([a]);
    expect(reducer(before, { type: "completeTask", id: a.id, at: 9, today: TODAY, logId: "x" })).toBe(before);
  });

  it("drops the time and the repeat when the day is removed", () => {
    const a = task("A", { due: TODAY, time: "09:00", repeat: "daily" });
    const viaPatch = reducer(data([a]), { type: "updateTask", id: a.id, patch: { due: null } });
    expect(viaPatch.tasks[0]).toMatchObject({ due: null, time: null, repeat: null });
    const viaBulk = reducer(data([a]), { type: "setDue", ids: [a.id], due: null });
    expect(viaBulk.tasks[0]).toMatchObject({ due: null, time: null, repeat: null });
  });

  it("keeps the time when a task moves to another day", () => {
    const a = task("A", { due: TODAY, time: "09:00" });
    const state = reducer(data([a]), { type: "setDue", ids: [a.id], due: "2026-11-17" });
    expect(state.tasks[0]).toMatchObject({ due: "2026-11-17", time: "09:00" });
  });

  it("sends a deleted list's tasks to the Inbox instead of deleting them", () => {
    const a = task("A", { listId: "work" });
    const state = reducer(data([a], [list("work", "Work")]), { type: "deleteList", id: "work" });
    expect(state.lists).toHaveLength(0);
    expect(state.tasks[0]?.listId).toBeNull();
  });

  it("a finished task is no longer in progress, including a repeating one", () => {
    const a = task("A", { doing: true });
    const done = reducer(data([a]), { type: "completeTask", id: a.id, at: 9, today: TODAY, logId: "x" });
    expect(done.tasks[0]).toMatchObject({ doing: false, completedAt: 9 });

    const b = task("B", { doing: true, due: TODAY, repeat: "daily" });
    const next = reducer(data([b]), { type: "completeTask", id: b.id, at: 9, today: TODAY, logId: "log" });
    expect(next.tasks.map((t) => t.doing)).toEqual([false, false]);
  });

  it("clears only finished tasks", () => {
    const state = reducer(data([task("A"), task("B", { completedAt: 3 })]), { type: "clearDone" });
    expect(state.tasks.map((t) => t.title)).toEqual(["A"]);
  });
});

describe("views", () => {
  it("orders by priority, then time, then age", () => {
    const tasks = [
      task("none"),
      task("p3", { priority: 3 }),
      task("p1 late", { priority: 1, time: "15:00" }),
      task("p1 early", { priority: 1, time: "09:00" }),
      task("p2", { priority: 2 }),
    ];
    expect([...tasks].sort(compareTasks).map((t) => t.title)).toEqual(["p1 early", "p1 late", "p2", "p3", "none"]);
  });

  it("puts tasks in progress first", () => {
    const tasks = [task("p1", { priority: 1 }), task("doing", { doing: true }), task("plain")];
    expect([...tasks].sort(compareTasks).map((t) => t.title)).toEqual(["doing", "p1", "plain"]);
  });

  it("sorts the board into three columns for the chosen scope", () => {
    const now = new Date(2026, 10, 16, 12).getTime();
    const yesterday = new Date(2026, 10, 15, 12).getTime();
    const all = data(
      [
        task("due today", { due: TODAY }),
        task("urgent today", { due: TODAY, priority: 1 }),
        task("carried", { due: "2026-11-10", doing: true }),
        task("tomorrow", { due: "2026-11-17" }),
        task("inbox idea"),
        task("work thing", { listId: "work", doing: true }),
        task("done now", { completedAt: now, listId: "work" }),
        task("done earlier today", { completedAt: now - 1000 }),
        task("done yesterday", { completedAt: yesterday, listId: "work" }),
      ],
      [list("work", "Work")],
    );
    const titles = (scope: string) => {
      const v = boardView(all, scope, TODAY, dayOf);
      return [v.todo, v.doing, v.done].map((col) => col.map((t) => t.title));
    };
    expect(titles("today")).toEqual([["urgent today", "due today"], ["carried"], ["done now", "done earlier today"]]);
    expect(titles("inbox")).toEqual([
      ["urgent today", "due today", "tomorrow", "inbox idea"],
      ["carried"],
      ["done earlier today"],
    ]);
    expect(titles("work")).toEqual([[], ["work thing"], ["done now"]]);
    expect(titles("all")).toEqual([
      ["urgent today", "due today", "tomorrow", "inbox idea"],
      ["carried", "work thing"],
      ["done now", "done earlier today"],
    ]);
  });

  it("splits Today into due and carried over, and leaves out finished tasks", () => {
    const view = todayView(
      data([
        task("due", { due: TODAY }),
        task("old", { due: "2026-11-10" }),
        task("older", { due: "2026-11-01" }),
        task("finished", { due: TODAY, completedAt: 1 }),
        task("future", { due: "2026-11-17" }),
        task("undated"),
      ]),
      TODAY,
    );
    expect(view.due.map((t) => t.title)).toEqual(["due"]);
    expect(view.carried.map((t) => t.title)).toEqual(["older", "old"]);
  });

  it("groups Upcoming by day, soonest first", () => {
    const groups = upcomingView(
      data([task("b", { due: "2026-11-20" }), task("a", { due: "2026-11-17" }), task("c", { due: "2026-11-20", priority: 1 })]),
      TODAY,
    );
    expect(groups.map((g) => g.day)).toEqual(["2026-11-17", "2026-11-20"]);
    expect(groups[1]?.tasks.map((t) => t.title)).toEqual(["c", "b"]);
  });

  it("keeps the Inbox to open tasks with no list", () => {
    const tasks = [task("in"), task("listed", { listId: "work" }), task("done", { completedAt: 1 })];
    expect(inboxView(data(tasks, [list("work", "Work")])).map((t) => t.title)).toEqual(["in"]);
  });

  it("groups Done by day, newest first", () => {
    const monday = new Date(2026, 10, 16, 9).getTime();
    const sunday = new Date(2026, 10, 15, 9).getTime();
    const groups = doneView(
      data([task("a", { completedAt: sunday }), task("b", { completedAt: monday }), task("c", { completedAt: monday + 1 })]),
      dayOf,
    );
    expect(groups.map((g) => g.day)).toEqual(["2026-11-16", "2026-11-15"]);
    expect(groups[0]?.tasks.map((t) => t.title)).toEqual(["c", "b"]);
  });

  it("counts what was finished today and in the last seven days", () => {
    const at = (d: number) => new Date(2026, 10, d, 12).getTime();
    const counts = doneCounts(
      data([
        task("today", { completedAt: at(16) }),
        task("six days ago", { completedAt: at(10) }),
        task("seven days ago", { completedAt: at(9) }),
        task("open"),
      ]),
      TODAY,
      dayOf,
    );
    expect(counts).toEqual({ today: 1, week: 2 });
  });

  it("adds up estimates and finds the next step", () => {
    expect(totalEstimate([task("a", { estimate: 15 }), task("b"), task("c", { estimate: 45 })])).toBe(60);
    const t = task("big", {
      steps: [
        { id: "1", title: "first", done: true },
        { id: "2", title: "second", done: false },
      ],
    });
    expect(nextStep(t)).toBe("second");
    expect(nextStep(task("plain"))).toBeNull();
  });
});

describe("search and lists", () => {
  const lists = [list("work", "Work"), list("side", "Side project")];
  const tasks = [
    task("Send invoice", { listId: "work", notes: "For the October job" }),
    task("Plan launch", { listId: "side", steps: [{ id: "s", title: "Write the invoice email", done: false }] }),
    task("Old invoice", { completedAt: 1 }),
    task("Buy milk"),
  ];

  it("matches every word across name, notes, steps and list name", () => {
    expect(searchTasks(data(tasks, lists), "invoice").map((t) => t.title)).toEqual([
      "Send invoice",
      "Plan launch",
      "Old invoice",
    ]);
    expect(searchTasks(data(tasks, lists), "october INVOICE").map((t) => t.title)).toEqual(["Send invoice"]);
    expect(searchTasks(data(tasks, lists), "side").map((t) => t.title)).toEqual(["Plan launch"]);
    expect(searchTasks(data(tasks, lists), "   ")).toEqual([]);
    const coloured = [task("Tax form", { color: "blue" }), task("Blue pen"), task("Other", { color: "moss" })];
    expect(searchTasks(data(coloured), "blue").map((t) => t.title)).toEqual(["Tax form", "Blue pen"]);
  });

  it("matches a typed list name loosely", () => {
    expect(findList(lists, "work")?.id).toBe("work");
    expect(findList(lists, "side project")?.id).toBe("side");
    expect(findList(lists, "sideproject")?.id).toBe("side");
    expect(findList(lists, "wo")?.id).toBe("work");
    expect(findList(lists, "home")).toBeNull();
  });
});

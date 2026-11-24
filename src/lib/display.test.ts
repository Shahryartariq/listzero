import { describe, expect, it } from "vitest";
import { readData } from "./backup";
import {
  DEFAULT_DISPLAY,
  NO_FILTERS,
  activeFilters,
  applyDisplay,
  isDefault,
  matches,
  placeTask,
  rank,
  readDisplay,
  readDisplays,
  sortTasks,
  type Display,
} from "./display";
import { reducer } from "./store";
import { emptyData, type AppData, type Task } from "./types";

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

const titles = (tasks: Task[]) => tasks.map((t) => t.title);
const withFilters = (filters: Partial<Display["filters"]>): Display => ({
  ...DEFAULT_DISPLAY,
  filters: { ...NO_FILTERS, ...filters },
});

describe("filters", () => {
  const tasks = [
    task("urgent blue", { priority: 1, color: "blue", listId: "work", estimate: 10 }),
    task("medium", { priority: 2, listId: "home", estimate: 60 }),
    task("plain"),
    task("doing moss", { color: "moss", doing: true, estimate: 15 }),
  ];

  it("lets everything through when nothing is switched on", () => {
    expect(applyDisplay(tasks, DEFAULT_DISPLAY)).toEqual(tasks);
    expect(activeFilters(NO_FILTERS)).toBe(0);
  });

  it("filters by priority, including tasks with none", () => {
    expect(titles(applyDisplay(tasks, withFilters({ priorities: [1, 2] })))).toEqual(["urgent blue", "medium"]);
    expect(titles(applyDisplay(tasks, withFilters({ priorities: [0] })))).toEqual(["plain", "doing moss"]);
  });

  it("ignores task colours, which are no longer shown", () => {
    expect(titles(applyDisplay(tasks, withFilters({})))).toEqual(titles(tasks));
  });

  it("filters by list, with the Inbox as a choice", () => {
    expect(titles(applyDisplay(tasks, withFilters({ lists: ["work"] })))).toEqual(["urgent blue"]);
    expect(titles(applyDisplay(tasks, withFilters({ lists: ["inbox", "home"] })))).toEqual([
      "medium",
      "plain",
      "doing moss",
    ]);
  });

  it("filters to tasks in progress and to quick tasks", () => {
    expect(titles(applyDisplay(tasks, withFilters({ doing: true })))).toEqual(["doing moss"]);
    // Quick means 15 minutes or less; a task with no estimate is not known to be quick.
    expect(titles(applyDisplay(tasks, withFilters({ quick: true })))).toEqual(["urgent blue", "doing moss"]);
  });

  it("requires every group that is on, and counts the groups", () => {
    const f = { ...NO_FILTERS, lists: ["inbox", "home"], quick: true, doing: true };
    expect(titles(tasks.filter((t) => matches(t, f)))).toEqual(["doing moss"]);
    expect(activeFilters(f)).toBe(3);
  });
});

describe("sorting", () => {
  const tasks = [
    task("Banana", { priority: 3, due: "2026-11-20", estimate: 30 }),
    task("apple", { priority: 1, due: "2026-11-25" }),
    task("Cherry 10", { due: "2026-11-18", estimate: 5 }),
    task("cherry 9", { priority: 1, due: "2026-11-19", estimate: 45 }),
  ];

  it("keeps the view's own order for the suggested sort and never changes the input", () => {
    const copy = [...tasks];
    expect(sortTasks(tasks, "smart")).toBe(tasks);
    sortTasks(tasks, "name");
    expect(tasks).toEqual(copy);
  });

  it.each([
    ["priority", ["cherry 9", "apple", "Banana", "Cherry 10"]],
    ["day", ["Cherry 10", "cherry 9", "Banana", "apple"]],
    ["name", ["apple", "Banana", "cherry 9", "Cherry 10"]],
    ["newest", ["cherry 9", "Cherry 10", "apple", "Banana"]],
    ["length", ["Cherry 10", "Banana", "cherry 9", "apple"]],
  ] as const)("sorts by %s", (sort, expected) => {
    expect(titles(sortTasks(tasks, sort))).toEqual(expected);
  });

  it("puts tasks with no day last when sorting by day", () => {
    const mixed = [task("undated"), task("dated", { due: "2026-12-01" })];
    expect(titles(sortTasks(mixed, "day"))).toEqual(["dated", "undated"]);
  });
});

describe("saved display settings", () => {
  it("knows the default", () => {
    expect(isDefault(DEFAULT_DISPLAY)).toBe(true);
    expect(isDefault({ ...DEFAULT_DISPLAY, layout: "table" })).toBe(false);
    expect(isDefault({ ...DEFAULT_DISPLAY, sort: "name" })).toBe(false);
    expect(isDefault(withFilters({ quick: true }))).toBe(false);
  });

  it("repairs anything it does not recognise", () => {
    expect(readDisplay(null)).toEqual(DEFAULT_DISPLAY);
    expect(readDisplay({ layout: "gantt", sort: "random", filters: "all" })).toEqual(DEFAULT_DISPLAY);
    expect(
      readDisplay({
        layout: "calendar",
        sort: "day",
        filters: { priorities: [1, 1, 9, "2"], colors: ["blue", "neon", "none"], lists: ["work", "<x>", 4], doing: 1, quick: true },
      }),
    ).toEqual({
      layout: "calendar",
      sort: "day",
      // A colour filter saved before colours were dropped is let go.
      filters: { priorities: [1], lists: ["work"], doing: false, quick: true },
    });
  });

  it("keeps settings only for real view names, and drops entries that are just the default", () => {
    const saved = readDisplays({
      today: { layout: "board" },
      "list:work": { sort: "name" },
      inbox: { layout: "list", sort: "smart" },
      settings: { layout: "table" },
      "list:<script>": { layout: "table" },
    });
    expect(Object.keys(saved)).toEqual(["today", "list:work"]);
  });

  it("travels with a backup, and older backups get none", () => {
    const withDisplay = readData({ version: 1, tasks: [], settings: { display: { upcoming: { layout: "calendar" } } } });
    expect(withDisplay?.settings.display).toEqual({ upcoming: { ...DEFAULT_DISPLAY, layout: "calendar" } });
    expect(readData({ version: 1, tasks: [], settings: { theme: "dark" } })?.settings.display).toEqual({});
  });
});

describe("display in the store", () => {
  it("saves and resets one view without touching the others", () => {
    let state = emptyData();
    state = reducer(state, { type: "setDisplay", view: "today", display: { ...DEFAULT_DISPLAY, layout: "board" } });
    state = reducer(state, { type: "setDisplay", view: "inbox", display: { ...DEFAULT_DISPLAY, sort: "name" } });
    expect(Object.keys(state.settings.display)).toEqual(["today", "inbox"]);
    state = reducer(state, { type: "setDisplay", view: "today", display: null });
    expect(state.settings.display).toEqual({ inbox: { ...DEFAULT_DISPLAY, sort: "name" } });
  });

  it("forgets a deleted list everywhere", () => {
    let state: AppData = { ...emptyData(), lists: [{ id: "work", name: "Work", color: "blue", createdAt: 1 }] };
    state = reducer(state, { type: "setDisplay", view: "list:work", display: { ...DEFAULT_DISPLAY, layout: "table" } });
    state = reducer(state, { type: "setDisplay", view: "today", display: withFilters({ lists: ["work", "inbox"] }) });
    state = reducer(state, { type: "deleteList", id: "work" });
    expect(state.settings.display["list:work"]).toBeUndefined();
    expect(state.settings.display.today?.filters.lists).toEqual(["inbox"]);
  });
});

describe("my order", () => {
  const ordered = (tasks: Task[], orders: Record<string, number>) =>
    sortTasks(
      tasks.map((t) => (t.id in orders ? { ...t, order: orders[t.id] } : t)),
      "manual",
    ).map((t) => t.title);

  it("starts as the order the tasks were added in", () => {
    const a = task("A", { createdAt: 1 });
    const b = task("B", { createdAt: 2 });
    const c = task("C", { createdAt: 3 });
    expect(sortTasks([c, a, b], "manual").map((t) => t.title)).toEqual(["A", "B", "C"]);
    expect(rank(a)).toBe(1);
  });

  it("moves one task between its new neighbours, changing only that task", () => {
    const tasks = [task("A", { createdAt: 10 }), task("B", { createdAt: 20 }), task("C", { createdAt: 30 })];
    const down = placeTask(tasks, tasks[0]!.id, 2);
    expect(Object.keys(down)).toEqual([tasks[0]!.id]);
    expect(ordered(tasks, down)).toEqual(["B", "C", "A"]);

    const middle = placeTask(tasks, tasks[2]!.id, 1);
    expect(middle[tasks[2]!.id]).toBe(15);
    expect(ordered(tasks, middle)).toEqual(["A", "C", "B"]);

    expect(ordered(tasks, placeTask(tasks, tasks[2]!.id, 0))).toEqual(["C", "A", "B"]);
    expect(placeTask(tasks, tasks[1]!.id, 1)).toEqual({});
  });

  it("numbers a view afresh when it was shown another way, keeping what was on screen", () => {
    // Shown by priority, not in added order: C, A, B on screen. Move B to the top.
    const a = task("A", { createdAt: 10 });
    const b = task("B", { createdAt: 20 });
    const c = task("C", { createdAt: 30 });
    const shown = [c, a, b];
    const orders = placeTask(shown, b.id, 0);
    expect(Object.keys(orders).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(ordered(shown, orders)).toEqual(["B", "C", "A"]);
    expect(Math.min(...Object.values(orders))).toBe(10);
  });

  it("numbers afresh when two neighbours have no room between them", () => {
    const tasks = [task("A", { createdAt: 5 }), task("B", { createdAt: 5 }), task("C", { createdAt: 6 })];
    const orders = placeTask(tasks, tasks[2]!.id, 1);
    expect(ordered(tasks, orders)).toEqual(["A", "C", "B"]);
  });

  it("keeps a valid order through a backup and drops a broken one", () => {
    const base = task("Kept", { order: 12.5 });
    const data = readData({ version: 1, tasks: [base, { ...task("Odd"), order: "soon" }, { ...task("Huge"), order: 1e20 }], lists: [] });
    expect(data!.tasks.map((t) => t.order)).toEqual([12.5, undefined, undefined]);
  });

  it("is a sort the display settings accept", () => {
    expect(readDisplay({ layout: "list", sort: "manual" }).sort).toBe("manual");
    const state = reducer(emptyData(), { type: "addTasks", tasks: [task("A")] });
    const moved = reducer(state, { type: "setOrders", orders: { [state.tasks[0]!.id]: 7 } });
    expect(moved.tasks[0]!.order).toBe(7);
  });
});

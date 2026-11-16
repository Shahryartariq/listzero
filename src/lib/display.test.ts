import { describe, expect, it } from "vitest";
import { readData } from "./backup";
import {
  DEFAULT_DISPLAY,
  NO_FILTERS,
  activeFilters,
  applyDisplay,
  isDefault,
  matches,
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

  it("filters by colour, including tasks with none", () => {
    expect(titles(applyDisplay(tasks, withFilters({ colors: ["blue", "moss"] })))).toEqual(["urgent blue", "doing moss"]);
    expect(titles(applyDisplay(tasks, withFilters({ colors: ["none"] })))).toEqual(["medium", "plain"]);
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
    const f = { ...NO_FILTERS, colors: ["blue" as const, "moss" as const], quick: true, doing: true };
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
      filters: { priorities: [1], colors: ["blue", "none"], lists: ["work"], doing: false, quick: true },
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

import { describe, expect, it } from "vitest";
import { emptyData, type AppData, type Task, type TaskList } from "../lib/types";
import {
  applyChanges,
  changedBetween,
  emptyFingerprints,
  fingerprint,
  fingerprintsOf,
  loadSyncState,
  localChanges,
  saveSyncState,
  settle,
  type Change,
} from "./engine";

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
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
  createdAt: 1,
  completedAt: null,
  ...extra,
});
const list = (id: string, name = id): TaskList => ({ id, name, color: "blue", createdAt: 1 });
const data = (tasks: Task[], lists: TaskList[] = []): AppData => ({ ...emptyData(), tasks, lists });

describe("fingerprints", () => {
  it("do not depend on the order of an item's fields", () => {
    const a = task("a", { title: "Same" });
    const shuffled = Object.fromEntries(Object.entries(a).reverse()) as unknown as Task;
    expect(fingerprint(shuffled)).toBe(fingerprint(a));
  });

  it("change when anything about the item changes", () => {
    const a = task("a");
    expect(fingerprint({ ...a, title: "Other" })).not.toBe(fingerprint(a));
    expect(fingerprint({ ...a, steps: [{ id: "s", title: "Step", done: false }] })).not.toBe(fingerprint(a));
    expect(fingerprint({ ...a, steps: [{ id: "s", title: "Step", done: true }] })).not.toBe(
      fingerprint({ ...a, steps: [{ id: "s", title: "Step", done: false }] }),
    );
  });
});

describe("what a device sends", () => {
  it("sends everything the server has never seen, lists before tasks", () => {
    const changes = localChanges(data([task("t1", { listId: "work" })], [list("work")]), emptyFingerprints());
    expect(changes.map((c) => `${c.kind}:${c.id}`)).toEqual(["list:work", "task:t1"]);
  });

  it("sends nothing when nothing changed", () => {
    const d = data([task("t1"), task("t2")], [list("work")]);
    expect(localChanges(d, fingerprintsOf(d))).toEqual([]);
  });

  it("sends edits and deletions, and only those", () => {
    const before = data([task("t1"), task("t2"), task("t3")], [list("work"), list("home")]);
    const known = fingerprintsOf(before);
    const after = data([task("t1"), task("t2", { title: "Edited" }), task("t4")], [list("work")]);
    expect(localChanges(after, known)).toEqual<Change[]>([
      { kind: "task", id: "t2", data: task("t2", { title: "Edited" }) },
      { kind: "task", id: "t4", data: task("t4") },
      { kind: "list", id: "home", data: null },
      { kind: "task", id: "t3", data: null },
    ]);
  });
});

describe("what a device does with what it receives", () => {
  it("adds, replaces and removes items", () => {
    const before = data([task("t1"), task("t2")], [list("work")]);
    const after = applyChanges(before, [
      { kind: "task", id: "t1", data: task("t1", { title: "From the phone" }) },
      { kind: "task", id: "t2", data: null },
      { kind: "task", id: "t3", data: task("t3") },
      { kind: "list", id: "home", data: list("home", "Home") },
    ]);
    expect(after.tasks.map((t) => t.title)).toEqual(["From the phone", "Task t3"]);
    expect(after.lists.map((l) => l.name)).toEqual(["work", "Home"]);
  });

  it("returns the same object when there is nothing to do, so nothing re-renders or re-saves", () => {
    const before = data([task("t1")]);
    expect(applyChanges(before, [])).toBe(before);
    expect(applyChanges(before, [{ kind: "task", id: "t1", data: task("t1", { title: "X" }) }], new Set(["task:t1"]))).toBe(before);
  });

  it("leaves alone what was edited here while the request was in the air", () => {
    const base = data([task("t1"), task("t2")]);
    const current = data([task("t1", { title: "Typed just now" }), task("t2")]);
    const skip = changedBetween(base, current);
    expect([...skip]).toEqual(["task:t1"]);
    const after = applyChanges(
      current,
      [
        { kind: "task", id: "t1", data: task("t1", { title: "From the phone" }) },
        { kind: "task", id: "t2", data: task("t2", { title: "Also from the phone" }) },
      ],
      skip,
    );
    expect(after.tasks.map((t) => t.title)).toEqual(["Typed just now", "Also from the phone"]);
  });

  it("moves a task to the Inbox when its list was deleted elsewhere, and drops that list's saved display", () => {
    const before: AppData = {
      ...data([task("t1", { listId: "work" })], [list("work"), list("home")]),
      settings: {
        ...emptyData().settings,
        display: {
          "list:work": { layout: "board", sort: "smart", filters: { priorities: [], colors: [], lists: [], doing: false, quick: false } },
          today: { layout: "list", sort: "name", filters: { priorities: [], colors: [], lists: ["work", "home", "inbox"], doing: false, quick: false } },
        },
      },
    };
    const after = applyChanges(before, [{ kind: "list", id: "work", data: null }]);
    expect(after.tasks[0]?.listId).toBeNull();
    expect(Object.keys(after.settings.display)).toEqual(["today"]);
    expect(after.settings.display.today?.filters.lists).toEqual(["home", "inbox"]);
  });

  it("checks what arrives like any other untrusted input", () => {
    const before = data([task("t1")]);
    const after = applyChanges(before, [
      { kind: "task", id: "t9", data: { id: "t9", title: "<img src=x onerror=alert(1)>", priority: 99, evil: true } as unknown as Task },
      { kind: "task", id: "t8", data: { id: "different", title: "Wrong id" } as unknown as Task },
      { kind: "task", id: "t7", data: { id: "t7", title: "   " } as unknown as Task },
    ]);
    expect(after.tasks.map((t) => t.id)).toEqual(["t1", "t9"]);
    expect(after.tasks[1]).toMatchObject({ title: "<img src=x onerror=alert(1)>", priority: 0 });
    expect(after.tasks[1]).not.toHaveProperty("evil");
  });
});

describe("a full round trip", () => {
  it("ends with nothing left to send", () => {
    const device = data([task("t1"), task("t2")], [list("work")]);
    const sent = localChanges(device, emptyFingerprints());
    const received: Change[] = [{ kind: "task", id: "t3", data: task("t3") }];
    const known = settle(emptyFingerprints(), sent, received);
    const merged = applyChanges(device, received);
    expect(localChanges(merged, known)).toEqual([]);
  });

  it("sends an edit made during the request on the next round", () => {
    const base = data([task("t1")]);
    const known = settle(emptyFingerprints(), localChanges(base, emptyFingerprints()), []);
    const current = data([task("t1", { title: "Edited during the request" })]);
    expect(localChanges(current, known)).toHaveLength(1);
  });

  it("first sign-in on a device: the account's copy wins for shared items, and the rest is added to the account", () => {
    // The device has never synced. It first asks for everything (sending nothing)…
    const device = data([task("shared", { title: "Old copy on this device" }), task("only-here")]);
    const fromAccount: Change[] = [
      { kind: "task", id: "shared", data: task("shared", { title: "Newer copy in the account" }) },
      { kind: "task", id: "only-there", data: task("only-there") },
    ];
    const merged = applyChanges(device, fromAccount);
    const known = settle(emptyFingerprints(), [], fromAccount);
    expect(merged.tasks.find((t) => t.id === "shared")?.title).toBe("Newer copy in the account");
    // …and then sends only what the account did not have.
    expect(localChanges(merged, known).map((c) => c.id)).toEqual(["only-here"]);
  });

  it("a deletion that arrives for something edited here brings the edit back to the account", () => {
    const base = data([task("t1")]);
    const known = fingerprintsOf(base);
    const current = data([task("t1", { title: "Edited here" })]);
    const received: Change[] = [{ kind: "task", id: "t1", data: null }];
    const after = applyChanges(current, received, changedBetween(base, current));
    expect(after.tasks).toHaveLength(1);
    expect(localChanges(after, settle(known, [], received)).map((c) => c.data?.id)).toEqual(["t1"]);
  });
});

describe("what a device remembers", () => {
  const memory = () => {
    const items = new Map<string, string>();
    return {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
      items,
    };
  };

  it("survives a round trip through storage", () => {
    const storage = memory();
    const state = { userId: "u1", email: "a@b.c", cursor: 12, known: { task: { t1: "abc" }, list: {} } };
    saveSyncState(storage, state);
    expect(loadSyncState(storage)).toEqual(state);
    saveSyncState(storage, null);
    expect(loadSyncState(storage)).toBeNull();
  });

  it("ignores anything it cannot make sense of", () => {
    const storage = memory();
    for (const bad of ["{", "null", "[]", '{"userId":1}', '{"userId":"u","cursor":"x","known":{}}']) {
      storage.items.set("listzero:sync", bad);
      expect(loadSyncState(storage), bad).toBeNull();
    }
    storage.items.set("listzero:sync", '{"userId":"u","cursor":-4,"known":{"task":{"a":"x","b":3},"list":null}}');
    expect(loadSyncState(storage)).toEqual({ userId: "u", email: "", cursor: 0, known: { task: { a: "x" }, list: {} } });
  });
});

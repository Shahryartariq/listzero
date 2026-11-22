import { describe, expect, it } from "vitest";
import { STORAGE_KEY } from "../lib/backup";
import { emptyData, type AppData, type Settings, type Task, type TaskList } from "../lib/types";
import {
  ACTIVE_KEY,
  GUEST,
  LEGACY_SYNC_KEY,
  accountKey,
  clearGuestItems,
  forgetAccountCopy,
  keyOf,
  moveLegacyAccount,
  readAccount,
  readGuest,
  remember,
  remembered,
  syncKey,
  withGuestItems,
  writeAccount,
  writeSettings,
} from "./workspace";

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
const data = (tasks: Task[], lists: TaskList[] = [], settings?: Partial<Settings>): AppData => ({
  ...emptyData(),
  tasks,
  lists,
  settings: { ...emptyData().settings, ...settings },
});

function memory(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const saved = (d: AppData) => JSON.stringify({ version: 1, tasks: d.tasks, lists: d.lists, settings: d.settings });
const dark = { ...emptyData().settings, theme: "dark" } as Settings;

describe("whose tasks show first", () => {
  it("is the guest's until an account signs in here", () => {
    const storage = memory();
    expect(remembered(storage)).toEqual(GUEST);
    remember(storage, { kind: "account", userId: "user_1" });
    expect(remembered(storage)).toEqual({ kind: "account", userId: "user_1" });
    remember(storage, GUEST);
    expect(remembered(storage)).toEqual(GUEST);
    expect(storage.items.has(ACTIVE_KEY)).toBe(false);
  });

  it("ignores a remembered id that is not an id, and storage that throws", () => {
    expect(remembered(memory({ [ACTIVE_KEY]: "../../etc" }))).toEqual(GUEST);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => {}, removeItem: () => {} };
    expect(remembered(broken)).toEqual(GUEST);
    expect(remembered(null)).toEqual(GUEST);
  });

  it("keeps each workspace in its own place", () => {
    expect(keyOf(GUEST)).toBe(STORAGE_KEY);
    expect(keyOf({ kind: "account", userId: "a" })).toBe("listzero:account:a");
    expect(keyOf({ kind: "account", userId: "b" })).not.toBe(keyOf({ kind: "account", userId: "a" }));
  });
});

describe("an account's copy on this device", () => {
  it("holds tasks and lists only; the settings are the device's", () => {
    const storage = memory();
    expect(writeAccount(storage, "a", data([task("t1")], [list("l1")], { theme: "dark" }))).toBe(true);
    expect(JSON.parse(storage.items.get(accountKey("a"))!)).not.toHaveProperty("settings");

    const read = readAccount(storage, "a", dark);
    expect(read.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(read.lists.map((l) => l.id)).toEqual(["l1"]);
    expect(read.settings).toBe(dark);
  });

  it("reads as empty when missing or damaged", () => {
    expect(readAccount(memory(), "a", dark).tasks).toEqual([]);
    expect(readAccount(memory({ [accountKey("a")]: "{nope" }), "a", dark).tasks).toEqual([]);
  });

  it("is gone after sign-out, along with what sync knew, and the guest's tasks are untouched", () => {
    const guest = saved(data([task("g")]));
    const storage = memory({
      [STORAGE_KEY]: guest,
      [accountKey("a")]: "{}",
      [syncKey("a")]: "{}",
      [accountKey("b")]: "{}",
      [ACTIVE_KEY]: "a",
    });
    forgetAccountCopy(storage, "a");
    expect([...storage.items.keys()].sort()).toEqual([accountKey("b"), STORAGE_KEY].sort());
    expect(storage.items.get(STORAGE_KEY)).toBe(guest);
  });

  it("leaves another account's place in the active key alone", () => {
    const storage = memory({ [ACTIVE_KEY]: "b", [accountKey("a")]: "{}" });
    forgetAccountCopy(storage, "a");
    expect(storage.items.get(ACTIVE_KEY)).toBe("b");
  });
});

describe("settings while an account is signed in", () => {
  it("go to the guest's record, where the pre-paint script reads them, without touching its tasks", () => {
    const storage = memory({ [STORAGE_KEY]: saved(data([task("g")])) });
    writeSettings(storage, dark);
    const guest = readGuest(storage, emptyData().settings);
    expect(guest.tasks.map((t) => t.id)).toEqual(["g"]);
    expect(JSON.parse(storage.items.get(STORAGE_KEY)!).settings.theme).toBe("dark");
  });

  it("start a record when the guest has none yet", () => {
    const storage = memory();
    writeSettings(storage, dark);
    expect(JSON.parse(storage.items.get(STORAGE_KEY)!)).toMatchObject({ version: 1, tasks: [], settings: { theme: "dark" } });
  });
});

describe("browsers signed in before accounts had their own place", () => {
  const legacy = (userId: string) => JSON.stringify({ userId, email: "sam@a.test", cursor: 4, known: {} });

  it("move the signed-in account's tasks out of the guest's place", () => {
    const storage = memory({ [STORAGE_KEY]: saved(data([task("t1")], [list("l1")], { theme: "dark" })), [LEGACY_SYNC_KEY]: legacy("a") });
    expect(moveLegacyAccount(storage, "a")).toBe(true);

    expect(readAccount(storage, "a", dark).tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(storage.items.get(syncKey("a"))).toBe(legacy("a"));
    const guest = readGuest(storage, emptyData().settings);
    expect(guest.tasks).toEqual([]);
    expect(guest.lists).toEqual([]);
    expect(JSON.parse(storage.items.get(STORAGE_KEY)!).settings.theme).toBe("dark");
    expect(storage.items.has(LEGACY_SYNC_KEY)).toBe(false);
  });

  it("leave the tasks to the guest when the old state was another account's", () => {
    const storage = memory({ [STORAGE_KEY]: saved(data([task("t1")])), [LEGACY_SYNC_KEY]: legacy("someone-else") });
    expect(moveLegacyAccount(storage, "a")).toBe(false);
    expect(readGuest(storage, dark).tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(storage.items.has(accountKey("a"))).toBe(false);
    expect(storage.items.has(LEGACY_SYNC_KEY)).toBe(false);
  });

  it("do nothing on a browser that never had the old state", () => {
    const storage = memory({ [STORAGE_KEY]: saved(data([task("t1")])) });
    expect(moveLegacyAccount(storage, "a")).toBe(false);
    expect(readGuest(storage, dark).tasks).toHaveLength(1);
  });
});

describe("adding the guest's tasks to an account", () => {
  it("adds them, and a guest list joins the account's list of the same name", () => {
    const account = data([task("a1", { listId: "work" })], [list("work", "Work")]);
    const guest = data([task("g1", { listId: "gwork" }), task("g2", { listId: "home" }), task("g3")], [list("gwork", " work "), list("home", "Home")]);

    const { data: merged, tasks } = withGuestItems(account, guest);
    expect(tasks).toBe(3);
    expect(merged.lists.map((l) => l.id)).toEqual(["work", "home"]);
    expect(merged.tasks.map((t) => [t.id, t.listId])).toEqual([
      ["a1", "work"],
      ["g1", "work"],
      ["g2", "home"],
      ["g3", null],
    ]);
  });

  it("never adds the same task twice", () => {
    const account = data([task("same", { title: "The account's copy" })]);
    const guest = data([task("same", { title: "The guest's copy" }), task("new")]);
    const { data: merged, tasks } = withGuestItems(account, guest);
    expect(tasks).toBe(1);
    expect(merged.tasks.find((t) => t.id === "same")?.title).toBe("The account's copy");
  });

  it("then empties the guest's tasks and lists but keeps the settings", () => {
    const storage = memory({ [STORAGE_KEY]: saved(data([task("g")], [list("l")], { theme: "dark" })) });
    clearGuestItems(storage);
    const raw = JSON.parse(storage.items.get(STORAGE_KEY)!);
    expect(raw.tasks).toEqual([]);
    expect(raw.lists).toEqual([]);
    expect(raw.settings.theme).toBe("dark");
  });
});

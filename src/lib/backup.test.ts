import { describe, expect, it } from "vitest";
import { STORAGE_KEY, load, parseBackup, readData, save, serialize } from "./backup";
import { exampleData } from "./examples";
import { DEFAULT_SETTINGS, emptyData } from "./types";

describe("readData", () => {
  it("round-trips real data unchanged", () => {
    const data = exampleData("2026-11-16", 1_800_000_000_000, emptyData());
    expect(parseBackup(serialize(data))).toEqual(data);
  });

  it("rejects things that are not a Listzero file", () => {
    expect(parseBackup("not json")).toBeNull();
    expect(readData(null)).toBeNull();
    expect(readData([])).toBeNull();
    expect(readData({ version: 2, tasks: [] })).toBeNull();
    expect(readData({ version: 1 })).toBeNull();
  });

  it("drops broken tasks and repairs bad fields", () => {
    const data = readData({
      version: 1,
      lists: [{ id: "work", name: "Work", color: "neon" }, { id: "work", name: "Duplicate" }, { name: "No id" }],
      tasks: [
        { id: "a", title: "  Keeps  ", listId: "work", due: "2026-02-30", time: "09:00", priority: 9, estimate: -5 },
        { id: "b", title: "Has a day", listId: "gone", due: "2026-11-16", time: "25:00", repeat: "hourly" },
        { id: "a", title: "Duplicate id" },
        { id: "c", title: "   " },
        { id: "<script>", title: "Bad id" },
        "nonsense",
        { id: "d", title: "Steps", steps: [{ id: "s1", title: "ok", done: true }, { id: "s2", title: "" }, 7] },
      ],
      settings: { theme: "neon", dailyLimit: 500, calm: "yes" },
    });
    expect(data).not.toBeNull();
    expect(data?.lists).toEqual([expect.objectContaining({ id: "work", name: "Work", color: "slate" })]);
    expect(data?.tasks.map((t) => t.id)).toEqual(["a", "b", "d"]);
    // An impossible day is dropped, and the time goes with it.
    expect(data?.tasks[0]).toMatchObject({ title: "Keeps", listId: "work", due: null, time: null, priority: 0, estimate: null });
    expect(data?.tasks[1]).toMatchObject({ listId: null, due: "2026-11-16", time: null, repeat: null });
    expect(data?.tasks[2]?.steps).toEqual([{ id: "s1", title: "ok", done: true }]);
    expect(data?.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps a saved look and gives older saves the defaults", () => {
    const saved = readData({
      version: 1,
      tasks: [],
      settings: { theme: "dark", palette: "sage", textSize: "large", quiet: true, dailyLimit: 3, calm: true },
    });
    expect(saved?.settings).toEqual({
      theme: "dark",
      palette: "sage",
      textSize: "large",
      quiet: true,
      display: {},
      dailyLimit: 3,
      calm: true,
      analytics: true,
    });
    // Visit counting stays off only when it was turned off; anything else means the default.
    const settingsWith = (analytics: unknown) => readData({ version: 1, tasks: [], settings: { analytics } })?.settings;
    expect(settingsWith(false)?.analytics).toBe(false);
    expect(settingsWith("no")?.analytics).toBe(true);
    // A file saved before palettes existed.
    const older = readData({ version: 1, tasks: [], settings: { theme: "dark", dailyLimit: 4, calm: false } });
    expect(older?.settings).toEqual({ ...DEFAULT_SETTINGS, theme: "dark", dailyLimit: 4 });
    expect(readData({ version: 1, tasks: [], settings: { palette: "neon", textSize: "huge" } })?.settings).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("keeps a task's colour and progress, and drops values it does not know", () => {
    const data = readData({
      version: 1,
      tasks: [
        { id: "a", title: "Blue and doing", color: "blue", doing: true },
        { id: "b", title: "Bad colour", color: "neon", doing: "yes" },
        { id: "c", title: "Finished cannot be doing", doing: true, completedAt: 1000 },
        { id: "d", title: "Saved before colours existed" },
      ],
    });
    expect(data?.tasks.map((t) => [t.color, t.doing])).toEqual([
      ["blue", true],
      [null, false],
      [null, false],
      [null, false],
    ]);
  });

  it("caps very long text", () => {
    const data = readData({ version: 1, tasks: [{ id: "a", title: "x".repeat(1000), notes: "n".repeat(9000) }] });
    expect(data?.tasks[0]?.title).toHaveLength(300);
    expect(data?.tasks[0]?.notes).toHaveLength(5000);
  });
});

describe("load and save", () => {
  const memory = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  };

  it("starts empty on a first visit", () => {
    expect(load(memory())).toEqual({ data: emptyData(), persistent: true });
  });

  it("reads back what it saved", () => {
    const storage = memory();
    const data = exampleData("2026-11-16", 1_800_000_000_000, emptyData());
    expect(save(storage, data)).toBe(true);
    expect(load(storage).data).toEqual(data);
  });

  it("hands back unreadable saved text instead of silently losing it", () => {
    const storage = memory();
    storage.setItem(STORAGE_KEY, "{broken");
    const loaded = load(storage);
    expect(loaded.data).toEqual(emptyData());
    expect(loaded.damaged).toBe("{broken");
  });

  it("reports when the browser refuses storage", () => {
    expect(load(null).persistent).toBe(false);
    expect(save(null, emptyData())).toBe(false);
    const full = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(save(full, emptyData())).toBe(false);
  });
});

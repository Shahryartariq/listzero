import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { applyReply, pendingChanges, type SharedList, type Space } from "./space";

const L = "11111111-1111-4111-8111-111111111111";
const list: SharedList = { id: L, name: "Office", color: "blue", role: "edit", access: "restricted", linkRole: "edit", link: null, people: [], invited: [] };
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, notes: "", listId: L, due: null, time: null, priority: 0, estimate: null, steps: [], repeat: null,
  color: null, doing: false, createdAt: 1, completedAt: null, ...extra,
});
const space = (tasks: Task[], known: Task[]): Space => ({
  userId: "me", lists: [list], tasks, cursors: { [L]: 3 }, known: Object.fromEntries(known.map((t) => [`${L}:${t.id}`, t])),
});

describe("shared lists on the device", () => {
  it("sends new tasks whole, changed ones with the fields that changed, and deletions", () => {
    const s = space([task("new"), task("a", { title: "Renamed", priority: 1 }), task("same")], [task("a"), task("same"), task("gone")]);
    expect(pendingChanges(s)).toEqual([
      { listId: L, id: "new", data: task("new") },
      { listId: L, id: "a", data: task("a", { title: "Renamed", priority: 1 }), fields: ["title", "priority"] },
      { listId: L, id: "gone", data: null },
    ]);
  });

  it("sends nothing from a list it can only view", () => {
    const s = { ...space([task("a", { title: "Mine" })], [task("a")]), lists: [{ ...list, role: "view" as const }] };
    expect(pendingChanges({ ...s, known: {} }).length).toBe(1);
    expect(pendingChanges({ ...s, tasks: [] })).toEqual([]);
  });

  it("takes in what others changed, and keeps fields edited here while the request was away", () => {
    const base = space([task("a")], [task("a")]);
    const now = space([task("a", { title: "Typed meanwhile" })], [task("a")]);
    const next = applyReply(now, base, {
      lists: [list],
      items: { [L]: { cursor: 5, more: false, reset: false, changes: [{ id: "a", data: task("a", { completedAt: 9, doneBy: "him" }) }, { id: "b", data: task("b") }] } },
    });
    expect(next.cursors[L]).toBe(5);
    expect(next.tasks.find((t) => t.id === "a")).toMatchObject({ title: "Typed meanwhile", completedAt: 9, doneBy: "him" });
    expect(next.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    // The typed title goes out next time, as a change to the title only.
    expect(pendingChanges(next)).toEqual([expect.objectContaining({ id: "a", fields: ["title"] })]);
  });

  it("drops a list, and its tasks, when the person is no longer in it", () => {
    const now = space([task("a")], [task("a")]);
    const next = applyReply(now, now, { lists: [], items: {} });
    expect(next.tasks).toEqual([]);
    expect(next.known).toEqual({});
    expect(next.lists).toEqual([]);
  });
});

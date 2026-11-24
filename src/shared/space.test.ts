import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { stampHere } from "./sharedStore";
import { applyReply, doneByLabel, nameOf, onItLabel, pendingChanges, type SharedList, type Space } from "./space";

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

  it("shows who is on a task and who finished it straight away", () => {
    const started = stampHere(task("a", { doing: true }), task("a"), "me");
    expect(started.doingBy).toBe("me");
    // Editing a task someone else is on leaves it theirs; taking it over makes it yours.
    const theirs = task("a", { doing: true, doingBy: "abdullah" });
    expect(stampHere({ ...theirs, notes: "Key" }, theirs, "me").doingBy).toBe("abdullah");
    expect(stampHere({ ...theirs, doingBy: "me" }, theirs, "me").doingBy).toBe("me");
    // Back to To do: nobody is on it. Ticked off: done by whoever ticked it; reopened: by nobody.
    expect(stampHere({ ...theirs, doing: false }, theirs, "me").doingBy).toBeUndefined();
    const done = stampHere({ ...theirs, doing: false, completedAt: 5 }, theirs, "me");
    expect(done).toMatchObject({ doneBy: "me" });
    expect(done.doingBy).toBeUndefined();
    expect(stampHere({ ...done, completedAt: null }, done, "me").doneBy).toBeUndefined();
  });

  it("names people by their first name, and you as you", () => {
    const s = { ...space([], []), lists: [{ ...list, people: [{ id: "a1", name: "Abdullah Khan", email: "a@x.test", role: "edit" as const }] }] };
    expect(onItLabel(nameOf(s, "a1"))).toBe("Abdullah is on it");
    expect(onItLabel(nameOf(s, "me"))).toBe("You are on it");
    expect(doneByLabel(nameOf(s, "me"))).toBe("Done by you");
    expect(nameOf(s, "gone")).toBe("Someone");
    const unnamed = { ...s, lists: [{ ...list, people: [{ id: "b1", name: "", email: "ali.raza@x.test", role: "view" as const }] }] };
    expect(nameOf(unnamed, "b1")).toBe("Ali");
  });
});

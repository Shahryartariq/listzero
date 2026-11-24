// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { MAX_PEOPLE } from "./shared";
import { browser, linkFor, testApp } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "correct horse battery 42";
type T = Awaited<ReturnType<typeof testApp>>;
type B = ReturnType<typeof browser>;

/** Signs up and confirms the email, ending signed in. */
async function person(t: T, name: string) {
  const b = browser(t.app);
  const email = `${name}@listzero.test`;
  await b.post("/api/auth/sign-up/email", { email, username: name, name, password: PASSWORD, callbackURL: "/verify-email" });
  await b.visit(linkFor(t.outbox, email));
  const session = await b.get("/api/auth/get-session");
  return Object.assign(b, { id: (session.data?.user as { id: string }).id, email });
}

const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Task ${id}`, ...extra });

interface Reply {
  lists: { id: string; name: string; role: string; link: string | null; people: { id: string; role: string }[]; invited: { email: string }[] }[];
  items: Record<string, { cursor: number; changes: { id: string; data: Record<string, unknown> | null }[] }>;
}

async function syncOf(b: B, changes: unknown[] = [], cursors: Record<string, number> = {}) {
  const r = await b.post("/api/shared/sync", { cursors, changes });
  expect(r.status, JSON.stringify(r.data)).toBe(200);
  return r.data as unknown as Reply;
}

const tasksIn = (reply: Reply, listId: string) =>
  Object.fromEntries((reply.items[listId]?.changes ?? []).map((c) => [c.id, c.data]));

async function newList(b: B, name = "Office", tasks: unknown[] = []) {
  const r = await b.post("/api/shared/create", { name, color: "blue", tasks });
  expect(r.status).toBe(200);
  return r.data?.listId as string;
}

describe("shared lists", () => {
  it("only members see a list; the owner adds people by email, and they can edit", async () => {
    const t = await testApp();
    const sherry = await person(t, "sherry");
    const abdullah = await person(t, "abdullah");
    const stranger = await person(t, "stranger");
    const listId = await newList(sherry, "Office", [task("a")]);

    expect(tasksIn(await syncOf(sherry), listId).a?.title).toBe("Task a");
    expect((await syncOf(abdullah)).lists).toEqual([]);
    // Someone outside can't write into it, or change it.
    await syncOf(stranger, [{ listId, id: "x", data: task("x") }]);
    expect(tasksIn(await syncOf(sherry), listId).x).toBeUndefined();
    expect((await stranger.post("/api/shared/update", { listId, name: "Mine now" })).status).toBe(404);

    const invited = await sherry.post("/api/shared/invite", { listId, email: "ABDULLAH@listzero.test", role: "edit" });
    expect(invited.data?.status).toBe("sent");
    expect(t.outbox.at(-1)?.to).toBe("abdullah@listzero.test");
    expect(t.outbox.at(-1)?.subject).toContain("Office");

    const his = await syncOf(abdullah, [{ listId, id: "b", data: task("b") }]);
    expect(his.lists.map((l) => [l.name, l.role])).toEqual([["Office", "edit"]]);
    // Only the owner gets the link.
    expect(his.lists[0]?.link).toBeNull();
    expect(Object.keys(tasksIn(await syncOf(sherry), listId)).sort()).toEqual(["a", "b"]);
    t.close();
  });

  it("an invite to an address with no account waits, and is taken up once that address is confirmed", async () => {
    const t = await testApp();
    const sherry = await person(t, "sherry");
    const listId = await newList(sherry);
    const reply = await sherry.post("/api/shared/invite", { listId, email: "newbie@listzero.test", role: "view" });
    // The same answer as for someone with an account: it doesn't tell who has one.
    expect(reply.data?.status).toBe("sent");
    expect((reply.data?.lists as Reply["lists"])[0]?.invited).toEqual([{ email: "newbie@listzero.test", role: "view" }]);

    const newbie = await person(t, "newbie");
    const lists = (await syncOf(newbie)).lists;
    expect(lists.map((l) => [l.name, l.role])).toEqual([["Office", "view"]]);
    expect((await syncOf(sherry)).lists[0]?.invited).toEqual([]);
    t.close();
  });

  it("someone who can only view can't change anything", async () => {
    const t = await testApp();
    const sherry = await person(t, "sherry");
    const viewer = await person(t, "viewer");
    const listId = await newList(sherry, "Office", [task("a")]);
    await sherry.post("/api/shared/invite", { listId, email: viewer.email, role: "view" });
    await syncOf(viewer, [{ listId, id: "a", data: task("a", { title: "Changed" }), fields: ["title"] }, { listId, id: "z", data: task("z") }]);
    const now = tasksIn(await syncOf(sherry), listId);
    expect(now.a?.title).toBe("Task a");
    expect(now.z).toBeUndefined();
    expect((await viewer.post("/api/shared/invite", { listId, email: "x@listzero.test" })).status).toBe(403);
    t.close();
  });

  it("two people changing one task keep both changes, and the server says who started and who finished it", async () => {
    const t = await testApp();
    const sherry = await person(t, "sherry");
    const abdullah = await person(t, "abdullah");
    const listId = await newList(sherry, "Office", [task("a")]);
    await sherry.post("/api/shared/invite", { listId, email: abdullah.email });

    // Abdullah presses Start; a device can't say someone else did.
    await syncOf(abdullah, [{ listId, id: "a", data: task("a", { doing: true, doingBy: sherry.id }), fields: ["doing"] }]);
    expect(tasksIn(await syncOf(sherry), listId).a).toMatchObject({ doing: true, doingBy: abdullah.id });

    // Sherry's notes don't take it from him; taking it over does.
    await syncOf(sherry, [{ listId, id: "a", data: task("a", { doing: true, notes: "Bring the key" }), fields: ["notes"] }]);
    expect(tasksIn(await syncOf(sherry), listId).a).toMatchObject({ notes: "Bring the key", doingBy: abdullah.id });
    await syncOf(sherry, [{ listId, id: "a", data: task("a", { doing: true, doingBy: sherry.id }), fields: ["doingBy"] }]);
    expect(tasksIn(await syncOf(abdullah), listId).a).toMatchObject({ doing: true, doingBy: sherry.id });

    // At the same time, from the same starting point: Sherry renames it, Abdullah ticks it off.
    await syncOf(sherry, [{ listId, id: "a", data: task("a", { title: "Renamed" }), fields: ["title"] }]);
    await syncOf(abdullah, [{ listId, id: "a", data: task("a", { completedAt: Date.now() }), fields: ["completedAt"] }]);
    const a = tasksIn(await syncOf(sherry), listId).a;
    expect(a?.title).toBe("Renamed");
    expect(a?.completedAt).toEqual(expect.any(Number));
    expect(a?.doneBy).toBe(abdullah.id);
    expect(a?.doingBy).toBeUndefined();

    // A cursor brings only what changed after it.
    const first = await syncOf(sherry);
    const cursor = first.items[listId]!.cursor;
    await syncOf(abdullah, [{ listId, id: "c", data: task("c") }]);
    const next = await syncOf(sherry, [], { [listId]: cursor });
    expect(next.items[listId]!.changes.map((c) => c.id)).toEqual(["c"]);
    t.close();
  });

  it("a link only works while access is set to anyone with the link, and a new link replaces the old one", async () => {
    const t = await testApp();
    const sherry = await person(t, "sherry");
    const abdullah = await person(t, "abdullah");
    const listId = await newList(sherry);
    const link = (await syncOf(sherry)).lists[0]!.link!;
    const token = link.split("/join/")[1];

    expect((await abdullah.post("/api/shared/peek", { token })).status).toBe(404);
    expect((await abdullah.post("/api/shared/join", { token })).status).toBe(404);

    await sherry.post("/api/shared/update", { listId, access: "link", linkRole: "view" });
    const peeked = await abdullah.post("/api/shared/peek", { token });
    expect(peeked.data).toMatchObject({ name: "Office", owner: "sherry", role: "view", member: false });
    expect((await abdullah.post("/api/shared/join", { token })).status).toBe(200);
    expect((await syncOf(abdullah)).lists[0]?.role).toBe("view");

    await sherry.post("/api/shared/update", { listId, newLink: true });
    const late = await person(t, "late");
    expect((await late.post("/api/shared/join", { token })).status).toBe(404);
    // Signed out, nobody can join.
    expect((await browser(t.app).post("/api/shared/join", { token })).status).toBe(401);
    t.close();
  });

  it("only the owner manages people; members can leave; the owner hands the list on before leaving", async () => {
    const t = await testApp();
    const sherry = await person(t, "sherry");
    const abdullah = await person(t, "abdullah");
    const listId = await newList(sherry);
    await sherry.post("/api/shared/invite", { listId, email: abdullah.email });

    expect((await abdullah.post("/api/shared/delete", { listId })).status).toBe(403);
    expect((await abdullah.post("/api/shared/member", { listId, userId: sherry.id, remove: true })).status).toBe(403);
    expect((await sherry.post("/api/shared/leave", { listId })).status).toBe(403);

    await sherry.post("/api/shared/member", { listId, userId: abdullah.id, role: "owner" });
    const roles = (await syncOf(sherry)).lists[0]!.people.map((p) => [p.id === sherry.id ? "sherry" : "abdullah", p.role]);
    expect(roles).toEqual([
      ["sherry", "edit"],
      ["abdullah", "owner"],
    ]);
    expect((await sherry.post("/api/shared/leave", { listId })).status).toBe(200);
    expect((await syncOf(sherry)).lists).toEqual([]);

    await abdullah.post("/api/shared/delete", { listId });
    expect((await syncOf(abdullah)).lists).toEqual([]);
    t.close();
  });

  it(`holds at most ${MAX_PEOPLE} people, invites included`, async () => {
    const t = await testApp();
    const sherry = await person(t, "sherry");
    const listId = await newList(sherry);
    for (let i = 1; i < MAX_PEOPLE; i++) {
      expect((await sherry.post("/api/shared/invite", { listId, email: `p${i}@listzero.test` })).status).toBe(200);
    }
    expect((await sherry.post("/api/shared/invite", { listId, email: "one-more@listzero.test" })).status).toBe(409);
    t.close();
  });

  it("deleting an account deletes the lists it owns, and leaves the lists it was only in", async () => {
    const t = await testApp();
    const sherry = await person(t, "sherry");
    const abdullah = await person(t, "abdullah");
    const office = await newList(sherry, "Office", [task("a")]);
    await sherry.post("/api/shared/invite", { listId: office, email: abdullah.email });
    const home = await newList(abdullah, "Home");
    await abdullah.post("/api/shared/invite", { listId: home, email: sherry.email });

    expect((await sherry.post("/api/auth/delete-user", { callbackURL: "/today" })).status).toBe(200);
    await sherry.visit(linkFor(t.outbox, sherry.email));
    expect((await sherry.get("/api/auth/get-session")).data).toBeNull();

    const left = await syncOf(abdullah);
    expect(left.lists.map((l) => [l.name, l.people.length])).toEqual([["Home", 1]]);
    const { rows } = (await t.db.execute("select count(*)::int as n from shared_item")) as unknown as { rows: { n: number }[] };
    expect(rows[0]?.n).toBe(0);
    t.close();
  });
});


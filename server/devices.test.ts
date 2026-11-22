// @vitest-environment node
/**
 * Whole devices syncing through the real API: the app's sync code (src/sync) on one side, the
 * server's on the other, a real Postgres in between. No browser, so it runs in a second.
 */
import { describe, expect, it, vi } from "vitest";
import { emptyData, type AppData, type Task } from "../src/lib/types";
import { pendingCount, syncOnce, SyncFailure, type SyncIO, type SyncReply } from "../src/sync/run";
import { browser, linkFor, testApp } from "./testing";

// Each test starts its own in-memory Postgres and hashes real passwords: quick on a laptop, slower on CI.
vi.setConfig({ testTimeout: 30_000 });

const PASSWORD = "correct horse battery 42";

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

type TestApp = Awaited<ReturnType<typeof testApp>>;

/** A device: its own data, its own storage, its own cookies. */
function device(_t: TestApp, user: { id: string; email: string }, session: ReturnType<typeof browser>) {
  let data: AppData = emptyData();
  // What the device has written to its storage, as a reload would find it.
  let disk: AppData | null = null;
  let full = false;
  const items = new Map<string, string>();
  let online = true;
  const io: SyncIO = {
    user,
    read: () => data,
    load: (next) => {
      data = next;
    },
    keep: (next) => {
      if (full) return false;
      disk = next;
      return true;
    },
    storage: {
      getItem: (k) => items.get(k) ?? null,
      setItem: (k, v) => void items.set(k, v),
      removeItem: (k) => void items.delete(k),
    },
    async post(body) {
      if (!online) throw new SyncFailure("offline");
      const reply = await session.post("/api/sync", body);
      if (reply.status === 401) throw new SyncFailure("unauthorized");
      if (reply.status === 413) throw new SyncFailure("too-many", String(reply.data?.message));
      if (reply.status !== 200) throw new SyncFailure("server");
      return reply.data as unknown as SyncReply;
    },
  };
  return {
    io,
    sync: (adopt?: "merge" | "replace") => syncOnce(io, adopt),
    get tasks() {
      return data.tasks.map((t) => t.title).sort();
    },
    get data() {
      return data;
    },
    edit(change: (d: AppData) => AppData) {
      data = change(data);
    },
    add(...tasks: Task[]) {
      data = { ...data, tasks: [...data.tasks, ...tasks] };
    },
    setOnline(value: boolean) {
      online = value;
    },
    /** Storage that refuses new writes, as when a browser has run out of room for the site. */
    setFull(value: boolean) {
      full = value;
    },
    /** A reload: only what reached storage is left. */
    reload() {
      data = disk ?? emptyData();
    },
    as(next: { id: string; email: string }, cookies: ReturnType<typeof browser>) {
      io.user = next;
      session = cookies;
    },
  };
}

async function person(t: TestApp, email: string, username: string) {
  const session = browser(t.app);
  await session.post("/api/auth/sign-up/email", { email, username, name: username, password: PASSWORD });
  await session.visit(linkFor(t.outbox, email));
  const user = (await session.get("/api/auth/get-session")).data?.user as { id: string; email: string };
  const another = async () => {
    const b = browser(t.app);
    await b.post("/api/auth/sign-in/email", { email, password: PASSWORD });
    return b;
  };
  return { user, session, another };
}

describe("a device that cannot keep the account's tasks", () => {
  it("never tells the account they were deleted", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const laptop = device(t, sam.user, sam.session);
    laptop.add(task("a"), task("b"), task("c"));
    await laptop.sync();

    // A browser out of room signs in: the tasks arrive on screen but cannot be written down.
    const phone = device(t, sam.user, await sam.another());
    phone.setFull(true);
    expect(await phone.sync()).toEqual({ ok: false, reason: "full", message: "" });
    expect(phone.tasks).toEqual(["Task a", "Task b", "Task c"]);

    // After a reload the tasks are gone from this device, and the account must still have them.
    phone.reload();
    phone.setFull(false);
    expect(await phone.sync()).toMatchObject({ ok: true });
    expect(phone.tasks).toEqual(["Task a", "Task b", "Task c"]);
    expect(await laptop.sync()).toMatchObject({ ok: true, received: 0 });
    expect(laptop.tasks).toEqual(["Task a", "Task b", "Task c"]);
    await t.close();
  });

  it("keeps a task it sent while full, and gets it back after a reload", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const laptop = device(t, sam.user, sam.session);
    laptop.add(task("a"));
    await laptop.sync();

    laptop.setFull(true);
    laptop.add(task("b"));
    expect(await laptop.sync()).toMatchObject({ ok: false, reason: "full" });
    laptop.reload();
    laptop.setFull(false);
    expect(laptop.tasks).toEqual(["Task a"]);
    await laptop.sync();
    expect(laptop.tasks).toEqual(["Task a", "Task b"]);

    const phone = device(t, sam.user, await sam.another());
    await phone.sync();
    expect(phone.tasks).toEqual(["Task a", "Task b"]);
    await t.close();
  });
});

describe("devices of one person", () => {
  it("first sign-in adds this device's tasks to the account, and a second device gets them", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const laptop = device(t, sam.user, sam.session);
    laptop.add(task("a"), task("b"));
    expect(pendingCount(laptop.io)).toBe(2);

    expect(await laptop.sync()).toEqual({ ok: true, first: true, sent: 2, received: 0 });
    expect(pendingCount(laptop.io)).toBe(0);

    const phone = device(t, sam.user, await sam.another());
    phone.add(task("c"));
    expect(await phone.sync()).toEqual({ ok: true, first: true, sent: 1, received: 2 });
    expect(phone.tasks).toEqual(["Task a", "Task b", "Task c"]);

    expect(await laptop.sync()).toEqual({ ok: true, first: false, sent: 0, received: 1 });
    expect(laptop.tasks).toEqual(["Task a", "Task b", "Task c"]);
    // Nothing left to say on either side.
    expect(await laptop.sync()).toMatchObject({ sent: 0, received: 0 });
    expect(await phone.sync()).toMatchObject({ sent: 0, received: 0 });
    await t.close();
  });

  it("edits, deletions and lists travel both ways; the same task edited twice keeps the later sync", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const laptop = device(t, sam.user, sam.session);
    const phone = device(t, sam.user, await sam.another());
    laptop.edit((d) => ({ ...d, lists: [{ id: "work", name: "Work", color: "blue", createdAt: 1 }] }));
    laptop.add(task("a", { listId: "work" }), task("b"), task("c"));
    await laptop.sync();
    await phone.sync();
    expect(phone.data.lists.map((l) => l.name)).toEqual(["Work"]);
    expect(phone.data.tasks.find((x) => x.id === "a")?.listId).toBe("work");

    // Offline on the phone: finish a, delete b, edit c.
    phone.setOnline(false);
    phone.edit((d) => ({
      ...d,
      tasks: d.tasks.filter((x) => x.id !== "b").map((x) => (x.id === "a" ? { ...x, completedAt: 99 } : x.id === "c" ? { ...x, title: "c from the phone" } : x)),
    }));
    expect(await phone.sync()).toMatchObject({ ok: false, reason: "offline" });
    expect(pendingCount(phone.io)).toBe(3);

    // Meanwhile the laptop edits c too, and deletes the list.
    laptop.edit((d) => ({
      ...d,
      lists: [],
      tasks: d.tasks.map((x) => (x.id === "c" ? { ...x, title: "c from the laptop" } : x.id === "a" ? { ...x, listId: null } : x)),
    }));
    await laptop.sync();

    // The phone comes back and syncs last, so its version of a and c stand.
    phone.setOnline(true);
    expect(await phone.sync()).toMatchObject({ ok: true });
    await laptop.sync();
    await phone.sync();
    for (const d of [laptop, phone]) {
      expect(d.tasks).toEqual(["Task a", "c from the phone"]);
      expect(d.data.lists).toEqual([]);
      expect(d.data.tasks.find((x) => x.id === "a")).toMatchObject({ completedAt: 99, listId: null });
    }
    await t.close();
  });

  it("a big first sync goes through in batches", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const laptop = device(t, sam.user, sam.session);
    laptop.add(...Array.from({ length: 2500 }, (_, i) => task(`t${i}`)));
    expect(await laptop.sync()).toEqual({ ok: true, first: true, sent: 2500, received: 0 });
    const phone = device(t, sam.user, await sam.another());
    expect(await phone.sync()).toEqual({ ok: true, first: true, sent: 0, received: 2500 });
    expect(phone.data.tasks).toHaveLength(2500);
    await t.close();
  }, 60_000);

  it("more than an account may hold is refused, and nothing is lost on the device", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const laptop = device(t, sam.user, sam.session);
    laptop.add(...Array.from({ length: 5001 }, (_, i) => task(`t${i}`)));
    const outcome = await laptop.sync();
    expect(outcome).toMatchObject({ ok: false, reason: "too-many" });
    expect(laptop.data.tasks).toHaveLength(5001);
    await t.close();
  }, 60_000);
});

describe("more than one person on a device", () => {
  it("does not mix accounts unless told to", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const ada = await person(t, "ada@a.test", "ada");
    const shared = device(t, sam.user, sam.session);
    shared.add(task("sams"));
    await shared.sync();

    // Sam signs out and keeps the tasks on the device; Ada signs in.
    shared.as(ada.user, ada.session);
    expect(await shared.sync()).toEqual({ ok: false, reason: "other-account", email: "sam@a.test" });
    expect(shared.tasks).toEqual(["Task sams"]);

    // "Replace them with my tasks": Sam's leave the device, and nothing of Sam's reaches Ada's account.
    expect(await shared.sync("replace")).toEqual({ ok: true, first: true, sent: 0, received: 0 });
    expect(shared.tasks).toEqual([]);
    const adasPhone = device(t, ada.user, await ada.another());
    await adasPhone.sync();
    expect(adasPhone.tasks).toEqual([]);

    // Sam's account still has Sam's task.
    const samsPhone = device(t, sam.user, await sam.another());
    await samsPhone.sync();
    expect(samsPhone.tasks).toEqual(["Task sams"]);
    await t.close();
  });

  it("does not ask when the other account left nothing on the device", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const ada = await person(t, "ada@a.test", "ada");
    const adasLaptop = device(t, ada.user, ada.session);
    adasLaptop.add(task("adas"));
    await adasLaptop.sync();

    // Sam synced an empty browser, signed out, and Ada signs in on it.
    const shared = device(t, sam.user, sam.session);
    await shared.sync();
    shared.as(ada.user, ada.session);
    expect(await shared.sync()).toEqual({ ok: true, first: true, sent: 0, received: 1 });
    expect(shared.tasks).toEqual(["Task adas"]);
    await t.close();
  });

  it("can add what is on the device to the new account when asked", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const ada = await person(t, "ada@a.test", "ada");
    const shared = device(t, sam.user, sam.session);
    shared.add(task("x"));
    await shared.sync();
    shared.as(ada.user, ada.session);
    expect(await shared.sync("merge")).toEqual({ ok: true, first: true, sent: 1, received: 0 });
    await t.close();
  });

  it("a signed-out device is told so", async () => {
    const t = await testApp();
    const sam = await person(t, "sam@a.test", "sam");
    const laptop = device(t, sam.user, sam.session);
    await sam.session.post("/api/auth/sign-out");
    laptop.add(task("a"));
    expect(await laptop.sync()).toMatchObject({ ok: false, reason: "unauthorized" });
    expect(laptop.tasks).toEqual(["Task a"]);
    await t.close();
  });
});

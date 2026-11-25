// @vitest-environment node
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { checkRoles, signInMethodOf } from "./admin";
import { browser, linkFor, testApp } from "./testing";

const PASSWORD = "correct horse battery 42";
type T = Awaited<ReturnType<typeof testApp>>;

async function person(t: T, name: string) {
  const b = browser(t.app);
  const email = `${name}@listzero.test`;
  await b.post("/api/auth/sign-up/email", {
    email,
    username: name,
    name,
    password: PASSWORD,
    callbackURL: "/verify-email",
  });
  await b.visit(linkFor(t.outbox, email));
  const session = await b.get("/api/auth/get-session");
  return Object.assign(b, { id: (session.data?.user as { id: string }).id, email });
}

const adminApp = () => testApp({ ADMIN_EMAILS: "boss@listzero.test" });

describe("admin panel", () => {
  it("answers 404 to guests, people who aren't admins, other sites and GET, as if it didn't exist", async () => {
    const t = await adminApp();
    const guest = browser(t.app);
    const sam = await person(t, "sam");
    const boss = await person(t, "boss");
    const missing = await guest.post("/api/no-such-thing");
    for (const path of ["/api/admin/overview", "/api/admin/people", "/api/admin/person", "/api/admin/anything"]) {
      for (const who of [guest, sam]) {
        const r = await who.post(path, {});
        expect(r.status).toBe(404);
        expect(r.data).toEqual(missing.data);
      }
    }
    expect((await boss.post("/api/admin/overview", {}, { origin: "https://evil.example" })).status).toBe(404);
    expect((await boss.get("/api/admin/overview")).status).toBe(404);
    expect((await boss.post("/api/admin/overview")).status).toBe(200);
    t.close();
  });

  it("shows who is online now, from their syncs, and who isn't any more", async () => {
    const t = await adminApp();
    const boss = await person(t, "boss");
    const sam = await person(t, "sam");
    const ana = await person(t, "ana");
    await sam.post("/api/sync", { cursor: 0, changes: [] });
    await ana.post("/api/shared/sync", { cursors: {}, changes: [] });

    let view = (await boss.post("/api/admin/overview")).data as {
      people: number;
      admins: number;
      online: { email: string; devices: number }[];
    };
    expect(view.people).toBe(3);
    expect(view.admins).toBe(1);
    expect(view.online.map((p) => p.email).sort()).toEqual([
      "ana@listzero.test",
      "boss@listzero.test",
      "sam@listzero.test",
    ]);
    // Times are right whatever time zone the server runs in.
    for (const p of view.online as unknown as { seenAt: string }[])
      expect(Math.abs(Date.parse(p.seenAt) - Date.now())).toBeLessThan(60_000);

    // Ana was last here ten minutes ago: no longer online, but still "last seen".
    await t.db.execute(sql`update activity set seen_at = now() - interval '10 minutes' where user_id = ${ana.id}`);
    view = (await boss.post("/api/admin/overview")).data as typeof view;
    expect(view.online.map((p) => p.email).sort()).toEqual(["boss@listzero.test", "sam@listzero.test"]);
    const list = (await boss.post("/api/admin/people", { filter: "online" })).data as {
      people: { email: string; online: boolean }[];
      total: number;
    };
    expect(list.total).toBe(2);
    const all = (await boss.post("/api/admin/people", {})).data as {
      people: { email: string; online: boolean; seenAt: string | null }[];
    };
    expect(all.people.find((p) => p.email === "ana@listzero.test")).toMatchObject({
      online: false,
      seenAt: expect.any(String),
    });

    // Signing out ends that device's presence.
    await sam.post("/api/auth/sign-out");
    view = (await boss.post("/api/admin/overview")).data as typeof view;
    expect(view.online.map((p) => p.email)).toEqual(["boss@listzero.test"]);
    t.close();
  });

  it("lists people with search and filters, and shows one person's details but none of their tasks", async () => {
    const t = await adminApp();
    const boss = await person(t, "boss");
    const sam = await person(t, "sam");
    await person(t, "ana");
    await sam.post("/api/sync", {
      cursor: 0,
      changes: [
        {
          kind: "task",
          id: "t1",
          data: {
            id: "t1",
            title: "Secret plan",
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
          },
        },
        {
          kind: "task",
          id: "t2",
          data: {
            id: "t2",
            title: "Done thing",
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
            createdAt: 2,
            completedAt: 3,
          },
        },
      ],
    });
    await sam.post("/api/shared/create", { name: "Office", color: "blue" });

    const found = (await boss.post("/api/admin/people", { search: "sa" })).data as {
      people: { email: string }[];
      total: number;
    };
    expect(found.people.map((p) => p.email)).toEqual(["sam@listzero.test"]);
    expect(((await boss.post("/api/admin/people", { search: "%" })).data as { total: number }).total).toBe(0);
    expect(
      ((await boss.post("/api/admin/people", { filter: "admins" })).data as { people: { email: string }[] }).people.map(
        (p) => p.email,
      ),
    ).toEqual(["boss@listzero.test"]);

    const details = (await boss.post("/api/admin/person", { userId: sam.id })).data as Record<string, unknown>;
    expect(details).toMatchObject({
      email: "sam@listzero.test",
      username: "sam",
      role: "user",
      emailVerified: true,
      twoFactor: false,
      methods: ["password"],
      online: true,
      counts: { tasks: 2, openTasks: 1, lists: 0, sharedOwned: 1, sharedIn: 0 },
    });
    expect((details.devices as unknown[]).length).toBe(1);
    // Counts, never content; and no session tokens or addresses.
    const text = JSON.stringify(details);
    expect(text).not.toContain("Secret plan");
    expect(text).not.toMatch(/"(token|ipAddress|password)":/i);

    expect((await boss.post("/api/admin/person", { userId: "not-an-id" })).status).toBe(404);
    expect((await boss.post("/api/admin/person", { userId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    t.close();
  });

  it("only ADMIN_EMAILS makes admins: on sign-up, on each sign-in, at start, and never from the app", async () => {
    const t = await adminApp();
    const boss = await person(t, "boss");
    const sam = await person(t, "sam");
    const roleOf = async (b: typeof boss) =>
      ((await b.get("/api/auth/get-session")).data?.user as { role: string }).role;
    expect(await roleOf(boss)).toBe("admin");
    expect(await roleOf(sam)).toBe("user");

    // Someone made an admin some other way stops being one when they next sign in…
    await t.db.execute(sql`update "user" set role = 'admin' where id = ${sam.id}`);
    await sam.post("/api/auth/sign-in/email", { email: sam.email, password: PASSWORD });
    expect(await roleOf(sam)).toBe("user");
    // …and the listed admin is one again.
    await t.db.execute(sql`update "user" set role = 'user' where id = ${boss.id}`);
    await boss.post("/api/auth/sign-in/email", { email: boss.email, password: PASSWORD });
    expect(await roleOf(boss)).toBe("admin");

    // At start, everyone is checked against the list.
    await t.db.execute(sql`update "user" set role = 'admin' where id = ${sam.id}`);
    await checkRoles(t.db, ["boss@listzero.test"], true);
    expect(await roleOf(sam)).toBe("user");
    await checkRoles(t.db, [], true);
    expect(await roleOf(boss)).toBe("user");
    await checkRoles(t.db, ["boss@listzero.test"], true);
    expect(await roleOf(boss)).toBe("admin");

    // An admin can't make anyone else an admin, by changing a role or by creating an account.
    expect((await boss.post("/api/auth/admin/set-role", { userId: sam.id, role: "admin" })).status).toBe(403);
    expect(await roleOf(sam)).toBe("user");
    const made = await boss.post("/api/auth/admin/create-user", {
      email: "new@listzero.test",
      password: PASSWORD,
      name: "New",
      role: "admin",
    });
    expect(made.status).toBe(403);
    // And someone who isn't an admin finds none of these.
    expect((await sam.post("/api/auth/admin/list-users")).status).toBe(404);
    t.close();
  });

  it("with Google sign-in on, admin tools need a session started with Google", async () => {
    const t = await testApp({
      ADMIN_EMAILS: "boss@listzero.test",
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
    });
    const boss = await person(t, "boss");
    await boss.post("/api/auth/sign-in/email", { email: boss.email, password: PASSWORD });
    const session = (await boss.get("/api/auth/get-session")).data as {
      user: { role: string };
      session: { signInMethod: string };
    };
    expect(session.user.role).toBe("admin");
    expect(session.session.signInMethod).toBe("password");

    // An admin's password alone opens nothing.
    expect((await boss.post("/api/admin/overview")).status).toBe(404);
    expect((await boss.post("/api/auth/admin/list-users")).status).toBe(404);

    // The same account signed in with Google can.
    await t.db.execute(sql`update session set sign_in_method = 'google' where user_id = ${boss.id}`);
    expect((await boss.post("/api/admin/overview")).status).toBe(200);
    expect((await boss.get("/api/auth/admin/list-users")).status).toBe(200);
    t.close();
  });

  it("names how a session started from the endpoint that started it", () => {
    expect(signInMethodOf("/callback/:id")).toBe("google");
    expect(signInMethodOf("/sign-in/email")).toBe("password");
    expect(signInMethodOf("/sign-in/username")).toBe("password");
    expect(signInMethodOf("/two-factor/verify-totp")).toBe("password");
    expect(signInMethodOf("/passkey/verify-authentication")).toBe("passkey");
    expect(signInMethodOf("/verify-email")).toBe("other");
    expect(signInMethodOf(undefined)).toBe("other");
  });
});

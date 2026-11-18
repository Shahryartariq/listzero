// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { MAX_LISTS } from "../src/lib/backup";
import { createApp } from "./app";
import { isListedAdmin, readConfig } from "./env";
import { browser, linkFor, testApp } from "./testing";

// Each test starts its own in-memory Postgres and hashes real passwords: quick on a laptop, slower on CI.
vi.setConfig({ testTimeout: 30_000 });

const PASSWORD = "correct horse battery 42";

/** Signs up and confirms the email, ending signed in. */
async function join(t: Awaited<ReturnType<typeof testApp>>, email: string, username: string) {
  const b = browser(t.app);
  const signUp = await b.post("/api/auth/sign-up/email", { email, username, name: username, password: PASSWORD, callbackURL: "/verify-email" });
  expect(signUp.status).toBe(200);
  await b.visit(linkFor(t.outbox, email));
  return b;
}

const task = (id: string, title = `Task ${id}`) => ({ kind: "task", id, data: { id, title } });

describe("a copy of Listzero with accounts not set up", () => {
  const off = createApp({ config: null, missing: ["DATABASE_URL is not set"] });

  it("says so and offers nothing else", async () => {
    const config = await off(new Request("https://x.test/api/config"));
    expect(await config.json()).toEqual({ accounts: false, google: false, emailVerification: false, email: false });
    for (const path of ["/api/auth/get-session", "/api/sync", "/api/anything"]) {
      const response = await off(new Request(`https://x.test${path}`, { method: "POST" }));
      expect(response.status, path).toBe(503);
    }
  });

  it("is what an empty environment gives, with the reasons spelled out", () => {
    expect(readConfig({})).toEqual({
      config: null,
      missing: ["DATABASE_URL is not set", "BETTER_AUTH_SECRET is not set", "BETTER_AUTH_URL is not set (the address of the site)"],
    });
    expect(readConfig({ DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "short", BETTER_AUTH_URL: "https://a.test" }).missing).toEqual([
      "BETTER_AUTH_SECRET must be at least 32 characters",
    ]);
  });
});

describe("settings read from the environment", () => {
  const base = { DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "x".repeat(40) };

  it("takes the address from Vercel when none is given, production first", () => {
    const { config } = readConfig({ ...base, VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "listzero.vercel.app", VERCEL_URL: "listzero-abc.vercel.app" });
    expect(config?.baseURL).toBe("https://listzero.vercel.app");
    expect(config?.trustedOrigins).toEqual(["https://listzero.vercel.app", "https://listzero-abc.vercel.app"]);
    expect(config?.production).toBe(true);
  });

  it("turns email verification off in production when no email account is set, and on when one is", () => {
    const address = { ...base, VERCEL_ENV: "production", BETTER_AUTH_URL: "https://listzero.vercel.app" };
    const without = readConfig(address).config;
    expect(without).toMatchObject({ emailDelivery: false, verificationRequired: false, smtp: null });
    // Gmail shows app passwords in groups of four; the spaces are dropped. (A made-up value.)
    const grouped = ["abcd", "efgh", "ijkl", "mnop"].join(" ");
    const withGmail = readConfig({ ...address, SMTP_USER: "me@gmail.com", SMTP_PASSWORD: grouped }).config;
    expect(withGmail).toMatchObject({
      emailDelivery: true,
      verificationRequired: true,
      emailFrom: "Listzero <me@gmail.com>",
      smtp: { host: "smtp.gmail.com", port: 465, user: "me@gmail.com", password: "abcdefghijklmnop" },
    });
    expect(readConfig({ ...address, SMTP_USER: "me@gmail.com", SMTP_PASSWORD: "x", REQUIRE_EMAIL_VERIFICATION: "false" }).config?.verificationRequired).toBe(false);
  });

  it("offers Google only when both halves of its key are set", () => {
    const address = { ...base, BETTER_AUTH_URL: "https://a.test" };
    expect(readConfig({ ...address, GOOGLE_CLIENT_ID: "id" }).config?.google).toBeNull();
    expect(readConfig({ ...address, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }).config?.google).toEqual({ clientId: "id", clientSecret: "s" });
  });

  it("makes a listed address an admin only when the address is proven", () => {
    const admins = ["boss@a.test"];
    expect(isListedAdmin({ email: "Boss@A.test ", emailVerified: false }, admins, true)).toBe(true);
    expect(isListedAdmin({ email: "boss@a.test", emailVerified: false }, admins, false)).toBe(false);
    expect(isListedAdmin({ email: "boss@a.test", emailVerified: true }, admins, false)).toBe(true);
    expect(isListedAdmin({ email: "other@a.test", emailVerified: true }, admins, true)).toBe(false);
  });
});

describe("accounts", () => {
  it("sign up, confirm the email, then sign in with the email or the username", async () => {
    const t = await testApp();
    const b = browser(t.app);
    expect((await b.get("/api/config")).data).toEqual({ accounts: true, google: false, emailVerification: true, email: true });

    const signUp = await b.post("/api/auth/sign-up/email", { email: "sam@a.test", username: "Sam_One", name: "Sam", password: PASSWORD, callbackURL: "/verify-email" });
    expect(signUp.status).toBe(200);
    expect(signUp.data?.token).toBeNull();
    expect(signUp.data?.user).toMatchObject({ email: "sam@a.test", username: "sam_one", displayUsername: "Sam_One", emailVerified: false });

    // Not confirmed yet: no way in, and a fresh link is sent.
    const early = await b.post("/api/auth/sign-in/email", { email: "sam@a.test", password: PASSWORD, callbackURL: "/verify-email" });
    expect(early).toMatchObject({ status: 403, data: { code: "EMAIL_NOT_VERIFIED" } });
    expect((await b.get("/api/auth/get-session")).data).toBeNull();
    expect(t.outbox.filter((m) => m.to === "sam@a.test").length).toBeGreaterThanOrEqual(1);
    expect(t.outbox[0]).toMatchObject({ subject: "Confirm your email for Listzero" });
    expect(t.outbox[0]?.html).toContain("Listzero");

    const confirmed = await b.visit(linkFor(t.outbox, "sam@a.test"));
    expect(confirmed.status).toBe(302);
    expect(confirmed.location).toMatch(/\/verify-email$/);
    expect((await b.get("/api/auth/get-session")).data?.user).toMatchObject({ email: "sam@a.test", emailVerified: true });

    for (const [path, body] of [
      ["/api/auth/sign-in/email", { email: "sam@a.test", password: PASSWORD }],
      ["/api/auth/sign-in/username", { username: "SAM_one", password: PASSWORD }],
    ] as const) {
      const fresh = browser(t.app);
      expect((await fresh.post(path, body)).status, path).toBe(200);
      expect((await fresh.get("/api/auth/get-session")).data?.user).toMatchObject({ username: "sam_one" });
    }
    await t.close();
  });

  it("refuses a wrong password, a taken email or username, a weak password and an odd username", async () => {
    const t = await testApp();
    await join(t, "sam@a.test", "sam");
    const b = browser(t.app);
    expect((await b.post("/api/auth/sign-in/email", { email: "sam@a.test", password: "wrong password" })).status).toBe(401);
    expect((await b.post("/api/auth/sign-in/username", { username: "sam", password: "wrong password" })).status).toBe(401);
    expect((await b.post("/api/auth/sign-in/email", { email: "nobody@a.test", password: PASSWORD })).status).toBe(401);

    const sameName = await b.post("/api/auth/sign-up/email", { email: "other@a.test", username: "SAM", name: "x", password: PASSWORD });
    expect(sameName.status).toBeGreaterThanOrEqual(400);
    const short = await b.post("/api/auth/sign-up/email", { email: "short@a.test", username: "shorty", name: "x", password: "1234567" });
    expect(short.status).toBe(400);
    for (const username of ["ab", "has space", "-starts", "ends.", "x".repeat(31), "emoji😀name"]) {
      const odd = await b.post("/api/auth/sign-up/email", { email: `${username.length}@a.test`, username, name: "x", password: PASSWORD });
      expect(odd.status, username).toBeGreaterThanOrEqual(400);
    }
    await t.close();
  });

  it("resets a forgotten password by email, once, and signs every device out", async () => {
    const t = await testApp();
    const laptop = await join(t, "sam@a.test", "sam");
    const b = browser(t.app);

    const asked = await b.post("/api/auth/request-password-reset", { email: "sam@a.test", redirectTo: "/reset-password" });
    expect(asked.status).toBe(200);
    // Asking for an address with no account looks the same and sends nothing.
    const before = t.outbox.length;
    expect((await b.post("/api/auth/request-password-reset", { email: "nobody@a.test", redirectTo: "/reset-password" })).status).toBe(200);
    expect(t.outbox.length).toBe(before);

    const link = linkFor(t.outbox, "sam@a.test");
    const landed = await b.visit(link);
    const token = new URL(landed.location ?? "", "http://x").searchParams.get("token");
    expect(landed.location).toContain("/reset-password?token=");

    const NEW = "a brand new password 77";
    expect((await b.post("/api/auth/reset-password", { newPassword: NEW, token })).status).toBe(200);
    expect((await b.post("/api/auth/reset-password", { newPassword: "third password 99", token })).status).toBe(400);

    expect((await laptop.get("/api/auth/get-session")).data).toBeNull();
    expect((await b.post("/api/auth/sign-in/email", { email: "sam@a.test", password: PASSWORD })).status).toBe(401);
    expect((await b.post("/api/auth/sign-in/email", { email: "sam@a.test", password: NEW })).status).toBe(200);
    await t.close();
  });

  it("without email delivery in production: no verification step, and sign-up signs in at once", async () => {
    const t = await testApp({ REQUIRE_EMAIL_VERIFICATION: "false" });
    const b = browser(t.app);
    expect((await b.get("/api/config")).data).toMatchObject({ emailVerification: false });
    const signUp = await b.post("/api/auth/sign-up/email", { email: "sam@a.test", username: "sam", name: "Sam", password: PASSWORD });
    expect(signUp.data?.token).toEqual(expect.any(String));
    expect((await b.get("/api/auth/get-session")).data?.user).toMatchObject({ email: "sam@a.test" });
    await t.close();
  });

  it("gives the admin role to a listed address and lets only admins list people", async () => {
    const t = await testApp({ ADMIN_EMAILS: "boss@a.test" });
    const boss = await join(t, "boss@a.test", "boss");
    const sam = await join(t, "sam@a.test", "sam");
    expect((await boss.get("/api/auth/get-session")).data?.user).toMatchObject({ role: "admin" });
    expect((await sam.get("/api/auth/get-session")).data?.user).toMatchObject({ role: "user" });

    const listed = await boss.get("/api/auth/admin/list-users?limit=10");
    expect(listed.status).toBe(200);
    expect((listed.data?.users as { email: string }[]).map((u) => u.email).sort()).toEqual(["boss@a.test", "sam@a.test"]);
    expect((await sam.get("/api/auth/admin/list-users?limit=10")).status).toBe(403);

    const samId = (await sam.get("/api/auth/get-session")).data?.user as { id: string };
    // An admin cannot sign in as someone else, or set their password.
    expect((await boss.post("/api/auth/admin/impersonate-user", { userId: samId.id })).status).toBe(403);
    expect((await boss.post("/api/auth/admin/set-user-password", { userId: samId.id, newPassword: PASSWORD })).status).toBe(403);
    // A ban ends the person's sessions and keeps them out.
    expect((await boss.post("/api/auth/admin/ban-user", { userId: samId.id, banReason: "testing" })).status).toBe(200);
    expect((await sam.get("/api/auth/get-session")).data).toBeNull();
    expect((await browser(t.app).post("/api/auth/sign-in/email", { email: "sam@a.test", password: PASSWORD })).status).toBe(403);
    await t.close();
  });

  it("slows down guessing in production", async () => {
    const t = await testApp({ NODE_ENV: "production" });
    await join(t, "sam@a.test", "sam");
    const b = browser(t.app);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await b.post("/api/auth/sign-in/email", { email: "sam@a.test", password: `wrong ${i} wrong` }, { "x-forwarded-for": "203.0.113.9" })).status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    await t.close();
  });
});

describe("sync", () => {
  it("needs a session and a request from the site itself", async () => {
    const t = await testApp();
    const guest = browser(t.app);
    expect((await guest.post("/api/sync", { cursor: 0, changes: [] })).status).toBe(401);
    const sam = await join(t, "sam@a.test", "sam");
    expect((await sam.post("/api/sync", { cursor: 0, changes: [] }, { origin: "https://evil.test" })).status).toBe(403);
    expect((await sam.get("/api/sync")).status).toBe(405);
    expect((await sam.post("/api/sync", { cursor: -1, changes: [] })).status).toBe(400);
    expect((await sam.post("/api/sync", { cursor: 0 })).status).toBe(400);
    await t.close();
  });

  it("carries changes between two devices, one task at a time, last sync wins", async () => {
    const t = await testApp();
    const laptop = await join(t, "sam@a.test", "sam");
    const phone = browser(t.app);
    await phone.post("/api/auth/sign-in/username", { username: "sam", password: PASSWORD });

    // The laptop sends a list and two tasks.
    const first = await laptop.post("/api/sync", {
      cursor: 0,
      changes: [{ kind: "list", id: "work", data: { id: "work", name: "Work", color: "blue", createdAt: 1 } }, task("t1"), task("t2")],
    });
    expect(first.data).toEqual({ cursor: 3, changes: [], more: false, reset: false });

    // The phone has never synced: it gets all three, in the order they were written.
    const phoneFirst = await phone.post("/api/sync", { cursor: 0, changes: [] });
    expect((phoneFirst.data?.changes as { id: string }[]).map((c) => c.id)).toEqual(["work", "t1", "t2"]);
    expect(phoneFirst.data?.cursor).toBe(3);

    // The phone edits t1 and deletes t2. It gets nothing back: nothing else happened.
    const phoneEdit = await phone.post("/api/sync", { cursor: 3, changes: [task("t1", "Edited on the phone"), { kind: "task", id: "t2", data: null }] });
    expect(phoneEdit.data).toMatchObject({ cursor: 5, changes: [] });

    // The laptop, still at 3, edits t1 too and adds t3. It receives the phone's deletion of t2,
    // but not the phone's t1, which its own newer edit has just replaced.
    const laptopEdit = await laptop.post("/api/sync", { cursor: 3, changes: [task("t1", "Edited on the laptop"), task("t3")] });
    expect(laptopEdit.data).toMatchObject({ cursor: 7, changes: [{ kind: "task", id: "t2", data: null }] });

    // The phone catches up: the laptop's t1 won.
    const phoneLast = await phone.post("/api/sync", { cursor: 5, changes: [] });
    expect((phoneLast.data?.changes as { id: string; data: { title: string } }[]).map((c) => [c.id, c.data.title])).toEqual([
      ["t1", "Edited on the laptop"],
      ["t3", "Task t3"],
    ]);
    // And asking again brings nothing.
    expect((await phone.post("/api/sync", { cursor: 7, changes: [] })).data).toEqual({ cursor: 7, changes: [], more: false, reset: false });
    await t.close();
  });

  it("cleans what it stores and drops what is not a task", async () => {
    const t = await testApp();
    const sam = await join(t, "sam@a.test", "sam");
    await sam.post("/api/sync", {
      cursor: 0,
      changes: [
        { kind: "task", id: "ok", data: { id: "ok", title: "  Kept  ", priority: 9, evil: "<script>", notes: "n".repeat(9000) } },
        { kind: "task", id: "mismatch", data: { id: "other", title: "Wrong id" } },
        { kind: "task", id: "empty", data: { id: "empty", title: "   " } },
        { kind: "note", id: "n1", data: { id: "n1", title: "Unknown kind" } },
        { kind: "task", id: "bad id!", data: { id: "bad id!", title: "Bad id" } },
        "not even an object",
      ],
    });
    const all = await browser(t.app).post("/api/sync", { cursor: 0, changes: [] });
    expect(all.status).toBe(401);
    const mine = await sam.post("/api/sync", { cursor: 0, changes: [] });
    const changes = mine.data?.changes as { id: string; data: Record<string, unknown> }[];
    expect(changes.map((c) => c.id)).toEqual(["ok"]);
    expect(changes[0]?.data).toMatchObject({ title: "Kept", priority: 0 });
    expect(changes[0]?.data).not.toHaveProperty("evil");
    expect(String(changes[0]?.data.notes)).toHaveLength(5000);
    await t.close();
  });

  it("keeps each person's tasks to themselves", async () => {
    const t = await testApp();
    const sam = await join(t, "sam@a.test", "sam");
    const ada = await join(t, "ada@a.test", "ada");
    await sam.post("/api/sync", { cursor: 0, changes: [task("same-id", "Sam's secret")] });
    await ada.post("/api/sync", { cursor: 0, changes: [task("same-id", "Ada's own")] });
    const samSees = (await sam.post("/api/sync", { cursor: 0, changes: [] })).data?.changes as { data: { title: string } }[];
    const adaSees = (await ada.post("/api/sync", { cursor: 0, changes: [] })).data?.changes as { data: { title: string } }[];
    expect(samSees.map((c) => c.data.title)).toEqual(["Sam's secret"]);
    expect(adaSees.map((c) => c.data.title)).toEqual(["Ada's own"]);
    await t.close();
  });

  it("refuses more than an account may hold, without keeping part of the request", async () => {
    const t = await testApp();
    const sam = await join(t, "sam@a.test", "sam");
    const lists = Array.from({ length: MAX_LISTS + 1 }, (_, i) => ({ kind: "list", id: `l${i}`, data: { id: `l${i}`, name: `List ${i}`, color: "blue", createdAt: i } }));
    const tooMany = await sam.post("/api/sync", { cursor: 0, changes: lists });
    expect(tooMany).toMatchObject({ status: 413, data: { code: "TOO_MANY_ITEMS" } });
    expect((await sam.post("/api/sync", { cursor: 0, changes: [] })).data).toMatchObject({ cursor: 0, changes: [] });
    const tooLong = await sam.post("/api/sync", { cursor: 0, changes: Array.from({ length: 2001 }, (_, i) => task(`t${i}`)) });
    expect(tooLong.status).toBe(413);
    await t.close();
  });

  it("starts a device over when its cursor is from another life of the account", async () => {
    const t = await testApp();
    const sam = await join(t, "sam@a.test", "sam");
    await sam.post("/api/sync", { cursor: 0, changes: [task("t1")] });
    const ahead = await sam.post("/api/sync", { cursor: 500, changes: [] });
    expect(ahead.data).toMatchObject({ reset: true, cursor: 1 });
    expect(ahead.data?.changes).toHaveLength(1);
    await t.close();
  });

  it("deleting the account deletes its tasks", async () => {
    const t = await testApp();
    const sam = await join(t, "sam@a.test", "sam");
    await sam.post("/api/sync", { cursor: 0, changes: [task("t1")] });
    const asked = await sam.post("/api/auth/delete-user", { callbackURL: "/account-deleted" });
    expect(asked.status).toBe(200);
    await sam.visit(linkFor(t.outbox, "sam@a.test"));
    expect((await sam.get("/api/auth/get-session")).data).toBeNull();
    const { rows } = (await t.db.execute("select count(*)::int as n from sync_item")) as unknown as { rows: { n: number }[] };
    expect(rows[0]?.n).toBe(0);
    await t.close();
  });
});

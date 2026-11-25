import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { settled } from "./helpers";

/**
 * The admin panel: hidden from everyone but admins (and from crawlers), signed into at /admin/login,
 * showing who is online now and one person's details. Runs against the real API.
 */
const SITE = "http://localhost:4173";
const PASSWORD = "correct horse battery 42";

interface Person {
  email: string;
  username: string;
}

const person = (label: string): Person => {
  const tag = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  return { email: `${label}-${tag}@listzero.test`, username: `${label}_${tag}` };
};

async function confirm(request: APIRequestContext, email: string) {
  let link = "";
  await expect
    .poll(async () => {
      const mails = (await (await request.get(`/api/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as {
        subject: string;
        text: string;
      }[];
      link =
        /https?:\/\/\S+/.exec(mails.filter((m) => /^Confirm your email/.test(m.subject)).at(-1)?.text ?? "")?.[0] ?? "";
      return link;
    })
    .not.toBe("");
  await request.get(link, { maxRedirects: 0 }).catch(() => undefined);
}

async function account(request: APIRequestContext, who: Person, name = who.username.split("_")[0]!): Promise<Person> {
  const made = await request.post("/api/auth/sign-up/email", {
    headers: { origin: SITE },
    data: { email: who.email, password: PASSWORD, name, username: who.username },
  });
  // The admin is made once per API run; a second run finds it there.
  if (made.ok()) await confirm(request, who.email);
  return who;
}

async function signInAt(page: Page, path: string, who: Person) {
  await page.goto(path);
  await page.getByLabel("Email or username").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function device(browser: Browser) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  return { context, page: await context.newPage() };
}

async function expectNoViolations(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

test("the admin panel is hidden: not found for guests and people, never indexed, never listed", async ({
  page,
  request,
  browser,
}) => {
  // To a guest, /admin is an address that doesn't exist.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "This page does not exist." })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow, noarchive");

  // Search engines are told not to index, follow or keep either page.
  for (const path of ["/admin", "/admin/login"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive, nosnippet");
  }
  // And nothing public points at it.
  for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/", "/about"]) {
    expect(await (await request.get(path)).text(), path).not.toMatch(/admin/i);
  }

  // Its API answers like an address that isn't there.
  const nothing = await request.post("/api/no-such-thing", { headers: { origin: SITE }, data: {} });
  const guestAsk = await request.post("/api/admin/overview", { headers: { origin: SITE }, data: {} });
  expect(guestAsk.status()).toBe(404);
  expect(await guestAsk.json()).toEqual(await nothing.json());

  // Someone signed in who isn't an admin: the same "doesn't exist", and the sign-in page says no.
  const sam = await account(request, person("sam"));
  const theirs = await device(browser);
  await signInAt(theirs.page, "/admin/login", sam);
  await expect(theirs.page.getByRole("heading", { name: "Not an admin account" })).toBeVisible();
  await theirs.page.goto("/admin");
  await expect(theirs.page.getByRole("heading", { name: "This page does not exist." })).toBeVisible();
  const asked = await theirs.page.evaluate(
    async () =>
      (
        await fetch("/api/admin/people", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
  );
  expect(asked).toBe(404);
  // No way to it from their own pages either.
  await theirs.page.goto("/account");
  await expect(theirs.page.getByRole("link", { name: /admin/i })).toHaveCount(0);
  await theirs.context.close();
});

test("admins sign in at /admin/login and see who is online, everyone, and one person's details", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const boss = await account(
    request,
    { email: `boss-${testInfo.project.name}@listzero.test`, username: `boss_${testInfo.project.name}` },
    "Boss",
  );
  const ana = await account(request, person("ana"));

  // Ana is using Listzero on another device, with a task.
  const hers = await device(browser);
  await signInAt(hers.page, "/sign-in", ana);
  await expect(hers.page).toHaveURL(/\/today$/);
  await hers.page.getByRole("textbox", { name: /Add a task/ }).fill("Private task name");
  await hers.page.getByRole("button", { name: "Add", exact: true }).click();

  // The admin signs in at the admin address and lands on the panel.
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Admin sign-in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
  await expectNoViolations(page);
  await signInAt(page, "/admin/login", boss);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow, noarchive");

  // Ana is online now.
  const online = page.getByRole("region", { name: "Online now" });
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(online.getByRole("button", { name: new RegExp(ana.email) })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("term").filter({ hasText: "Online now" })).toBeVisible();

  // Everyone, searchable; Ana's row says she's online.
  await page.getByRole("searchbox", { name: "Search by name, email or username" }).fill(ana.username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const row = page.getByRole("row", { name: new RegExp(ana.email) });
  await expect(row).toContainText("Online");
  await expect(row).toContainText("Active");
  await expectNoViolations(page);

  // Her details: how she signs in, her devices, counts but never the task itself.
  await row.getByRole("button", { name: `Details for ${ana.email}` }).click();
  const sheet = page.getByRole("dialog", { name: "ana" });
  await expect(sheet.getByRole("definition").filter({ hasText: "Password" }).first()).toBeVisible();
  await expect(sheet).toContainText("Last seenOnline now");
  await expect(sheet).toContainText("Tasks1 open, 0 done");
  await expect(sheet.locator(".devices")).toContainText("Online");
  await expect(sheet).not.toContainText("Private task name");
  await expectNoViolations(page);

  // An admin can still suspend and lift it from here.
  await sheet.getByRole("button", { name: "Suspend" }).click();
  const ban = page.getByRole("dialog", { name: /^Suspend/ });
  await ban.getByLabel("Reason (they see this)").fill("Testing");
  await ban.getByRole("button", { name: "Suspend" }).click();
  await expect(sheet).toContainText("Suspended: Testing");
  await expect(sheet).toContainText("Signed out everywhere.");
  await sheet.getByRole("button", { name: "Lift suspension" }).click();
  await expect(sheet).toContainText("StatusActive");
  await sheet.getByRole("button", { name: "Close" }).click();

  // Back at /admin/login, a signed-in admin goes straight to the panel.
  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/admin$/);
  await hers.context.close();
});

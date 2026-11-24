import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { addTask, row } from "./helpers";

/**
 * Shared lists, with two people on two devices, against the real API (playwright.config.ts starts it).
 * The phone run would only repeat this on a smaller screen, so it runs once.
 */
test.skip(({ isMobile }) => isMobile, "Two-person flows run once, on desktop.");

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

async function account(request: APIRequestContext, who: Person): Promise<Person> {
  const made = await request.post("/api/auth/sign-up/email", {
    headers: { origin: SITE },
    data: { email: who.email, password: PASSWORD, name: who.username.split("_")[0], username: who.username },
  });
  expect(made.ok(), await made.text()).toBe(true);
  let link = "";
  await expect
    .poll(async () => {
      const mails = (await (await request.get(`/api/__test/outbox?to=${encodeURIComponent(who.email)}`)).json()) as { subject: string; text: string }[];
      link = /https?:\/\/\S+/.exec(mails.filter((m) => /^Confirm your email/.test(m.subject)).at(-1)?.text ?? "")?.[0] ?? "";
      return link;
    })
    .not.toBe("");
  await request.get(link, { maxRedirects: 0 }).catch(() => undefined);
  return who;
}

/** One person on their own device, signed in. */
async function device(browser: Browser, who: Person): Promise<Page> {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email or username").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  return page;
}

const shared = (page: Page) => page.getByRole("navigation", { name: "Shared" });

test("two people share a list: both see its tasks, and it stays out of their own", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const sherry = await account(request, person("sherry"));
  const abdullah = await account(request, person("abdullah"));
  const her = await device(browser, sherry);

  // Sherry makes a shared list and adds the day's work.
  await expect(shared(her)).toContainText("Lists you share with others.");
  await her.getByRole("button", { name: "New shared list" }).click();
  await her.getByLabel("Name").fill("Office");
  await her.getByRole("button", { name: "Create list" }).click();
  await expect(her).toHaveURL(/\/shared\/[0-9a-f-]{36}$/);
  await expect(her.getByRole("heading", { level: 1, name: "Office" })).toBeVisible();
  // The owner's header offers Share.
  await expect(her.getByRole("button", { name: "Share", exact: true })).toBeVisible();
  await addTask(her, "Buy milk");
  await addTask(her, "Fix login bug #urgent");
  // A #word stays in the title here: tasks in a shared list stay in it.
  await expect(row(her, "Fix login bug #urgent")).toBeVisible();
  const listId = /\/shared\/(.+)$/.exec(her.url())![1]!;

  // Her own Today knows nothing about them.
  await her.getByRole("link", { name: /^Today/ }).first().click();
  await expect(row(her, "Buy milk")).toHaveCount(0);

  // She adds Abdullah (the Share dialog comes in the next part; the API is the same).
  const invited = await her.request.post("/api/shared/invite", { headers: { origin: SITE }, data: { listId, email: abdullah.email } });
  expect(invited.ok()).toBe(true);

  // On his device, the list is under Shared, with both tasks.
  const his = await device(browser, abdullah);
  await expect(shared(his).getByRole("link", { name: /Office/ })).toBeVisible();
  await shared(his).getByRole("link", { name: /Office/ }).click();
  await expect(his.getByText("You and 1 other")).toBeVisible();
  await expect(row(his, "Buy milk")).toBeVisible();
  await his.getByRole("checkbox", { name: "Mark “Buy milk” as done" }).click();
  await addTask(his, "Order lunch");

  // Sherry, looking at the list, sees his changes within seconds.
  await her.goto(`/shared/${listId}`);
  await expect(row(her, "Order lunch")).toBeVisible({ timeout: 20_000 });
  await expect(row(her, "Buy milk")).toHaveCount(0, { timeout: 20_000 });
  await expect(row(his, "Order lunch")).toBeVisible();
});

test("a guest has no Shared section, and a shared link asks them to sign in", async ({ page }) => {
  await page.goto("/today");
  await expect(page.getByRole("navigation", { name: "Shared" })).toHaveCount(0);
  await page.goto("/shared/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Sign in to see this list." })).toBeVisible();
});

test("sharing like Google Drive: by email, by link, roles, leaving and deleting", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const sherry = await account(request, person("sherry"));
  const abdullah = await account(request, person("abdullah"));
  const visitor = await account(request, person("visitor"));
  const her = await device(browser, sherry);

  // One of her own lists, with a task, moves to Shared when she shares it.
  await her.goto("/inbox");
  await addTask(her, "Book the room #office");
  await her.getByRole("link", { name: /^office/i }).first().click();
  await her.getByRole("button", { name: "Share", exact: true }).click();
  await her.getByRole("dialog", { name: "Share “Office”?" }).getByRole("button", { name: "Move to Shared" }).click();
  await expect(her).toHaveURL(/\/shared\/[0-9a-f-]{36}(\?share)?$/);
  const dialog = her.getByRole("dialog", { name: "Share “Office”" });
  await expect(dialog).toBeVisible();
  await expect(row(her, "Book the room")).toBeVisible();
  await expect(her.getByRole("navigation", { name: "Lists" }).getByRole("link", { name: /office/i })).toHaveCount(0);

  // By email: Abdullah, who can edit.
  await dialog.getByLabel("Add people by email").fill(abdullah.email);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("status")).toHaveText(`Invite sent to ${abdullah.email}.`);
  await expect(dialog.locator(".share__email").filter({ hasText: abdullah.email })).toBeVisible();

  // By link: anyone with it can view.
  await dialog.getByRole("combobox", { name: "General access" }).click();
  await her.getByRole("option", { name: "Anyone with the link" }).click();
  await expect(dialog.getByText("Anyone signed in with the link can join.")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Role for people with the link" }).click();
  await her.getByRole("option", { name: "Can view" }).click();
  const link = await her.evaluate(async () => {
    const r = await fetch("/api/shared/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cursors: {}, changes: [] }) });
    return ((await r.json()) as { lists: { link: string }[] }).lists[0]!.link;
  });
  await dialog.getByRole("button", { name: "Done" }).click();

  // The visitor opens the link, signs in, and joins as a viewer: no add box.
  const them = await device(browser, visitor);
  await them.goto(new URL(link).pathname);
  await expect(them.getByRole("heading", { name: /shared “Office” with you/ })).toBeVisible();
  await them.getByRole("button", { name: "Join list" }).click();
  await expect(row(them, "Book the room")).toBeVisible();
  await expect(them.getByRole("textbox", { name: /Add a task/ })).toHaveCount(0);

  // Abdullah sees who is in it, and can leave; he stays for now.
  const his = await device(browser, abdullah);
  await his.getByRole("navigation", { name: "Shared" }).getByRole("link", { name: /Office/ }).click();
  await his.getByRole("button", { name: "You and 2 others" }).click();
  const theirs = his.getByRole("dialog", { name: "Share “Office”" });
  await expect(theirs.getByRole("button", { name: "Leave list" })).toBeVisible();
  await expect(theirs.getByLabel("Add people by email")).toHaveCount(0);
  await theirs.getByRole("button", { name: "Done" }).click();

  // Sherry deletes it for everyone.
  await her.getByRole("button", { name: "Share", exact: true }).click();
  await her.getByRole("dialog", { name: "Share “Office”" }).getByRole("button", { name: "Delete list" }).click();
  await her.getByRole("button", { name: "Delete for everyone" }).click();
  await expect(her).toHaveURL(/\/today$/);
  await his.reload();
  await expect(his.getByRole("heading", { name: "This list isn’t shared with you." })).toBeVisible({ timeout: 20_000 });
});

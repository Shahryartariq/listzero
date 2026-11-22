import { createHmac, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { addTask, day, row, seed, settled } from "./helpers";

/**
 * Accounts and sync, against the real API with an in-memory database (playwright.config.ts starts it).
 * Emails land in an outbox the tests can read instead of being sent.
 */

const SITE = "http://localhost:4173";
const PASSWORD = "correct horse battery 42";
let counter = 0;

interface Person {
  email: string;
  username: string;
  password: string;
}

const person = (label = "sam"): Person => {
  const tag = `${Date.now().toString(36)}${(counter++).toString(36)}${randomUUID().slice(0, 4)}`;
  return { email: `${label}-${tag}@listzero.test`, username: `${label}_${tag}`, password: PASSWORD };
};

const CONFIRM = /^Confirm your email/;
const RESET = /^Reset your Listzero password/;
const DELETE = /^Confirm deleting/;

/**
 * The link in the newest email of one kind sent to an address. Matching the subject matters with real
 * email, which arrives a moment after the request that sent it: the newest email may still be the last one.
 */
async function emailedLink(request: APIRequestContext, to: string, about = CONFIRM): Promise<string> {
  let link = "";
  await expect
    .poll(async () => {
      const mails = (await (await request.get(`/api/__test/outbox?to=${encodeURIComponent(to)}`)).json()) as { subject: string; text: string }[];
      const mail = mails.filter((m) => about.test(m.subject)).at(-1);
      link = /https?:\/\/\S+/.exec(mail?.text ?? "")?.[0] ?? "";
      return link;
    })
    .not.toBe("");
  return link;
}

/** An account that exists and has confirmed its email, made through the API to keep the tests quick. */
async function account(request: APIRequestContext, who = person()): Promise<Person> {
  const made = await request.post("/api/auth/sign-up/email", {
    headers: { origin: SITE },
    data: { email: who.email, password: who.password, name: who.username, username: who.username },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const link = await emailedLink(request, who.email);
  // The link confirms the email; where it redirects afterwards does not matter here.
  await request.get(link, { maxRedirects: 0 }).catch(() => undefined);
  return who;
}

async function signIn(page: Page, who: Person, name = who.email) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or username").fill(name);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/**
 * Signed in and the first sync has finished. With tasks here as a guest, Listzero asks once whether to
 * add them to the account; pass the answer.
 */
async function signedIn(page: Page, who: Person, guestTasks?: "Add to my account" | "Not now") {
  await signIn(page, who);
  await expect(page).toHaveURL(/\/today$/);
  if (guestTasks) await answerOffer(page, guestTasks);
  await synced(page);
}

async function answerOffer(page: Page, answer: "Add to my account" | "Not now") {
  const offer = page.getByRole("dialog", { name: "Add your guest tasks?" });
  await offer.getByRole("button", { name: answer }).click();
  await expect(offer).toHaveCount(0);
}

async function synced(page: Page) {
  await page.goto("/account");
  await expect(page.getByRole("region", { name: "Sync" }).getByRole("status")).toContainText("In sync");
}

/** Signs out from the Account page and lands on the front page as a guest. */
async function signOut(page: Page) {
  await page.goto("/account");
  await page.getByRole("region", { name: "Sign out" }).getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("dialog", { name: "Sign out" }).getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Get today to zero." })).toBeVisible();
}

/** Every key this browser keeps for an account (its tasks, and what sync knows). */
const accountKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("listzero:account:") || k.startsWith("listzero:sync")));

const device = async (browser: Browser) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  return { context, page: await context.newPage() };
};

/** The code an authenticator app would show for a base32 secret. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const step = Buffer.alloc(8);
  step.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const mac = createHmac("sha1", key).update(step).digest();
  const offset = mac[mac.length - 1]! & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

test.describe("creating an account", () => {
  test("sign up, confirm the email, and the guest's tasks can move into the new account", async ({ page, request }) => {
    await seed(page, [{ title: "Was here before the account", due: day() }]);
    const who = person();

    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Username").fill(who.username);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    // Not confirmed yet: the password alone does not let anyone in.
    await signIn(page, who);
    await expect(page.getByText("Confirm your email first. We have sent you a new link.")).toBeVisible();

    await page.goto(await emailedLink(request, who.email));
    await expect(page).toHaveURL(/\/today$/);
    const offer = page.getByRole("dialog", { name: "Add your guest tasks?" });
    await expect(offer).toContainText("You have 1 task as a guest in this browser.");
    await answerOffer(page, "Add to my account");
    await expect(page.getByText("1 task added to your account.")).toBeVisible();
    await expect(row(page, "Was here before the account")).toBeVisible();
    await synced(page);
    await expect(page.getByText(`Signed in as ${who.email}`)).toBeVisible();

    // It moved: the guest no longer has it, the account does.
    await signOut(page);
    await page.goto("/today");
    await expect(row(page, "Was here before the account")).toHaveCount(0);
    await signedIn(page, who);
    await page.goto("/today");
    await expect(row(page, "Was here before the account")).toBeVisible();
  });

  test("the form says what is wrong before anything is sent", async ({ page, request }) => {
    const taken = await account(request);
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Username").fill("a b");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter an email address, like you@example.com.")).toBeVisible();
    await expect(page.getByText("Use 3 to 30 letters, numbers, dots, dashes or underscores.")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);

    // A username someone else has is refused by name, so it can be changed.
    await page.getByLabel("Email").fill(person().email);
    await page.getByLabel("Username").fill(taken.username);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/username.*taken/i)).toBeVisible();
  });
});

test.describe("signing in", () => {
  test("with the username, and a wrong password says so without saying which part", async ({ page, request }) => {
    const who = await account(request);
    await signIn(page, { ...who, password: "not the password" });
    await expect(page.getByRole("alert")).toContainText("That email and password do not match.");

    await signIn(page, who, who.username);
    await expect(page).toHaveURL(/\/today$/);
  });

  test("pages that need an account send you to sign in and back", async ({ page, request }) => {
    const who = await account(request);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount|\/sign-in\?next=\/account/);
    await page.getByLabel("Email or username").fill(who.email);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("a forgotten password is reset by email, and the old one stops working", async ({ page, request }) => {
    const who = await account(request);
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(who.email);
    await page.getByRole("button", { name: "Send the link" }).click();
    await expect(page.getByText(/^If that address has an account/)).toBeVisible();

    await page.goto(await emailedLink(request, who.email, RESET));
    await expect(page).toHaveURL(/\/reset-password/);
    await page.getByLabel("New password", { exact: true }).fill("a brand new phrase 77");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

    await signIn(page, who);
    await expect(page.getByRole("alert")).toBeVisible();
    await signIn(page, { ...who, password: "a brand new phrase 77" });
    await expect(page).toHaveURL(/\/today$/);
  });
});

test.describe("sync", () => {
  test("a task added on one device shows up on the other, and so does finishing it", async ({ browser, request }) => {
    const who = await account(request);
    const one = await device(browser);
    const two = await device(browser);
    await signedIn(one.page, who);
    await signedIn(two.page, who);

    await one.page.goto("/inbox");
    await addTask(one.page, "Buy stamps");
    await synced(one.page);

    await two.page.goto("/account");
    await two.page.getByRole("button", { name: "Sync now" }).click();
    await two.page.goto("/inbox");
    await expect(row(two.page, "Buy stamps")).toBeVisible();

    await row(two.page, "Buy stamps").getByRole("checkbox").click();
    await synced(two.page);
    await one.page.goto("/account");
    await one.page.getByRole("button", { name: "Sync now" }).click();
    await one.page.goto("/done");
    await expect(row(one.page, "Buy stamps")).toBeVisible();

    await one.context.close();
    await two.context.close();
  });

  test("work done offline is kept and sent when the connection returns", async ({ browser, request }) => {
    const who = await account(request);
    const one = await device(browser);
    await signedIn(one.page, who);

    await one.page.goto("/inbox");
    await one.context.setOffline(true);
    await addTask(one.page, "Written on the train");
    await expect(row(one.page, "Written on the train")).toBeVisible();
    await one.context.setOffline(false);
    await one.page.evaluate(() => window.dispatchEvent(new Event("online")));
    await synced(one.page);

    const two = await device(browser);
    await signedIn(two.page, who);
    await two.page.goto("/inbox");
    await expect(row(two.page, "Written on the train")).toBeVisible();
    await one.context.close();
    await two.context.close();
  });

  test("a guest's tasks and an account's tasks stay apart, and signing out takes the account's off this browser", async ({ page, request }) => {
    const who = await account(request);
    await seed(page, [{ title: "Kept as a guest", due: day() }]);
    await signedIn(page, who, "Not now");

    await page.goto("/today");
    await expect(row(page, "Kept as a guest")).toHaveCount(0);
    await addTask(page, "Only in the account");
    await synced(page);
    expect(await accountKeys(page)).not.toEqual([]);

    await signOut(page);
    expect(await accountKeys(page)).toEqual([]);
    await expect(page.getByText("As a guest you have 1 open task in this browser.")).toBeVisible();
    await page.getByRole("link", { name: "Continue as a guest" }).click();
    await expect(row(page, "Kept as a guest")).toBeVisible();
    await expect(row(page, "Only in the account")).toHaveCount(0);

    // Signing in again asks again, and the account's tasks come back from the account.
    await signedIn(page, who, "Not now");
    await page.goto("/today");
    await expect(row(page, "Only in the account")).toBeVisible();
    await expect(row(page, "Kept as a guest")).toHaveCount(0);
  });

  test("two accounts on one browser each see only their own tasks", async ({ page, request }) => {
    const first = await account(request);
    const second = await account(request);
    await signedIn(page, first);
    await page.goto("/today");
    await addTask(page, "Belongs to the first person");
    await synced(page);
    await signOut(page);

    // The guest is empty, so there is nothing to offer.
    await signedIn(page, second);
    await expect(page.getByRole("dialog", { name: "Add your guest tasks?" })).toHaveCount(0);
    await page.goto("/today");
    await expect(row(page, "Belongs to the first person")).toHaveCount(0);
    await addTask(page, "Belongs to the second person");
    await synced(page);
    await signOut(page);

    await signedIn(page, first);
    await page.goto("/today");
    await expect(row(page, "Belongs to the first person")).toBeVisible();
    await expect(row(page, "Belongs to the second person")).toHaveCount(0);
  });

  test("someone signed in skips the front page, and sees their tasks even when the account cannot be reached", async ({ page, request }) => {
    const who = await account(request);
    await signedIn(page, who);
    await page.goto("/today");
    await addTask(page, "Here without the server");
    await synced(page);

    await page.goto("/");
    await expect(page).toHaveURL(/\/today$/);
    // Only a check that worked can say "signed out": a failed one keeps the account's tasks on screen.
    await page.route("**/api/auth/get-session*", (route) => route.abort());
    await page.goto("/");
    await expect(page).toHaveURL(/\/today$/);
    await expect(row(page, "Here without the server")).toBeVisible();
  });
});

test.describe("the Account page", () => {
  test("profile and password can be changed", async ({ page, request }) => {
    const who = await account(request);
    await signedIn(page, who);

    const profile = page.getByRole("region", { name: "Profile" });
    await profile.getByLabel("Name", { exact: true }).fill("Sam Rivers");
    await profile.getByRole("button", { name: "Save profile" }).click();
    await expect(profile.getByRole("status")).toContainText("Saved.");

    const password = page.getByRole("region", { name: "Password" });
    await password.getByLabel("Current password", { exact: true }).fill(who.password);
    await password.getByLabel("New password", { exact: true }).fill("another long phrase 91");
    await password.getByRole("button", { name: "Change password" }).click();
    await expect(password.getByRole("status")).toContainText("Password changed");

    await signOut(page);
    await signIn(page, { ...who, password: "another long phrase 91" });
    await expect(page).toHaveURL(/\/today$/);
  });

  test("two-factor: turn it on, then sign in with a code or a backup code", async ({ page, request }) => {
    const who = await account(request);
    await signedIn(page, who);

    const section = page.getByRole("region", { name: "Two-factor sign-in" });
    await section.getByRole("button", { name: "Turn on two-factor" }).click();
    await section.getByLabel("Your password, to confirm it is you", { exact: true }).fill(who.password);
    await section.getByRole("button", { name: "Continue" }).click();
    await expect(section.getByRole("img", { name: /QR code/ })).toBeVisible();
    const secret = ((await section.locator(".secret").textContent()) ?? "").replace(/\s/g, "");
    await section.getByLabel("6-digit code").fill(totp(secret));
    await section.getByRole("button", { name: "Turn on", exact: true }).click();
    await expect(section.getByRole("list", { name: "Backup codes" }).locator("code")).toHaveCount(10);
    const codes = await section.getByRole("list", { name: "Backup codes" }).locator("code").allTextContents();
    await section.getByRole("button", { name: "I have saved them" }).click();
    await expect(section).toContainText("On. Signing in asks for a code");

    await signOut(page);
    await signIn(page, who);
    await expect(page).toHaveURL(/\/two-factor/);
    await page.getByLabel("Code", { exact: true }).fill("000000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/code/i).and(page.locator(".form__error"))).toBeVisible();
    await page.getByLabel("Code", { exact: true }).fill(totp(secret));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/today$/);

    await synced(page);
    await signOut(page);
    await signIn(page, who);
    await page.getByRole("button", { name: "Use a backup code instead" }).click();
    await page.getByLabel("Backup code").fill(codes[0]!);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/today$/);
  });

  test("a passkey can be added and then signs you in without a password", async ({ page, request }) => {
    const who = await account(request);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await signedIn(page, who);

    const section = page.getByRole("region", { name: "Passkeys" });
    await section.getByLabel("Name for a new passkey").fill("Test key");
    await section.getByRole("button", { name: "Add a passkey" }).click();
    await expect(section.getByText("Test key")).toBeVisible();

    await signOut(page);
    await page.goto("/sign-in");
    // The test authenticator also answers the browser's passkey autofill by itself, so the page may
    // already be moving on by the time the button is clicked. Either way, no password was typed.
    await page
      .getByRole("button", { name: "Sign in with a passkey" })
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await expect(page).toHaveURL(/\/today$/);
    await page.goto("/account");
    await expect(page.getByText(`Signed in as ${who.email}`)).toBeVisible();
  });

  test("another device can be signed out from here", async ({ browser, request }) => {
    const who = await account(request);
    const one = await device(browser);
    const two = await device(browser);
    await signedIn(one.page, who);
    await signedIn(two.page, who);

    await one.page.reload();
    const sessions = one.page.getByRole("region", { name: "Where you are signed in" });
    // Both browsers, plus the session made when the email was confirmed.
    await expect(sessions.getByRole("listitem")).toHaveCount(3);
    await sessions.getByRole("button", { name: "Sign out all other devices" }).click();
    await expect(sessions.getByRole("listitem")).toHaveCount(1);

    await two.page.goto("/account");
    await expect(two.page).toHaveURL(/\/sign-in/);
    await one.context.close();
    await two.context.close();
  });

  test("deleting the account is confirmed by email and leaves the guest's tasks in this browser", async ({ page, request }) => {
    const who = await account(request);
    await seed(page, [{ title: "Outlives the account", due: day() }]);
    await signedIn(page, who, "Not now");
    await page.goto("/today");
    await addTask(page, "Goes with the account");
    await synced(page);

    await page.getByRole("region", { name: "Delete account" }).getByRole("button", { name: "Delete my account" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Email me the link" }).click();
    await expect(page.getByRole("region", { name: "Delete account" }).getByRole("status")).toContainText("Check your email");

    await page.goto(await emailedLink(request, who.email, DELETE));
    await page.goto("/today");
    await expect(row(page, "Outlives the account")).toBeVisible();
    await expect(row(page, "Goes with the account")).toHaveCount(0);
    expect(await accountKeys(page)).toEqual([]);
    await signIn(page, who);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});

test.describe("admins", () => {
  test("can see accounts, suspend one and lift it; other people cannot open the page", async ({ page, request }, testInfo) => {
    const admin = { ...person("admin"), email: `admin-${testInfo.project.name}@listzero.test` };
    const made = await request.post("/api/auth/sign-up/email", {
      headers: { origin: SITE },
      data: { email: admin.email, password: admin.password, name: "Admin", username: admin.username },
    });
    // A second run against the same API finds the admin already there.
    if (made.ok()) await request.get(await emailedLink(request, admin.email), { maxRedirects: 0 }).catch(() => undefined);
    const target = await account(request);

    await signedIn(page, admin);
    await page.getByRole("link", { name: "Manage people" }).click();
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search by email" }).fill(target.email);
    await page.getByRole("button", { name: "Search" }).click();
    const line = page.getByRole("row", { name: target.email });
    await expect(line).toContainText("Active");

    await line.getByRole("button", { name: "Suspend" }).click();
    const sheet = page.getByRole("dialog", { name: /^Suspend/ });
    await sheet.getByLabel("Reason (they see this)").fill("Testing");
    await sheet.getByRole("button", { name: "Suspend" }).click();
    await expect(line).toContainText("Suspended: Testing");

    const other = await device(page.context().browser()!);
    await signIn(other.page, target);
    await expect(other.page.getByRole("alert")).toContainText(/suspended/i);

    await line.getByRole("button", { name: "Lift suspension" }).click();
    await expect(line).toContainText("Active");
    await signIn(other.page, target);
    await expect(other.page).toHaveURL(/\/today$/);
    await other.page.goto("/admin");
    await expect(other.page.getByRole("heading", { name: "This page is for admins." })).toBeVisible();
    await other.context.close();
  });
});

async function expectNoViolations(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`account screens, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("pass automated WCAG checks, with errors, sheets and the two-factor setup showing", async ({ page, request }) => {
      await page.goto("/sign-in");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expectNoViolations(page);

      await page.goto("/sign-up");
      await page.getByLabel("Email").fill("bad");
      await page.getByLabel("Password", { exact: true }).fill("short");
      await page.getByRole("button", { name: "Create account" }).click();
      await expectNoViolations(page);

      const who = await account(request);
      await signedIn(page, who);
      await expectNoViolations(page);

      const twoFactor = page.getByRole("region", { name: "Two-factor sign-in" });
      await twoFactor.getByRole("button", { name: "Turn on two-factor" }).click();
      await twoFactor.getByLabel("Your password, to confirm it is you", { exact: true }).fill(who.password);
      await twoFactor.getByRole("button", { name: "Continue" }).click();
      await expect(twoFactor.getByRole("img", { name: /QR code/ })).toBeVisible();
      await expectNoViolations(page);

      await page.getByRole("region", { name: "Sign out" }).getByRole("button", { name: "Sign out" }).click();
      await expect(page.getByRole("dialog", { name: "Sign out" })).toBeVisible();
      await expectNoViolations(page);
    });
  });
}

test.describe("a copy of Listzero without accounts", () => {
  test("has no sign-in anywhere and works as before", async ({ page }) => {
    await page.route("**/api/config", (route) => route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html>" }));
    await seed(page, [{ title: "Still local", due: day() }]);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Continue as a guest" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
    await page.goto("/menu");
    await expect(page.getByRole("link", { name: "Settings" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);

    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Accounts are not available here." })).toBeVisible();
    await page.goto("/account");
    await expect(page).toHaveURL(/\/today$/);
    await expect(row(page, "Still local")).toBeVisible();
  });
});

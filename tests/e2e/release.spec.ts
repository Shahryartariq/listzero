import { expect, test, type Page } from "@playwright/test";
import { addTask, day, isPhone, monthDay, openDisplay, row, seed } from "./helpers";

const SITE = "https://listzero.vercel.app";

test.describe("search engines", () => {
  test("only the home page and How it works ask to be indexed", async ({ page }) => {
    const robots = page.locator('meta[name="robots"]');
    const canonical = page.locator('link[rel="canonical"]');

    await page.goto("/");
    await expect(robots).toHaveAttribute("content", "index, follow");
    await expect(canonical).toHaveAttribute("href", `${SITE}/`);
    // The front page keeps the site's own title and says what Listzero is.
    await expect(page).toHaveTitle("Listzero: a free to-do list for busy minds");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Get today to zero.");

    await page.goto("/about");
    await expect(robots).toHaveAttribute("content", "index, follow");
    await expect(canonical).toHaveAttribute("href", `${SITE}/about`);

    for (const path of ["/today", "/inbox", "/upcoming", "/board", "/done", "/focus", "/search", "/settings", "/list/x", "/nope"]) {
      await page.goto(path);
      await expect(robots, path).toHaveAttribute("content", "noindex, follow");
      await expect(canonical, path).toHaveCount(0);
    }
  });

  test("once there are tasks, the tab says what is left", async ({ page }) => {
    await seed(page, [{ title: "One", due: day() }]);
    await page.goto("/today");
    await expect(page).toHaveTitle("1 to zero | Listzero");
  });

  test("How it works has its own head before any script runs", async ({ request }) => {
    // The host serves this file at /about (vercel.json); the local preview only knows it by its file name.
    const html = await (await request.get("/about/index.html")).text();
    expect(html).toContain("<title>How Listzero works: a to-do list for minds that get overwhelmed</title>");
    expect(html).toContain(`<link rel="canonical" href="${SITE}/about" />`);
    expect(html).toContain(`<meta property="og:url" content="${SITE}/about" />`);
    expect(html).not.toContain(`content="${SITE}/" />`);
  });

  test("the not-found page, sitemap and other crawler files are real files", async ({ request }) => {
    const missing = await (await request.get("/404.html")).text();
    expect(missing).toContain("<title>Page not found | Listzero</title>");
    expect(missing).toContain('<meta name="robots" content="noindex" />');
    expect(missing).not.toContain('rel="canonical"');

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toMatch(new RegExp(`<loc>${SITE}/</loc><lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`));
    expect(sitemap).toContain(`<loc>${SITE}/about</loc>`);

    const llms = await request.get("/llms.txt");
    expect(llms.headers()["content-type"]).toContain("text/plain");
    expect(await llms.text()).toMatch(/^# Listzero\n/);

    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");
    expect(await (await request.get("/.well-known/security.txt")).text()).toContain("Contact:");
    expect(await (await request.get("/google4adfdcaade9a40a0.html")).text()).toBe(
      "google-site-verification: google4adfdcaade9a40a0.html",
    );
  });

  test("the page describes itself in structured data, and the theme script is inline", async ({ page, request }) => {
    await page.goto("/today");
    const data = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(data ?? "{}")).toMatchObject({ "@type": "WebApplication", name: "Listzero" });
    const html = await (await request.get("/")).text();
    expect(html).not.toContain('src="/theme.js"');
    expect(html).not.toContain("registerSW.js");
    // The inline script ran under the Content-Security-Policy: the look is set before React starts.
    await expect(page.locator("html")).toHaveAttribute("data-palette", "chalk");
  });
});

/** Serves the local build at the public address, so the app believes it is the live site. */
async function asPublicSite(page: Page) {
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `http://localhost:4173${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  // Stand-ins for Google, so the test sends nothing real.
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "window.__tagLoaded = true;" }),
  );
  await page.route("https://*.google-analytics.com/**", (route) => route.fulfill({ status: 204, body: "" }));
}

const sent = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => Array.from(entry)),
  );

test.describe("visit counting", () => {
  test("a local copy never contacts Google", async ({ page }) => {
    const google: string[] = [];
    page.on("request", (r) => /google/.test(new URL(r.url()).hostname) && google.push(r.url()));
    await page.goto("/today");
    await page.goto("/about");
    await page.waitForTimeout(1200);
    expect(google).toEqual([]);
    expect(await sent(page)).toEqual([]);
  });

  test("the public site counts the kind of screen, and nothing a visitor typed", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await asPublicSite(page);
    await seed(page, [{ title: "Secret task", listId: "private-list-id" }], [{ id: "private-list-id", name: "My salary plan" }]);

    await page.goto(`${SITE}/list/private-list-id?task=seed-1`);
    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(`${SITE}/search?q=Secret`);
    await expect(row(page, "Secret task")).toBeVisible();
    await page.goto(`${SITE}/a-typed-address`);

    // The Google tag loaded, so the Content-Security-Policy lets it through and nothing else complained.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tagLoaded?: boolean }).__tagLoaded)).toBe(true);
    const blocked = await page.evaluate(() =>
      fetch("https://region1.google-analytics.com/g/collect", { method: "POST", mode: "no-cors" }).then(
        () => false,
        () => true,
      ),
    );
    expect(blocked).toBe(false);
    expect(errors).toEqual([]);

    const events = await sent(page);
    const views = events.filter((e) => e[0] === "event" && e[1] === "page_view").map((e) => e[2]);
    expect(views).toEqual([{ page_location: `${SITE}/not-found`, page_title: "Page not found | Listzero" }]);
    expect(events.find((e) => e[0] === "config")?.[2]).toMatchObject({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    expect(events.find((e) => e[0] === "consent")?.[2]).toMatchObject({ ad_storage: "denied", ad_user_data: "denied" });

    // Moving around inside the app: fixed addresses and titles only.
    await page.goto(`${SITE}/today`);
    if (isPhone(page)) await page.getByRole("link", { name: "Menu" }).click();
    await page.getByRole("link", { name: "My salary plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "My salary plan" })).toBeVisible();
    const all = JSON.stringify(await sent(page));
    expect(all).toContain(`${SITE}/list"`);
    expect(all).toContain("List | Listzero");
    for (const secret of ["salary", "Secret", "private-list-id", "seed-1", "a-typed-address", "?q="]) {
      expect(all, secret).not.toContain(secret);
    }
  });

  test("it can be turned off in Settings, and stays off", async ({ page }) => {
    await asPublicSite(page);
    await page.goto(`${SITE}/settings`);
    const counting = page.getByRole("radiogroup", { name: "Visit counting" });
    await expect(counting.getByRole("radio", { name: "On" })).toBeChecked();
    await counting.getByRole("radio", { name: "Off" }).click();
    await expect(counting.getByRole("radio", { name: "Off" })).toBeChecked();
    expect(await page.evaluate(() => (window as unknown as Record<string, boolean>)["ga-disable-G-F20040CM1X"])).toBe(true);

    const before = (await sent(page)).length;
    await page.goto(`${SITE}/today`);
    await page.reload();
    await page.waitForTimeout(800);
    // After the reload nothing is set up at all.
    expect(await sent(page)).toEqual([]);
    expect(before).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("listzero:v1") ?? "{}").settings.analytics)).toBe(false);

    await page.goto(`${SITE}/settings`);
    await page.getByRole("link", { name: "What is counted" }).click();
    await expect(page).toHaveURL(/\/about#privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeInViewport();
  });

  test("a browser that asks not to be tracked is not counted", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true }));
    await asPublicSite(page);
    await page.goto(`${SITE}/settings`);
    await expect(page.getByText("Your browser asks sites not to track you")).toBeVisible();
    await page.goto(`${SITE}/today`);
    await page.waitForTimeout(600);
    expect(await sent(page)).toEqual([]);
  });
});

test.describe("flows that were missing", () => {
  test("a task can be added straight onto a calendar day, and keeps the view's list", async ({ page }) => {
    await seed(page, [{ title: "Existing", listId: "work", due: monthDay(10) }], [{ id: "work", name: "Work" }]);
    await page.goto("/list/work");
    const sheet = await openDisplay(page);
    await sheet.getByRole("radio", { name: "Calendar" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();

    await page.locator(`td[data-day="${monthDay(12)}"] .cal__day`).click();
    const field = page.getByRole("textbox", { name: /^Add a task on .*12/ });
    await expect(page.getByRole("button", { name: "Add to this day" })).toBeDisabled();
    await field.fill("Send the report");
    await field.press("Enter");
    await expect(field).toHaveValue("");
    const twelfth = page.getByRole("region", { name: /12/ });
    await expect(twelfth.locator("[data-task]")).toHaveText(/Send the report/);
    await expect(page.locator(`td[data-day="${monthDay(12)}"]`).getByRole("button", { name: /, 1 task$/ })).toBeVisible();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("listzero:v1") ?? "{}").tasks.at(-1));
    expect(saved).toMatchObject({ title: "Send the report", listId: "work", due: monthDay(12) });
  });

  test("a day typed in the task wins over the chosen day, and the calendar follows it", async ({ page }) => {
    await seed(page, [{ title: "Existing" }]);
    await page.goto("/inbox");
    const sheet = await openDisplay(page);
    await sheet.getByRole("radio", { name: "Calendar" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await page.locator(`td[data-day="${monthDay(12)}"] .cal__day`).click();
    await page.getByRole("textbox", { name: /^Add a task on/ }).fill("Call the bank today");
    await page.getByRole("button", { name: "Add to this day" }).click();
    await expect(page.locator(`td[data-day="${day()}"]`)).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("region", { name: /^Today,/ }).locator("[data-task]")).toHaveText(/Call the bank/);
  });

  test("reopening a finished task says so and can be undone", async ({ page }) => {
    await seed(page, [{ title: "Was done", completedAt: Date.now() - 1000 }]);
    await page.goto("/done");
    await row(page, "Was done").getByRole("checkbox").click();
    await expect(page.locator(".toasts")).toContainText("Back on the list.");
    await expect(row(page, "Was done")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row(page, "Was done")).toBeVisible();
  });

  test("Focus names the tab when there is nothing to do, and says when the timer is up", async ({ page }) => {
    await page.goto("/about");
    await page.goto("/focus");
    await expect(page.getByRole("heading", { name: "Nothing to focus on." })).toBeVisible();
    await expect(page).toHaveTitle("Focus | Listzero");

    await page.clock.install();
    await seed(page, [{ title: "Write one line", due: day() }]);
    await page.goto("/focus");
    await page.getByRole("button", { name: "Just 2 minutes" }).click();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page).toHaveTitle(/^0[12]:\d\d \| Write one line$/);
    await page.clock.fastForward("02:01");
    await expect(page.getByRole("status").filter({ hasText: "Time is up" })).toBeVisible();
    await expect(page).toHaveTitle("Time is up | Write one line");
  });

  test("when the browser runs out of room, the warning says that and where to go", async ({ page }) => {
    await seed(page, [{ title: "One", due: day() }]);
    await page.goto("/today");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("full", "QuotaExceededError");
      };
    });
    await addTask(page, "Does not fit");
    const warning = page.getByRole("alert");
    await expect(warning).toContainText("run out of room");
    await expect(warning).not.toContainText("private mode");
    await warning.getByRole("link", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/done$/);
  });

  test("when storage is refused from the start, the warning says tasks will not be kept", async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("denied", "SecurityError");
      };
    });
    await page.goto("/today");
    await expect(page.getByRole("alert")).toContainText("not saving data for this site");
  });

  test("saved data that cannot be read is kept, offered as a download, and never silently lost", async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("broken")) return;
      sessionStorage.setItem("broken", "1");
      localStorage.setItem("listzero:v1", '{"version":1,"tasks":[{"title":"Half a ta');
    });
    await page.goto("/today");
    const warning = page.getByRole("alert");
    await expect(warning).toContainText("could not be read");

    // It is still offered after a reload, because the copy is still there.
    await addTask(page, "A new task");
    await page.reload();
    await expect(warning).toContainText("could not be read");
    await expect(row(page, "A new task")).toBeVisible();

    const download = page.waitForEvent("download");
    await warning.getByRole("button", { name: "Download the copy" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^listzero-unreadable-\d{4}-\d{2}-\d{2}\.txt$/);
    const stream = await file.createReadStream();
    let text = "";
    for await (const chunk of stream) text += String(chunk);
    expect(text).toBe('{"version":1,"tasks":[{"title":"Half a ta');

    await warning.getByRole("button", { name: "Delete the copy" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("listzero:v1:unreadable"))).toBeNull();
  });

  test("a new version takes over without waiting for every tab to close", async ({ request }) => {
    const worker = await (await request.get("/sw.js")).text();
    expect(worker).toContain("self.skipWaiting()");
    expect(worker).toContain("clientsClaim()");
    // Without the two settings above, the worker only skips waiting when a page asks it to.
    expect(worker).not.toContain("SKIP_WAITING");
  });

  test("a screen whose download fails shows a way out instead of a blank page", async ({ page }) => {
    await page.route("**/assets/Settings-*.js", (route) => route.abort());
    await page.goto("/settings");
    // One automatic reload is tried first, then the message.
    await expect(page.getByRole("alert")).toContainText("This screen did not load.");
    await expect(page.getByRole("link", { name: "Today" }).first()).toBeVisible();
    await page.unroute("**/assets/Settings-*.js");
    await page.getByRole("button", { name: "Reload" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  });

  test("the shortcut to Settings is listed with the others", async ({ page }) => {
    test.skip(isPhone(page), "Keyboard shortcuts are for keyboards.");
    await page.goto("/about");
    await expect(page.getByRole("row", { name: /Go to Inbox, Today, Upcoming, Board, Done, Focus, Settings/ })).toContainText("S");
    await page.locator("body").press("g");
    await page.locator("body").press("s");
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("screens that load on demand open from a cold start, and the task sheet opens from a link", async ({ page }) => {
    await seed(page, [{ title: "Linked task", due: day() }]);
    for (const [path, heading] of [
      ["/settings", "Settings"],
      ["/done", "Done"],
      ["/search", "Search"],
      ["/board", "Board"],
      ["/about", "How Listzero works"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
    await page.goto("/today?task=seed-1");
    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Task name" })).toHaveValue("Linked task");
  });
});

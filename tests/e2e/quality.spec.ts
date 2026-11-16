import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { day, seed } from "./helpers";

async function loadExamples(page: Page) {
  await page.goto("/today");
  await page.getByRole("button", { name: "Load example tasks" }).click();
  await page.getByRole("button", { name: "Dismiss" }).click();
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("every view passes automated WCAG checks", async ({ page }) => {
      await loadExamples(page);
      await expectNoViolations(page);
      for (const path of ["/inbox", "/upcoming", "/board", "/board?in=all", "/done", "/focus", "/search?q=the", "/settings", "/about", "/menu"]) {
        await page.goto(path);
        await expect(page.locator("h1").first()).toBeVisible();
        await expectNoViolations(page);
      }
    });

    test("the task sheet, a quick add with chips and a toast pass too", async ({ page }) => {
      await loadExamples(page);
      await page.getByRole("textbox", { name: "Add a task" }).fill("Call the dentist tomorrow 5pm p1 #health 15m");
      await expectNoViolations(page);
      await page.getByRole("textbox", { name: "Add a task" }).press("Enter");
      await expect(page.locator(".toast")).toBeVisible();
      await expectNoViolations(page);
      await page.locator("[data-row]", { hasText: "Write the first draft" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoViolations(page);
    });
  });
}

const PALETTES = ["chalk", "sage", "sky", "sand", "lilac", "rose"] as const;

for (const palette of PALETTES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`colour ${palette}, ${scheme}: Today, the task sheet and Settings pass WCAG checks`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await loadExamples(page);
      await page.evaluate((name) => {
        const data = JSON.parse(localStorage.getItem("listzero:v1") ?? "{}");
        data.settings.palette = name;
        localStorage.setItem("listzero:v1", JSON.stringify(data));
      }, palette);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-palette", palette);
      await page.getByRole("textbox", { name: "Add a task" }).fill("Call the dentist tomorrow p1 #health 15m");
      await expectNoViolations(page);
      await page.locator("[data-row]", { hasText: "Write the first draft" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoViolations(page);
      await page.goto("/settings");
      await expectNoViolations(page);
      await page.goto("/focus");
      await expectNoViolations(page);
      // The board has every task colour on screen at once.
      await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem("listzero:v1") ?? "{}");
        const colours = ["slate", "brick", "ochre", "moss", "teal", "blue", "plum"];
        data.tasks.forEach((t: { color: string | null }, i: number) => (t.color = colours[i % colours.length] ?? null));
        localStorage.setItem("listzero:v1", JSON.stringify(data));
      });
      await page.goto("/board?in=all");
      await expect(page.locator(".card").first()).toBeVisible();
      await expectNoViolations(page);
    });
  }
}

test("no view scrolls sideways on a 360px screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seed(page, [
    {
      title: "A task with an extremely long unbroken name: supercalifragilisticexpialidocious_and_then_some_more_characters_to_be_sure",
      due: day(),
      notes: "x",
      estimate: 90,
      priority: 1,
      color: "plum",
      doing: true,
    },
    { title: "Carried", due: day(-3) },
    { title: "Later", due: day(4) },
  ]);
  for (const path of ["/today", "/inbox", "/upcoming", "/board", "/board?in=all", "/done", "/focus", "/search?q=task", "/settings", "/about", "/menu", "/today?task=seed-1"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("pages have one h1, a description and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await loadExamples(page);
  for (const path of ["/today", "/inbox", "/upcoming", "/board", "/done", "/focus", "/search", "/settings", "/about"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toHaveCount(1);
  }
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /free to-do list/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://listzero.vercel.app/");
  expect(errors).toEqual([]);
});

test("pages are served with a strict Content-Security-Policy and it blocks nothing the app needs", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => /Content Security Policy/i.test(m.text()) && blocked.push(m.text()));
  const response = await page.goto("/today");
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
  await loadExamples(page);
  await page.locator("[data-row]").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goto("/menu");
  await page.goto("/focus");
  expect(blocked).toEqual([]);
});

test("the app shell is installable and its static files are served", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const json = await manifest.json();
  expect(json.name).toBe("Listzero");
  expect(json.icons.length).toBeGreaterThanOrEqual(3);
  for (const path of ["/sw.js", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/og.png", "/robots.txt", "/sitemap.xml", "/theme.js"]) {
    expect((await request.get(path)).ok(), path).toBe(true);
  }
});

test.describe("offline", () => {
  test.use({ serviceWorkers: "allow" });

  test("after one visit the app opens and saves without a connection", async ({ page, context }) => {
    await page.goto("/today");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Let the worker finish caching the app shell.
    await page.waitForFunction(async () => (await caches.keys()).length > 0);
    await page.reload();
    await context.setOffline(true);
    await page.goto("/inbox");
    await page.getByRole("textbox", { name: "Add a task" }).fill("Written offline");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.reload();
    await expect(page.locator("[data-task]", { hasText: "Written offline" })).toBeVisible();
  });
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { day, isPhone, seed, settled } from "./helpers";

/** The sidebar can be narrowed to icons on wide screens. Phones keep the tab bar and the menu. */

const sideWidth = (page: Page) => page.locator(".side").evaluate((el) => Math.round(el.getBoundingClientRect().width));
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("listzero:v1") ?? "{}").settings?.sidebarCollapsed ?? false);
const tip = (page: Page) => page.locator(".side-tip");

async function withLists(page: Page) {
  await seed(
    page,
    [
      { title: "Call SC", due: day(), listId: "work" },
      { title: "Buy stamps" },
    ],
    [
      { id: "work", name: "Work" },
      { id: "long", name: "Home and family errands for the long weekend" },
    ],
  );
}

test.describe("narrow sidebar", () => {
  test.beforeEach(({ page }) => {
    test.skip(isPhone(page), "Phones have no sidebar.");
  });

  test("collapses to icons and back, keeps every name for screen readers, and remembers the choice", async ({ page }) => {
    await withLists(page);
    await page.goto("/today");
    expect(await sideWidth(page)).toBeGreaterThan(200);

    const toggle = page.getByRole("button", { name: "Collapse sidebar" });
    await expect(toggle).toHaveAttribute("aria-keyshortcuts", "[");
    await toggle.click();
    await expect.poll(() => sideWidth(page)).toBeLessThan(80);
    // The same button, now saying what it will do, and still focused.
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeFocused();
    expect(await saved(page)).toBe(true);

    // Names are hidden from view but are still the links' names; counts stay too.
    const inbox = page.getByRole("link", { name: "Inbox 1 open" });
    await expect(inbox).toBeVisible();
    await expect(inbox.locator(".nav__label")).toHaveCSS("position", "absolute");
    await expect(page.getByRole("link", { name: /^Work/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "New list" })).toBeVisible();

    // A reload starts narrow, with no wide first frame: the attribute is set before the app runs.
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.sidebar)).toBe("collapsed");
    expect(await sideWidth(page)).toBeLessThan(80);

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect.poll(() => sideWidth(page)).toBeGreaterThan(200);
    await expect(page.getByRole("link", { name: "Inbox 1 open" }).locator(".nav__label")).toBeVisible();
    expect(await saved(page)).toBe(false);
  });

  test("is narrow from the very first paint after a reload", async ({ page }) => {
    await withLists(page);
    await page.goto("/today");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect.poll(() => saved(page)).toBe(true);

    // With the app's code held back, only the inline script in the page has run, and it has
    // already chosen the narrow layout the app's first frame is drawn with.
    await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.sidebar)).toBe("collapsed");
    expect(await page.locator(".app").count()).toBe(0);

    // And with the app running, the strip is narrow from its first frame: no slide on load.
    await page.unrouteAll();
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        const side = document.querySelector(".side");
        if (!side) return;
        (window as unknown as { firstWidth: number }).firstWidth = side.getBoundingClientRect().width;
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await page.reload();
    await expect(page.locator(".side")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { firstWidth: number }).firstWidth)).toBeLessThan(80);
  });

  test("the [ key toggles it, but not while typing", async ({ page }) => {
    await withLists(page);
    await page.goto("/today");
    await page.locator("body").press("[");
    await expect.poll(() => sideWidth(page)).toBeLessThan(80);
    await page.locator("body").press("[");
    await expect.poll(() => sideWidth(page)).toBeGreaterThan(200);

    const add = page.getByRole("textbox", { name: "Add a task" });
    await add.fill("Read [chapter 2");
    await expect(add).toHaveValue("Read [chapter 2");
    expect(await sideWidth(page)).toBeGreaterThan(200);
  });

  test("shows a name beside each icon on hover and on keyboard focus, and Escape hides it", async ({ page }) => {
    await withLists(page);
    await page.goto("/today");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();

    await page.getByRole("link", { name: /^Inbox/ }).hover();
    await expect(tip(page)).toHaveText("Inbox");
    // The tip sits beside the icon, outside the narrow sidebar.
    const side = await page.locator(".side").boundingBox();
    const shown = await tip(page).boundingBox();
    expect(shown!.x).toBeGreaterThan(side!.x + side!.width);
    // The pointer can move onto the tip without losing it.
    await page.mouse.move(shown!.x + shown!.width / 2, shown!.y + shown!.height / 2, { steps: 4 });
    await expect(tip(page)).toHaveText("Inbox");
    await page.keyboard.press("Escape");
    await expect(tip(page)).toHaveCount(0);

    await page.getByRole("link", { name: /^Work/ }).focus();
    await page.keyboard.press("Tab");
    await expect(tip(page)).toHaveText("Home and family errands for the long weekend");
    await page.mouse.move(900, 500);
    await page.locator("body").click({ position: { x: 900, y: 500 } });
    await expect(tip(page)).toHaveCount(0);

    // The toggle has its tip, with the key, at either width.
    await page.getByRole("button", { name: "Expand sidebar" }).hover();
    await expect(tip(page)).toHaveText("Expand sidebar[");
  });

  test("at full width, only icon buttons and names cut short get a tip", async ({ page }) => {
    await withLists(page);
    await page.goto("/today");
    await page.getByRole("link", { name: /^Inbox/ }).hover();
    await page.waitForTimeout(200);
    await expect(tip(page)).toHaveCount(0);
    await page.getByRole("link", { name: /^Home and family/ }).hover();
    await expect(tip(page)).toHaveText("Home and family errands for the long weekend");
    await page.getByRole("button", { name: "New list" }).hover();
    await expect(tip(page)).toHaveText("New list");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`passes automated WCAG checks when narrow, ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await withLists(page);
      await page.goto("/today");
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await page.getByRole("link", { name: /^Inbox/ }).hover();
      await expect(tip(page)).toBeVisible();
      await settled(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
});

test.describe("on a phone", () => {
  test("the narrow setting changes nothing: tab bar, full menu, and [ does nothing", async ({ page }) => {
    test.skip(!isPhone(page), "Only phones hide the sidebar.");
    await withLists(page);
    await page.addInitScript(() => {
      const data = JSON.parse(localStorage.getItem("listzero:v1") ?? "{}");
      data.settings = { ...data.settings, sidebarCollapsed: true };
      localStorage.setItem("listzero:v1", JSON.stringify(data));
    });
    await page.goto("/menu");
    await expect(page.locator(".side")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    // Names in the menu are shown in full, long ones wrapping.
    await expect(page.getByRole("main").getByText("Home and family errands for the long weekend")).toBeVisible();
    await page.locator("body").press("[");
    expect(await saved(page)).toBe(true);
    expect(await page.evaluate(() => document.querySelector(".app")!.getBoundingClientRect().width)).toBe(page.viewportSize()!.width);
  });
});

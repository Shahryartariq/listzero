import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { day, isPhone, seed, settled } from "./helpers";

/** The sidebar is a floating glass pill that never shows a scrollbar and fits short screens. */

const LISTS = ["Work", "Home", "Groceries", "Reading", "Gym", "Side project", "Bills", "Travel", "Ideas", "Family"];

async function manyLists(page: Page) {
  await seed(
    page,
    [{ title: "Call SC", due: day(), listId: "l0" }],
    LISTS.map((name, i) => ({ id: `l${i}`, name })),
  );
}

/** Whether the element draws a scrollbar (it takes room from the content when it does). */
const scrollbar = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const style = getComputedStyle(el);
    const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    return el.getBoundingClientRect().width - borders - el.clientWidth > 0.5;
  });

test.describe("sidebar look", () => {
  test.beforeEach(({ page }) => {
    test.skip(isPhone(page), "Phones have no sidebar.");
  });

  test("floats as a rounded pill, and where you are is a pill in the mark colour", async ({ page }) => {
    await manyLists(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/today");
    const side = page.locator(".side");
    const box = await side.boundingBox();
    expect(box!.x).toBe(12);
    expect(box!.y).toBe(12);
    expect(box!.height).toBe(900 - 24);
    expect(parseFloat(await side.evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(12);
    await expect(side).not.toHaveCSS("box-shadow", "none");

    const today = side.getByRole("link", { name: /^Today/ });
    await expect(today).toHaveAttribute("aria-current", "page");
    const [pill, mark] = await today.evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      getComputedStyle(document.documentElement).getPropertyValue("--mark").trim(),
    ]);
    const probe = await page.evaluate((color) => {
      const el = document.createElement("i");
      el.style.color = color;
      document.body.append(el);
      const rgb = getComputedStyle(el).color;
      el.remove();
      return rgb;
    }, mark);
    expect(pill).toBe(probe);
    expect(parseFloat(await today.evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(15);
  });

  test("on a short laptop window: no scrollbar, the footer stays in view, and the lists fade and scroll", async ({ page }) => {
    await manyLists(page);
    await page.setViewportSize({ width: 1280, height: 593 });
    await page.goto("/today");
    // The account row arrives a moment later and makes the footer taller; wait for the final layout.
    await expect(page.locator(".side").getByRole("link", { name: "Sign in" })).toBeVisible();

    expect(await scrollbar(page, ".side")).toBe(false);
    expect(await scrollbar(page, ".side__body")).toBe(false);
    for (const name of ["Appearance", "Settings", "How it works"]) {
      await expect(page.locator(".side").getByRole("link", { name }).or(page.locator(".side").getByRole("button", { name }))).toBeInViewport();
    }

    // More lists than fit: the bottom edge fades, and the last one scrolls into view.
    const body = page.locator(".side__body");
    await expect(body).toHaveAttribute("data-more-below", "");
    await expect(body).not.toHaveAttribute("data-more-above", "");
    const last = page.locator(".side").getByRole("link", { name: /^Family/ });
    await expect(last).not.toBeInViewport();
    await body.hover();
    await page.mouse.wheel(0, 2000);
    await expect(last).toBeInViewport();
    await expect(body).toHaveAttribute("data-more-above", "");
    await expect(body).not.toHaveAttribute("data-more-below", "");

    // Tab reaches it too.
    await page.goto("/today");
    await last.focus();
    await expect(last).toBeInViewport();
  });

  test("the footer tools are labelled, and named on hover once the sidebar is narrow", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/today");
    const tools = page.locator(".side__tools");
    await expect(tools.locator(".side__tool-label")).toHaveText(["Appearance", "Settings", "How it works"]);
    for (const label of await tools.locator(".side__tool-label").all()) await expect(label).toBeVisible();
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.locator(".side").getByRole("button", { name: "Appearance" }).hover();
    await expect(page.locator(".side-tip")).toHaveText("Appearance");
    await page.locator(".side").getByRole("link", { name: "How it works" }).hover();
    await expect(page.locator(".side-tip")).toHaveText("How it works?");
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page.locator(".side").getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator(".side").getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`passes automated WCAG checks, ${scheme} theme, on a short window`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await manyLists(page);
      await page.setViewportSize({ width: 1280, height: 593 });
      await page.goto("/today");
      await settled(page);
      const results = await new AxeBuilder({ page }).include(".side").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
});

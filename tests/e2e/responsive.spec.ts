import { expect, test, type Page } from "@playwright/test";
import { day, seed } from "./helpers";

/**
 * Every screen size the app is likely to meet: small and large phones, phones held sideways,
 * tablets both ways, laptops and big monitors.
 */
const SIZES = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
];

const LONG_LIST = "Home and family errands that never end";

async function seeded(page: Page) {
  await seed(
    page,
    [
      { title: "Call the electricity company about the double charge on the October bill and ask for a refund", due: day(), listId: "l1", priority: 3, estimate: 45 },
      { title: "Supercalifragilisticexpialidocious-unbroken-word-that-never-wraps-anywhere", due: day(), listId: "l1" },
      { title: "Pay rent", due: day(), doing: true },
      { title: "Book dentist", due: day(1) },
    ],
    [{ id: "l1", name: LONG_LIST }],
  );
}

/** Things past the right or left edge of the screen, outside anything that scrolls on purpose. */
const pastTheEdge = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    if (document.documentElement.scrollWidth > width + 1) found.push(`page ${document.documentElement.scrollWidth} > ${width}`);
    for (const el of document.querySelectorAll<HTMLElement>("main *, header *, nav *")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || el.closest(".sr-only")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      let parent = el.parentElement;
      let scrolls = false;
      while (parent && parent !== document.body) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowX)) scrolls = true;
        parent = parent.parentElement;
      }
      if (!scrolls && (box.right > width + 1 || box.left < -1)) found.push(`${el.tagName.toLowerCase()}.${el.className}`);
    }
    return found.slice(0, 5);
  });

test.describe("every screen size", () => {
  test.skip(({ isMobile }) => isMobile, "each test sets its own screen sizes");

  for (const size of SIZES) {
    test(`nothing spills past the edge at ${size.width}×${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await seeded(page);
      for (const path of ["/", "/today", "/board", "/list/l1", "/focus", "/settings", "/menu", "/sign-in", "/today?task=seed-1"]) {
        await page.goto(path);
        await expect(page.locator("h1, h2").first()).toBeVisible();
        expect(await pastTheEdge(page), `${path} at ${size.width}×${size.height}`).toEqual([]);
      }
    });
  }

  test("a phone held sideways gets the tab bar, not a sidebar taller than the screen", async ({ page }) => {
    await seeded(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/today");
    await expect(page.locator(".side")).toBeHidden();
    await expect(page.locator(".tabs")).toBeVisible();
    // The board shows one column at a time, with tabs to switch.
    await page.goto("/board");
    await expect(page.locator(".board__tabs")).toBeVisible();

    // A tablet, or a laptop window of the same width but taller, keeps the sidebar.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/today");
    await expect(page.locator(".side")).toBeVisible();
    await expect(page.locator(".tabs")).toBeHidden();
  });

  test("a long list name takes the line, and its tools move under it on a small phone", async ({ page }) => {
    await seeded(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/list/l1");
    const title = page.getByRole("heading", { level: 1, name: LONG_LIST });
    const display = page.getByRole("button", { name: /Display/ });
    const titleBox = await title.boundingBox();
    const displayBox = await display.boundingBox();
    // At most three lines of the display face, and the Display button below it.
    expect(titleBox!.height).toBeLessThan(120);
    expect(displayBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height - 1);
  });

  test("Focus sits in the middle of a wide screen", async ({ page }) => {
    await seeded(page);
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto("/focus");
    await page.locator(".focus").waitFor();
    // Measured together, and again until the sidebar has finished sliding away.
    const offCentre = () =>
      page.evaluate(() => {
        const main = document.querySelector("main")!.getBoundingClientRect();
        const focus = document.querySelector(".focus")!.getBoundingClientRect();
        return Math.abs(focus.left - main.left - (main.right - focus.right));
      });
    await expect.poll(offCentre).toBeLessThan(80);
    await expect(page.locator(".side")).toBeHidden();
    expect(await offCentre()).toBeLessThan(80);
  });

  test("a big monitor shows everything a step larger", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/today");
    const normal = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.setViewportSize({ width: 2560, height: 1440 });
    const big = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(normal).toBe(16);
    expect(big).toBe(18);
  });
});

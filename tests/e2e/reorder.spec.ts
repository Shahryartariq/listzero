import { expect, test, type Page } from "@playwright/test";
import { day, openDisplay, seed } from "./helpers";

/** Dragging tasks up and down by their handle (components/useReorder.ts). */

const titles = (page: Page) =>
  page.locator("main .rows .row__title").allTextContents();

/** Drags a task's handle by `dy` (and `dx`) in small steps, like a hand would. */
async function drag(page: Page, title: string, dy: number, dx = 0) {
  const grip = page.getByRole("button", { name: `Reorder “${title}”` });
  await grip.scrollIntoViewIfNeeded();
  const box = (await grip.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12);
  }
  await page.mouse.up();
}

test.describe("in the Inbox", () => {
  test.beforeEach(async ({ page }) => {
    await seed(
      page,
      ["One", "Two", "Three", "Four"].map((title) => ({ title })),
    );
  });

  test("drag a task down the Inbox; the view switches to My order and keeps it", async ({
    page,
  }) => {
    await page.goto("/inbox");
    expect(await titles(page)).toEqual(["One", "Two", "Three", "Four"]);
    // From one row's top to the next: a row and the gap under it.
    const first = (await page.locator("main .row").nth(0).boundingBox())!;
    const rowHeight = (await page.locator("main .row").nth(1).boundingBox())!.y - first.y;

    await drag(page, "One", rowHeight * 2.2);
    await expect
      .poll(() => titles(page))
      .toEqual(["Two", "Three", "One", "Four"]);
    await expect(page.getByText("Sorted by your order now.")).toBeVisible();

    // Display says so, and the order survives a reload.
    const sheet = await openDisplay(page);
    await expect(sheet.getByRole("combobox", { name: "Sort by" })).toHaveText("My order");
    await page.keyboard.press("Escape");
    await page.reload();
    expect(await titles(page)).toEqual(["Two", "Three", "One", "Four"]);

    // And upwards.
    await drag(page, "Four", -rowHeight * 3.2);
    await expect
      .poll(() => titles(page))
      .toEqual(["Four", "Two", "Three", "One"]);
  });

  test("Escape while dragging puts the task back", async ({ page }) => {
    await page.goto("/inbox");
    const grip = page.getByRole("button", { name: "Reorder “One”" });
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 5, box.y + 150, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await titles(page)).toEqual(["One", "Two", "Three", "Four"]);
  });

  test("the arrow keys move a task from its handle, and say where it went", async ({
    page,
  }) => {
    await page.goto("/inbox");
    const grip = page.getByRole("button", { name: "Reorder “Four”" });
    await grip.focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() => titles(page))
      .toEqual(["One", "Four", "Two", "Three"]);
    await expect(grip).toBeFocused();
    await expect(page.getByText("Moved to 2 of 4.")).toBeAttached();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByText("Already at the top.")).toBeAttached();
    expect(await titles(page)).toEqual(["Four", "One", "Two", "Three"]);
  });

  test("cards can be dragged around the grid", async ({ page, isMobile }) => {
    test.skip(
      isMobile,
      "One column of cards on a phone: the list test covers it.",
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/inbox");
    const sheet = await openDisplay(page);
    await sheet.getByRole("radio", { name: "Cards" }).click();
    await page.keyboard.press("Escape");
    const first = (await page.locator("main .row").nth(0).boundingBox())!;
    const third = (await page.locator("main .row").nth(2).boundingBox())!;
    await drag(page, "One", third.y - first.y, third.x - first.x);
    await expect
      .poll(() => titles(page))
      .toEqual(["Two", "Three", "One", "Four"]);
  });
});

test("Today and Upcoming keep each group in its own order", async ({
  page,
}) => {
  await seed(page, [
    { title: "Today A", due: day() },
    { title: "Today B", due: day() },
    { title: "Later A", due: day(2) },
    { title: "Later B", due: day(2) },
  ]);
  await page.goto("/today");
  await page.getByRole("button", { name: "Reorder “Today B”" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => titles(page)).toEqual(["Today B", "Today A"]);
  await page.goto("/upcoming");
  await page.getByRole("button", { name: "Reorder “Later B”" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => titles(page)).toEqual(["Later B", "Later A"]);
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addTask, day, isPhone, monthDay, openDisplay, row, seed, settled } from "./helpers";

const SEED = [
  { title: "Charlie report", due: day(), priority: 1, estimate: 45, color: "blue", listId: "work" },
  { title: "alpha call", due: day(), priority: 3, estimate: 10 },
  { title: "Bravo email", due: day(), estimate: 5, color: "moss", doing: true },
];
const LISTS = [{ id: "work", name: "Work" }];

const names = (page: Page) => page.locator("[data-task] .row__title");

async function pick(page: Page, layout: string) {
  const sheet = await openDisplay(page);
  await sheet.getByRole("radio", { name: layout }).click();
  await sheet.getByRole("button", { name: "Show tasks" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("display: layouts", () => {
  test("the Display button offers five layouts, and the choice is kept for that view only", async ({ page }) => {
    await seed(page, SEED, LISTS);
    await page.goto("/today");
    const sheet = await openDisplay(page);
    await expect(sheet.getByRole("radiogroup", { name: "Layout" }).getByRole("radio")).toHaveText([
      "List",
      "Cards",
      "Board",
      "Calendar",
      "Table",
    ]);
    await expect(sheet.getByRole("radio", { name: "List" })).toBeChecked();
    await expect(sheet.getByRole("button", { name: "Reset" })).toBeDisabled();

    await sheet.getByRole("radio", { name: "Cards" }).click();
    await expect(sheet.getByRole("radio", { name: "Cards" })).toBeChecked();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(page.locator(".rows--cards [data-task]")).toHaveCount(3);

    await page.reload();
    await expect(page.locator(".rows--cards [data-task]")).toHaveCount(3);

    await page.goto("/inbox");
    await expect(page.locator(".rows--cards")).toHaveCount(0);
    await expect((await openDisplay(page)).getByRole("radio", { name: "List" })).toBeChecked();
  });

  test("Board layout: the view's tasks in columns, and cards move", async ({ page }) => {
    await seed(page, SEED, LISTS);
    await page.goto("/today");
    await pick(page, "Board");
    if (isPhone(page)) await page.getByRole("tab", { name: /^Doing/ }).click();
    await expect(page.getByRole("region", { name: "Doing" }).locator("[data-task]")).toHaveText(/Bravo email/);
    await page.getByRole("button", { name: "Done with “Bravo email”" }).click();
    if (isPhone(page)) await page.getByRole("tab", { name: /^Done today/ }).click();
    await expect(page.getByRole("region", { name: "Done today" }).locator("[data-task]")).toHaveText(/Bravo email/);
    await expect(page.locator(".zero-head__count")).toHaveText("2");
  });

  test("Table layout: every detail in columns, sorted by clicking a heading", async ({ page }) => {
    await seed(page, SEED, LISTS);
    await page.goto("/today");
    await pick(page, "Table");
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText(["Done", "Task", "Day", "Priority", "Length", "List"]);
    const report = table.getByRole("row", { name: /Charlie report/ });
    await expect(report.getByRole("cell")).toHaveText(["", "Today", "High", "45m", "Work"]);
    await expect(names(page)).toHaveText(["Bravo email", "Charlie report", "alpha call"]);

    await table.getByRole("button", { name: "Task" }).click();
    await expect(names(page)).toHaveText(["alpha call", "Bravo email", "Charlie report"]);
    await expect(table.getByRole("columnheader", { name: "Task" })).toHaveAttribute("aria-sort", "ascending");
    await table.getByRole("button", { name: "Length" }).click();
    await expect(names(page)).toHaveText(["Bravo email", "alpha call", "Charlie report"]);
    // Clicking the active heading goes back to the suggested order.
    await table.getByRole("button", { name: "Length" }).click();
    await expect(names(page)).toHaveText(["Bravo email", "Charlie report", "alpha call"]);

    await report.getByRole("checkbox").click();
    await expect(names(page)).toHaveText(["Bravo email", "alpha call"]);
    await table.getByRole("button", { name: /alpha call/ }).click();
    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
  });

  test("Calendar layout: tasks on their days, month navigation, and a list for the chosen day", async ({ page }) => {
    await seed(page, [
      { title: "On the tenth", due: monthDay(10), color: "blue" },
      { title: "Also the tenth", due: monthDay(10) },
      { title: "On the twelfth", due: monthDay(12) },
      { title: "Someday" },
    ]);
    await page.goto("/inbox");
    await pick(page, "Calendar");
    const monthTitle = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date());
    await expect(page.locator(".cal__month")).toHaveText(monthTitle);

    const tenth = page.locator(`td[data-day="${monthDay(10)}"]`);
    await expect(tenth.getByRole("button", { name: /, 2 tasks$/ })).toBeVisible();
    await tenth.locator(".cal__day").click();
    const chosen = page.getByRole("region", { name: /10/ });
    await expect(chosen.locator("[data-task]")).toHaveText([/On the tenth/, /Also the tenth/]);
    await expect(page.getByRole("region", { name: "No day yet" }).locator("[data-task]")).toHaveText(/Someday/);

    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.locator(".cal__month")).not.toHaveText(monthTitle);
    await expect(page.locator("[data-cal-task]")).toHaveCount(0);
    await page.getByRole("button", { name: "This month" }).click();
    await expect(page.locator(".cal__month")).toHaveText(monthTitle);
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.locator(".cal__month")).not.toHaveText(monthTitle);
  });

  test("Calendar layout: dragging a task to another day moves it, with Undo", async ({ page }) => {
    test.skip(isPhone(page), "On a phone the day cells show counts; the day is changed in the task sheet.");
    await seed(page, [{ title: "Movable", due: monthDay(10) }]);
    await page.goto("/inbox");
    await pick(page, "Calendar");
    const twelfth = page.locator(`td[data-day="${monthDay(12)}"]`);
    await page.locator('[data-cal-task="seed-1"]').dragTo(twelfth);
    await expect(twelfth.locator("[data-cal-task]")).toHaveText("Movable");
    await expect(page.locator(".toasts")).toContainText("Moved to");
    await expect(twelfth).toHaveAttribute("data-selected", "true");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(`td[data-day="${monthDay(10)}"] [data-cal-task]`)).toHaveText("Movable");

    await page.locator('[data-cal-task="seed-1"]').click();
    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
  });

  test("a list and Upcoming have their own Display too", async ({ page }) => {
    await seed(page, [{ title: "Work thing", listId: "work" }, { title: "Later thing", due: day(3), listId: "work" }], LISTS);
    await page.goto("/list/work");
    await pick(page, "Board");
    if (!isPhone(page)) await expect(page.getByRole("region", { name: "To do" }).locator("[data-task]")).toHaveCount(2);
    await page.getByRole("button", { name: "Start “Work thing”" }).click();
    if (isPhone(page)) await page.getByRole("tab", { name: /^Doing/ }).click();
    await expect(page.getByRole("region", { name: "Doing" }).locator("[data-task]")).toHaveText(/Work thing/);

    await page.goto("/upcoming");
    await pick(page, "Table");
    await expect(page.getByRole("table").getByRole("row", { name: /Later thing/ })).toBeVisible();
    await addTask(page, "Added in table view");
    await expect(page.getByRole("table").getByRole("row", { name: /Added in table view/ })).toContainText("Tomorrow");
  });
});

test.describe("display: sort, filter and reset", () => {
  test("sorting changes the order and shows on the button", async ({ page }) => {
    await seed(page, SEED, LISTS);
    await page.goto("/today");
    await expect(names(page)).toHaveText(["Bravo email", "Charlie report", "alpha call"]);
    const sheet = await openDisplay(page);
    await sheet.getByRole("radio", { name: "Name" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(names(page)).toHaveText(["alpha call", "Bravo email", "Charlie report"]);
    await expect(page.getByRole("button", { name: "Display 1 change on" })).toBeVisible();

    await page.reload();
    await expect(names(page)).toHaveText(["alpha call", "Bravo email", "Charlie report"]);
    await (await openDisplay(page)).getByRole("radio", { name: "Shortest" }).click();
    await page.keyboard.press("Escape");
    await expect(names(page)).toHaveText(["Bravo email", "alpha call", "Charlie report"]);
  });

  test("filters narrow the view, say how many tasks they hide, and never change the count to zero", async ({ page }) => {
    await seed(page, SEED, LISTS);
    await page.goto("/today");
    let sheet = await openDisplay(page);
    await sheet.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High" }).click();
    await expect(sheet.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(names(page)).toHaveText(["Charlie report"]);
    await expect(page.getByText("Showing 1 of 3 tasks.")).toBeVisible();
    await expect(page.locator(".zero-head__count")).toHaveText("3");

    // Adding a second priority widens the same filter.
    sheet = await openDisplay(page);
    await sheet.getByRole("group", { name: "Priority" }).getByRole("button", { name: "Low" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(names(page)).toHaveText(["Charlie report", "alpha call"]);

    // A second kind of filter narrows it.
    sheet = await openDisplay(page);
    await sheet.getByRole("group", { name: "More filters" }).getByRole("button", { name: /Quick/ }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(names(page)).toHaveText(["alpha call"]);
    await expect(page.getByRole("button", { name: "Display 2 changes on" })).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(names(page)).toHaveCount(3);
    await expect(page.getByText(/Showing \d of/)).toBeHidden();
  });

  test("filter by list and by in progress; there is no colour filter", async ({ page }) => {
    await seed(page, SEED, LISTS);
    await page.goto("/today");
    let sheet = await openDisplay(page);
    await expect(sheet.getByRole("group", { name: "Colour" })).toHaveCount(0);
    await sheet.getByRole("group", { name: "List" }).getByRole("button", { name: "Work" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(names(page)).toHaveText(["Charlie report"]);

    sheet = await openDisplay(page);
    await sheet.getByRole("button", { name: "Reset" }).click();
    await sheet.getByRole("group", { name: "More filters" }).getByRole("button", { name: "In progress" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(names(page)).toHaveText(["Bravo email"]);
  });

  test("when nothing matches it says so and offers a way out", async ({ page }) => {
    await seed(page, SEED, LISTS);
    await page.goto("/today");
    const sheet = await openDisplay(page);
    await sheet.getByRole("group", { name: "Priority" }).getByRole("button", { name: "Medium" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(page.getByText("None of the 3 tasks here match your filters.")).toBeVisible();
    await expect(names(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(names(page)).toHaveCount(3);
  });

  test("Reset puts layout, sort and filters back, and filters apply in every layout", async ({ page }) => {
    await seed(page, SEED, LISTS);
    await page.goto("/today");
    let sheet = await openDisplay(page);
    await sheet.getByRole("radio", { name: "Table" }).click();
    await sheet.getByRole("radio", { name: "Priority" }).click();
    await sheet.getByRole("group", { name: "Priority" }).getByRole("button", { name: "None" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(names(page)).toHaveText(["Bravo email"]);

    sheet = await openDisplay(page);
    await expect(sheet.getByRole("button", { name: "Reset" })).toBeEnabled();
    await sheet.getByRole("button", { name: "Reset" }).click();
    await expect(sheet.getByRole("radio", { name: "List" })).toBeChecked();
    await expect(sheet.getByRole("radio", { name: "Suggested" })).toBeChecked();
    await expect(sheet.getByRole("button", { name: "None", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(sheet.getByRole("button", { name: "Reset" })).toBeDisabled();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(row(page, "Charlie report")).toBeVisible();
    await expect(page.getByRole("button", { name: "Display", exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("listzero:v1") ?? "{}").settings.display)).toEqual({});
  });

  test("a filter on Today hides the offer to move tasks, which counts every task", async ({ page }) => {
    await seed(page, ["One", "Two", "Three", "Four", "Five", "Six"].map((title) => ({ title, due: day() })));
    await page.goto("/today");
    await expect(page.getByText("6 tasks is a lot for one day.")).toBeVisible();
    const sheet = await openDisplay(page);
    await sheet.getByRole("group", { name: "Priority" }).getByRole("button", { name: "None" }).click();
    await sheet.getByRole("button", { name: "Show tasks" }).click();
    await expect(page.getByText("is a lot for one day")).toBeHidden();
  });
});

test.describe("display: quality", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`every layout and the Display sheet pass WCAG checks, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/today");
      await page.getByRole("button", { name: "Load example tasks" }).click();
      await page.getByRole("button", { name: "Dismiss" }).click();
      const check = async () => {
        await settled(page);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      };
      const sheet = await openDisplay(page);
      await sheet.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High" }).click();
      await check();
      await sheet.getByRole("button", { name: "Reset" }).click();
      await sheet.getByRole("button", { name: "Show tasks" }).click();
      for (const layout of ["Cards", "Board", "Calendar", "Table"]) {
        await pick(page, layout);
        await check();
      }
      await page.goto("/upcoming");
      await pick(page, "Calendar");
      await check();
    });
  }

  test("no layout scrolls the page sideways on a 360px screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await seed(
      page,
      [
        {
          title: "A task with a very long unbroken name: supercalifragilisticexpialidocious_and_then_some_more_characters",
          due: day(),
          estimate: 90,
          priority: 1,
          color: "plum",
          listId: "work",
        },
        { title: "Second", due: day(), doing: true },
      ],
      LISTS,
    );
    await page.goto("/today");
    for (const layout of ["Cards", "Board", "Calendar", "Table", "List"]) {
      await pick(page, layout);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${layout} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    }
    await openDisplay(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

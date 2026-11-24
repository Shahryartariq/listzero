import { expect, test, type Page } from "@playwright/test";
import { addTask, choose, day, isPhone, row, seed } from "./helpers";

test.describe("capture", () => {
  test("a first visit starts at zero, and a new task survives a reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start as a guest" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { name: "A clean slate." })).toBeVisible();
    await expect(page.locator(".zero-head__count")).toHaveText("0");

    await addTask(page, "Buy milk");
    await expect(row(page, "Buy milk")).toBeVisible();
    await expect(page.locator(".zero-head__count")).toHaveText("1");
    await expect(page).toHaveTitle("1 to zero | Listzero");
    await expect(page.getByRole("heading", { name: "A clean slate." })).toBeHidden();

    await page.reload();
    await expect(row(page, "Buy milk")).toBeVisible();
  });

  test("reads the day, list, priority and length out of a sentence", async ({ page }) => {
    await page.goto("/today");
    const input = page.getByRole("textbox", { name: "Add a task" });
    await input.fill("Call the dentist tomorrow p1 #health 15m");
    const chips = page.locator(".chip");
    await expect(chips).toHaveText(["New list: Health", "Priority 1", "Tomorrow", "Takes 15m"]);

    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(page.locator(".toasts")).toContainText("Added to Tomorrow.");
    await expect(row(page, "Call the dentist")).toBeHidden();

    await page.goto("/upcoming");
    const added = row(page, "Call the dentist");
    await expect(added).toContainText("15m");
    await expect(added).toContainText("Health");
    await expect(added.getByRole("checkbox")).toHaveAttribute("data-priority", "1");
    await expect(page.getByRole("region", { name: "Tomorrow" })).toBeVisible();
  });

  test("a wrong guess can be switched off and the words stay in the name", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("textbox", { name: "Add a task" }).fill("Watch Friday Night Lights");
    await expect(page.locator(".chip")).toHaveCount(1);
    await page.getByRole("button", { name: /Keep “Friday” as plain text/ }).click();
    await expect(page.locator(".chip")).toHaveCount(0);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(row(page, "Watch Friday Night Lights")).toBeVisible();
  });

  test("a pasted list becomes one task per line", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/inbox");
    await page.evaluate(() => navigator.clipboard.writeText("- Renew passport\n- Book flights p1\n\n3. Pack bags"));
    await page.getByRole("textbox", { name: "Add a task" }).focus();
    await page.keyboard.press("ControlOrMeta+V");
    await expect(page.locator("[data-task]")).toHaveCount(3);
    await expect(page.locator(".toasts")).toContainText("Added 3 tasks.");
    await expect(row(page, "Book flights").getByRole("checkbox")).toHaveAttribute("data-priority", "1");
  });

  test("an empty or whitespace task cannot be added", async ({ page }) => {
    await page.goto("/inbox");
    const add = page.getByRole("button", { name: "Add", exact: true });
    await expect(add).toBeDisabled();
    await page.getByRole("textbox", { name: "Add a task" }).fill("    ");
    await expect(add).toBeDisabled();
    await page.getByRole("textbox", { name: "Add a task" }).press("Enter");
    await expect(page.locator("[data-task]")).toHaveCount(0);
  });
});

test.describe("finishing", () => {
  test("finishing a task takes today to zero, and Undo brings it back", async ({ page }) => {
    await seed(page, [{ title: "Send invoice", due: day() }]);
    await page.goto("/today");
    await page.getByRole("checkbox", { name: "Mark “Send invoice” as done" }).click();
    await expect(row(page, "Send invoice")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Today is at zero." })).toBeVisible();
    await expect(page.locator(".zero-head__count")).toHaveAttribute("data-zero", "true");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row(page, "Send invoice")).toBeVisible();
    await expect(page.locator(".zero-head__count")).toHaveText("1");
  });

  test("Undo is withdrawn once something else changes, so it cannot roll back later work", async ({ page }) => {
    await seed(page, [{ title: "First", due: day() }]);
    await page.goto("/today");
    await page.getByRole("checkbox", { name: "Mark “First” as done" }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await addTask(page, "Added afterwards");
    await expect(page.getByRole("button", { name: "Undo" })).toBeHidden();
    await expect(row(page, "Added afterwards")).toBeVisible();
  });

  test("finishing two tasks quickly leaves Undo only on the latest", async ({ page }) => {
    await seed(page, [{ title: "First", due: day() }, { title: "Second", due: day() }]);
    await page.goto("/today");
    await page.getByRole("checkbox", { name: "Mark “First” as done" }).click();
    await page.getByRole("checkbox", { name: "Mark “Second” as done" }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row(page, "Second")).toBeVisible();
    await expect(row(page, "First")).toBeHidden();
  });

  test("the Today bar shows how much of the day is done", async ({ page }) => {
    await seed(page, [{ title: "One", due: day() }, { title: "Two", due: day() }, { title: "Three", due: day() }]);
    await page.goto("/today");
    const bar = page.getByRole("progressbar", { name: "Today’s progress" });
    await expect(bar).toHaveAttribute("aria-valuetext", "0 of 3 done");
    await page.getByRole("checkbox", { name: "Mark “One” as done" }).click();
    await expect(bar).toHaveAttribute("aria-valuetext", "1 of 3 done");
    await expect(page.getByText("2 to zero. 1 done.")).toBeVisible();
  });

  test("finished tasks are kept in Done and can be reopened", async ({ page }) => {
    await seed(page, [{ title: "Send invoice", due: day() }]);
    await page.goto("/today");
    await page.getByRole("checkbox", { name: "Mark “Send invoice” as done" }).click();
    await page.goto("/done");
    await expect(page.getByText("1 today, 1 in the last 7 days.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Mark “Send invoice” as not done" }).click();
    await expect(page.getByRole("heading", { name: "Nothing finished yet." })).toBeVisible();
    await page.goto("/today");
    await expect(row(page, "Send invoice")).toBeVisible();
  });

  test("a repeating task comes back on its next day", async ({ page }) => {
    await page.goto("/today");
    await addTask(page, "Water the plants every day");
    await expect(row(page, "Water the plants")).toContainText("Every day");
    await page.getByRole("checkbox", { name: "Mark “Water the plants” as done" }).click();
    await expect(page.locator(".toasts")).toContainText("It comes back on its next day.");
    await expect(page.getByRole("heading", { name: "Today is at zero." })).toBeVisible();

    await page.goto("/upcoming");
    await expect(page.getByRole("region", { name: "Tomorrow" }).locator("[data-task]")).toHaveText(/Water the plants/);
    await page.goto("/done");
    await expect(page.locator("[data-task]")).toHaveCount(1);
  });

  test("clearing finished tasks asks first and leaves open tasks alone", async ({ page }) => {
    await seed(page, [{ title: "Open one", due: day() }, { title: "Old one", completedAt: Date.now() - 1000 }]);
    await page.goto("/done");
    await page.getByRole("button", { name: "Clear finished" }).click();
    const dialog = page.getByRole("dialog", { name: "Clear finished tasks?" });
    await expect(dialog).toContainText("This removes 1 finished task");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row(page, "Old one")).toBeVisible();

    await page.getByRole("button", { name: "Clear finished" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear finished" }).click();
    await expect(page.getByRole("heading", { name: "Nothing finished yet." })).toBeVisible();
    await page.goto("/today");
    await expect(row(page, "Open one")).toBeVisible();
  });
});

test.describe("one day at a time", () => {
  test("tasks from earlier days are carried over without blame and move in one tap", async ({ page }) => {
    await seed(page, [
      { title: "Reply to Hamza", due: day(-2) },
      { title: "Pay the bill", due: day(-1) },
      { title: "Due today", due: day() },
    ]);
    await page.goto("/today");
    await expect(page.locator(".zero-head__count")).toHaveText("3");
    const carried = page.getByRole("region", { name: "Carried over" });
    await expect(carried.locator("[data-task]")).toHaveCount(2);
    await expect(carried).toContainText("2 from earlier days.");

    await carried.getByRole("button", { name: "Move all to tomorrow" }).click();
    await expect(carried).toBeHidden();
    await expect(page.locator(".zero-head__count")).toHaveText("1");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(carried.locator("[data-task]")).toHaveCount(2);

    await carried.getByRole("button", { name: "Remove their dates" }).click();
    await page.goto("/inbox");
    await expect(row(page, "Reply to Hamza")).toBeVisible();
    await expect(row(page, "Pay the bill")).toBeVisible();
  });

  test("an overfull day offers to move the rest to tomorrow, lowest priority first", async ({ page }) => {
    await seed(page, [
      ...["One", "Two", "Three", "Four", "Five", "Six"].map((title) => ({ title, due: day() })),
      { title: "Urgent", due: day(), priority: 1 },
    ]);
    await page.goto("/today");
    await expect(page.getByText("7 tasks is a lot for one day.")).toBeVisible();
    await page.getByRole("button", { name: "Move 2 to tomorrow" }).click();
    await expect(page.locator("[data-task]")).toHaveCount(5);
    await expect(row(page, "Urgent")).toBeVisible();
    await expect(row(page, "Six")).toBeHidden();
    await expect(page.getByText("is a lot for one day")).toBeHidden();
  });

  test("the full-day limit can be changed in Settings", async ({ page }) => {
    await seed(page, ["One", "Two", "Three"].map((title) => ({ title, due: day() })));
    await page.goto("/settings");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Fewer tasks" }).click();
    await expect(page.locator("output")).toHaveText("2 tasks");
    await page.goto("/today");
    await expect(page.getByRole("button", { name: "Move 1 to tomorrow" })).toBeVisible();
  });
});

test.describe("task details", () => {
  test("steps, priority and notes are saved as they change, and Back closes the sheet", async ({ page }) => {
    await seed(page, [{ title: "Write the talk", due: day() }]);
    await page.goto("/today");
    await row(page, "Write the talk").locator("[data-row]").click();
    const sheet = page.getByRole("dialog", { name: "Task" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\?task=seed-1$/);

    await sheet.getByRole("textbox", { name: "New step" }).fill("Open the outline");
    await sheet.getByRole("textbox", { name: "New step" }).press("Enter");
    await sheet.getByRole("textbox", { name: "New step" }).fill("Write the opening");
    await sheet.getByRole("button", { name: "Add step" }).click();
    await choose(page, "Priority", "High");
    await choose(page, "Length", "15m");
    await sheet.getByRole("textbox", { name: "Notes" }).fill("Ten minutes, three points.");
    await sheet.getByRole("checkbox", { name: "Mark step “Open the outline” as done" }).click();

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/today$/);
    const item = row(page, "Write the talk");
    await expect(item).toContainText("Next: Write the opening");
    await expect(item).toContainText("(1/2)");
    await expect(item).toContainText("15m");
    await expect(item.getByRole("checkbox")).toHaveAttribute("data-priority", "1");

    await page.reload();
    await row(page, "Write the talk").locator("[data-row]").click();
    await expect(sheet.getByRole("textbox", { name: "Notes" })).toHaveValue("Ten minutes, three points.");
    await expect(sheet.getByRole("combobox", { name: "Priority" })).toHaveText("High");
  });

  test("a long task name is shown in full in the sheet", async ({ page }) => {
    const title = "Write the first draft of the conference talk and send it to the organisers before the weekend";
    await seed(page, [{ title, due: day() }]);
    await page.goto("/today");
    await row(page, title).locator("[data-row]").click();
    const name = page.getByRole("textbox", { name: "Task name" });
    await expect(name).toHaveValue(title);
    const box = await name.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    expect(box.client).toBeGreaterThanOrEqual(box.scroll);
    expect(box.client).toBeGreaterThan(40);
  });

  test("renaming keeps the old name if the field is emptied", async ({ page }) => {
    await seed(page, [{ title: "Old name", due: day() }]);
    await page.goto("/today?task=seed-1");
    const name = page.getByRole("textbox", { name: "Task name" });
    await name.fill("");
    await name.blur();
    await expect(name).toHaveValue("Old name");
    await name.fill("New name");
    await page.keyboard.press("Escape");
    await expect(row(page, "New name")).toBeVisible();
  });

  test("moving the day in the sheet moves the task between views", async ({ page }) => {
    await seed(page, [{ title: "Plan trip", due: day() }]);
    await page.goto("/today?task=seed-1");
    const sheet = page.getByRole("dialog", { name: "Task" });
    await choose(page, "Day", "Tomorrow");
    await expect(sheet.getByRole("combobox", { name: "Day" })).toHaveText("Tomorrow");
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(row(page, "Plan trip")).toBeHidden();
    await page.goto("/upcoming");
    await expect(row(page, "Plan trip")).toBeVisible();
  });

  test("deleting from the sheet can be undone, and a dead task link cleans itself up", async ({ page }) => {
    await seed(page, [{ title: "Delete me", due: day() }]);
    await page.goto("/today");
    await row(page, "Delete me").locator("[data-row]").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row(page, "Delete me")).toBeHidden();
    await expect(page).toHaveURL(/\/today$/);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row(page, "Delete me")).toBeVisible();

    await page.goto("/today?task=does-not-exist");
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("focus", () => {
  test("shows one task at a time, skips without losing it, and finishes", async ({ page }) => {
    await seed(page, [
      { title: "First thing", due: day(), priority: 1, estimate: 10 },
      { title: "Second thing", due: day() },
    ]);
    await page.goto("/focus");
    await expect(page.getByRole("heading", { name: "First thing" })).toBeVisible();
    await expect(page.getByText("Task 1 of 2")).toBeVisible();

    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("heading", { name: "Second thing" })).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("heading", { name: "First thing" })).toBeVisible();

    await page.getByRole("button", { name: "Just 2 minutes" }).click();
    await expect(page.getByRole("timer")).toHaveText(/^0[12]:\d\d$/);
    await expect(page).toHaveTitle(/^0[12]:\d\d \| First thing$/);
    await page.getByRole("button", { name: "Stop timer" }).click();
    await expect(page.getByRole("button", { name: "10m" })).toBeVisible();

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Second thing" })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nothing to focus on." })).toBeVisible();
  });

  test("the timer pauses, takes 5 more minutes, survives a reload, and the app steps back", async ({ page }) => {
    await seed(page, [{ title: "Write report", due: day() }, { title: "Call Sara", due: day() }]);
    await page.goto("/focus");
    // Only the task: no sidebar, no tab bar.
    await expect(page.locator(".side")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

    await page.getByRole("button", { name: "25m" }).click();
    await expect(page.getByRole("timer")).toHaveText(/^2[45]:\d\d$/);
    await page.getByRole("button", { name: "Pause" }).click();
    const paused = await page.getByRole("timer").textContent();
    await page.waitForTimeout(1200);
    await expect(page.getByRole("timer")).toHaveText(paused!);
    await expect(page).toHaveTitle(/^Paused \| Write report$/);

    await page.getByRole("button", { name: "+5 min" }).click();
    await expect(page.getByRole("timer")).toHaveText(/^(29|30):\d\d$/);
    await page.reload();
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    // The next task starts fresh, with the title focused for keyboard and screen reader users.
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("heading", { name: "Call Sara" })).toBeFocused();
    await expect(page.getByRole("timer")).toHaveCount(0);

    // Escape leaves, and everything comes back.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/today$/);
    if (!isPhone(page)) await expect(page.locator(".side")).toBeVisible();
    else await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

  test("any task can be focused from its sheet, even when it is not due today", async ({ page }) => {
    await seed(page, [{ title: "Someday project" }, { title: "Due today", due: day() }]);
    await page.goto("/inbox?task=seed-1");
    await page.getByRole("button", { name: "Focus on this" }).click();
    await expect(page).toHaveURL(/\/focus\?on=seed-1$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Someday project" })).toBeVisible();
  });
});

test.describe("board", () => {
  const column = (page: Page, name: string) => page.getByRole("region", { name });

  // On a phone the board shows one column at a time.
  const show = async (page: Page, name: string) => {
    if (isPhone(page)) await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
  };

  test("a task moves To do → Doing → Done with the card buttons, and Today follows", async ({ page }) => {
    await seed(page, [{ title: "Write report", due: day() }, { title: "Call Sara", due: day(), priority: 1 }]);
    await page.goto("/board");
    await expect(column(page, "To do").locator("[data-task]")).toHaveText([/Call Sara/, /Write report/]);

    await page.getByRole("button", { name: "Start “Write report”" }).click();
    await show(page, "Doing");
    await expect(column(page, "Doing").locator("[data-task]")).toHaveText(/Write report/);

    await page.reload();
    await show(page, "Doing");
    await expect(column(page, "Doing").locator("[data-task]")).toHaveText(/Write report/);

    // Done is the card's own checkbox.
    await page.getByRole("checkbox", { name: "Mark “Write report” as done" }).click();
    await expect(page.locator(".toasts")).toContainText("Done.");
    await show(page, "Done today");
    await expect(column(page, "Done today").locator("[data-task]")).toHaveText(/Write report/);

    await page.goto("/today");
    await expect(page.locator(".zero-head__count")).toHaveText("1");
    await expect(row(page, "Write report")).toBeHidden();
  });

  test("“Not yet” and unticking move a task back, and a task in progress is marked in lists", async ({ page }) => {
    await seed(page, [{ title: "Draft email", due: day(), doing: true }, { title: "Old win", completedAt: Date.now() - 1000 }]);
    await page.goto("/today");
    await expect(row(page, "Draft email")).toContainText("Doing");

    await page.goto("/board");
    await show(page, "Doing");
    await page.getByRole("button", { name: "Not yet: move “Draft email” back to To do" }).click();
    await show(page, "To do");
    await expect(column(page, "To do").locator("[data-task]")).toHaveText(/Draft email/);

    await show(page, "Done today");
    await expect(page.getByRole("button", { name: "Reopen “Old win”" })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Mark “Old win” as not done" }).click();
    await show(page, "To do");
    await expect(column(page, "To do").locator("[data-task]")).toHaveCount(2);
    await page.goto("/today");
    await expect(row(page, "Draft email")).not.toContainText("Doing");
  });

  test("a card can be dragged to another column", async ({ page }) => {
    test.skip(isPhone(page), "Phones show one column at a time and use the card buttons.");
    await seed(page, [{ title: "Drag me", due: day() }, { title: "Stay put", due: day() }]);
    await page.goto("/board");
    await page.locator("[data-task]", { hasText: "Drag me" }).dragTo(column(page, "Doing"));
    await expect(column(page, "Doing").locator("[data-task]")).toHaveText(/Drag me/);
    await expect(column(page, "To do").locator("[data-task]")).toHaveText(/Stay put/);

    await page.locator("[data-task]", { hasText: "Drag me" }).dragTo(column(page, "Done today"));
    await expect(column(page, "Done today").locator("[data-task]")).toHaveText(/Drag me/);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(column(page, "Doing").locator("[data-task]")).toHaveText(/Drag me/);

    await page.locator("[data-task]", { hasText: "Drag me" }).dragTo(column(page, "To do"));
    await expect(column(page, "To do").locator("[data-task]")).toHaveCount(2);
    await expect(page.locator('.column[data-over="true"]')).toHaveCount(0);
  });

  test("the board can show a list, the Inbox or everything, and adds tasks to what it shows", async ({ page }) => {
    await seed(
      page,
      [{ title: "Today thing", due: day() }, { title: "Work thing", listId: "work" }, { title: "Loose idea" }],
      [{ id: "work", name: "Work" }],
    );
    await page.goto("/board");
    await expect(column(page, "To do").locator("[data-task]")).toHaveText(/Today thing/);

    const scope = page.getByRole("combobox", { name: "Show tasks from" });
    const showFrom = async (name: string) => {
      await scope.click();
      await page.getByRole("option", { name, exact: true }).click();
    };
    await showFrom("Work");
    await expect(page).toHaveURL(/\/board\?in=work$/);
    await expect(column(page, "To do").locator("[data-task]")).toHaveText(/Work thing/);
    await addTask(page, "Added on the Work board");
    await expect(column(page, "To do").locator("[data-task]")).toHaveCount(2);

    await showFrom("Everything open");
    await expect(column(page, "To do").locator("[data-task]")).toHaveCount(4);
    await showFrom("Inbox");
    await expect(column(page, "To do").locator("[data-task]")).toHaveText([/Today thing/, /Loose idea/]);

    await page.goto("/board?in=deleted-list");
    await expect(page.getByRole("combobox", { name: "Show tasks from" })).toHaveText("Today");
  });

  test("more than three tasks in progress gets a gentle note, not a block", async ({ page }) => {
    await seed(page, ["A", "B", "C", "D"].map((title) => ({ title, due: day(), doing: true })));
    await page.goto("/board");
    await show(page, "Doing");
    await expect(page.getByText("4 at once is a lot to hold.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Mark “A” as done" }).click();
    await expect(page.getByText("is a lot to hold")).toBeHidden();
  });

  test("a card opens the task sheet", async ({ page }) => {
    await seed(page, [{ title: "Open me", due: day() }]);
    await page.goto("/board");
    await page.locator("[data-row]", { hasText: "Open me" }).click();
    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
    await expect(page).toHaveURL(/\/board\?task=seed-1$/);
  });
});

test.describe("priority", () => {
  test("is named on the task, not only coloured, and a task has no colour of its own", async ({ page }) => {
    await seed(page, [
      { title: "Tax form", due: day(), priority: 1 },
      { title: "Plain task", due: day() },
      // An older task that still carries a colour shows no trace of it.
      { title: "Old coloured task", due: day(), color: "moss", priority: 3 },
    ]);
    await page.goto("/today");
    await expect(row(page, "Tax form").locator(".meta--p1")).toHaveText("High");
    await expect(row(page, "Old coloured task").locator(".meta--p3")).toHaveText("Low");
    await expect(row(page, "Plain task").locator("[class*='meta--p']")).toHaveCount(0);
    await expect(row(page, "Old coloured task")).not.toHaveAttribute("data-color");

    await row(page, "Tax form").locator("[data-row]").click();
    const sheet = page.getByRole("dialog", { name: "Task" });
    await expect(sheet.getByText("Colour", { exact: true })).toHaveCount(0);
    await choose(page, "Priority", "Medium");
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(row(page, "Tax form").locator(".meta--p2")).toHaveText("Medium");
  });
});

test.describe("lists", () => {
  test("create, fill, rename and delete a list; its tasks fall back to the Inbox", async ({ page }) => {
    await page.goto(isPhone(page) ? "/menu" : "/today");
    await page.getByRole("button", { name: "New list" }).click();
    const dialog = page.getByRole("dialog", { name: "New list" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Work");
    await dialog.getByRole("radio", { name: "Blue" }).click();
    await dialog.getByRole("button", { name: "Create list" }).click();
    await expect(page.getByRole("heading", { name: "Work", level: 1 })).toBeVisible();

    await addTask(page, "Ship the release");
    await expect(row(page, "Ship the release")).toBeVisible();

    await page.getByRole("button", { name: "List options" }).click();
    const options = page.getByRole("dialog", { name: "List options" });
    await options.getByRole("textbox", { name: "Name" }).fill("Day job");
    await options.getByRole("button", { name: "Save list" }).click();
    await expect(page.getByRole("heading", { name: "Day job", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "List options" }).click();
    await options.getByRole("button", { name: "Delete list" }).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(row(page, "Ship the release")).toBeVisible();
  });

  test("two lists cannot share a name", async ({ page }) => {
    await seed(page, [], [{ id: "work", name: "Work" }]);
    await page.goto(isPhone(page) ? "/menu" : "/today");
    await page.getByRole("button", { name: "New list" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("work");
    await expect(page.getByText("You already have a list with this name.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create list" })).toBeDisabled();
  });

  test("typing #name sends a task to an existing list", async ({ page }) => {
    await seed(page, [], [{ id: "work", name: "Work" }]);
    await page.goto("/inbox");
    await page.getByRole("textbox", { name: "Add a task" }).fill("Review the PR #work");
    await expect(page.locator(".chip")).toHaveText(["List: Work"]);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator(".toasts")).toContainText("Added to Work.");
    await page.goto("/list/work");
    await expect(row(page, "Review the PR")).toBeVisible();
  });

  test("a link to a list that is not in this browser says so, instead of quietly showing the Inbox", async ({ page }) => {
    await page.goto("/list/nope");
    await expect(page.getByRole("heading", { level: 1, name: "This list does not exist." })).toBeVisible();
    await expect(page).toHaveTitle("List not found | Listzero");
    await page.getByRole("link", { name: "Open the Inbox" }).click();
    await expect(page).toHaveURL(/\/inbox$/);
  });

  test("deleting the list on screen goes to the Inbox, and Undo brings the list back", async ({ page }) => {
    await seed(page, [{ title: "Kept task", listId: "work" }], [{ id: "work", name: "Work" }]);
    await page.goto("/list/work");
    await page.getByRole("button", { name: "List options" }).click();
    await page.getByRole("button", { name: "Delete list" }).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(row(page, "Kept task")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await page.goto("/list/work");
    await expect(page.getByRole("heading", { level: 1, name: "Work" })).toBeVisible();
  });
});

test.describe("search", () => {
  test("finds tasks by name, notes and list, including finished ones", async ({ page }) => {
    await seed(
      page,
      [
        { title: "Send invoice", listId: "work", notes: "For the October job" },
        { title: "Buy milk" },
        { title: "Old invoice", completedAt: Date.now() - 5000 },
      ],
      [{ id: "work", name: "Work" }],
    );
    await page.goto("/search");
    const input = page.getByRole("searchbox", { name: "Search tasks" });
    await input.fill("invoice");
    await expect(page.locator("[data-task]")).toHaveCount(2);
    await expect(page).toHaveURL(/\?q=invoice$/);
    await input.fill("october");
    await expect(page.locator("[data-task]")).toHaveText(/Send invoice/);
    await input.fill("zzz");
    await expect(page.getByText("0 tasks found.")).toBeVisible();
  });
});

test.describe("settings and data", () => {
  test("the theme choice is applied before the page paints after a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(27, 39, 38)");

    // Stop the app from starting, so only the small script in <head> can have set the theme.
    await page.route("**/assets/*.js", (route) => route.abort());
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1b2726");
  });

  test("choosing a colour changes the whole look, and it is there before the app starts after a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("data-palette", "chalk");
    await page.getByRole("radio", { name: "Sage" }).click();
    await expect(page.getByRole("radio", { name: "Sage" })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-palette", "sage");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(236, 242, 232)");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ecf2e8");

    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(25, 37, 30)");

    await page.route("**/assets/*.js", (route) => route.abort());
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-palette", "sage");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#19251e");
  });

  test("Appearance opens from the menu, and each swatch previews its own colours", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(isPhone(page) ? "/menu" : "/today");
    await page.getByRole("button", { name: "Appearance" }).click();
    const sheet = page.getByRole("dialog", { name: "Appearance" });
    await expect(sheet.getByRole("radio", { name: "Chalk" })).toBeChecked();
    const preview = sheet.getByRole("radio", { name: "Lilac" }).locator(".palette__preview");
    await expect(preview).toHaveCSS("background-color", "rgb(240, 238, 248)");
    await sheet.getByRole("radio", { name: "Lilac" }).click();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(240, 238, 248)");
    await sheet.getByRole("radio", { name: "Large" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-text", "large");
    await expect(page.locator("html")).toHaveCSS("font-size", "18px");
    await sheet.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-palette", "lilac");
    await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  });

  test("“Name only” rows hide the details but keep the next step", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("button", { name: "Load example tasks" }).click();
    const draft = row(page, "Write the first draft of the talk");
    await expect(draft).toContainText("45m");
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Name only" }).click();
    await page.goto("/today");
    await expect(draft).toContainText("Next: Write the opening story");
    await expect(draft).not.toContainText("45m");
    await expect(draft).not.toContainText("Work");
  });

  test("“Match my device” follows the system setting live", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/today");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("a backup can be saved, everything deleted, and the backup loaded again", async ({ page }) => {
    await seed(page, [{ title: "Keep me", due: day() }, { title: "Me too" }]);
    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save a backup" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`listzero-backup-${day()}.json`);
    const path = await download.path();

    await page.getByRole("button", { name: "Delete everything" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete everything" }).click();
    await expect(page.getByText("0 tasks in this browser.")).toBeVisible();

    await page.getByLabel("Backup file").setInputFiles(path);
    await expect(page.locator(".toasts")).toContainText("Backup loaded: 2 tasks.");
    await page.goto("/today");
    await expect(row(page, "Keep me")).toBeVisible();
  });

  test("a file that is not a backup changes nothing", async ({ page }) => {
    await seed(page, [{ title: "Still here", due: day() }]);
    await page.goto("/settings");
    await page.getByLabel("Backup file").setInputFiles({
      name: "holiday.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"photos": ["beach.jpg"]}'),
    });
    await expect(page.locator(".toasts")).toContainText("That file is not a Listzero backup. Nothing was changed.");
    await expect(page.getByText("1 task in this browser.")).toBeVisible();
  });

  test("example tasks fill every view", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("button", { name: "Load example tasks" }).click();
    await expect(page.locator(".zero-head__count")).toHaveText("5");
    await expect(page.getByRole("region", { name: "Carried over" })).toBeVisible();
    await page.goto("/upcoming");
    await expect(page.locator("[data-task]").first()).toBeVisible();
    await page.goto("/done");
    await expect(page.locator("[data-task]")).toHaveCount(3);
  });

  test("a second tab follows changes made in the first", async ({ context, page }) => {
    await page.goto("/inbox");
    const other = await context.newPage();
    await other.goto("/inbox");
    await addTask(page, "Seen in both tabs");
    await expect(row(other, "Seen in both tabs")).toBeVisible();
  });

  test("saved data that cannot be read is set aside, not overwritten silently", async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("listzero:v1", "{not json");
      }
    });
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "A clean slate." })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("listzero:v1:unreadable"))).toBe("{not json");
  });
});

test.describe("navigation", () => {
  test("deep links, the 404 page and the About page work", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "How Listzero works" })).toBeVisible();
    await expect(page).toHaveTitle("How it works | Listzero");
    await page.goto("/nowhere/at/all");
    await expect(page.getByRole("heading", { name: "This page does not exist." })).toBeVisible();
    await page.getByRole("link", { name: "Go to Today", exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
  });

  test("keyboard shortcuts", async ({ page }) => {
    test.skip(isPhone(page), "Shortcuts are for keyboards.");
    await seed(page, [{ title: "First", due: day(), priority: 1 }, { title: "Second", due: day() }]);
    await page.goto("/today");
    await page.keyboard.press("q");
    await expect(page.getByRole("textbox", { name: "Add a task" })).toBeFocused();
    // Typing in a field must not trigger shortcuts.
    await page.keyboard.type("g i / ?");
    await expect(page).toHaveURL(/\/today$/);
    await page.getByRole("textbox", { name: "Add a task" }).fill("");
    await page.locator("h1").click();

    await page.keyboard.press("j");
    await expect(row(page, "First").locator("[data-row]")).toBeFocused();
    await page.keyboard.press("j");
    await expect(row(page, "Second").locator("[data-row]")).toBeFocused();
    await page.keyboard.press("k");
    await page.keyboard.press("x");
    await expect(row(page, "First")).toBeHidden();

    await page.locator("h1").click();
    await page.keyboard.press("g");
    await page.keyboard.press("u");
    await expect(page).toHaveURL(/\/upcoming$/);
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox")).toBeFocused();
    await page.keyboard.press("Escape");
    await page.locator("h1").click();
    await page.keyboard.press("g");
    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/board$/);
    await page.keyboard.press("g");
    await page.keyboard.press("s");
    await expect(page).toHaveURL(/\/settings$/);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByRole("textbox", { name: "Add a task" })).toBeFocused();
  });

  test("the phone tab bar reaches every view and its + button opens quick add", async ({ page }) => {
    test.skip(!isPhone(page), "The tab bar is only shown on small screens.");
    await page.goto("/settings");
    const tabs = page.getByRole("navigation", { name: "Main" });
    await tabs.getByRole("button", { name: "Add a task" }).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByRole("textbox", { name: "Add a task" })).toBeFocused();
    await tabs.getByRole("link", { name: "Upcoming" }).click();
    await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
    await tabs.getByRole("link", { name: "Menu" }).click();
    await page.getByRole("link", { name: "Done" }).click();
    await expect(page.getByRole("heading", { name: "Done", level: 1 })).toBeVisible();
  });
});

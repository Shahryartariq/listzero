import { expect, test } from "@playwright/test";
import { day, row, seed } from "./helpers";

/** The task sheet's Save button and its pickers (components/TaskSheet.tsx, components/Picker.tsx). */

test.beforeEach(async ({ page }) => {
  await seed(page, [{ title: "Write report", due: day() }], [{ id: "work", name: "Work" }]);
});

test("Save keeps the edits, adds a step still being typed, and closes the sheet", async ({ page }) => {
  await page.goto("/today?task=seed-1");
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Task name").fill("Write the report");
  await sheet.getByLabel("New step").fill("Open the draft");
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(sheet).toBeHidden();
  await expect(row(page, "Write the report")).toBeVisible();
  await page.goto("/today?task=seed-1");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Step", exact: true })).toHaveValue("Open the draft");
});

test("the sheet's pickers work with a mouse and with the keyboard", async ({ page }) => {
  await page.goto("/today?task=seed-1");
  const sheet = page.getByRole("dialog");

  // Mouse: open, pick.
  const repeat = sheet.getByRole("combobox", { name: "Repeat" });
  // Unset, a chip shows its name.
  await expect(repeat).toHaveText("Repeat");
  await repeat.click();
  await expect(repeat).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("option", { name: "Every week", exact: true }).click();
  await expect(repeat).toHaveText("Every week");
  await expect(repeat).toHaveAttribute("aria-expanded", "false");
  await expect(repeat).toBeFocused();

  // Keyboard: a time with no value opens at 9 am; the arrows move, Enter picks.
  const time = sheet.getByRole("combobox", { name: "Time" });
  await time.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "9 am", exact: true })).toBeVisible();
  await expect(time).toHaveAttribute("aria-activedescendant", /.+/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(time).toHaveText("9:30 am");

  // Escape closes the list and leaves the sheet open.
  const list = sheet.getByRole("combobox", { name: "List" });
  await list.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox", { name: "List" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "List" })).toBeHidden();
  await expect(sheet).toBeVisible();

  // Typing jumps to a match.
  await page.keyboard.press("w");
  await page.keyboard.press("Enter");
  await expect(list).toHaveText("Work");
  await expect(sheet.getByText("Work").first()).toBeVisible();

  // A press outside closes an open list without picking.
  await repeat.click();
  await sheet.getByLabel("Task name").click();
  await expect(page.getByRole("listbox", { name: "Repeat" })).toBeHidden();
  await expect(repeat).toHaveText("Every week");
});

test("the details are one row of chips, and a day from the calendar shows on its chip", async ({ page }) => {
  await page.goto("/today?task=seed-1");
  const sheet = page.getByRole("dialog");
  const details = sheet.getByRole("group", { name: "Details" });
  await expect(details.getByRole("combobox")).toHaveText(["Today", "Time", "Repeat", "Priority", "Length", "Inbox"]);
  // The sheet opens without a ring on Close.
  await expect(sheet.getByRole("button", { name: "Close" })).not.toBeFocused();

  const dayChip = sheet.getByRole("combobox", { name: "Day" });
  await dayChip.click();
  await expect(page.getByRole("option", { name: "Pick a date…" })).toBeVisible();
  await page.keyboard.press("Escape");
  await sheet.locator(".props__calendar").fill(day(20));
  await expect(dayChip).not.toHaveText("Today");
  const picked = await dayChip.innerText();
  await dayChip.click();
  await expect(page.getByRole("option", { selected: true })).toHaveText(picked);

  // No day hides time and repeat, which need one.
  await page.getByRole("option", { name: "No day" }).click();
  await expect(dayChip).toHaveText("No day");
  await expect(sheet.getByRole("combobox", { name: "Time" })).toHaveCount(0);
});

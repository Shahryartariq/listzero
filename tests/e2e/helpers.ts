import type { Page } from "@playwright/test";

const pad = (n: number) => String(n).padStart(2, "0");

/** A local day relative to today, as the app stores it. */
export function day(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface SeedTask {
  title: string;
  due?: string | null;
  priority?: number;
  listId?: string | null;
  notes?: string;
  estimate?: number | null;
  completedAt?: number | null;
  color?: string | null;
  doing?: boolean;
}

/** Puts tasks in storage before the app starts. Runs once, so reloads keep what the test changed. */
export async function seed(page: Page, tasks: SeedTask[], lists: { id: string; name: string }[] = []) {
  const data = {
    version: 1,
    lists: lists.map((l, i) => ({ ...l, color: "moss", createdAt: i + 1 })),
    tasks: tasks.map((t, i) => ({
      id: `seed-${i + 1}`,
      notes: "",
      listId: null,
      due: null,
      time: null,
      priority: 0,
      estimate: null,
      steps: [],
      repeat: null,
      color: null,
      doing: false,
      createdAt: i + 1,
      completedAt: null,
      ...t,
    })),
    settings: { theme: "system", dailyLimit: 5, calm: false },
  };
  await page.addInitScript((json) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("listzero:v1", json);
  }, JSON.stringify(data));
}

export async function addTask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Add a task" }).fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

export const row = (page: Page, title: string) => page.locator("[data-task]", { hasText: title });

/**
 * Waits until no animation or transition is running. Contrast checks need this: a colour sampled
 * halfway through a fade belongs to no real state of the page.
 */
export async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** A day in the current month by its number, e.g. the 10th. Always on the calendar's first screen. */
export function monthDay(n: number): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(n)}`;
}

/** Opens the Display sheet of the view on screen. */
export async function openDisplay(page: Page) {
  await page.getByRole("button", { name: /^Display/ }).click();
  return page.getByRole("dialog", { name: "Display" });
}

/** Picks an option in one of the app's pickers: a combobox that opens a list of options. */
export async function choose(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

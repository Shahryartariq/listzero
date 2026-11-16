/** A small, believable set of tasks so a first-time visitor can see every view filled in. */

import { addDays } from "./dates";
import { newId } from "./id";
import type { AppData, Task, TaskList } from "./types";

export function exampleData(today: string, now: number, base: AppData): AppData {
  const list = (name: string, color: TaskList["color"]): TaskList => ({ id: newId(), name, color, createdAt: now });
  const home = list("Home", "moss");
  const work = list("Work", "blue");
  const money = list("Money", "ochre");

  let n = 0;
  const task = (title: string, extra: Partial<Task> = {}): Task => ({
    id: newId(),
    title,
    notes: "",
    listId: null,
    due: null,
    time: null,
    priority: 0,
    estimate: null,
    steps: [],
    repeat: null,
    createdAt: now + n++,
    completedAt: null,
    ...extra,
  });
  const steps = (...titles: string[]) => titles.map((title, i) => ({ id: newId(), title, done: i === 0 }));

  const tasks: Task[] = [
    task("Send the invoice for the October project", { listId: work.id, due: today, priority: 1, estimate: 15 }),
    task("Book a dentist appointment", {
      listId: home.id,
      due: today,
      time: "16:30",
      estimate: 10,
      notes: "The clinic picks up after 4. Ask for a morning slot next week.",
    }),
    task("Write the first draft of the talk", {
      listId: work.id,
      due: today,
      priority: 2,
      estimate: 45,
      steps: steps("Open the outline", "Write the opening story", "Three main points", "Closing slide"),
    }),
    task("Water the plants", { listId: home.id, due: today, repeat: "weekly", estimate: 5 }),
    task("Reply to Hamza about the weekend", { due: addDays(today, -2), estimate: 5 }),
    task("Pay the electricity bill", { listId: money.id, due: addDays(today, 1), priority: 1, estimate: 5 }),
    task("Review pull requests", { listId: work.id, due: addDays(today, 1), time: "10:00", repeat: "weekdays", estimate: 30 }),
    task("Renew the car insurance", {
      listId: money.id,
      due: addDays(today, 4),
      priority: 2,
      steps: steps("Find last year's policy", "Compare two quotes", "Pay and save the PDF"),
    }),
    task("Plan the trip to Hunza", { due: addDays(today, 9), estimate: 60 }),
    task("Idea: a tiny script that renames screenshots by date"),
    task("Return the library books"),
    task("Clear the downloads folder", { listId: home.id, estimate: 10, completedAt: now - 3_600_000 }),
    task("Call the bank about the card", { listId: money.id, completedAt: now - 5_400_000 }),
    task("Fix the login redirect bug", { listId: work.id, priority: 1, completedAt: now - 26 * 3_600_000 }),
  ];

  return { ...base, lists: [...base.lists, home, work, money], tasks: [...base.tasks, ...tasks] };
}

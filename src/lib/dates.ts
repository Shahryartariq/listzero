/** Calendar-day helpers. Days are local "YYYY-MM-DD" strings, never UTC instants. */

import type { Repeat } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export function toDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDay(fromDay(value)) === value;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function today(now: Date = new Date()): string {
  return toDay(now);
}

export function addDays(day: string, n: number): string {
  const d = fromDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** Adds months and clamps to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(day: string, n: number): string {
  const d = fromDay(day);
  const dom = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dom, last));
  return toDay(d);
}

export function diffDays(a: string, b: string): number {
  const ms = fromDay(a).getTime() - fromDay(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday. */
export function weekday(day: string): number {
  return fromDay(day).getDay();
}

/** The next day strictly after `from` that falls on `target` (0 = Sunday). */
export function nextWeekday(from: string, target: number): string {
  const delta = (target - weekday(from) + 7) % 7 || 7;
  return addDays(from, delta);
}

/** The next occurrence of a repeating task, always after both its due day and today. */
export function nextOccurrence(due: string, repeat: Repeat, todayDay: string): string {
  const step = (d: string): string => {
    switch (repeat) {
      case "daily":
        return addDays(d, 1);
      case "weekdays": {
        let next = addDays(d, 1);
        while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1);
        return next;
      }
      case "weekly":
        return addDays(d, 7);
      case "monthly":
        return addMonths(d, 1);
      case "yearly":
        return addMonths(d, 12);
    }
  };
  let next = step(due);
  // A task finished late should not come back already overdue.
  for (let i = 0; next <= todayDay && i < 5000; i++) next = step(next);
  return next;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Tomorrow", "Friday", "Mon 24 Nov", "24 Nov 2027". */
export function describeDay(day: string, todayDay: string): string {
  const delta = diffDays(day, todayDay);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  const d = fromDay(day);
  if (delta > 1 && delta < 7) return WEEKDAYS[d.getDay()] ?? day;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (d.getFullYear() !== fromDay(todayDay).getFullYear()) return `${base} ${d.getFullYear()}`;
  return `${(WEEKDAYS[d.getDay()] ?? "").slice(0, 3)} ${base}`;
}

/** "17:30" -> "5:30 pm". */
export function describeTime(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${pad(m)} ${suffix}`;
}

/** 95 -> "1h 35m", 30 -> "30m", 120 -> "2h". */
export function describeMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

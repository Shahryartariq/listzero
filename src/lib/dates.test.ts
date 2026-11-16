import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  describeDay,
  describeMinutes,
  describeTime,
  diffDays,
  isDay,
  isTime,
  nextOccurrence,
  nextWeekday,
  toDay,
} from "./dates";

describe("days", () => {
  it("formats local days without drifting into UTC", () => {
    expect(toDay(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
    expect(toDay(new Date(2026, 11, 31, 23, 55))).toBe("2026-12-31");
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("clamps month ends", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("counts whole days", () => {
    expect(diffDays("2026-11-20", "2026-11-16")).toBe(4);
    expect(diffDays("2026-03-30", "2026-03-27")).toBe(3);
  });

  it("finds the next weekday strictly after a day", () => {
    expect(nextWeekday("2026-11-16", 1)).toBe("2026-11-23");
    expect(nextWeekday("2026-11-16", 5)).toBe("2026-11-20");
  });

  it("validates days and times", () => {
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("26-2-28")).toBe(false);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
  });
});

describe("nextOccurrence", () => {
  it("moves one step for each kind of repeat", () => {
    expect(nextOccurrence("2026-11-16", "daily", "2026-11-16")).toBe("2026-11-17");
    expect(nextOccurrence("2026-11-16", "weekly", "2026-11-16")).toBe("2026-11-23");
    expect(nextOccurrence("2026-01-31", "monthly", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence("2028-02-29", "yearly", "2028-02-29")).toBe("2029-02-28");
  });

  it("skips the weekend for weekday repeats", () => {
    expect(nextOccurrence("2026-11-20", "weekdays", "2026-11-20")).toBe("2026-11-23");
  });

  it("never returns a day that is already over when the task was finished late", () => {
    expect(nextOccurrence("2026-11-02", "weekly", "2026-11-16")).toBe("2026-11-23");
    expect(nextOccurrence("2026-11-10", "daily", "2026-11-16")).toBe("2026-11-17");
  });
});

describe("labels", () => {
  const today = "2026-11-16";
  it("describes days relative to today", () => {
    expect(describeDay("2026-11-16", today)).toBe("Today");
    expect(describeDay("2026-11-17", today)).toBe("Tomorrow");
    expect(describeDay("2026-11-15", today)).toBe("Yesterday");
    expect(describeDay("2026-11-20", today)).toBe("Friday");
    expect(describeDay("2026-11-30", today)).toBe("Mon 30 Nov");
    expect(describeDay("2026-11-10", today)).toBe("Tue 10 Nov");
    expect(describeDay("2027-01-03", today)).toBe("3 Jan 2027");
  });

  it("describes times and lengths", () => {
    expect(describeTime("00:00")).toBe("12 am");
    expect(describeTime("12:05")).toBe("12:05 pm");
    expect(describeTime("17:30")).toBe("5:30 pm");
    expect(describeMinutes(5)).toBe("5m");
    expect(describeMinutes(60)).toBe("1h");
    expect(describeMinutes(95)).toBe("1h 35m");
  });
});

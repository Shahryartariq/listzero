import { describe, expect, it } from "vitest";
import { parseTask, splitLines } from "./parse";

// Monday 16 November 2026, 10:00 local time.
const NOW = new Date(2026, 10, 16, 10, 0);

describe("parseTask", () => {
  it("leaves a plain sentence alone", () => {
    const p = parseTask("Buy milk", NOW);
    expect(p).toMatchObject({ title: "Buy milk", due: null, time: null, priority: 0, estimate: null, tokens: [] });
  });

  it("reads everything out of one sentence", () => {
    const p = parseTask("Call the dentist tomorrow 5pm #health p1 15m", NOW);
    expect(p).toMatchObject({
      title: "Call the dentist",
      due: "2026-11-17",
      time: "17:00",
      listName: "health",
      priority: 1,
      estimate: 15,
    });
    expect(p.tokens.map((t) => t.kind).sort()).toEqual(["due", "estimate", "list", "priority", "time"]);
  });

  it.each([
    ["Pay rent today", "2026-11-16"],
    ["Pay rent tmrw", "2026-11-17"],
    ["Pay rent friday", "2026-11-20"],
    ["Pay rent on fri", "2026-11-20"],
    // "monday" typed on a Monday means the next one, not today.
    ["Pay rent monday", "2026-11-23"],
    ["Pay rent next week", "2026-11-23"],
    ["Pay rent in 3 days", "2026-11-19"],
    ["Pay rent in 2 weeks", "2026-11-30"],
    ["Pay rent 12 dec", "2026-12-12"],
    ["Pay rent dec 12th", "2026-12-12"],
    // A date that has passed this year rolls to next year.
    ["Pay rent 3 jan", "2027-01-03"],
    ["Pay rent 3 jan 2028", "2028-01-03"],
    ["Pay rent 2026-12-01", "2026-12-01"],
    ["Pay rent this weekend", "2026-11-21"],
    ["Pay rent next month", "2026-12-01"],
  ])("%s -> %s", (input, due) => {
    const p = parseTask(input, NOW);
    expect(p.due).toBe(due);
    expect(p.title).toBe("Pay rent");
  });

  it("does not invent impossible dates", () => {
    expect(parseTask("Party 31 feb", NOW)).toMatchObject({ due: null, title: "Party 31 feb" });
    expect(parseTask("Report 2026-13-40", NOW).due).toBeNull();
  });

  it("does not read a month name without a day as a date", () => {
    expect(parseTask("Ask if we may leave early", NOW)).toMatchObject({ due: null, tokens: [] });
    expect(parseTask("Call Tom about the march", NOW).due).toBeNull();
  });

  it.each([
    ["Standup 9am", "09:00"],
    ["Standup at 9:30am", "09:30"],
    ["Standup 12am", "00:00"],
    ["Standup 12pm", "12:00"],
    ["Standup 17:45", "17:45"],
    ["Standup at noon", "12:00"],
  ])("%s -> %s", (input, time) => {
    const p = parseTask(input, NOW);
    expect(p.time).toBe(time);
    expect(p.title).toBe("Standup");
  });

  it("puts a time with no day on today, or tomorrow when it has passed", () => {
    expect(parseTask("Standup 3pm", NOW).due).toBe("2026-11-16");
    expect(parseTask("Standup 9am", NOW).due).toBe("2026-11-17");
  });

  it("ignores numbers that are not times", () => {
    expect(parseTask("Buy 13pm batteries", NOW).time).toBeNull();
    expect(parseTask("Read chapter 5", NOW)).toMatchObject({ time: null, estimate: null, title: "Read chapter 5" });
  });

  it.each([
    ["Read 20m", 20],
    ["Read ~45min", 45],
    ["Read 1h", 60],
    ["Read 1.5h", 90],
    ["Read 1h 30m", 90],
    ["Read 2 hours", 120],
  ])("%s -> %i minutes", (input, estimate) => {
    const p = parseTask(input, NOW);
    expect(p.estimate).toBe(estimate);
    expect(p.title).toBe("Read");
  });

  it("reads repeats and gives them a first day", () => {
    expect(parseTask("Water plants every day", NOW)).toMatchObject({ repeat: "daily", due: "2026-11-16" });
    expect(parseTask("Review PRs every weekday", NOW)).toMatchObject({ repeat: "weekdays", due: "2026-11-16" });
    expect(parseTask("Team sync every thursday 10am", NOW)).toMatchObject({
      title: "Team sync",
      repeat: "weekly",
      due: "2026-11-19",
      time: "10:00",
    });
    expect(parseTask("Pay rent monthly on 1 dec", NOW)).toMatchObject({ repeat: "monthly", due: "2026-12-01" });
  });

  it("starts a weekday repeat on Monday when typed at the weekend", () => {
    const saturday = new Date(2026, 10, 21, 10, 0);
    expect(parseTask("Review PRs weekdays", saturday).due).toBe("2026-11-23");
  });

  it("reads lists and priorities only as whole words", () => {
    expect(parseTask("Fix issue #42 in app1", NOW)).toMatchObject({
      title: "Fix issue #42 in app1",
      listName: null,
      priority: 0,
    });
    expect(parseTask("Email c#team about p10", NOW)).toMatchObject({ listName: null, priority: 0 });
    expect(parseTask("Plan trip #side-project P2", NOW)).toMatchObject({
      title: "Plan trip",
      listName: "side project",
      priority: 2,
    });
  });

  it("keeps the words when a kind is switched off", () => {
    const p = parseTask("Watch Friday Night Lights", NOW, new Set(["due"]));
    expect(p).toMatchObject({ title: "Watch Friday Night Lights", due: null });
  });

  it("treats text that is only a date as a title", () => {
    expect(parseTask("tomorrow", NOW)).toMatchObject({ title: "tomorrow", due: null, tokens: [] });
  });

  it("collapses the gaps left by removed words", () => {
    expect(parseTask("  Send   invoice   friday   to Sara ", NOW).title).toBe("Send invoice to Sara");
  });
});

describe("splitLines", () => {
  it("turns a pasted list into task lines", () => {
    const text = "- Buy milk\n* Call mum\n\n1. Pay rent\n2) Book flights\n[ ] Water plants\n- [x] Send invoice\n  Plain line  ";
    expect(splitLines(text)).toEqual([
      "Buy milk",
      "Call mum",
      "Pay rent",
      "Book flights",
      "Water plants",
      "Send invoice",
      "Plain line",
    ]);
  });
});

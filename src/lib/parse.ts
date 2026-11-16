/**
 * Quick-add parser: turns "Call the dentist tomorrow 5pm #health p1 ~15m"
 * into a title plus a due day, time, list, priority and estimate.
 *
 * Every recognised piece is reported as a token so the UI can show it as a chip
 * and let the user switch that kind of parsing off when it guessed wrong.
 */

import { addDays, addMonths, nextWeekday, toDay, weekday } from "./dates";
import type { Priority, Repeat } from "./types";

export type TokenKind = "due" | "time" | "priority" | "estimate" | "repeat" | "list";

export interface Token {
  kind: TokenKind;
  /** The text that was recognised, as typed. */
  source: string;
}

export interface Parsed {
  title: string;
  due: string | null;
  time: string | null;
  priority: Priority;
  estimate: number | null;
  repeat: Repeat | null;
  /** Name typed after "#", without the hash. */
  listName: string | null;
  tokens: Token[];
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
};
const DAY_PATTERN = "sunday|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday";

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_PATTERN = MONTH_NAMES.map((m) => (m.length > 3 ? `${m}|${m.slice(0, 3)}` : m)).join("|");

function monthIndex(name: string): number {
  return MONTH_NAMES.findIndex((m) => m.startsWith(name.toLowerCase().slice(0, 3)));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A real calendar day for the given parts, or null (rejects 31 Feb). */
function makeDay(year: number, month: number, dom: number): string | null {
  const d = new Date(year, month, dom);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== dom) return null;
  return toDay(d);
}

class Scanner {
  text: string;
  tokens: Token[] = [];

  constructor(text: string) {
    this.text = text;
  }

  /** Finds the first match the handler accepts, removes it from the text and records a token. */
  take(kind: TokenKind, pattern: RegExp, accept: (m: RegExpExecArray) => boolean): boolean {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.text)) !== null) {
      if (accept(m)) {
        this.tokens.push({ kind, source: m[0].trim() });
        this.text = this.text.slice(0, m.index) + " " + this.text.slice(m.index + m[0].length);
        return true;
      }
      if (m[0].length === 0) re.lastIndex++;
    }
    return false;
  }
}

/** Parses one line of quick-add text. `off` lists the kinds the user has switched off. */
export function parseTask(input: string, now: Date = new Date(), off: ReadonlySet<TokenKind> = new Set()): Parsed {
  const todayDay = toDay(now);
  const s = new Scanner(input.replace(/\s+/g, " ").trim());
  const out: Parsed = {
    title: "",
    due: null,
    time: null,
    priority: 0,
    estimate: null,
    repeat: null,
    listName: null,
    tokens: [],
  };

  if (!off.has("list")) {
    // A list name starts with a letter, so "issue #42" stays a number.
    s.take("list", /(?:^|\s)#(\p{L}[\p{L}\p{N}_-]{0,39})(?=\s|$)/u, (m) => {
      out.listName = (m[1] ?? "").replace(/[_-]+/g, " ");
      return true;
    });
  }

  if (!off.has("priority")) {
    s.take("priority", /(?:^|\s)p([123])(?=\s|$)/i, (m) => {
      out.priority = Number(m[1]) as Priority;
      return true;
    });
  }

  if (!off.has("repeat")) {
    const everyDay = new RegExp(`\\bevery\\s+(${DAY_PATTERN})\\b`, "i");
    const found =
      s.take("repeat", /\b(?:every\s+weekday|weekdays)\b/i, () => {
        out.repeat = "weekdays";
        return true;
      }) ||
      s.take("repeat", /\b(?:every\s+day|daily)\b/i, () => {
        out.repeat = "daily";
        return true;
      }) ||
      s.take("repeat", everyDay, (m) => {
        const target = DAY_NAMES[(m[1] ?? "").toLowerCase()];
        if (target === undefined) return false;
        out.repeat = "weekly";
        out.due = weekday(todayDay) === target ? todayDay : nextWeekday(todayDay, target);
        return true;
      }) ||
      s.take("repeat", /\b(?:every\s+week|weekly)\b/i, () => {
        out.repeat = "weekly";
        return true;
      }) ||
      s.take("repeat", /\b(?:every\s+month|monthly)\b/i, () => {
        out.repeat = "monthly";
        return true;
      }) ||
      s.take("repeat", /\b(?:every\s+year|yearly|annually)\b/i, () => {
        out.repeat = "yearly";
        return true;
      });
    void found;
  }

  if (!off.has("due") && out.due === null) {
    const prefix = "(?:(?:on|by|due)\\s+)?";
    const monthDay = new RegExp(
      `\\b${prefix}(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})|(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?)\\b(?:,?\\s+(\\d{4})\\b)?`,
      "i",
    );
    const found =
      s.take("due", new RegExp(`\\b${prefix}(\\d{4})-(\\d{2})-(\\d{2})\\b`, "i"), (m) => {
        const day = makeDay(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (!day) return false;
        out.due = day;
        return true;
      }) ||
      s.take("due", new RegExp(`\\b${prefix}(?:today|tonight)\\b`, "i"), () => {
        out.due = todayDay;
        return true;
      }) ||
      s.take("due", new RegExp(`\\b${prefix}(?:tomorrow|tmrw|tmr)\\b`, "i"), () => {
        out.due = addDays(todayDay, 1);
        return true;
      }) ||
      s.take("due", /\bnext\s+week\b/i, () => {
        out.due = nextWeekday(todayDay, 1);
        return true;
      }) ||
      s.take("due", /\bnext\s+month\b/i, () => {
        out.due = addMonths(todayDay.slice(0, 8) + "01", 1);
        return true;
      }) ||
      s.take("due", /\b(?:this\s+)?weekend\b/i, () => {
        out.due = weekday(todayDay) === 6 ? todayDay : nextWeekday(todayDay, 6);
        return true;
      }) ||
      s.take("due", /\bin\s+(\d{1,3})\s+(day|week|month)s?\b/i, (m) => {
        const n = Number(m[1]);
        const unit = (m[2] ?? "").toLowerCase();
        out.due = unit === "day" ? addDays(todayDay, n) : unit === "week" ? addDays(todayDay, n * 7) : addMonths(todayDay, n);
        return true;
      }) ||
      s.take("due", monthDay, (m) => {
        const dom = Number(m[1] ?? m[4]);
        const month = monthIndex(m[2] ?? m[3] ?? "");
        if (month < 0) return false;
        const base = now.getFullYear();
        if (m[5]) {
          const day = makeDay(Number(m[5]), month, dom);
          if (!day) return false;
          out.due = day;
          return true;
        }
        const thisYear = makeDay(base, month, dom);
        const day = thisYear && thisYear >= todayDay ? thisYear : makeDay(base + 1, month, dom);
        if (!day) return false;
        out.due = day;
        return true;
      }) ||
      s.take("due", new RegExp(`\\b(?:(?:on|by|due|next|this)\\s+)?(${DAY_PATTERN})\\b`, "i"), (m) => {
        const target = DAY_NAMES[(m[1] ?? "").toLowerCase()];
        if (target === undefined) return false;
        out.due = nextWeekday(todayDay, target);
        return true;
      });
    void found;
  }

  if (!off.has("time")) {
    const setTime = (h: number, min: number) => {
      out.time = `${pad(h)}:${pad(min)}`;
      return true;
    };
    const found =
      s.take("time", /\b(?:at\s+)?noon\b/i, () => setTime(12, 0)) ||
      s.take("time", /(?:\bat\s+|@\s?)?\b(\d{1,2})(?::([0-5]\d))?\s?(am|pm)\b/i, (m) => {
        const raw = Number(m[1]);
        if (raw < 1 || raw > 12) return false;
        const pm = (m[3] ?? "").toLowerCase() === "pm";
        return setTime((raw % 12) + (pm ? 12 : 0), Number(m[2] ?? 0));
      }) ||
      s.take("time", /(?:\bat\s+|@\s?)?\b([01]?\d|2[0-3]):([0-5]\d)\b/i, (m) => setTime(Number(m[1]), Number(m[2])));
    void found;
  }

  if (!off.has("estimate")) {
    const hours = /(?:^|\s)~?(\d{1,2}(?:\.\d)?)\s?(?:hours?|hrs?|h)(?:\s?(\d{1,2})\s?(?:minutes?|mins?|m))?(?=\s|$)/i;
    const minutes = /(?:^|\s)~?(\d{1,3})\s?(?:minutes?|mins?|m)(?=\s|$)/i;
    const set = (value: number) => {
      const rounded = Math.round(value);
      if (rounded < 1 || rounded > 24 * 60) return false;
      out.estimate = rounded;
      return true;
    };
    const found =
      s.take("estimate", hours, (m) => set(Number(m[1]) * 60 + Number(m[2] ?? 0))) ||
      s.take("estimate", minutes, (m) => set(Number(m[1])));
    void found;
  }

  // A time or a repeat with no day means "today"; a time that has already passed means tomorrow.
  if (out.due === null && out.time !== null) {
    const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    out.due = out.time > nowTime ? todayDay : addDays(todayDay, 1);
  }
  if (out.due === null && out.repeat !== null) {
    out.due = todayDay;
    if (out.repeat === "weekdays") {
      while (weekday(out.due) === 0 || weekday(out.due) === 6) out.due = addDays(out.due, 1);
    }
  }

  out.title = s.text.replace(/\s+/g, " ").trim();
  out.tokens = s.tokens;

  // "tomorrow" on its own is a title, not a task with an empty name.
  if (out.title === "") {
    return {
      title: input.replace(/\s+/g, " ").trim(),
      due: null,
      time: null,
      priority: 0,
      estimate: null,
      repeat: null,
      listName: null,
      tokens: [],
    };
  }
  return out;
}

/** Splits pasted text into task lines, dropping blank lines and list bullets ("- ", "* ", "1. ", "[ ] "). */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•–]\s+|\d{1,3}[.)]\s+)?(?:\[[ xX]?\]\s+)?/, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

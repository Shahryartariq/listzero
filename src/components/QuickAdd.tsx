import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { useLocation } from "react-router";
import { REPEAT_LABEL, describeDay, describeMinutes, describeTime } from "../lib/dates";
import { parseTask, splitLines, type Parsed, type Token, type TokenKind } from "../lib/parse";
import { findList } from "../lib/store";
import type { Task, TaskList } from "../lib/types";
import { useStore, type AddDefaults } from "../state/store-context";
import { Icon } from "./Icon";

interface QuickAddProps {
  defaults?: AddDefaults;
  /** Whether a new task will show up in the view the user is looking at. */
  staysHere?(task: Task): boolean;
}

const OFF_LABEL: Record<TokenKind, string> = {
  due: "a day",
  time: "a time",
  priority: "a priority",
  estimate: "an estimate",
  repeat: "a repeat",
  list: "a list",
};

const capitalize = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** Where a new task can be found, for the "Added to …" message when it is not in the view on screen. */
export function whereItWent(task: Task, today: string, lists: TaskList[]): string {
  if (task.due) return describeDay(task.due, today);
  const list = lists.find((l) => l.id === task.listId);
  return list ? list.name : "the Inbox";
}

function chipText(token: Token, parsed: Parsed, today: string, lists: TaskList[]): string {
  switch (token.kind) {
    case "due":
      return parsed.due ? describeDay(parsed.due, today) : token.source;
    case "time":
      return parsed.time ? describeTime(parsed.time) : token.source;
    case "priority":
      return `Priority ${parsed.priority}`;
    case "estimate":
      return parsed.estimate ? `Takes ${describeMinutes(parsed.estimate)}` : token.source;
    case "repeat":
      return parsed.repeat ? REPEAT_LABEL[parsed.repeat] : token.source;
    case "list": {
      const match = parsed.listName ? findList(lists, parsed.listName) : null;
      return match ? `List: ${match.name}` : `New list: ${capitalize(parsed.listName ?? "")}`;
    }
  }
}

export function QuickAdd({ defaults, staysHere }: QuickAddProps) {
  const store = useStore();
  const [text, setText] = useState("");
  const [off, setOff] = useState<ReadonlySet<TokenKind>>(new Set());

  const input = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const wantsFocus = (location.state as { add?: number } | null)?.add;

  // The "add" shortcut and the phone's + button land here from other pages.
  useEffect(() => {
    if (wantsFocus) input.current?.focus();
  }, [wantsFocus]);

  const parsed = useMemo(() => parseTask(text, new Date(), off), [text, off]);
  const ready = text.trim().length > 0;


  const add = (lines: string[]) => {
    const created = store.addFromText(lines, defaults, off);
    const hidden = staysHere ? created.filter((t) => !staysHere(t)) : [];
    if (created.length > 1) {
      store.notify(`Added ${created.length} tasks.`);
    } else if (hidden[0]) {
      store.notify(`Added to ${whereItWent(hidden[0], store.today, store.data.lists)}.`);
    }
    setText("");
    setOff(new Set());
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) add([text]);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!/\r?\n/.test(pasted)) return;
    const lines = splitLines(pasted);
    if (lines.length < 2) return;
    // A pasted list becomes one task per line instead of one very long task.
    e.preventDefault();
    add(text.trim() ? [text, ...lines] : lines);
  };

  return (
    <form className="add" onSubmit={onSubmit}>
      <div className="add__box">
        <label className="sr-only" htmlFor="quick-add">
          Add a task
        </label>
        <input
          id="quick-add"
          ref={input}
          className="add__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder="Add a task, like “Pay rent friday 9am p1”"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={600}
        />
        <button type="submit" className="add__send" disabled={!ready}>
          Add
        </button>
      </div>
      <div className="add__below">
        {parsed.tokens.length > 0 ? (
          parsed.tokens.map((token) => (
            <span className="chip" key={token.kind}>
              {chipText(token, parsed, store.today, store.data.lists)}
              <button
                type="button"
                className="chip__off"
                aria-label={`Keep “${token.source}” as plain text, not ${OFF_LABEL[token.kind]}`}
                title="Keep as plain text"
                onClick={() => setOff((prev) => new Set([...prev, token.kind]))}
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          ))
        ) : (
          <span>Paste a list to add many at once.</span>
        )}
      </div>
    </form>
  );
}

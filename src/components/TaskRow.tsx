import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { REPEAT_LABEL, addDays, describeDay, describeMinutes, describeTime } from "../lib/dates";
import { nextStep } from "../lib/store";
import type { Task } from "../lib/types";
import { useStore } from "../state/store-context";
import { useOpenTask } from "../state/useOpenTask";
import { Icon } from "./Icon";

interface TaskRowProps {
  task: Task;
  /** Show the due day. Views that are already about one day leave it out. */
  showDay?: boolean;
  showList?: boolean;
  /** A one-tap move shown at the end of the row. */
  quick?: "tomorrow" | "today";
  /** The task was just finished and is on its way out of the list. */
  leaving?: boolean;
  /** Called just before an open task is finished, so the list can keep showing it for a moment. */
  onFinish?(task: Task): void;
}

const LEAVE_MS = 320;

export function Zero({
  checked,
  priority = 0,
  label,
  onToggle,
}: {
  checked: boolean;
  priority?: number;
  label: string;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      className="zero"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      data-priority={priority}
      onClick={onToggle}
    >
      <span className="zero__ring">
        <span className="zero__check">
          <Icon name="check" size={14} />
        </span>
      </span>
    </button>
  );
}

export function TaskRow({ task, showDay = true, showList = true, quick, leaving = false, onFinish }: TaskRowProps) {
  const store = useStore();
  const open = useOpenTask();
  const done = task.completedAt !== null;
  const list = showList ? store.data.lists.find((l) => l.id === task.listId) : undefined;
  const next = done ? null : nextStep(task);
  const stepsDone = task.steps.filter((s) => s.done).length;

  const toggle = () => {
    if (leaving) return;
    // The task is saved as finished right away; only the row lingers.
    if (!done) onFinish?.(task);
    store.toggleTask(task.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "x" || e.key === "X") {
      e.preventDefault();
      toggle();
    }
  };

  const late = !done && task.due !== null && task.due < store.today;
  const details = !store.data.settings.quiet;

  return (
    <li
      className="row"
      data-done={done}
      data-leaving={leaving}
      data-color={task.color ?? undefined}
      data-task={leaving ? undefined : task.id}
      inert={leaving}
    >
      <Zero
        checked={done || leaving}
        priority={done || leaving ? 0 : task.priority}
        label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        onToggle={toggle}
      />
      <button
        type="button"
        className="row__body"
        data-row={leaving ? undefined : true}
        onClick={() => open(task.id)}
        onKeyDown={onKeyDown}
      >
        <span className="row__title">{task.title}</span>
        <span className="row__meta">
          {task.doing && !done && <span className="meta meta--doing">Doing</span>}
          {next && (
            <span className="meta meta--next">
              Next: {next}
              <span className="sr-only">,</span> ({stepsDone}/{task.steps.length})
            </span>
          )}
          {details && showDay && task.due && (
            <span className={late ? "meta meta--late" : "meta"}>
              <Icon name="calendar" size={15} />
              {describeDay(task.due, store.today)}
            </span>
          )}
          {details && task.time && <span className="meta">{describeTime(task.time)}</span>}
          {details && task.estimate !== null && (
            <span className="meta">
              <Icon name="clock" size={15} />
              {describeMinutes(task.estimate)}
            </span>
          )}
          {details && task.repeat && (
            <span className="meta">
              <Icon name="repeat" size={15} />
              {REPEAT_LABEL[task.repeat]}
            </span>
          )}
          {details && list && (
            <span className="meta">
              <span className="dot" style={{ "--dot": `var(--c-${list.color})` } as React.CSSProperties} />
              {list.name}
            </span>
          )}
          {details && task.notes && (
            <span className="meta" title="Has notes">
              <Icon name="note" size={15} />
              <span className="sr-only">Has notes</span>
            </span>
          )}
        </span>
      </button>
      <span className="row__side">
        {quick && !done && (
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={() =>
              quick === "tomorrow"
                ? store.setDue([task.id], addDays(store.today, 1), "Moved to tomorrow.")
                : store.setDue([task.id], store.today, "Moved to today.")
            }
            aria-label={quick === "tomorrow" ? `Move “${task.title}” to tomorrow` : `Move “${task.title}” to today`}
          >
            {quick === "tomorrow" ? "Tomorrow" : "Today"}
          </button>
        )}
      </span>
    </li>
  );
}

/**
 * A list of task rows. A task that has just been finished stays in place for a moment,
 * ticked and fading, so the tick is seen before the row goes.
 */
export function TaskRows({
  tasks,
  cards = false,
  ...rest
}: { tasks: Task[]; cards?: boolean } & Omit<TaskRowProps, "task" | "leaving" | "onFinish">) {
  const store = useStore();
  const [ghosts, setGhosts] = useState<{ task: Task; index: number }[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const onFinish = (task: Task) => {
    if (store.data.settings.calm || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const index = tasks.findIndex((t) => t.id === task.id);
    setGhosts((list) => [...list.filter((g) => g.task.id !== task.id), { task, index }]);
    timers.current.push(
      window.setTimeout(() => setGhosts((list) => list.filter((g) => g.task.id !== task.id)), LEAVE_MS),
    );
  };

  const ids = new Set(tasks.map((t) => t.id));
  const rows: { task: Task; leaving: boolean }[] = tasks.map((task) => ({ task, leaving: false }));
  // Ghosts go back where they were, unless Undo has already brought the real task back.
  for (const ghost of [...ghosts].sort((a, b) => a.index - b.index)) {
    if (ids.has(ghost.task.id)) continue;
    rows.splice(Math.min(Math.max(ghost.index, 0), rows.length), 0, { task: ghost.task, leaving: true });
  }

  if (rows.length === 0) return null;
  return (
    <ul className={cards ? "rows rows--cards" : "rows"}>
      {rows.map(({ task, leaving }) => (
        <TaskRow key={task.id} task={task} leaving={leaving} onFinish={onFinish} {...rest} />
      ))}
    </ul>
  );
}

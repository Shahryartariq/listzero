import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { REPEAT_LABEL, addDays, describeDay, describeMinutes, describeTime } from "../lib/dates";
import { nextStep } from "../lib/store";
import type { Task } from "../lib/types";
import { useStore } from "../state/store-context";
import { useOpenTask } from "../state/useOpenTask";
import { Icon } from "./Icon";
import { useReorder, type GripProps } from "./useReorder";

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
  /** A handle to drag the task up and down (useReorder), and where to draw it meanwhile. */
  grip?: GripProps;
  /** The id of the text that says how to move a task. */
  gripHelp?: string;
  dragStyle?: CSSProperties;
  dragging?: boolean;
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

export function TaskRow({
  task,
  showDay = true,
  showList = true,
  quick,
  leaving = false,
  onFinish,
  grip,
  gripHelp,
  dragStyle,
  dragging = false,
}: TaskRowProps) {
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
      data-dragging={dragging || undefined}
      style={dragStyle}
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
      {grip && !leaving && (
        <button
          type="button"
          className="row__grip"
          aria-label={`Reorder “${task.title}”`}
          aria-describedby={gripHelp}
          onPointerDown={grip.onPointerDown}
          onKeyDown={grip.onKeyDown}
        >
          <Icon name="grip" size={18} />
        </button>
      )}
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
  onMove,
  ...rest
}: {
  tasks: Task[];
  cards?: boolean;
  /** Lets tasks be dragged up and down; `to` is the new index in `tasks`. */
  onMove?(id: string, to: number): void;
} & Omit<TaskRowProps, "task" | "leaving" | "onFinish" | "grip" | "gripHelp" | "dragStyle" | "dragging">) {
  const store = useStore();
  const list = useRef<HTMLUListElement>(null);
  const help = useId();
  // While a finished row lingers, the rows are not where the list says: no dragging until it goes.
  const reorder = useReorder(
    tasks.map((t) => t.id),
    list,
    onMove,
  );
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
  const sortable = Boolean(onMove) && ghosts.length === 0;
  return (
    <>
      <ul
        ref={list}
        className={cards ? "rows rows--cards" : "rows"}
        data-sortable={onMove ? true : undefined}
        data-dragging={reorder.dragging || undefined}
      >
        {rows.map(({ task, leaving }) => {
          const place = sortable && !leaving ? reorder.styleFor(task.id) : { dragging: false };
          return (
            <TaskRow
              key={task.id}
              task={task}
              leaving={leaving}
              onFinish={onFinish}
              grip={sortable ? reorder.gripFor(task.id) : undefined}
              gripHelp={help}
              dragStyle={place.style}
              dragging={place.dragging}
              {...rest}
            />
          );
        })}
      </ul>
      {onMove && (
        <>
          <p id={help} hidden>
            Drag up or down, or use the arrow keys.
          </p>
          <p className="sr-only" aria-live="polite">
            {reorder.said}
          </p>
        </>
      )}
    </>
  );
}

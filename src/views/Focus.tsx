import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Zero } from "../components/TaskRow";
import { describeMinutes } from "../lib/dates";
import { isOpen, nextStep, todayView } from "../lib/store";
import type { Task } from "../lib/types";
import { useStore } from "../state/store-context";

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** One task on the screen and nothing else. */
export function Focus() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const [skipped, setSkipped] = useState<string[]>([]);
  const pinnedId = params.get("on");

  const queue = useMemo(() => {
    const view = todayView(store.data, store.today);
    const list: Task[] = [...view.due, ...view.carried];
    const pinned = pinnedId ? store.data.tasks.find((t) => t.id === pinnedId && isOpen(t)) : undefined;
    if (pinned) return [pinned, ...list.filter((t) => t.id !== pinned.id)];
    return list;
  }, [store.data, store.today, pinnedId]);

  const waiting = queue.filter((t) => !skipped.includes(t.id));
  const task = waiting[0] ?? queue[0];
  const position = task ? queue.indexOf(task) + 1 : 0;

  if (!task) {
    return (
      <div className="view">
        <header className="head">
          <h1 className="title">Focus</h1>
        </header>
        <div className="empty" style={{ paddingTop: "0.5rem" }}>
          <h2 className="empty__title">Nothing to focus on.</h2>
          <p>
            Focus shows today’s tasks one at a time. Today is at zero, so either add something, or open any task and
            choose “Focus on this”.
          </p>
          <div className="empty__actions">
            <Link to="/today" className="btn btn--quiet">
              Back to Today
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const skip = () => {
    if (pinnedId) setParams({}, { replace: true });
    setSkipped((list) => (waiting.length <= 1 ? [] : [...list, task.id]));
  };

  return (
    <FocusTask
      key={task.id}
      task={task}
      position={position}
      total={queue.length}
      onSkip={skip}
      onDone={() => {
        if (pinnedId) setParams({}, { replace: true });
        store.toggleTask(task.id);
      }}
    />
  );
}

interface FocusTaskProps {
  task: Task;
  position: number;
  total: number;
  onSkip(): void;
  onDone(): void;
}

function FocusTask({ task, position, total, onSkip, onDone }: FocusTaskProps) {
  const store = useStore();
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const next = nextStep(task);
  const remaining = endsAt === null ? 0 : endsAt - now;

  useEffect(() => {
    if (endsAt === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) {
        setEndsAt(null);
        setFinished(true);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  useEffect(() => {
    document.title = endsAt !== null ? `${clock(remaining)} | ${task.title}` : `Focus | Listzero`;
  }, [endsAt, remaining, task.title]);

  const start = (minutes: number) => {
    setFinished(false);
    setNow(Date.now());
    setEndsAt(Date.now() + minutes * 60_000);
  };

  const lengths = [...new Set([2, task.estimate ?? 0, 25])].filter((m) => m > 0);

  return (
    <div className="focus">
      <div className="focus__bar">
        <h1 className="sr-only">Focus</h1>
        <span>
          Task {position} of {total}
        </span>
        <Link to="/today" className="text-btn">
          Leave focus
        </Link>
      </div>

      <div className="focus__task">
        <h2 className="focus__title">{task.title}</h2>
        {next && task.steps.length > 0 && <p className="focus__next">Next: {next}</p>}
        {task.notes && <p className="focus__notes">{task.notes}</p>}

        {task.steps.length > 0 && (
          <ul className="steps focus__steps" aria-label="Steps">
            {task.steps.map((step) => (
              <li className="step" key={step.id} data-done={step.done}>
                <Zero
                  checked={step.done}
                  label={step.done ? `Mark step “${step.title}” as not done` : `Mark step “${step.title}” as done`}
                  onToggle={() =>
                    store.updateTask(task.id, {
                      steps: task.steps.map((s) => (s.id === step.id ? { ...s, done: !s.done } : s)),
                    })
                  }
                />
                <span className="step__title" style={{ display: "flex", alignItems: "center" }}>
                  {step.title}
                </span>
                <span />
              </li>
            ))}
          </ul>
        )}

        <div className="timer">
          {endsAt !== null ? (
            <>
              <span className="timer__clock" role="timer" aria-label="Time left">
                {clock(remaining)}
              </span>
              <button type="button" className="btn btn--quiet" onClick={() => setEndsAt(null)}>
                Stop timer
              </button>
            </>
          ) : (
            <>
              <span className="hint" id="timer-label">
                {finished ? "Time. Keep going, or stop here." : "Starting is the hard part. Give it:"}
              </span>
              <span className="seg" role="group" aria-labelledby="timer-label">
                {lengths.map((m) => (
                  <button key={m} type="button" className="seg__opt" onClick={() => start(m)}>
                    {m === 2 ? "Just 2 minutes" : describeMinutes(m)}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="focus__actions">
        <button type="button" className="btn btn--mark" onClick={onDone}>
          Done
        </button>
        {total > 1 && (
          <button type="button" className="btn btn--quiet" onClick={onSkip}>
            Not now
          </button>
        )}
      </div>
    </div>
  );
}

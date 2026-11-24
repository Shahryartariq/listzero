import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { Zero } from "../components/TaskRow";
import { describeMinutes } from "../lib/dates";
import { isOpen, nextStep, todayView } from "../lib/store";
import type { Task } from "../lib/types";
import { sharedStore } from "../shared/sharedStore";
import { useSpace, useSpaceLoading } from "../shared/space";
import { StoreContext, useStore } from "../state/store-context";
import { usePageTitle } from "../state/usePageTitle";

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** A timer for one task. Running: `endsAt` is set. Paused: `left` is. */
interface Timer {
  taskId: string;
  total: number;
  endsAt: number | null;
  left: number | null;
}

// Kept for the tab, so a reload or a quick trip to another page does not lose the timer.
const TIMER_KEY = "listzero:focus-timer";

function readTimer(): Timer | null {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(TIMER_KEY) ?? "null");
    if (!v || typeof v !== "object") return null;
    const t = v as Record<string, unknown>;
    const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
    if (typeof t.taskId !== "string" || !num(t.total) || (t.total as number) <= 0) return null;
    if (!(t.endsAt === null || num(t.endsAt)) || !(t.left === null || num(t.left))) return null;
    if ((t.endsAt === null) === (t.left === null)) return null;
    return t as unknown as Timer;
  } catch {
    return null;
  }
}

function writeTimer(timer: Timer | null) {
  try {
    if (timer) sessionStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    else sessionStorage.removeItem(TIMER_KEY);
  } catch {
    // Storage blocked: the timer still works, it just won't survive a reload.
  }
}

const calm = () =>
  document.documentElement.dataset.calm === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One task on the screen and nothing else. */
export function Focus() {
  const [params] = useSearchParams();
  const sharedId = params.get("shared");
  if (sharedId) return <SharedFocus listId={sharedId} taskId={params.get("on") ?? ""} />;
  return <TodayFocus />;
}

/**
 * One task from a shared list. It is the only one: shared tasks never join the Today queue, so
 * finishing it or leaving goes back to its list.
 */
function SharedFocus({ listId, taskId }: { listId: string; taskId: string }) {
  const personal = useStore();
  const space = useSpace();
  const navigate = useNavigate();
  const list = space?.lists.find((l) => l.id === listId);
  const store = useMemo(() => (list ? sharedStore(personal, list) : null), [personal, list, space]); // eslint-disable-line react-hooks/exhaustive-deps
  const task = store?.data.tasks.find((t) => t.id === taskId && isOpen(t));
  const back = `/shared/${listId}`;
  const loading = useSpaceLoading();
  usePageTitle("Focus");
  if (loading && !store) return <div className="view" aria-busy="true" />;
  if (!store || !task || store.readOnly) return <Navigate to={back} replace />;

  return (
    <StoreContext.Provider value={store}>
      <FocusTask
        key={task.id}
        task={task}
        position={1}
        total={1}
        takeFocus={false}
        place={list?.name}
        back={back}
        onSkip={() => navigate(back)}
        onDone={() => {
          writeTimer(null);
          store.toggleTask(task.id);
          navigate(back);
        }}
      />
    </StoreContext.Provider>
  );
}

function TodayFocus() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [moved, setMoved] = useState(false);
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
  // The task screen below names the tab itself (it shows the timer); this covers the empty screen.
  usePageTitle("Focus");

  if (!task) {
    return (
      <div className="view">
        <header className="head">
          <h1 className="title">Focus</h1>
        </header>
        <div className="empty" style={{ paddingTop: "0.5rem" }}>
          <h2 className="empty__title">Nothing to focus on.</h2>
          <p>
            Today is clear. To focus on any task, open it and press{" "}
            <span className="inline-icon" role="img" aria-label="Focus on this">
              <Icon name="focus" size={18} />
            </span>
            .
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

  const leave = () => {
    setMoved(true);
    writeTimer(null);
    if (pinnedId) setParams({}, { replace: true });
  };

  return (
    <FocusTask
      key={task.id}
      task={task}
      position={position}
      total={queue.length}
      takeFocus={moved}
      onSkip={() => {
        leave();
        setSkipped((list) => (waiting.length <= 1 ? [] : [...list, task.id]));
      }}
      onDone={() => {
        leave();
        store.toggleTask(task.id);
      }}
    />
  );
}

interface FocusTaskProps {
  task: Task;
  position: number;
  total: number;
  /** Move keyboard focus to the title: the task before it was just finished or put off. */
  takeFocus: boolean;
  /** The shared list the task is in, said in place of "Task 1 of 3". */
  place?: string;
  /** Where Leave focus goes. */
  back?: string;
  onSkip(): void;
  onDone(): void;
}

function FocusTask({ task, position, total, takeFocus, place, back = "/today", onSkip, onDone }: FocusTaskProps) {
  const store = useStore();
  const navigate = useNavigate();
  const title = useRef<HTMLHeadingElement>(null);
  const [timer, setTimerState] = useState<Timer | null>(() => {
    const saved = readTimer();
    return saved?.taskId === task.id ? saved : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const next = nextStep(task);

  const running = timer !== null && timer.endsAt !== null;
  const left = timer === null ? 0 : timer.endsAt !== null ? timer.endsAt - now : (timer.left ?? 0);
  const finished = running && left <= 0;
  const paused = timer !== null && timer.endsAt === null;

  const setTimer = (value: Timer | null) => {
    setTimerState(value);
    writeTimer(value);
  };

  // The rest of the app steps back while a task is on screen.
  useLayoutEffect(() => {
    document.documentElement.dataset.focus = "on";
    return () => {
      delete document.documentElement.dataset.focus;
    };
  }, []);

  useEffect(() => {
    if (takeFocus) title.current?.focus();
  }, [takeFocus]);

  // Escape leaves, unless it is closing something else first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      navigate(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, back]);

  const endsAt = timer?.endsAt ?? null;
  useEffect(() => {
    if (endsAt === null) return;
    const tick = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) window.clearInterval(tick);
    }, 250);
    return () => window.clearInterval(tick);
  }, [endsAt]);

  useEffect(() => {
    // Someone who switched tabs while the timer ran sees it in the tab, and sees when it is over.
    if (finished) document.title = `Time is up | ${task.title}`;
    else if (running) document.title = `${clock(left)} | ${task.title}`;
    else if (paused) document.title = `Paused | ${task.title}`;
    else document.title = "Focus | Listzero";
  }, [running, finished, paused, left, task.title]);

  // Keep a phone's screen on while the clock runs.
  const awake = running && !finished;
  useEffect(() => {
    if (!awake || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (gone) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      gone = true;
      void lock?.release().catch(() => {});
    };
  }, [awake]);

  const start = (minutes: number) => {
    const at = Date.now();
    setNow(at);
    setTimer({ taskId: task.id, total: minutes * 60_000, endsAt: at + minutes * 60_000, left: null });
  };

  const pause = () => {
    if (!timer || timer.endsAt === null) return;
    setTimer({ ...timer, endsAt: null, left: Math.max(0, timer.endsAt - Date.now()) });
  };

  const resume = () => {
    if (!timer || timer.left === null) return;
    const at = Date.now();
    setNow(at);
    setTimer({ ...timer, endsAt: at + timer.left, left: null });
  };

  const addFive = () => {
    if (!timer || finished) return start(5);
    const extra = 5 * 60_000;
    setTimer({
      ...timer,
      total: timer.total + extra,
      endsAt: timer.endsAt === null ? null : timer.endsAt + extra,
      left: timer.left === null ? null : timer.left + extra,
    });
  };

  // Finishing slides the task away first, then the next one comes in.
  const finish = (then: () => void) => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(then, calm() ? 0 : 260);
  };

  const lengths = [...new Set([2, task.estimate ?? 0, 25])].filter((m) => m > 0);
  const share = timer === null ? 1 : Math.max(0, Math.min(1, left / timer.total));

  return (
    <div className="focus" data-arriving={takeFocus || undefined} data-leaving={leaving || undefined}>
      <div className="focus__bar">
        <h1 className="sr-only">Focus</h1>
        <span className="focus__count">{place ? `From “${place}”` : `Task ${position} of ${total}`}</span>
        <Link to={back} className="btn btn--quiet btn--small" aria-keyshortcuts="Escape">
          <Icon name="close" size={16} />
          Leave focus
        </Link>
      </div>

      <div className="focus__task">
        <h2 className="focus__title" ref={title} tabIndex={-1}>
          {task.title}
        </h2>
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

        <span className="sr-only" role="status">
          {finished ? "Time is up." : ""}
        </span>
        <div className="timer" data-state={finished ? "up" : running ? "on" : paused ? "paused" : "idle"}>
          {timer !== null ? (
            <>
              <div className="timer__dial">
                <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                  <circle className="timer__track" cx="50" cy="50" r="45" />
                  <circle className="timer__arc" cx="50" cy="50" r="45" pathLength="100" strokeDasharray={`${share * 100} 100`} />
                </svg>
                {finished ? (
                  <span className="timer__clock timer__clock--up" aria-hidden="true">
                    Time’s up
                  </span>
                ) : (
                  <span className="timer__clock" role="timer" aria-label={paused ? "Paused, time left" : "Time left"}>
                    {clock(left)}
                  </span>
                )}
              </div>
              <div className="timer__controls">
                {finished ? (
                  <button type="button" className="btn btn--quiet" onClick={addFive}>
                    <Icon name="plus" size={18} />5 more minutes
                  </button>
                ) : (
                  <>
                    {paused ? (
                      <button type="button" className="btn" onClick={resume}>
                        <Icon name="play" size={18} />
                        Resume
                      </button>
                    ) : (
                      <button type="button" className="btn" onClick={pause}>
                        <Icon name="pause" size={18} />
                        Pause
                      </button>
                    )}
                    <button type="button" className="btn btn--quiet" onClick={addFive}>
                      +5 min
                    </button>
                  </>
                )}
                <button type="button" className="btn btn--quiet" onClick={() => setTimer(null)}>
                  Stop timer
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="timer__ask" id="timer-label">
                Start a timer
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
        <button type="button" className="btn" onClick={() => finish(onDone)}>
          <Icon name="check" size={20} />
          Done
        </button>
        {total > 1 && (
          <button type="button" className="btn btn--quiet" onClick={() => finish(onSkip)}>
            Not now
          </button>
        )}
      </div>
    </div>
  );
}

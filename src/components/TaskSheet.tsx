import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { REPEAT_LABEL, addDays, describeDay, nextWeekday } from "../lib/dates";
import { newId } from "../lib/id";
import { COLOR_NAME, LIST_COLORS, type Priority, type Repeat, type Task } from "../lib/types";
import { useStore } from "../state/store-context";
import { useCloseTask } from "../state/useOpenTask";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { Zero } from "./TaskRow";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 0, label: "None" },
  { value: 3, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 1, label: "High" },
];

const ESTIMATES = [5, 15, 30, 60];

/** Renders the open task, if the URL names one. Lives once, in the shell. */
export function TaskSheet() {
  const [params] = useSearchParams();
  const store = useStore();
  const close = useCloseTask();
  const navigate = useNavigate();
  const location = useLocation();
  const id = params.get("task");
  const task = id ? store.data.tasks.find((t) => t.id === id) : undefined;

  // A link to a task that no longer exists should not leave a dead "?task=" in the address bar.
  // This rewrites the current entry instead of going back, so it is safe next to a close already under way.
  useEffect(() => {
    if (!id || task) return;
    const rest = new URLSearchParams(location.search);
    rest.delete("task");
    const search = rest.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
  }, [id, task, navigate, location.pathname, location.search]);

  if (!task) return null;
  return <TaskEditor key={task.id} task={task} onClose={close} />;
}

function TaskEditor({ task, onClose }: { task: Task; onClose(): void }) {
  const store = useStore();
  const navigate = useNavigate();
  const [title, setTitle] = useState(task.title);
  const [newStep, setNewStep] = useState("");
  const titleBox = useRef<HTMLTextAreaElement>(null);
  const done = task.completedAt !== null;

  // Grow the name field with its text. This runs after the dialog has opened, when the field has a size.
  useEffect(() => {
    const el = titleBox.current;
    if (!el || el.scrollHeight === 0) return;
    el.style.height = "auto";
    // scrollHeight leaves out the border, and the box is sized border-box.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [title]);
  const list = store.data.lists.find((l) => l.id === task.listId);
  const today = store.today;
  const tomorrow = addDays(today, 1);
  const nextWeek = nextWeekday(today, 1);

  const saveTitle = (value: string) => {
    setTitle(value);
    const clean = value.replace(/\s+/g, " ").trim();
    if (clean) store.updateTask(task.id, { title: clean.slice(0, 300) });
  };

  const addStep = () => {
    const clean = newStep.replace(/\s+/g, " ").trim();
    if (!clean || task.steps.length >= 50) return;
    store.updateTask(task.id, { steps: [...task.steps, { id: newId(), title: clean.slice(0, 300), done: false }] });
    setNewStep("");
  };

  const onStepKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addStep();
    }
  };

  const setDue = (due: string | null) => store.updateTask(task.id, { due });

  return (
    <Sheet
      title="Task"
      context={
        <>
          {list && <span className="dot" style={{ "--dot": `var(--c-${list.color})` } as React.CSSProperties} />}
          {list ? list.name : "Inbox"}
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              onClose();
              store.deleteTask(task.id);
            }}
          >
            <Icon name="trash" size={18} />
            Delete
          </button>
          {!done && (
            <button type="button" className="btn" onClick={() => navigate(`/focus?on=${task.id}`)}>
              <Icon name="focus" size={18} />
              Focus on this
            </button>
          )}
        </>
      }
    >
      <div className="detail__top">
        <Zero
          checked={done}
          priority={done ? 0 : task.priority}
          label={done ? "Mark as not done" : "Mark as done"}
          onToggle={() => {
            if (!done) onClose();
            store.toggleTask(task.id);
          }}
        />
        <textarea
          ref={titleBox}
          className="detail__title"
          aria-label="Task name"
          rows={1}
          value={title}
          maxLength={300}
          onChange={(e) => saveTitle(e.target.value.replace(/\n/g, " "))}
          onBlur={() => {
            if (!title.trim()) setTitle(task.title);
          }}
        />
      </div>
      {done && task.completedAt && (
        <p className="hint">Finished {describeDay(store.dayOf(task.completedAt), today).toLowerCase()}.</p>
      )}

      <div className="detail__group">
        <span className="label" id="steps-label">
          Steps
        </span>
        {task.steps.length > 0 && (
          <ul className="steps" aria-labelledby="steps-label">
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
                <input
                  className="step__title"
                  aria-label="Step"
                  defaultValue={step.title}
                  maxLength={300}
                  onBlur={(e) => {
                    const clean = e.target.value.replace(/\s+/g, " ").trim();
                    if (!clean) {
                      e.target.value = step.title;
                      return;
                    }
                    if (clean !== step.title) {
                      store.updateTask(task.id, {
                        steps: task.steps.map((s) => (s.id === step.id ? { ...s, title: clean } : s)),
                      });
                    }
                  }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove step “${step.title}”`}
                  onClick={() => store.updateTask(task.id, { steps: task.steps.filter((s) => s.id !== step.id) })}
                >
                  <Icon name="close" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="detail__row" style={{ marginTop: task.steps.length ? "0.5rem" : 0 }}>
          <input
            className="field"
            style={{ flex: "1 1 12rem" }}
            aria-label="New step"
            placeholder={task.steps.length ? "Add another step" : "What is the first small step?"}
            value={newStep}
            maxLength={300}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={onStepKey}
            enterKeyHint="done"
          />
          <button type="button" className="btn btn--quiet" onClick={addStep} disabled={!newStep.trim()}>
            Add step
          </button>
        </div>
        {task.steps.length === 0 && (
          <p className="hint" style={{ marginTop: "0.5rem" }}>
            Stuck on a big task? Write a first step small enough to start in two minutes.
          </p>
        )}
      </div>

      <div className="detail__group">
        <span className="label" id="day-label">
          Day
        </span>
        <div className="detail__row" role="group" aria-labelledby="day-label">
          <div className="seg">
            <button type="button" className="seg__opt" aria-pressed={task.due === today} onClick={() => setDue(today)}>
              Today
            </button>
            <button
              type="button"
              className="seg__opt"
              aria-pressed={task.due === tomorrow}
              onClick={() => setDue(tomorrow)}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className="seg__opt"
              aria-pressed={task.due === nextWeek}
              onClick={() => setDue(nextWeek)}
            >
              Next week
            </button>
            <button type="button" className="seg__opt" aria-pressed={task.due === null} onClick={() => setDue(null)}>
              No day
            </button>
          </div>
          <input
            type="date"
            className="field"
            aria-label="Pick a day"
            value={task.due ?? ""}
            onChange={(e) => setDue(e.target.value || null)}
          />
        </div>
        {task.due && (
          <div className="detail__row" style={{ marginTop: "0.6rem" }}>
            <input
              type="time"
              className="field"
              aria-label="Time"
              value={task.time ?? ""}
              onChange={(e) => store.updateTask(task.id, { time: e.target.value || null })}
            />
            <select
              className="field"
              aria-label="Repeat"
              value={task.repeat ?? ""}
              onChange={(e) => store.updateTask(task.id, { repeat: (e.target.value || null) as Repeat | null })}
            >
              <option value="">Does not repeat</option>
              {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="detail__group">
        <span className="label" id="priority-label">
          Priority
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="priority-label">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              className="seg__opt"
              aria-checked={task.priority === p.value}
              onClick={() => store.updateTask(task.id, { priority: p.value })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="detail__group">
        <span className="label" id="color-label">
          Colour
        </span>
        <div className="swatches" role="radiogroup" aria-labelledby="color-label">
          <button
            type="button"
            role="radio"
            className="swatch swatch--none"
            aria-checked={task.color === null}
            aria-label="No colour"
            title="No colour"
            onClick={() => store.updateTask(task.id, { color: null })}
          >
            <span className="dot" />
          </button>
          {LIST_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              className="swatch"
              aria-checked={task.color === c}
              aria-label={COLOR_NAME[c]}
              title={COLOR_NAME[c]}
              onClick={() => store.updateTask(task.id, { color: c })}
            >
              <span className="dot" style={{ "--dot": `var(--c-${c})` } as React.CSSProperties} />
            </button>
          ))}
        </div>
      </div>

      <div className="detail__group">
        <span className="label" id="estimate-label">
          How long it takes
        </span>
        <div className="detail__row" role="group" aria-labelledby="estimate-label">
          <div className="seg">
            {ESTIMATES.map((m) => (
              <button
                key={m}
                type="button"
                className="seg__opt"
                aria-pressed={task.estimate === m}
                onClick={() => store.updateTask(task.id, { estimate: task.estimate === m ? null : m })}
              >
                {m < 60 ? `${m} min` : "1 hour"}
              </button>
            ))}
          </div>
          <input
            type="number"
            className="field"
            style={{ flex: "0 1 8rem" }}
            aria-label="Minutes"
            placeholder="Minutes"
            min={1}
            max={1440}
            inputMode="numeric"
            value={task.estimate ?? ""}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              store.updateTask(task.id, { estimate: e.target.value && n >= 1 && n <= 1440 ? n : null });
            }}
          />
        </div>
      </div>

      <div className="detail__group">
        <label className="label" htmlFor="task-list">
          List
        </label>
        <select
          id="task-list"
          className="field"
          value={task.listId ?? ""}
          onChange={(e) => store.updateTask(task.id, { listId: e.target.value || null })}
        >
          <option value="">Inbox</option>
          {store.data.lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="detail__group">
        <label className="label" htmlFor="task-notes">
          Notes
        </label>
        <textarea
          id="task-notes"
          className="field"
          value={task.notes}
          maxLength={5000}
          onChange={(e) => store.updateTask(task.id, { notes: e.target.value })}
        />
        <p className="hint" style={{ marginTop: "0.5rem" }}>
          Changes save as you type.
        </p>
      </div>
    </Sheet>
  );
}

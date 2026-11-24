import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { doneByLabel, nameOf, onItLabel, useSpace } from "../shared/space";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { REPEAT_LABEL, addDays, describeDay, describeMinutes, describeTime, nextWeekday } from "../lib/dates";
import { newId } from "../lib/id";
import { PRIORITY_LABEL, type Priority, type Repeat, type Task } from "../lib/types";
import { useStore } from "../state/store-context";
import { useCloseTask } from "../state/useOpenTask";
import { Icon } from "./Icon";
import { Picker, type PickerOption } from "./Picker";
import { Sheet } from "./Sheet";
import { Zero } from "./TaskRow";

const PRIORITIES: PickerOption<"0" | "1" | "2" | "3">[] = [
  { value: "0", label: "No priority" },
  { value: "1", label: PRIORITY_LABEL[1] },
  { value: "2", label: PRIORITY_LABEL[2] },
  { value: "3", label: PRIORITY_LABEL[3] },
];

const LENGTHS = [5, 15, 30, 45, 60, 90, 120];

/** The usual lengths, plus the task's own when it is another. */
function lengthOptions(current: number | null): PickerOption<string>[] {
  const minutes = current !== null && !LENGTHS.includes(current) ? [...LENGTHS, current].sort((a, b) => a - b) : LENGTHS;
  return [{ value: "", label: "No length" }, ...minutes.map((m) => ({ value: String(m), label: describeMinutes(m) }))];
}

const REPEATS: PickerOption<Repeat | "">[] = [
  { value: "", label: "Does not repeat" },
  ...(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => ({ value: r, label: REPEAT_LABEL[r] })),
];

/** Every half hour, plus the task's own time when it falls between. */
function timeOptions(current: string | null): PickerOption<string>[] {
  const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
  if (current && !times.includes(current)) times.push(current);
  times.sort();
  return [{ value: "", label: "No time" }, ...times.map((t) => ({ value: t, label: describeTime(t) }))];
}

/** Opens the browser's calendar from a hidden date input that sits under the Day chip. */
function openCalendar(input: HTMLInputElement | null) {
  try {
    input?.showPicker();
  } catch {
    input?.focus();
  }
}

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
  const readOnly = store.readOnly === true;
  const space = useSpace();
  // In a shared list, the list's own id; Focus needs it to find the task.
  const shared = space?.lists.find((l) => l.id === task.listId);
  const who = done
    ? task.doneBy && doneByLabel(nameOf(space, task.doneBy))
    : task.doing && task.doingBy && onItLabel(nameOf(space, task.doingBy));

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
  const calendar = useRef<HTMLInputElement>(null);
  const dayValue = task.due ?? "none";
  const dayOptions: PickerOption<string>[] = [
    { value: today, label: "Today" },
    { value: tomorrow, label: "Tomorrow" },
    ...(nextWeek !== tomorrow ? [{ value: nextWeek, label: "Next week" }] : []),
    ...(task.due && ![today, tomorrow, nextWeek].includes(task.due)
      ? [{ value: task.due, label: describeDay(task.due, today) }]
      : []),
    { value: "none", label: "No day" },
    { value: "pick", label: "Pick a date…" },
  ];

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
          {readOnly ? (
            <span className="hint">You can view this list, not change it.</span>
          ) : (
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
          )}
          <span className="sheet__end">
            {!done && !readOnly && (
              <button
                type="button"
                className="btn btn--quiet"
                aria-label="Focus on this"
                onClick={() => navigate(shared ? `/focus?shared=${shared.id}&on=${task.id}` : `/focus?on=${task.id}`)}
              >
                <Icon name="focus" size={18} />
                Focus
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  // Everything else is kept as it changes; a step still being typed goes in now.
                  addStep();
                  onClose();
                }}
              >
                <Icon name="check" size={18} />
                Save
              </button>
            )}
          </span>
        </>
      }
    >
      {/* A viewer sees everything as it is, with nothing to press or type into. */}
      <fieldset className="detail__set" disabled={readOnly}>
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
        {who && <p className="detail__who">{who}</p>}
        {done && task.completedAt && (
          <p className="hint">Finished {describeDay(store.dayOf(task.completedAt), today).toLowerCase()}.</p>
        )}

        <div className="props" role="group" aria-label="Details">
          <span className="props__day">
            <Picker
              chip
              label="Day"
              icon="calendar"
              value={dayValue}
              empty="none"
              placeholder="No day"
              options={dayOptions}
              onChange={(v) => {
                if (v === "pick") openCalendar(calendar.current);
                else setDue(v === "none" ? null : v);
              }}
            />
            {!readOnly && (
              <input
                ref={calendar}
                type="date"
                className="props__calendar"
                tabIndex={-1}
                aria-hidden="true"
                value={task.due ?? ""}
                onChange={(e) => setDue(e.target.value || null)}
              />
            )}
          </span>
          {task.due && (
            <Picker
              chip
              label="Time"
              icon="clock"
              value={task.time ?? ""}
              empty=""
              placeholder="Time"
              startAt="09:00"
              options={timeOptions(task.time)}
              onChange={(time) => store.updateTask(task.id, { time: time || null })}
            />
          )}
          {task.due && (
            <Picker
              chip
              label="Repeat"
              icon="repeat"
              value={task.repeat ?? ""}
              empty=""
              placeholder="Repeat"
              options={REPEATS}
              onChange={(repeat) => store.updateTask(task.id, { repeat: repeat || null })}
            />
          )}
          <Picker
            chip
            label="Priority"
            icon="flag"
            value={String(task.priority) as "0" | "1" | "2" | "3"}
            empty="0"
            placeholder="Priority"
            options={PRIORITIES}
            onChange={(p) => store.updateTask(task.id, { priority: Number(p) as Priority })}
          />
          <Picker
            chip
            label="Length"
            icon="timer"
            value={task.estimate === null ? "" : String(task.estimate)}
            empty=""
            placeholder="Length"
            options={lengthOptions(task.estimate)}
            onChange={(m) => store.updateTask(task.id, { estimate: m ? Number(m) : null })}
          />
          <Picker
            chip
            label="List"
            value={task.listId ?? ""}
            options={[
              { value: "", label: "Inbox" },
              ...store.data.lists.map((l) => ({ value: l.id, label: l.name, dot: `var(--c-${l.color})` })),
            ]}
            onChange={(listId) => store.updateTask(task.id, { listId: listId || null })}
          />
        </div>

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
          {!readOnly && (
            <div className="detail__row" style={{ marginTop: task.steps.length ? "0.5rem" : 0 }}>
              <input
                className="field"
                style={{ flex: "1 1 12rem" }}
                aria-label="New step"
                placeholder={task.steps.length ? "Add a step" : "First small step"}
                value={newStep}
                maxLength={300}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={onStepKey}
                enterKeyHint="done"
              />
              {newStep.trim() && (
                <button type="button" className="btn btn--quiet" onClick={addStep}>
                  Add step
                </button>
              )}
            </div>
          )}
          {task.steps.length === 0 && (
            <p className="hint" style={{ marginTop: "0.5rem" }}>
              {readOnly ? "No steps." : "Big task? Start with a two-minute step."}
            </p>
          )}
        </div>

        {!(readOnly && task.notes === "") && (
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
          </div>
        )}
      </fieldset>
    </Sheet>
  );
}

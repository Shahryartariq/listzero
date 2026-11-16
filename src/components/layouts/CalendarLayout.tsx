import { useMemo, useState, type FormEvent } from "react";
import { addDays, addMonths, fromDay, weekday } from "../../lib/dates";
import type { Task } from "../../lib/types";
import { useStore, type AddDefaults } from "../../state/store-context";
import { useOpenTask } from "../../state/useOpenTask";
import { Icon } from "../Icon";
import { whereItWent } from "../QuickAdd";
import { TaskRows } from "../TaskRow";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const weekdayName = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const monthOnly = new Intl.DateTimeFormat("en-GB", { month: "long" });

/** How many task names fit in a day cell before "+N more". */
const PER_DAY = 3;

interface CalendarProps {
  tasks: Task[];
  /** What the view gives a new task (its list, say). The chosen day is added to it. */
  defaults?: AddDefaults;
  staysHere?(task: Task): boolean;
}

/** A month of tasks on their days. Drag a task to another day to move it, or add one to the chosen day. */
export function CalendarLayout({ tasks, defaults, staysHere }: CalendarProps) {
  const store = useStore();
  const [draft, setDraft] = useState("");
  const open = useOpenTask();
  const today = store.today;
  const [month, setMonth] = useState(() => `${today.slice(0, 7)}-01`);
  const [selected, setSelected] = useState(today);
  const [over, setOver] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due) continue;
      const list = map.get(t.due);
      if (list) list.push(t);
      else map.set(t.due, [t]);
    }
    return map;
  }, [tasks]);
  const undated = tasks.filter((t) => t.due === null);

  // Weeks start on Monday. Show whole weeks that cover the month.
  const lead = (weekday(month) + 6) % 7;
  const daysInMonth = fromDay(addDays(addMonths(month, 1), -1)).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const start = addDays(month, -lead);
  const inMonth = (day: string) => day.slice(0, 7) === month.slice(0, 7);

  const go = (delta: number) => setMonth((m) => addMonths(m, delta));
  const onDay = byDay.get(selected) ?? [];
  const selectedName = longDay.format(fromDay(selected));

  const addOnDay = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    // A day typed in the task ("friday") still wins over the chosen one.
    const [task] = store.addFromText([draft], { ...defaults, due: selected });
    setDraft("");
    if (!task) return;
    if (task.due && task.due !== selected) {
      // Follow the task so it does not seem to vanish.
      setSelected(task.due);
      setMonth(`${task.due.slice(0, 7)}-01`);
    }
    if (staysHere && !staysHere(task)) store.notify(`Added to ${whereItWent(task, today, store.data.lists)}.`);
  };

  return (
    <div className="cal">
      <div className="cal__bar">
        <h2 className="cal__month" aria-live="polite">
          {monthName.format(fromDay(month))}
        </h2>
        <div className="cal__nav">
          <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label="Previous month">
            <Icon name="chevronLeft" />
          </button>
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={() => {
              setMonth(`${today.slice(0, 7)}-01`);
              setSelected(today);
            }}
          >
            This month
          </button>
          <button type="button" className="icon-btn" onClick={() => go(1)} aria-label="Next month">
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>

      <table className="cal__grid">
        <thead>
          <tr>
            {WEEKDAYS.map((name) => (
              <th key={name} scope="col" abbr={name}>
                {name.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: weeks }, (_, w) => (
            <tr key={w}>
              {Array.from({ length: 7 }, (_, d) => {
                const day = addDays(start, w * 7 + d);
                const list = byDay.get(day) ?? [];
                const date = fromDay(day);
                return (
                  <td
                    key={day}
                    data-day={day}
                    data-outside={!inMonth(day)}
                    data-today={day === today}
                    data-selected={day === selected}
                    data-over={day === over}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (over !== day) setOver(day);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOver(null);
                      const task = tasks.find((t) => t.id === e.dataTransfer.getData("text/plain"));
                      if (task && task.due !== day) {
                        store.setDue([task.id], day, `Moved to ${longDay.format(fromDay(day))}.`);
                        setSelected(day);
                      }
                    }}
                  >
                    {/* The name is read as "Monday 16 November, 2 tasks"; only the number, and on phones the count, show. */}
                    <button
                      type="button"
                      className="cal__day"
                      aria-pressed={day === selected}
                      onClick={() => setSelected(day)}
                    >
                      <span className="sr-only">{weekdayName.format(date)} </span>
                      <span className="cal__num">{date.getDate()}</span>
                      <span className="sr-only"> {monthOnly.format(date)}, </span>
                      <span className={list.length > 0 ? "cal__count" : "sr-only"}>{list.length}</span>
                      <span className="sr-only"> {list.length === 1 ? "task" : "tasks"}</span>
                    </button>
                    {list.length > 0 && (
                      <ul className="cal__tasks">
                        {list.slice(0, PER_DAY).map((task) => (
                          <li key={task.id}>
                            <button
                              type="button"
                              className="cal__task"
                              draggable
                              data-color={task.color ?? undefined}
                              data-cal-task={task.id}
                              title={task.title}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", task.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => setOver(null)}
                              onClick={() => open(task.id)}
                            >
                              {task.title}
                            </button>
                          </li>
                        ))}
                        {list.length > PER_DAY && <li className="cal__more">+{list.length - PER_DAY} more</li>}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="section" aria-labelledby="cal-day-title">
        <div className="section__head">
          <h2 className="section__title" id="cal-day-title">
            {selected === today ? "Today, " : ""}
            {longDay.format(fromDay(selected))}
          </h2>
          <p className="section__note">
            {onDay.length} {onDay.length === 1 ? "task" : "tasks"}
          </p>
        </div>
        <TaskRows tasks={onDay} showDay={false} />
        {onDay.length === 0 && <p className="hint cal__empty">Nothing on this day.</p>}
        <form className="cal__add" onSubmit={addOnDay}>
          <label className="sr-only" htmlFor="cal-add">
            Add a task on {selectedName}
          </label>
          <input
            id="cal-add"
            className="field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Add a task on ${selectedName}`}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={600}
          />
          <button type="submit" className="btn btn--quiet" disabled={!draft.trim()}>
            Add to this day
          </button>
        </form>
      </section>

      {undated.length > 0 && (
        <section className="section" aria-labelledby="cal-undated-title">
          <div className="section__head">
            <h2 className="section__title" id="cal-undated-title">
              No day yet
            </h2>
            <p className="section__note">
              {undated.length} {undated.length === 1 ? "task" : "tasks"}
            </p>
          </div>
          <TaskRows tasks={undated} showDay={false} />
        </section>
      )}
    </div>
  );
}

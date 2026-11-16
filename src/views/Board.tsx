import { useState, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { QuickAdd } from "../components/QuickAdd";
import { Zero } from "../components/TaskRow";
import { describeDay, describeMinutes } from "../lib/dates";
import { boardView, nextStep, type BoardColumn, type BoardScope } from "../lib/store";
import type { Task } from "../lib/types";
import { useStore, type AddDefaults } from "../state/store-context";
import { useOpenTask } from "../state/useOpenTask";
import { usePageTitle } from "../state/usePageTitle";

const COLUMNS: { id: BoardColumn; title: string; empty: string }[] = [
  { id: "todo", title: "To do", empty: "Nothing waiting." },
  { id: "doing", title: "Doing", empty: "Press Start on a task, or drag one here." },
  { id: "done", title: "Done today", empty: "Finished tasks land here." },
];

/** More than this in Doing and the board says so. It never blocks. */
const DOING_LIMIT = 3;

export function Board() {
  const store = useStore();
  const open = useOpenTask();
  const [params, setParams] = useSearchParams();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<BoardColumn | null>(null);
  const [shown, setShown] = useState<BoardColumn>("todo");
  usePageTitle("Board");

  const wanted = params.get("in") ?? "today";
  const list = store.data.lists.find((l) => l.id === wanted);
  const scope: BoardScope = wanted === "inbox" || wanted === "all" || list ? wanted : "today";
  const view = boardView(store.data, scope, store.today, store.dayOf);

  const defaults: AddDefaults = scope === "today" ? { due: store.today } : list ? { listId: list.id } : {};
  const staysHere = (t: Task) =>
    scope === "all" ||
    (scope === "inbox" && t.listId === null) ||
    (scope === "today" && t.due !== null && t.due <= store.today) ||
    t.listId === scope;

  const columnOf = (t: Task): BoardColumn => (t.completedAt !== null ? "done" : t.doing ? "doing" : "todo");

  const move = (task: Task, to: BoardColumn) => {
    const from = columnOf(task);
    if (from === to) return;
    if (to === "done") {
      store.toggleTask(task.id);
      return;
    }
    if (from === "done") store.toggleTask(task.id);
    // On today's board a reopened task has to be for today, or it would vanish from the board.
    const pullIn = scope === "today" && (task.due === null || task.due > store.today);
    store.updateTask(task.id, pullIn ? { doing: to === "doing", due: store.today } : { doing: to === "doing" });
  };

  const onDrop = (e: DragEvent, to: BoardColumn) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragging;
    const task = store.data.tasks.find((t) => t.id === id);
    setDragging(null);
    setOver(null);
    if (task) move(task, to);
  };

  return (
    <div className="view view--wide">
      <header className="head">
        <div>
          <h1 className="title">Board</h1>
          <p className="subtitle">Move a task along as you work on it.</p>
        </div>
        <div>
          <label className="sr-only" htmlFor="board-scope">
            Show tasks from
          </label>
          <select
            id="board-scope"
            className="field"
            value={scope}
            onChange={(e) => setParams(e.target.value === "today" ? {} : { in: e.target.value }, { replace: true })}
          >
            <option value="today">Today</option>
            <option value="inbox">Inbox</option>
            {store.data.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="all">Everything open</option>
          </select>
        </div>
      </header>

      <div className="board__add">
        <QuickAdd defaults={defaults} staysHere={staysHere} />
      </div>

      <div className="seg board__tabs" role="tablist" aria-label="Column">
        {COLUMNS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            className="seg__opt"
            aria-selected={shown === c.id}
            aria-controls={`column-${c.id}`}
            onClick={() => setShown(c.id)}
          >
            {c.title} <span className="board__tab-count">{view[c.id].length}</span>
          </button>
        ))}
      </div>

      <div className="board">
        {COLUMNS.map((column) => {
          const tasks = view[column.id];
          return (
            <section
              key={column.id}
              id={`column-${column.id}`}
              className="column"
              aria-labelledby={`column-${column.id}-title`}
              data-column={column.id}
              data-active={shown === column.id}
              data-over={over === column.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== column.id) setOver(column.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => onDrop(e, column.id)}
            >
              <div className="column__head">
                <h2 id={`column-${column.id}-title`}>{column.title}</h2>
                <span className="column__count">
                  {tasks.length}
                  <span className="sr-only"> {tasks.length === 1 ? "task" : "tasks"}</span>
                </span>
              </div>

              {column.id === "doing" && tasks.length > DOING_LIMIT && (
                <p className="column__note">{tasks.length} at once is a lot to hold. Finish one, or move one back.</p>
              )}

              {tasks.length === 0 ? (
                <p className="column__empty">{column.empty}</p>
              ) : (
                <ul className="cards">
                  {tasks.map((task) => {
                    const done = task.completedAt !== null;
                    const next = done ? null : nextStep(task);
                    return (
                      <li
                        key={task.id}
                        className="card"
                        draggable
                        data-task={task.id}
                        data-color={task.color ?? undefined}
                        data-done={done}
                        data-dragging={dragging === task.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(task.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                      >
                        <div className="card__top">
                          <Zero
                            checked={done}
                            priority={done ? 0 : task.priority}
                            label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
                            onToggle={() => store.toggleTask(task.id)}
                          />
                          <button type="button" className="card__body" data-row onClick={() => open(task.id)}>
                            <span className="row__title">{task.title}</span>
                            <span className="row__meta">
                              {next && <span className="meta meta--next">Next: {next}</span>}
                              {scope !== "today" && !done && task.due && (
                                <span className="meta">
                                  <Icon name="calendar" size={15} />
                                  {describeDay(task.due, store.today)}
                                </span>
                              )}
                              {!done && task.estimate !== null && (
                                <span className="meta">
                                  <Icon name="clock" size={15} />
                                  {describeMinutes(task.estimate)}
                                </span>
                              )}
                            </span>
                          </button>
                        </div>
                        <div className="card__actions">
                          {column.id === "todo" && (
                            <button
                              type="button"
                              className="btn btn--quiet btn--small"
                              aria-label={`Start “${task.title}”`}
                              onClick={() => move(task, "doing")}
                            >
                              Start
                            </button>
                          )}
                          {column.id === "doing" && (
                            <>
                              <button
                                type="button"
                                className="btn btn--small"
                                aria-label={`Done with “${task.title}”`}
                                onClick={() => move(task, "done")}
                              >
                                Done
                              </button>
                              <button
                                type="button"
                                className="btn btn--quiet btn--small"
                                aria-label={`Not yet: move “${task.title}” back to To do`}
                                onClick={() => move(task, "todo")}
                              >
                                Not yet
                              </button>
                            </>
                          )}
                          {column.id === "done" && (
                            <button
                              type="button"
                              className="btn btn--quiet btn--small"
                              aria-label={`Reopen “${task.title}”`}
                              onClick={() => move(task, "todo")}
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="hint board__foot">
        Drag cards between columns, or use the buttons on each card. Older finished tasks are in{" "}
        <Link to="/done">Done</Link>.
      </p>
    </div>
  );
}

import { describeDay, describeMinutes, describeTime } from "../../lib/dates";
import type { Sort } from "../../lib/display";
import { nextStep } from "../../lib/store";
import { PRIORITY_LABEL, type Task } from "../../lib/types";
import { useStore } from "../../state/store-context";
import { useOpenTask } from "../../state/useOpenTask";
import { Zero } from "../TaskRow";

type Column = "task" | "day" | "priority" | "length" | "list";

const COLUMNS: { id: Column; label: string; sort?: Exclude<Sort, "smart"> }[] = [
  { id: "task", label: "Task", sort: "name" },
  { id: "day", label: "Day", sort: "day" },
  { id: "priority", label: "Priority", sort: "priority" },
  { id: "length", label: "Length", sort: "length" },
  { id: "list", label: "List" },
];

/** An unset value: blank to the eye, named for screen readers. */
const Unset = ({ label }: { label: string }) => <span className="sr-only">{label}</span>;

interface TableLayoutProps {
  tasks: Task[];
  sort: Sort;
  onSort(sort: Sort): void;
}

/** Every detail in columns. Click a column heading to sort by it; click again to go back to the suggested order. */
export function TableLayout({ tasks, sort, onSort }: TableLayoutProps) {
  const store = useStore();
  const open = useOpenTask();
  // A column that would say "None" on every row says nothing, so it is left out.
  const shown = new Set<Column>(["task", "day"]);
  if (tasks.some((t) => t.priority > 0)) shown.add("priority");
  if (tasks.some((t) => t.estimate !== null)) shown.add("length");
  if (tasks.some((t) => t.listId !== null)) shown.add("list");
  const columns = COLUMNS.filter((c) => shown.has(c.id));

  return (
    <div className="table-scroll" role="region" aria-label="Tasks table" tabIndex={0}>
      <table className="grid">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Done</span>
            </th>
            {columns.map((col) => (
              <th key={col.label} scope="col" aria-sort={col.sort && sort === col.sort ? "ascending" : undefined}>
                {col.sort ? (
                  <button
                    type="button"
                    className="grid__sort"
                    data-on={sort === col.sort}
                    onClick={() => onSort(sort === col.sort ? "smart" : (col.sort as Sort))}
                  >
                    {col.label}
                    <span aria-hidden="true">{sort === col.sort ? " ↑" : ""}</span>
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const list = store.data.lists.find((l) => l.id === task.listId);
            const next = nextStep(task);
            const late = task.due !== null && task.due < store.today;
            return (
              <tr key={task.id} data-task={task.id}>
                <td>
                  <Zero
                    checked={false}
                    priority={task.priority}
                    label={`Mark “${task.title}” as done`}
                    onToggle={() => store.toggleTask(task.id)}
                  />
                </td>
                <th scope="row">
                  <button type="button" className="grid__task" data-row onClick={() => open(task.id)}>
                    <span className="row__title">{task.title}</span>
                    {(task.doing || next) && (
                      <span className="row__meta">
                        {task.doing && <span className="meta meta--doing">Doing</span>}
                        {next && <span className="meta meta--next">Next: {next}</span>}
                      </span>
                    )}
                  </button>
                </th>
                <td className={late ? "grid__late" : undefined}>
                  {task.due ? describeDay(task.due, store.today) : <Unset label="No day" />}
                  {task.time ? `, ${describeTime(task.time)}` : ""}
                </td>
                {shown.has("priority") && (
                  <td className={task.priority ? `meta--p${task.priority}` : undefined}>
                    {task.priority ? PRIORITY_LABEL[task.priority] : <Unset label="No priority" />}
                  </td>
                )}
                {shown.has("length") && (
                  <td>{task.estimate !== null ? describeMinutes(task.estimate) : <Unset label="No length" />}</td>
                )}
                {shown.has("list") && (
                  <td>
                    <span className="meta">
                      {list && <span className="dot" style={{ "--dot": `var(--c-${list.color})` } as React.CSSProperties} />}
                      {list ? list.name : "Inbox"}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

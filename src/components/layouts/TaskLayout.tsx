import { Suspense, lazy } from "react";
import type { Layout, Sort } from "../../lib/display";
import type { Task } from "../../lib/types";
import type { AddDefaults } from "../../state/store-context";
import { TaskRows } from "../TaskRow";

// Each of these is its own download, fetched when its layout is first chosen.
const BoardColumns = lazy(() => import("./BoardColumns").then((m) => ({ default: m.BoardColumns })));
const CalendarLayout = lazy(() => import("./CalendarLayout").then((m) => ({ default: m.CalendarLayout })));
const TableLayout = lazy(() => import("./TableLayout").then((m) => ({ default: m.TableLayout })));

interface TaskLayoutProps {
  layout: Exclude<Layout, "list">;
  /** Open tasks, already filtered and sorted. */
  tasks: Task[];
  /** Tasks finished today that belong to this view, for the board's last column. */
  done: Task[];
  showDay: boolean;
  showList: boolean;
  /** This view is about today, so a task reopened on its board is dated today. */
  aboutToday?: boolean;
  sort: Sort;
  onSort(sort: Sort): void;
  /** What a task added from inside a layout (a calendar day) starts with, and whether it stays in this view. */
  defaults?: AddDefaults;
  staysHere?(task: Task): boolean;
}

/** The layouts other than the plain list, which each view draws itself. */
export function TaskLayout(props: TaskLayoutProps) {
  if (props.layout === "cards") {
    return <TaskRows tasks={props.tasks} showDay={props.showDay} showList={props.showList} cards />;
  }
  return (
    <Suspense fallback={null}>
      <Loaded {...props} />
    </Suspense>
  );
}

function Loaded({ layout, tasks, done, showDay, aboutToday, sort, onSort, defaults, staysHere }: TaskLayoutProps) {
  switch (layout) {
    case "cards":
      return null;
    case "board":
      return (
        <BoardColumns
          todo={tasks.filter((t) => !t.doing)}
          doing={tasks.filter((t) => t.doing)}
          done={done}
          showDay={showDay}
          pullToToday={aboutToday}
        />
      );
    case "calendar":
      return <CalendarLayout tasks={tasks} defaults={defaults} staysHere={staysHere} />;
    case "table":
      return <TableLayout tasks={tasks} sort={sort} onSort={onSort} />;
  }
}

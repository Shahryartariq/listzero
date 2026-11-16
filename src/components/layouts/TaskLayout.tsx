import type { Layout, Sort } from "../../lib/display";
import type { Task } from "../../lib/types";
import { TaskRows } from "../TaskRow";
import { BoardColumns } from "./BoardColumns";
import { CalendarLayout } from "./CalendarLayout";
import { TableLayout } from "./TableLayout";

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
}

/** The layouts other than the plain list, which each view draws itself. */
export function TaskLayout({ layout, tasks, done, showDay, showList, aboutToday, sort, onSort }: TaskLayoutProps) {
  switch (layout) {
    case "cards":
      return <TaskRows tasks={tasks} showDay={showDay} showList={showList} cards />;
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
      return <CalendarLayout tasks={tasks} />;
    case "table":
      return <TableLayout tasks={tasks} sort={sort} onSort={onSort} />;
  }
}

import { Link, useSearchParams } from "react-router";
import { BoardColumns } from "../components/layouts/BoardColumns";
import { QuickAdd } from "../components/QuickAdd";
import { boardView, type BoardScope } from "../lib/store";
import type { Task } from "../lib/types";
import { useStore, type AddDefaults } from "../state/store-context";
import { usePageTitle } from "../state/usePageTitle";

export function Board() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
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

      <BoardColumns
        todo={view.todo}
        doing={view.doing}
        done={view.done}
        showDay={scope !== "today"}
        pullToToday={scope === "today"}
      />

      <p className="hint board__foot">
        Drag cards between columns, or use the buttons on each card. Older finished tasks are in{" "}
        <Link to="/done">Done</Link>.
      </p>
    </div>
  );
}

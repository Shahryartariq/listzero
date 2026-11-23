import { Link, useSearchParams } from "react-router";
import { BoardColumns } from "../components/layouts/BoardColumns";
import { Picker } from "../components/Picker";
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
        <Picker
          label="Show tasks from"
          icon="board"
          value={scope}
          options={[
            { value: "today", label: "Today" },
            { value: "inbox", label: "Inbox" },
            ...store.data.lists.map((l) => ({ value: l.id, label: l.name, dot: `var(--c-${l.color})` })),
            { value: "all", label: "Everything open" },
          ]}
          onChange={(next) => setParams(next === "today" ? {} : { in: next }, { replace: true })}
        />
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

import { useState } from "react";
import { SharedTools } from "../shared/SharedTools";
import type { SharedList } from "../shared/space";
import { useNavigate, useParams } from "react-router";
import { Icon } from "../components/Icon";
import { DisplayMenu, FilterNote } from "../components/DisplayMenu";
import { TaskLayout } from "../components/layouts/TaskLayout";
import { ListSheet } from "../components/ListSheet";
import { QuickAdd } from "../components/QuickAdd";
import { TaskRows } from "../components/TaskRow";
import { addDays, describeDay, describeMinutes } from "../lib/dates";
import { applyDisplay } from "../lib/display";
import { inboxView, listView, totalEstimate, upcomingView } from "../lib/store";
import type { Task } from "../lib/types";
import { useStore, type Store } from "../state/store-context";
import { useDisplay } from "../state/useDisplay";
import { usePageTitle } from "../state/usePageTitle";
import { NotFound } from "./Menu";

/** A plain list reads best as one narrow column; every other layout uses the width of the screen. */
export const wide = (layout: string) => (layout === "list" ? "view" : "view view--wide");

/** Tasks finished today that pass `belongs`, newest first: the board layout's last column. */
function finishedToday(store: Store, belongs: (t: Task) => boolean): Task[] {
  return store.data.tasks
    .filter((t) => t.completedAt !== null && store.dayOf(t.completedAt) === store.today && belongs(t))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

export function Inbox() {
  const store = useStore();
  const { display, set } = useDisplay("inbox");
  const all = inboxView(store.data);
  const tasks = applyDisplay(all, display);
  usePageTitle("Inbox");
  return (
    <div className={wide(display.layout)}>
      <header className="head">
        <div>
          <h1 className="title">Inbox</h1>
          <p className="subtitle">Capture now. Sort later.</p>
        </div>
        <DisplayMenu view="inbox" />
      </header>
      <QuickAdd staysHere={(t) => t.listId === null} />
      <FilterNote view="inbox" shown={tasks.length} total={all.length} />
      {display.layout === "list" ? (
        <TaskRows tasks={tasks} showList={false} onMove={(id, to) => store.moveTask("inbox", tasks, id, to)} />
      ) : (
        <TaskLayout
          layout={display.layout}
          tasks={tasks}
          done={applyDisplay(finishedToday(store, (t) => t.listId === null), { ...display, sort: "smart" })}
          showDay
          showList={false}
          sort={display.sort}
          onSort={(sort) => set({ ...display, sort })}
          staysHere={(t) => t.listId === null}
          onMove={(id, to) => store.moveTask("inbox", tasks, id, to)}
        />
      )}
      {all.length === 0 && (
        <div className="empty">
          <h2 className="empty__title">The Inbox is empty.</h2>
          <p>Tasks without a list land here.</p>
        </div>
      )}
    </div>
  );
}

export function Upcoming() {
  const store = useStore();
  const { display, set } = useDisplay("upcoming");
  const allGroups = upcomingView(store.data, store.today);
  const groups = allGroups
    .map((g) => ({ day: g.day, tasks: applyDisplay(g.tasks, display) }))
    .filter((g) => g.tasks.length > 0);
  const all = allGroups.flatMap((g) => g.tasks);
  const flat = applyDisplay(all, display);
  const tomorrow = addDays(store.today, 1);
  usePageTitle("Upcoming");
  return (
    <div className={wide(display.layout)}>
      <header className="head">
        <div>
          <h1 className="title">Upcoming</h1>
          <p className="subtitle">The days ahead.</p>
        </div>
        <DisplayMenu view="upcoming" byList />
      </header>
      <QuickAdd defaults={{ due: tomorrow }} staysHere={(t) => t.due !== null && t.due > store.today} />
      <FilterNote view="upcoming" shown={flat.length} total={all.length} />
      {display.layout !== "list" && (
        <TaskLayout
          layout={display.layout}
          tasks={flat}
          done={applyDisplay(finishedToday(store, (t) => t.due !== null && t.due > store.today), {
            ...display,
            sort: "smart",
          })}
          showDay
          showList
          sort={display.sort}
          onSort={(sort) => set({ ...display, sort })}
          staysHere={(t) => t.due !== null && t.due > store.today}
        />
      )}
      {all.length === 0 && (
        <div className="empty">
          <h2 className="empty__title">Nothing scheduled ahead.</h2>
          <p>New tasks here go to tomorrow, or the day you type, like “friday”.</p>
        </div>
      )}
      {(display.layout === "list" ? groups : []).map((group) => {
        const minutes = totalEstimate(group.tasks);
        return (
          <section className="section" key={group.day} aria-label={describeDay(group.day, store.today)}>
            <div className="section__head">
              <h2 className="section__title">{describeDay(group.day, store.today)}</h2>
              <p className="section__note">
                {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
                {minutes > 0 ? `, about ${describeMinutes(minutes)}` : ""}
              </p>
            </div>
            <TaskRows
              tasks={group.tasks}
              showDay={false}
              onMove={(id, to) => store.moveTask("upcoming", group.tasks, id, to)}
            />
          </section>
        );
      })}
    </div>
  );
}

/**
 * One list's page. A shared list (`shared`) uses the same page, inside SharedScope, so the tasks
 * shown and changed are that list's, and its header shows who it is shared with.
 */
export function ListView({ listId: given, shared }: { listId?: string; shared?: SharedList }) {
  const store = useStore();
  const navigate = useNavigate();
  const { listId: param = "" } = useParams();
  const listId = given ?? param;
  const [editing, setEditing] = useState(false);
  const viewKey = shared ? `shared:${listId}` : `list:${listId}`;
  const canAdd = shared?.role !== "view";
  const { display, set } = useDisplay(viewKey);
  const list = store.data.lists.find((l) => l.id === listId);
  usePageTitle(list?.name ?? "List not found");
  // A link to a list that is not in this browser: say so instead of quietly showing the Inbox.
  if (!list) return <NotFound list />;
  const all = listView(store.data, list.id);
  const tasks = applyDisplay(all, display);

  return (
    <div className={wide(display.layout)}>
      <header className="head">
        <div className="head__title">
          <span
            className="dot"
            style={{ "--dot": `var(--c-${list.color})`, width: "1rem", height: "1rem" } as React.CSSProperties}
          />
          <h1 className="title">{list.name}</h1>
        </div>
        <div className="head__tools">
          {shared && <SharedTools list={shared} />}
          <DisplayMenu view={viewKey} />
          {!shared && (
            <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="List options">
              <Icon name="more" />
            </button>
          )}
        </div>
      </header>
      {canAdd && <QuickAdd defaults={{ listId: list.id }} staysHere={(t) => t.listId === list.id} />}
      <FilterNote view={viewKey} shown={tasks.length} total={all.length} />
      {display.layout === "list" ? (
        <TaskRows tasks={tasks} showList={false} onMove={(id, to) => store.moveTask(viewKey, tasks, id, to)} />
      ) : (
        <TaskLayout
          layout={display.layout}
          tasks={tasks}
          done={applyDisplay(finishedToday(store, (t) => t.listId === list.id), { ...display, sort: "smart" })}
          showDay
          showList={false}
          sort={display.sort}
          onSort={(sort) => set({ ...display, sort })}
          defaults={{ listId: list.id }}
          staysHere={(t) => t.listId === list.id}
          onMove={(id, to) => store.moveTask(viewKey, tasks, id, to)}
        />
      )}
      {all.length === 0 && (
        <div className="empty">
          <h2 className="empty__title">Nothing open in {list.name}.</h2>
          {shared ? (
            <p>{canAdd ? "Add a task above. Everyone in this list sees it." : "Tasks added here show up for you too."}</p>
          ) : (
            <p>
              Add a task above, or type <span className="code">#{list.name.toLowerCase().replace(/\s+/g, "-")}</span>{" "}
              in any quick add to send it here.
            </p>
          )}
        </div>
      )}
      {editing && !shared && (
        <ListSheet
          list={list}
          taken={store.data.lists.map((l) => l.name)}
          onClose={() => setEditing(false)}
          onSave={(name, color) => store.updateList(list.id, { name, color })}
          onDelete={() => {
            store.deleteList(list.id);
            navigate("/inbox");
          }}
        />
      )}
    </div>
  );
}

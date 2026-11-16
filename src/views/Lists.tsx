import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Icon } from "../components/Icon";
import { ListSheet } from "../components/ListSheet";
import { QuickAdd } from "../components/QuickAdd";
import { TaskRows } from "../components/TaskRow";
import { addDays, describeDay, describeMinutes } from "../lib/dates";
import { inboxView, listView, totalEstimate, upcomingView } from "../lib/store";
import { useStore } from "../state/store-context";
import { usePageTitle } from "../state/usePageTitle";

export function Inbox() {
  const store = useStore();
  const tasks = inboxView(store.data);
  usePageTitle("Inbox");
  return (
    <div className="view">
      <header className="head">
        <div>
          <h1 className="title">Inbox</h1>
          <p className="subtitle">Get it out of your head first. Sort it later.</p>
        </div>
      </header>
      <QuickAdd staysHere={(t) => t.listId === null} />
      <TaskRows tasks={tasks} showList={false} />
      {tasks.length === 0 && (
        <div className="empty">
          <h2 className="empty__title">The Inbox is empty.</h2>
          <p>Anything you add without a list lands here. Paste a whole list and each line becomes a task.</p>
        </div>
      )}
    </div>
  );
}

export function Upcoming() {
  const store = useStore();
  const groups = upcomingView(store.data, store.today);
  const tomorrow = addDays(store.today, 1);
  usePageTitle("Upcoming");
  return (
    <div className="view">
      <header className="head">
        <div>
          <h1 className="title">Upcoming</h1>
          <p className="subtitle">What is coming, one day at a time.</p>
        </div>
      </header>
      <QuickAdd defaults={{ due: tomorrow }} staysHere={(t) => t.due !== null && t.due > store.today} />
      {groups.length === 0 && (
        <div className="empty">
          <h2 className="empty__title">Nothing scheduled ahead.</h2>
          <p>Tasks added here are set for tomorrow unless you type another day, like “friday” or “12 dec”.</p>
        </div>
      )}
      {groups.map((group) => {
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
            <TaskRows tasks={group.tasks} showDay={false} />
          </section>
        );
      })}
    </div>
  );
}

export function ListView() {
  const store = useStore();
  const navigate = useNavigate();
  const { listId = "" } = useParams();
  const [editing, setEditing] = useState(false);
  const list = store.data.lists.find((l) => l.id === listId);
  usePageTitle(list?.name ?? "List");
  if (!list) return <Navigate to="/inbox" replace />;
  const tasks = listView(store.data, list.id);

  return (
    <div className="view">
      <header className="head">
        <div className="head__title">
          <span
            className="dot"
            style={{ "--dot": `var(--c-${list.color})`, width: "1rem", height: "1rem" } as React.CSSProperties}
          />
          <h1 className="title">{list.name}</h1>
        </div>
        <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="List options">
          <Icon name="more" />
        </button>
      </header>
      <QuickAdd defaults={{ listId: list.id }} staysHere={(t) => t.listId === list.id} />
      <TaskRows tasks={tasks} showList={false} />
      {tasks.length === 0 && (
        <div className="empty">
          <h2 className="empty__title">Nothing open in {list.name}.</h2>
          <p>
            Add a task above, or type <span className="code">#{list.name.toLowerCase().replace(/\s+/g, "-")}</span> in
            any quick add to send it here.
          </p>
        </div>
      )}
      {editing && (
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

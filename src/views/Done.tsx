import { useState } from "react";
import { Confirm } from "../components/Sheet";
import { TaskRows } from "../components/TaskRow";
import { describeDay } from "../lib/dates";
import { doneCounts, doneView } from "../lib/store";
import { useStore } from "../state/store-context";
import { usePageTitle } from "../state/usePageTitle";

export function Done() {
  const store = useStore();
  const [confirming, setConfirming] = useState(false);
  const groups = doneView(store.data, store.dayOf);
  const counts = doneCounts(store.data, store.today, store.dayOf);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  usePageTitle("Done");

  return (
    <div className="view">
      <header className="head">
        <div>
          <h1 className="title">Done</h1>
          <p className="subtitle">
            {counts.today} today, {counts.week} in the last 7 days
          </p>
        </div>
        {total > 0 && (
          <button type="button" className="btn btn--quiet btn--small" onClick={() => setConfirming(true)}>
            Clear finished
          </button>
        )}
      </header>
      {total === 0 && (
        <div className="empty">
          <h2 className="empty__title">Nothing finished yet.</h2>
          <p>Finished tasks show up here.</p>
        </div>
      )}
      {groups.map((group) => (
        <section className="section" key={group.day} aria-label={describeDay(group.day, store.today)}>
          <div className="section__head">
            <h2 className="section__title">{describeDay(group.day, store.today)}</h2>
            <p className="section__note">{group.tasks.length} done</p>
          </div>
          <TaskRows tasks={group.tasks} showDay={false} />
        </section>
      ))}
      {confirming && (
        <Confirm
          title="Clear finished tasks?"
          body={`This removes ${total} finished ${total === 1 ? "task" : "tasks"} from Listzero. Open tasks are not touched.`}
          confirmLabel="Clear finished"
          onConfirm={() => store.clearDone()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

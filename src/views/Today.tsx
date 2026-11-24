import { Link } from "react-router";
import { DisplayMenu, FilterNote } from "../components/DisplayMenu";
import { TaskLayout } from "../components/layouts/TaskLayout";
import { QuickAdd } from "../components/QuickAdd";
import { TaskRows } from "../components/TaskRow";
import { addDays, describeMinutes, fromDay } from "../lib/dates";
import { activeFilters, applyDisplay } from "../lib/display";
import { exampleData } from "../lib/examples";
import { useAccountConfig } from "../account/config";
import { doneCounts, todayView, totalEstimate } from "../lib/store";
import { useStore } from "../state/store-context";
import { useDisplay } from "../state/useDisplay";
import { usePageTitle } from "../state/usePageTitle";
import { wide } from "./Lists";

const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

export function Today() {
  const accounts = useAccountConfig()?.accounts === true;
  const store = useStore();
  const { data, today } = store;
  const view = todayView(data, today);
  const left = view.due.length + view.carried.length;
  const planned = totalEstimate([...view.due, ...view.carried]);
  const done = doneCounts(data, today, store.dayOf).today;
  const limit = data.settings.dailyLimit;
  const { display, set } = useDisplay("today");
  const filtering = activeFilters(display.filters) > 0;
  const due = applyDisplay(view.due, display);
  const carried = applyDisplay(view.carried, display);
  // The offer to lighten the day counts every task, so it steps aside while a filter hides some.
  const overflow = filtering ? [] : view.due.slice(limit);
  const tomorrow = addDays(today, 1);
  const firstVisit = data.tasks.length === 0;
  // A first visit (and a search engine) keeps the site's own title; after that the tab says how much is left.
  usePageTitle(firstVisit ? null : left > 0 ? `${left} to zero` : "Today");

  let summary: string;
  if (left > 0) {
    summary = `${left} to zero.`;
    if (done > 0) summary += ` ${done} done.`;
    if (planned > 0) summary += ` About ${describeMinutes(planned)} left.`;
  } else if (done > 0) {
    summary = `Zero. ${done} done today.`;
  } else {
    summary = "Nothing due.";
  }

  return (
    <div className={wide(display.layout)}>
      <header className="zero-head">
        <p className="zero-head__count" data-zero={left === 0} aria-hidden="true">
          {left}
        </p>
        <div className="zero-head__text">
          <h1 className="title">Today</h1>
          <p className="subtitle">{longDay.format(fromDay(today))}</p>
          <p style={{ marginTop: "0.15rem", fontWeight: 600 }}>{summary}</p>
        </div>
        <DisplayMenu view="today" byList />
      </header>

      {done + left > 0 && (
        <div
          className="progress"
          role="progressbar"
          aria-label="Today’s progress"
          aria-valuemin={0}
          aria-valuemax={done + left}
          aria-valuenow={done}
          aria-valuetext={`${done} of ${done + left} done`}
        >
          {done > 0 && (
            <span className="progress__fill" style={{ width: `${Math.round((done / (done + left)) * 100)}%` }} />
          )}
        </div>
      )}

      <QuickAdd defaults={{ due: today }} staysHere={(t) => t.due === today} />

      {firstVisit && (
        <div className="empty">
          <h2 className="empty__title">A clean slate.</h2>
          <p>
            {accounts
              ? "Add your first task above, the way you would say it. No account needed: tasks stay in this browser."
              : "Add your first task above, the way you would say it. Tasks stay in this browser."}
          </p>
          <div className="empty__actions">
            <button
              type="button"
              className="btn"
              onClick={() => store.replaceAll(exampleData(today, Date.now(), data), "Example tasks added.")}
            >
              Load example tasks
            </button>
            <Link to="/about" className="btn btn--quiet">
              How it works
            </Link>
          </div>
        </div>
      )}

      {!firstVisit && left === 0 && (
        <div className="empty">
          <h2 className="empty__title">Today is at zero.</h2>
          <p>Nothing due. Pull one in from the Inbox, or stop here.</p>
          <div className="empty__actions">
            <Link to="/inbox" className="btn btn--quiet">
              Open the Inbox
            </Link>
            <Link to="/upcoming" className="btn btn--quiet">
              See what is coming
            </Link>
          </div>
        </div>
      )}

      <FilterNote view="today" shown={due.length + carried.length} total={left} />

      {display.layout === "list" ? (
        <TaskRows
          tasks={due}
          showDay={false}
          quick="tomorrow"
          onMove={(id, to) => store.moveTask("today", due, id, to)}
        />
      ) : (
        <TaskLayout
          layout={display.layout}
          tasks={applyDisplay([...view.due, ...view.carried], display)}
          done={applyDisplay(
            data.tasks
              .filter((t) => t.completedAt !== null && store.dayOf(t.completedAt) === today)
              .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
            { ...display, sort: "smart" },
          )}
          showDay={view.carried.length > 0}
          showList
          aboutToday
          sort={display.sort}
          onSort={(sort) => set({ ...display, sort })}
          staysHere={(t) => t.due !== null && t.due <= today}
          onMove={(id, to) =>
            store.moveTask("today", applyDisplay([...view.due, ...view.carried], display), id, to)
          }
        />
      )}

      {overflow.length > 0 && (
        <div className="note">
          <p>
            {view.due.length} tasks is a lot for one day. Move {overflow.length} to tomorrow?
          </p>
          <button
            type="button"
            className="btn btn--small"
            onClick={() =>
              store.setDue(
                overflow.map((t) => t.id),
                tomorrow,
                `Moved ${overflow.length} to tomorrow.`,
              )
            }
          >
            Move {overflow.length} to tomorrow
          </button>
        </div>
      )}

      {display.layout === "list" && carried.length > 0 && (
        <section className="section" aria-labelledby="carried-title">
          <div className="section__head">
            <h2 className="section__title" id="carried-title">
              Carried over
            </h2>
            <p className="section__note">
              {carried.length} from earlier days.
            </p>
          </div>
          <TaskRows tasks={carried} quick="today" onMove={(id, to) => store.moveTask("today", carried, id, to)} />
          <div className="section__actions">
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() =>
                store.setDue(
                  carried.map((t) => t.id),
                  today,
                  "Moved to today.",
                )
              }
            >
              Move all to today
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() =>
                store.setDue(
                  carried.map((t) => t.id),
                  tomorrow,
                  "Moved to tomorrow.",
                )
              }
            >
              Move all to tomorrow
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() =>
                store.setDue(
                  carried.map((t) => t.id),
                  null,
                  "Dates removed.",
                )
              }
            >
              Remove their dates
            </button>
          </div>
        </section>
      )}

      {left > 0 && (
        <div className="section__actions" style={{ marginTop: "2rem" }}>
          <Link to="/focus" className="btn">
            Start with one task
          </Link>
        </div>
      )}
    </div>
  );
}

import { Link } from "react-router";
import { QuickAdd } from "../components/QuickAdd";
import { TaskRows } from "../components/TaskRow";
import { addDays, describeMinutes, fromDay } from "../lib/dates";
import { exampleData } from "../lib/examples";
import { doneCounts, todayView, totalEstimate } from "../lib/store";
import { useStore } from "../state/store-context";
import { usePageTitle } from "../state/usePageTitle";

const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

export function Today() {
  const store = useStore();
  const { data, today } = store;
  const view = todayView(data, today);
  const left = view.due.length + view.carried.length;
  const planned = totalEstimate([...view.due, ...view.carried]);
  const done = doneCounts(data, today, store.dayOf).today;
  const limit = data.settings.dailyLimit;
  const overflow = view.due.slice(limit);
  const tomorrow = addDays(today, 1);
  const firstVisit = data.tasks.length === 0;
  usePageTitle(left > 0 ? `${left} to zero` : "Today");

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
    <div className="view">
      <header className="zero-head">
        <p className="zero-head__count" data-zero={left === 0} aria-hidden="true">
          {left}
        </p>
        <div className="zero-head__text">
          <h1 className="title">Today</h1>
          <p className="subtitle">{longDay.format(fromDay(today))}</p>
          <p style={{ marginTop: "0.15rem", fontWeight: 600 }}>{summary}</p>
        </div>
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
            Add your first task above. Your tasks stay in this browser: there is no account, and nothing is sent
            anywhere.
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
          <p>Nothing is due. Pull something in from the Inbox, or stop here. Stopping counts.</p>
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

      <TaskRows tasks={view.due} showDay={false} quick="tomorrow" />

      {overflow.length > 0 && (
        <div className="note">
          <p>
            {view.due.length} tasks is a lot for one day. Keep the top {limit} and move the other {overflow.length} to
            tomorrow?
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

      {view.carried.length > 0 && (
        <section className="section" aria-labelledby="carried-title">
          <div className="section__head">
            <h2 className="section__title" id="carried-title">
              Carried over
            </h2>
            <p className="section__note">
              {view.carried.length} from earlier days. It happens.
            </p>
          </div>
          <TaskRows tasks={view.carried} quick="today" />
          <div className="section__actions">
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() =>
                store.setDue(
                  view.carried.map((t) => t.id),
                  today,
                  "Moved to today.",
                )
              }
            >
              Move all to today
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() =>
                store.setDue(
                  view.carried.map((t) => t.id),
                  tomorrow,
                  "Moved to tomorrow.",
                )
              }
            >
              Move all to tomorrow
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() =>
                store.setDue(
                  view.carried.map((t) => t.id),
                  null,
                  "Dates removed. They are still in their lists.",
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
          <Link to="/focus" className="btn btn--mark">
            Start with one task
          </Link>
        </div>
      )}
    </div>
  );
}

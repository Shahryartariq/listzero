/**
 * The front page: what Listzero is, and the two ways in (as a guest, or with an account).
 * Someone already signed in here goes straight to Today.
 */
import { useState } from "react";
import { Link, Navigate } from "react-router";
import { useAccountConfig } from "../account/config";
import { Zero } from "../components/TaskRow";
import { usePageTitle } from "../state/usePageTitle";
import { useStore } from "../state/store-context";

const DEMO = ["Reply to Sara about Friday", "Pay the electricity bill", "20 minutes on the report"];
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** A small working Today: tick the three tasks and watch the count reach zero. Nothing is saved. */
function Demo() {
  const [done, setDone] = useState<boolean[]>(() => DEMO.map(() => false));
  const left = done.filter((d) => !d).length;
  return (
    <section className="demo" aria-label="Try it: tick off today's tasks">
      <header className="zero-head demo__head">
        <p className="zero-head__count" data-zero={left === 0} aria-hidden="true">
          {left}
        </p>
        <div className="zero-head__text">
          <p className="title">Today</p>
          <p className="subtitle">{longDay.format(new Date())}</p>
          <p className="demo__left" role="status">
            {left === 0 ? "Today is at zero." : `${left} to zero.`}
          </p>
        </div>
      </header>
      <ul className="rows demo__list">
        {DEMO.map((title, i) => (
          <li key={title} className="row" data-done={done[i]}>
            <Zero
              checked={done[i] ?? false}
              label={done[i] ? `Mark “${title}” as not done` : `Mark “${title}” as done`}
              onToggle={() => setDone((all) => all.map((d, j) => (j === i ? !d : d)))}
            />
            <span className="row__body demo__body">
              <span className="row__title">{title}</span>
            </span>
          </li>
        ))}
      </ul>
      {left === 0 && (
        <button type="button" className="link demo__again" onClick={() => setDone(DEMO.map(() => false))}>
          Start the demo again
        </button>
      )}
    </section>
  );
}

function GoogleStart() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="btn btn--quiet"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          // The account code loads only for people who use it.
          const [{ authClient }, { authMessage }] = await Promise.all([import("../account/client"), import("../account/messages")]);
          const { error: failed } = await authClient.signIn.social({
            provider: "google",
            callbackURL: "/verify-email?next=%2Ftoday",
            errorCallbackURL: "/sign-in",
          });
          if (failed) {
            setError(authMessage(failed));
            setBusy(false);
          }
        }}
      >
        <svg className="google-mark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function Landing() {
  usePageTitle(null);
  const store = useStore();
  const config = useAccountConfig();
  const accounts = config?.accounts === true;

  if (store.workspace.kind === "account") return <Navigate to="/today" replace />;

  const open = store.data.tasks.filter((t) => t.completedAt === null).length;
  const returning = store.data.tasks.length > 0 || store.data.lists.length > 0;

  return (
    <div className="landing">
      <div className="landing__hero">
        <div className="landing__pitch">
          <h1 className="landing__title">Get today to zero.</h1>
          <p className="landing__lead">
            A free to-do list for busy minds. Type tasks the way you would say them, see one day at a time, and clear
            it.
          </p>
          <div className="landing__actions">
            <Link className="btn" to="/today">
              {returning ? "Continue as a guest" : "Start as a guest"}
            </Link>
            {accounts && config?.google && <GoogleStart />}
          </div>
          {accounts && (
            <p className="landing__links">
              <Link to="/sign-in">Sign in with email</Link>
              <Link to="/sign-up">Create an account</Link>
            </p>
          )}
          <p className="landing__note">
            {returning
              ? `As a guest you have ${open === 1 ? "1 open task" : `${open} open tasks`} in this browser.`
              : "As a guest, your tasks stay in this browser."}{" "}
            {accounts ? "Sign in to keep them on all your devices." : "Save a backup from Settings to move them."}
          </p>
        </div>
        <Demo />
      </div>

      <ul className="landing__facts">
        <li>
          <strong>Type it the way you would say it.</strong> “Pay rent friday 9am p1” becomes a task due Friday at 9, with high
          priority.
        </li>
        <li>
          <strong>One day at a time.</strong> Today shows what is due and nothing else. The rest waits in Upcoming.
        </li>
        <li>
          <strong>Free and private.</strong> No ads, nothing you write is tracked, and it works offline.
        </li>
      </ul>

      <footer className="landing__foot">
        <Link to="/about">How it works</Link>
        <Link to="/about#privacy">Privacy</Link>
        <a href="https://github.com/Shahryartariq/listzero">Source on GitHub</a>
      </footer>
    </div>
  );
}

import { Link, useOutletContext } from "react-router";
import { NavItems } from "../components/Shell";
import { usePageTitle } from "../state/usePageTitle";

export function About() {
  usePageTitle("How it works");
  return (
    <div className="view prose">
      <h1 className="title">How Listzero works</h1>
      <p className="lede">
        Listzero is a to-do list for minds that get overwhelmed by to-do lists. It asks one thing of each day: get
        Today to zero, by doing a task, moving it, or letting it go.
      </p>

      <h2>Capture first</h2>
      <p>
        Type a task the way you would say it and press Enter. Listzero reads the day, time, list, priority and
        length out of the sentence and shows what it understood as yellow chips. If it guessed wrong, close the chip
        and the words stay in the task name.
      </p>
      <table className="table">
        <tbody>
          <tr>
            <th scope="row">Day</th>
            <td>
              <span className="code">today</span> <span className="code">tomorrow</span>{" "}
              <span className="code">friday</span> <span className="code">next week</span>{" "}
              <span className="code">in 3 days</span> <span className="code">12 dec</span>
            </td>
          </tr>
          <tr>
            <th scope="row">Time</th>
            <td>
              <span className="code">9am</span> <span className="code">5:30pm</span>{" "}
              <span className="code">17:00</span> <span className="code">noon</span>
            </td>
          </tr>
          <tr>
            <th scope="row">Repeat</th>
            <td>
              <span className="code">every day</span> <span className="code">every weekday</span>{" "}
              <span className="code">every monday</span> <span className="code">monthly</span>
            </td>
          </tr>
          <tr>
            <th scope="row">List</th>
            <td>
              <span className="code">#work</span> (a new name creates the list)
            </td>
          </tr>
          <tr>
            <th scope="row">Priority</th>
            <td>
              <span className="code">p1</span> <span className="code">p2</span> <span className="code">p3</span>
            </td>
          </tr>
          <tr>
            <th scope="row">How long it takes</th>
            <td>
              <span className="code">15m</span> <span className="code">1h</span>{" "}
              <span className="code">1h 30m</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p>Paste several lines at once and each line becomes its own task.</p>

      <h2>One day at a time</h2>
      <ul>
        <li>
          <strong>Today</strong> shows a single number: how many tasks are between you and zero.
        </li>
        <li>
          When a day holds more than a full day’s worth, Listzero offers to move the rest to tomorrow. You set what a
          full day is in <Link to="/settings">Settings</Link>.
        </li>
        <li>
          Tasks from earlier days show up as <strong>Carried over</strong>, with one button to move them or drop
          their dates. Nothing turns red.
        </li>
      </ul>

      <h2>Getting started on a task</h2>
      <ul>
        <li>
          Add <strong>steps</strong> to a big task. The row then shows only the next step.
        </li>
        <li>
          <strong>Focus</strong> puts one task on the screen and hides the rest. “Just 2 minutes” starts a short
          timer, because starting is usually the hard part.
        </li>
        <li>
          The <strong>Board</strong> shows tasks as cards in three columns: To do, Doing and Done today. Press
          Start, or drag a card. Keeping only a few in Doing makes them easier to finish.
        </li>
        <li>
          Give a task a <strong>colour</strong> in its sheet to tell kinds of work apart at a glance.
        </li>
        <li>
          <strong>Done</strong> keeps what you finished, so a slow day still shows what you did.
        </li>
      </ul>

      <h2>Make it yours</h2>
      <ul>
        <li>
          <strong>Appearance</strong> has six calm colours, each with a light and a dark side, and a larger text
          size. None use pure white or pure black.
        </li>
        <li>
          In <Link to="/settings">Settings</Link> you can show only task names in lists, and turn the small
          animations off.
        </li>
      </ul>

      <h2 id="keys">Keyboard</h2>
      <table className="table">
        <tbody>
          <tr>
            <th scope="row">Add a task</th>
            <td>
              <kbd>Q</kbd> or <kbd>N</kbd>
            </td>
          </tr>
          <tr>
            <th scope="row">Search</th>
            <td>
              <kbd>/</kbd>
            </td>
          </tr>
          <tr>
            <th scope="row">Move between tasks</th>
            <td>
              <kbd>J</kbd> and <kbd>K</kbd>
            </td>
          </tr>
          <tr>
            <th scope="row">Finish the selected task</th>
            <td>
              <kbd>X</kbd>
            </td>
          </tr>
          <tr>
            <th scope="row">Open the selected task</th>
            <td>
              <kbd>Enter</kbd>
            </td>
          </tr>
          <tr>
            <th scope="row">Go to Inbox, Today, Upcoming, Board, Done, Focus</th>
            <td>
              <kbd>G</kbd> then <kbd>I</kbd> <kbd>T</kbd> <kbd>U</kbd> <kbd>B</kbd> <kbd>D</kbd> <kbd>F</kbd>
            </td>
          </tr>
          <tr>
            <th scope="row">This page</th>
            <td>
              <kbd>?</kbd>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Your data</h2>
      <p>
        Listzero is free and has no accounts. Your tasks are saved in this browser on this device and are never sent
        to a server. It works offline, and you can install it from your browser’s menu.
      </p>
      <p>
        The trade-off: tasks do not sync between devices, and clearing your browser data clears them. Save a backup
        file from <Link to="/settings">Settings</Link> now and then, and load it wherever you need it.
      </p>

      <h2>What it does not do</h2>
      <ul>
        <li>No reminders or notifications. Times are shown on the task, but nothing rings.</li>
        <li>No sharing or team features.</li>
        <li>No streaks, points or badges.</li>
      </ul>

      <h2>Who made it</h2>
      <p>
        Listzero is built by <a href="https://github.com/Shahryartariq">Muhammad Shehryar</a>. The code is open on{" "}
        <a href="https://github.com/Shahryartariq/listzero">GitHub</a>.
      </p>
    </div>
  );
}

/** The phone's "Menu" tab: everything the sidebar holds on larger screens. */
export function Menu() {
  const { openNewList, openAppearance } = useOutletContext<{ openNewList(): void; openAppearance(): void }>();
  usePageTitle("Menu");
  return (
    <div className="view">
      <header className="head">
        <h1 className="title">Menu</h1>
      </header>
      <div style={{ display: "grid", gap: "1.5rem" }}>
        <NavItems onNewList={openNewList} onAppearance={openAppearance} />
      </div>
    </div>
  );
}

export function NotFound() {
  usePageTitle("Page not found");
  return (
    <div className="view">
      <div className="empty" style={{ paddingTop: 0 }}>
        <h1 className="empty__title">This page does not exist.</h1>
        <p>The address may be mistyped, or the list it pointed to was deleted.</p>
        <div className="empty__actions">
          <Link to="/today" className="btn">
            Go to Today
          </Link>
        </div>
      </div>
    </div>
  );
}

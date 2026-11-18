import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useAccountConfig } from "../account/config";
import { usePageTitle } from "../state/usePageTitle";

export function About() {
  const { hash } = useLocation();
  usePageTitle("How it works");
  // Whether this copy of Listzero offers accounts; the text below says only what is true here.
  const accounts = useAccountConfig()?.accounts === true;

  // A link such as /about#privacy lands on that section.
  useEffect(() => {
    if (hash.length > 1) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

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
          <strong>Display</strong>, at the top of Inbox, Today, Upcoming and every list, changes how that view
          looks: a list, cards, a board, a calendar or a table. It also sorts the tasks and can show only some of
          them, for example only high priority or only quick ones. Filters hide tasks, they never delete them, and
          Reset puts everything back.
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
            <th scope="row">Go to Inbox, Today, Upcoming, Board, Done, Focus, Settings</th>
            <td>
              <kbd>G</kbd> then <kbd>I</kbd> <kbd>T</kbd> <kbd>U</kbd> <kbd>B</kbd> <kbd>D</kbd> <kbd>F</kbd>{" "}
              <kbd>S</kbd>
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

      <h2 id="your-data">Your data</h2>
      {accounts ? (
        <>
          <p>
            Listzero is free and works without an account. Without one, your tasks are saved in this browser on this
            device and are never sent to a server. It works offline, and you can install it from your browser’s
            menu.
          </p>
          <p>
            The trade-off without an account: tasks do not sync between devices, and clearing your browser data
            clears them. Save a backup file from <Link to="/settings">Settings</Link> now and then, or sign in.
          </p>
          <p>
            <Link to="/sign-in">Signing in</Link> is optional. With an account, your tasks and lists are also kept on
            Listzero’s server, so they are the same on every device you sign in on. Changes made offline are sent
            when you are back online. Appearance and other settings stay on each device.
          </p>
        </>
      ) : (
        <>
          <p>
            Listzero is free and has no accounts. Your tasks are saved in this browser on this device and are never
            sent to a server. It works offline, and you can install it from your browser’s menu.
          </p>
          <p>
            The trade-off: tasks do not sync between devices, and clearing your browser data clears them. Save a
            backup file from <Link to="/settings">Settings</Link> now and then, and load it wherever you need it.
          </p>
        </>
      )}

      <h2 id="privacy">Privacy</h2>
      <p>
        The public site at listzero.vercel.app counts visits with Google Analytics, so its maker can see whether
        anyone uses it. It records which screen was opened (for example “Today” or “a list”) and the usual browser
        details Google collects: rough location, device and browser type. It uses cookies to tell a returning
        visitor from a new one.
      </p>
      <p>
        It never sends your task names, notes, steps, list names or search words. Addresses are replaced with fixed
        ones before anything is sent, so even a list’s name in the page title stays here. Advertising features are
        off.
      </p>
      <p>
        You can turn the counting off in <Link to="/settings">Settings</Link>. It is also off when your browser
        sends “Do Not Track” or “Global Privacy Control”, and it never runs on a copy of Listzero you host yourself.
      </p>

      {accounts && (
        <p>
          If you create an account, the server stores your email, name, username, a scrambled form of your password
          that cannot be read back, and your tasks and lists. They are used to sign you in and to sync, and for
          nothing else. Emails that confirm your address or reset a password are sent through Gmail. You can delete
          the account, and everything stored with it, from the Account page.
        </p>
      )}

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

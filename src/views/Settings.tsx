import { useRef, useState } from "react";
import { Link } from "react-router";
import { Appearance } from "../components/Appearance";
import { Icon } from "../components/Icon";
import { Confirm } from "../components/Sheet";
import { useAccountConfig } from "../account/config";
import { browserObjects } from "../lib/analytics";
import { parseBackup, serialize } from "../lib/backup";
import { downloadText } from "../lib/download";
import { exampleData } from "../lib/examples";
import { emptyData, type AppData } from "../lib/types";
import { useStore } from "../state/store-context";
import { usePageTitle } from "../state/usePageTitle";

export function Settings() {
  const accounts = useAccountConfig()?.accounts === true;
  const store = useStore();
  const { settings } = store.data;
  const file = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  // With an account signed in, what is on screen is the account's: replacing or deleting it reaches every device.
  const [pendingBackup, setPendingBackup] = useState<AppData | null>(null);
  const inAccount = store.workspace.kind === "account";
  const count = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;
  usePageTitle("Settings");

  const exportBackup = () => {
    downloadText(`listzero-backup-${store.today}.json`, serialize(store.data));
    store.notify("Backup saved to your downloads.");
  };

  const importBackup = async (picked: File | undefined) => {
    if (!picked) return;
    const data = picked.size <= 5_000_000 ? parseBackup(await picked.text()) : null;
    if (!data) {
      store.notify("That file is not a Listzero backup. Nothing was changed.");
      return;
    }
    if (inAccount) setPendingBackup(data);
    else loadBackup(data);
  };

  const loadBackup = (data: AppData) => store.replaceAll(data, `Backup loaded: ${count(data.tasks.length)}.`);

  return (
    <div className="view prose">
      <header className="head">
        <h1 className="title">Settings</h1>
      </header>

      <div className="setting">
        <span className="setting__name">Appearance</span>
        <Appearance />
      </div>

      <div className="setting">
        <span className="setting__name" id="limit-label">
          A full day is
        </span>
        <div className="setting__row">
          <span className="stepper" role="group" aria-labelledby="limit-label">
            <button
              type="button"
              className="icon-btn"
              aria-label="Fewer tasks"
              disabled={settings.dailyLimit <= 1}
              onClick={() => store.updateSettings({ dailyLimit: Math.max(1, settings.dailyLimit - 1) })}
            >
              <Icon name="minus" size={18} />
            </button>
            <output aria-live="polite">
              {settings.dailyLimit} {settings.dailyLimit === 1 ? "task" : "tasks"}
            </output>
            <button
              type="button"
              className="icon-btn"
              aria-label="More tasks"
              disabled={settings.dailyLimit >= 20}
              onClick={() => store.updateSettings({ dailyLimit: Math.min(20, settings.dailyLimit + 1) })}
            >
              <Icon name="plus" size={18} />
            </button>
          </span>
        </div>
        <p className="hint">Past this, Today offers to move the rest to tomorrow.</p>
      </div>

      <div className="setting">
        <span className="setting__name" id="calm-label">
          Motion
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="calm-label">
          <button
            type="button"
            role="radio"
            className="seg__opt"
            aria-checked={!settings.calm}
            onClick={() => store.updateSettings({ calm: false })}
          >
            Small animations
          </button>
          <button
            type="button"
            role="radio"
            className="seg__opt"
            aria-checked={settings.calm}
            onClick={() => store.updateSettings({ calm: true })}
          >
            None
          </button>
        </div>
        <p className="hint">Your device’s “reduce motion” setting is followed too.</p>
      </div>

      <div className="setting">
        <span className="setting__name" id="quiet-label">
          Task rows show
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="quiet-label">
          <button
            type="button"
            role="radio"
            className="seg__opt"
            aria-checked={!settings.quiet}
            onClick={() => store.updateSettings({ quiet: false })}
          >
            Name and details
          </button>
          <button
            type="button"
            role="radio"
            className="seg__opt"
            aria-checked={settings.quiet}
            onClick={() => store.updateSettings({ quiet: true })}
          >
            Name only
          </button>
        </div>
        <p className="hint">
          “Name only” hides dates, lengths and lists. The next step still shows.
        </p>
      </div>

      <div className="setting">
        <span className="setting__name">Your data</span>
        <p className="hint">
          {count(store.data.tasks.length)} {inAccount ? "in your account" : "in this browser"}.{" "}
          {inAccount ? (
            "A backup file is a copy you keep yourself."
          ) : accounts ? (
            <>
              A backup file is a copy you keep yourself. An <Link to="/account">account</Link> keeps your tasks the
              same on every device.
            </>
          ) : (
            "Nothing is stored on a server. To move devices, use a backup file."
          )}
        </p>
        <div className="setting__row">
          <button type="button" className="btn btn--quiet" onClick={exportBackup}>
            Save a backup
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => file.current?.click()}>
            Load a backup
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Backup file"
            onChange={(e) => {
              void importBackup(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() =>
              store.replaceAll(exampleData(store.today, Date.now(), store.data), "Example tasks added.")
            }
          >
            Add example tasks
          </button>
        </div>
        <p className="hint">
          {inAccount
            ? "Loading a backup replaces the tasks in your account, on every device you sign in on. You can undo it right after."
            : "Loading a backup replaces what is here. You can undo it right after."}
        </p>
      </div>

      <div className="setting">
        <span className="setting__name" id="count-label">
          Visit counting
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="count-label">
          <button
            type="button"
            role="radio"
            className="seg__opt"
            aria-checked={settings.analytics}
            onClick={() => store.updateSettings({ analytics: true })}
          >
            On
          </button>
          <button
            type="button"
            role="radio"
            className="seg__opt"
            aria-checked={!settings.analytics}
            onClick={() => store.updateSettings({ analytics: false })}
          >
            Off
          </button>
        </div>
        <p className="hint">
          Counts which screens are opened, never your tasks, lists or searches.{" "}
          <Link to="/about#privacy">What is counted</Link>
        </p>
        {browserObjects(navigator) && (
          <p className="hint">
            Your browser asks not to be tracked, so nothing is counted.
          </p>
        )}
      </div>

      <div className="setting">
        <span className="setting__name">Start over</span>
        <div className="setting__row">
          <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
            Delete everything
          </button>
        </div>
      </div>

      {confirming &&
        (inAccount ? (
          <Confirm
            title="Delete everything in your account?"
            body="This deletes every task and list in your account, on every device you sign in on. Save a backup first if you might want them back."
            confirmLabel="Delete from my account"
            onConfirm={() => store.replaceAll({ ...emptyData(), settings }, "Everything in your account deleted.")}
            onClose={() => setConfirming(false)}
          />
        ) : (
          <Confirm
            title="Delete everything?"
            body="This removes every task and list from this browser. Save a backup first if you might want them back."
            confirmLabel="Delete everything"
            onConfirm={() => store.replaceAll({ ...emptyData(), settings }, "Everything deleted.")}
            onClose={() => setConfirming(false)}
          />
        ))}

      {pendingBackup && (
        <Confirm
          title="Replace your account's tasks?"
          body={`The ${count(store.data.tasks.length)} and lists in your account are replaced with the ${count(pendingBackup.tasks.length)} in the backup, on every device you sign in on. You can undo it right after.`}
          confirmLabel="Replace them"
          onConfirm={() => loadBackup(pendingBackup)}
          onClose={() => setPendingBackup(null)}
        />
      )}
    </div>
  );
}

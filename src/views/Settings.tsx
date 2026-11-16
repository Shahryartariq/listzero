import { useRef, useState } from "react";
import { Appearance } from "../components/Appearance";
import { Icon } from "../components/Icon";
import { Confirm } from "../components/Sheet";
import { parseBackup, serialize } from "../lib/backup";
import { exampleData } from "../lib/examples";
import { emptyData } from "../lib/types";
import { useStore } from "../state/store-context";
import { usePageTitle } from "../state/usePageTitle";

export function Settings() {
  const store = useStore();
  const { settings } = store.data;
  const file = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  usePageTitle("Settings");

  const exportBackup = () => {
    const blob = new Blob([serialize(store.data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `listzero-backup-${store.today}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    store.notify("Backup saved to your downloads.");
  };

  const importBackup = async (picked: File | undefined) => {
    if (!picked) return;
    const data = picked.size <= 5_000_000 ? parseBackup(await picked.text()) : null;
    if (!data) {
      store.notify("That file is not a Listzero backup. Nothing was changed.");
      return;
    }
    store.replaceAll(data, `Backup loaded: ${data.tasks.length} ${data.tasks.length === 1 ? "task" : "tasks"}.`);
  };

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
        <p className="hint">When Today holds more than this, Listzero offers to move the rest to tomorrow.</p>
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
        <p className="hint">Listzero also follows your device’s “reduce motion” setting.</p>
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
          “Name only” hides dates, lengths and list names in lists, for less to read. The next step still shows.
        </p>
      </div>

      <div className="setting">
        <span className="setting__name">Your data</span>
        <p className="hint">
          {store.data.tasks.length} {store.data.tasks.length === 1 ? "task" : "tasks"} in this browser. Nothing is
          stored on a server, so a backup file is the way to move to another device or browser.
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
        <p className="hint">Loading a backup replaces what is here. You can undo it right after.</p>
      </div>

      <div className="setting">
        <span className="setting__name">Start over</span>
        <div className="setting__row">
          <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
            Delete everything
          </button>
        </div>
      </div>

      {confirming && (
        <Confirm
          title="Delete everything?"
          body="This removes every task and list from this browser. Save a backup first if you might want them back."
          confirmLabel="Delete everything"
          onConfirm={() => store.replaceAll({ ...emptyData(), settings }, "Everything deleted.")}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

/**
 * The pieces of the account that live in the app's frame: the sync that runs while someone is
 * signed in, the entry in the sidebar, and the "sign out" choice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { safeStorage } from "../lib/backup";
import { useStore } from "../state/store-context";
import { forgetAccount, pendingCount, SyncFailure, syncOnce, type SyncIO, type SyncReply } from "../sync/run";
import { registerSyncRunner, requestSync, setSyncStatus, useSyncStatus, type SyncStatus } from "../sync/status";
import { authClient } from "./client";

async function post(body: unknown): Promise<SyncReply> {
  let response: Response;
  try {
    response = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    throw new SyncFailure("offline");
  }
  if (response.status === 401) throw new SyncFailure("unauthorized");
  if (response.status === 413) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new SyncFailure("too-many", detail?.message ?? "");
  }
  if (!response.ok) throw new SyncFailure("server");
  return (await response.json()) as SyncReply;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Runs sync for as long as someone is signed in. Renders nothing, except the one question it may have to ask. */
export function SyncRunner() {
  const store = useStore();
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });

  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;
  const email = session.data?.user.email ?? "";
  const refetch = session.refetch;

  /** The email of another account whose tasks are on this device, while we wait for a choice. */
  const [other, setOther] = useState<string | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const lastRun = useRef(0);
  /** The data as it stood when the last sync finished: no need to sync again until it differs. */
  const settled = useRef<unknown>(null);

  const run = useCallback(
    async (adopt?: "merge" | "replace"): Promise<boolean> => {
      if (!userId) return false;
      if (running.current) {
        again.current = true;
        return false;
      }
      running.current = true;
      lastRun.current = Date.now();
      setSyncStatus({ phase: "syncing" });
      const io: SyncIO = {
        user: { id: userId, email },
        read: () => latest.current.read(),
        load: (next) => latest.current.load(next),
        storage: safeStorage(),
        post,
      };
      let ok = false;
      try {
        // One tab at a time: they share the tasks and what the device remembers about the account.
        const work = () => syncOnce(io, adopt);
        const outcome = navigator.locks ? await navigator.locks.request("listzero-sync", work) : await work();
        settled.current = io.read();
        if (outcome.ok) {
          ok = true;
          setOther(null);
          setSyncStatus({ phase: "synced", at: Date.now(), pending: 0, message: "" });
          if (outcome.first) {
            latest.current.notify(
              outcome.sent > 0
                ? `Signed in. ${plural(outcome.sent, "item", "items")} from this device added to your account.`
                : "Signed in. Your tasks are in sync.",
            );
          }
        } else if (outcome.reason === "other-account") {
          setOther(outcome.email || "another account");
          setSyncStatus({ phase: "error", pending: 0, message: "Waiting for your choice about the tasks on this device." });
        } else if (outcome.reason === "offline") {
          setSyncStatus({ phase: "offline", pending: pendingCount(io), message: "" });
        } else if (outcome.reason === "unauthorized") {
          setSyncStatus({ phase: "off", pending: 0, message: "" });
          void refetch();
        } else if (outcome.reason === "too-many") {
          setSyncStatus({
            phase: "error",
            pending: pendingCount(io),
            message: `${outcome.message || "This account is full"}. Clear finished tasks in Done to make room. Nothing on this device was lost.`,
          });
        } else {
          setSyncStatus({ phase: "error", pending: pendingCount(io), message: "Could not reach your account. Trying again shortly." });
        }
      } catch {
        setSyncStatus({ phase: "error", message: "Sync ran into a problem. Trying again shortly." });
      } finally {
        running.current = false;
        if (again.current) {
          again.current = false;
          void run();
        }
      }
      return ok;
    },
    [userId, email, refetch],
  );

  // Signed in: sync now. Signed out: sync is off.
  useEffect(() => {
    if (!userId) {
      setSyncStatus({ phase: "off", at: null, pending: 0, message: "" });
      registerSyncRunner(null);
      return;
    }
    registerSyncRunner(run);
    void run();
    return () => registerSyncRunner(null);
  }, [userId, run]);

  // Something changed here: send it, once typing has paused.
  const data = store.data;
  useEffect(() => {
    if (!userId || data === settled.current) return;
    const timer = window.setTimeout(() => void run(), 1200);
    return () => window.clearTimeout(timer);
  }, [data, userId, run]);

  // Back online, back to the tab, or a while has passed: check what other devices did.
  useEffect(() => {
    if (!userId) return;
    const wake = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun.current > 15_000) void run();
    };
    const online = () => void run();
    const timer = window.setInterval(wake, 90_000);
    window.addEventListener("online", online);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [userId, run]);

  if (!other || !userId) return null;
  const here = store.data.tasks.length;
  return (
    // Closing without choosing signs out again: the safe answer is not to mix two people's tasks.
    <Sheet
      title="Tasks from another account"
      small
      onClose={() => {
        setOther(null);
        void authClient.signOut();
      }}
    >
      <div className="prose">
        <p>
          This browser holds {plural(here, "task", "tasks")} from <strong>{other}</strong>. You are now signed in as{" "}
          <strong>{email}</strong>.
        </p>
        <p>What should happen to the tasks that are here?</p>
        <div className="choice">
          <button type="button" className="btn" onClick={() => void run("replace")}>
            Replace them with my tasks
          </button>
          <p className="hint">They leave this browser. They stay in {other}’s account.</p>
          <button type="button" className="btn btn--quiet" onClick={() => void run("merge")}>
            Add them to my account
          </button>
          <p className="hint">Only choose this if both accounts are yours.</p>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setOther(null);
              void authClient.signOut();
            }}
          >
            Sign out again
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function syncLabel(status: SyncStatus): string {
  switch (status.phase) {
    case "syncing":
      return "Syncing…";
    case "synced":
      return "In sync";
    case "offline":
      return status.pending > 0 ? `Offline. ${plural(status.pending, "change", "changes")} will sync when you are back online.` : "Offline";
    case "error":
      return status.message || "Sync problem";
    default:
      return "Not syncing";
  }
}

/** The account's line in the sidebar and the phone menu: "Sign in", or who is signed in and how sync is doing. */
export function AccountEntry() {
  const session = authClient.useSession();
  const status = useSyncStatus();
  if (session.isPending && !session.data) return null;
  if (!session.data) {
    return (
      <NavLink to="/sign-in" className="nav__link" data-tip="Sign in">
        <Icon name="user" />
        <span className="nav__label">Sign in</span>
      </NavLink>
    );
  }
  const { user } = session.data;
  const name = user.name || user.username || user.email;
  return (
    <NavLink to="/account" className="nav__link" data-tip={`${name}. ${syncLabel(status)}`}>
      <Icon name="user" />
      <span className="nav__name nav__label">{name}</span>
      <span className="sync-dot" data-phase={status.phase}>
        <span className="sr-only">{syncLabel(status)}</span>
      </span>
    </NavLink>
  );
}

/** Signing out asks one thing: what happens to the tasks in this browser. */
export function SignOutSheet({ onClose }: { onClose(): void }) {
  const store = useStore();
  const session = authClient.useSession();
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState<number | null>(null);

  // Send whatever has not gone out yet, so "remove from this device" loses nothing.
  useEffect(() => {
    let live = true;
    void requestSync().then((ok) => {
      if (!live || !session.data) return;
      const { id, email } = session.data.user;
      setUnsent(ok ? 0 : pendingCount({ user: { id, email }, read: () => store.read(), storage: safeStorage() }));
    });
    return () => {
      live = false;
    };
    // Once, when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async (remove: boolean) => {
    setBusy(true);
    await authClient.signOut();
    if (remove) {
      const data = store.read();
      store.load({ ...data, tasks: [], lists: [], settings: { ...data.settings, display: {} } });
      forgetAccount(safeStorage());
    }
    store.notify(remove ? "Signed out. This browser is empty again." : "Signed out. Your tasks are still in this browser.");
    onClose();
  };

  const risky = unsent !== null && unsent > 0;
  return (
    <Sheet title="Sign out" onClose={onClose} small>
      <div className="prose">
        <p>Your tasks stay safe in your account. What about the copy in this browser?</p>
        <div className="choice">
          <button type="button" className="btn" disabled={busy} onClick={() => void signOut(false)}>
            Sign out and keep the tasks here
          </button>
          <p className="hint">Good on your own device. You can keep using them without an account.</p>
          <button type="button" className="btn btn--quiet" disabled={busy || unsent === null} onClick={() => void signOut(true)}>
            Sign out and remove them from this browser
          </button>
          <p className="hint">Best on a shared or borrowed device.</p>
        </div>
        {risky && (
          <p className="form__alert" role="alert">
            {plural(unsent, "change has", "changes have")} not reached your account yet ({syncLabel(status).toLowerCase()}).
            Removing the tasks from this browser now would lose {unsent === 1 ? "it" : "them"}.
          </p>
        )}
      </div>
    </Sheet>
  );
}

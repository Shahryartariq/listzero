/**
 * The pieces of the account that live in the app's frame: the sync that runs while someone is
 * signed in, the entry in the sidebar, and the "sign out" choice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { safeStorage } from "../lib/backup";
import { useStore } from "../state/store-context";
import { clearGuestItems, forgetAccountCopy, GUEST, moveLegacyAccount, readGuest, syncKey, withGuestItems, writeAccount } from "../state/workspace";
import { pendingCount, SyncFailure, syncOnce, type SyncIO, type SyncReply } from "../sync/run";
import { registerSyncRunner, requestSync, setSyncStatus, useSyncStatus, type SyncStatus } from "../sync/status";
import { loadSyncState } from "../sync/engine";
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

/**
 * Keeps the right tasks on screen and in sync. Signed in: that account's own tasks, synced. Signed
 * out: the guest's. The first time someone signs in from guest mode with tasks, it asks once
 * whether to bring them into the account.
 */
export function SyncRunner() {
  const store = useStore();
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });

  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;
  const email = session.data?.user.email ?? "";
  // Only a check that worked says "signed out". Offline, keep whoever was signed in.
  const known = !session.isPending && !session.error;
  const refetch = session.refetch;
  const unreachable = Boolean(session.error) && !session.data;

  // The check failed: ask again when the connection is back, and now and then until it answers.
  useEffect(() => {
    if (!unreachable) return;
    const retry = () => void refetch();
    const timer = window.setInterval(retry, 60_000);
    window.addEventListener("online", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [unreachable, refetch]);

  /** The guest's tasks and lists on offer to the account that just signed in. */
  const [offer, setOffer] = useState<{ tasks: number; lists: number } | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const lastRun = useRef(0);
  /** The data as it stood when the last sync finished: no need to sync again until it differs. */
  const settled = useRef<unknown>(null);

  // Follow the session: one account's own tasks, or the guest's.
  useEffect(() => {
    if (!known) return;
    const storage = safeStorage();
    const current = latest.current.workspace;
    if (!userId) {
      // The session ended without Sign out here (signed out on another device, account deleted, or it
      // expired). Show the guest's tasks. The account's copy goes too, unless it holds changes the
      // account has not had yet: those wait here, out of sight, for the next sign-in to send them.
      if (current.kind === "account") {
        const unsent = pendingCount({
          user: { id: current.userId, email: "" },
          read: () => latest.current.read(),
          storage,
          stateKey: syncKey(current.userId),
        });
        if (unsent === 0) forgetAccountCopy(storage, current.userId);
        latest.current.switchWorkspace(GUEST);
      }
      return;
    }
    if (current.kind === "account" && current.userId === userId) return;
    // Signed in just now (or for the first time since accounts got their own place).
    const moved = moveLegacyAccount(storage, userId);
    latest.current.switchWorkspace({ kind: "account", userId });
    if (!moved && current.kind === "guest") {
      const guest = readGuest(storage, latest.current.read().settings);
      if (guest.tasks.length + guest.lists.length > 0) setOffer({ tasks: guest.tasks.length, lists: guest.lists.length });
    }
  }, [known, userId]);

  const run = useCallback(async (): Promise<boolean> => {
    // Sync only ever touches this account's own tasks. If the tasks on screen change hands while it
    // runs (signing out, another tab), it stops rather than send or receive anyone else's.
    const mine = () => {
      const ws = latest.current.readWorkspace();
      return userId !== null && ws.kind === "account" && ws.userId === userId;
    };
    if (!userId || !mine()) return false;
    if (running.current) {
      again.current = true;
      return false;
    }
    running.current = true;
    lastRun.current = Date.now();
    setSyncStatus({ phase: "syncing" });
    const io: SyncIO = {
      user: { id: userId, email },
      read: () => {
        if (!mine()) throw new SyncFailure("server", "switched");
        return latest.current.read();
      },
      load: (next) => {
        if (!mine()) throw new SyncFailure("server", "switched");
        latest.current.load(next);
      },
      keep: (next) => {
        if (!mine()) throw new SyncFailure("server", "switched");
        return writeAccount(safeStorage(), userId, next);
      },
      storage: safeStorage(),
      stateKey: syncKey(userId),
      post,
    };
    let ok = false;
    try {
      // One tab at a time: they share the tasks and what the device remembers about the account.
      const work = () => syncOnce(io);
      const outcome = navigator.locks ? await navigator.locks.request(`listzero-sync:${userId}`, work) : await work();
      if (!outcome.ok && "message" in outcome && outcome.message === "switched") return false;
      settled.current = io.read();
      if (outcome.ok) {
        ok = true;
        setSyncStatus({ phase: "synced", at: Date.now(), pending: 0, message: "" });
      } else if (outcome.reason === "offline") {
        setSyncStatus({ phase: "offline", pending: pendingCount(io), message: "" });
      } else if (outcome.reason === "unauthorized") {
        setSyncStatus({ phase: "off", pending: 0, message: "" });
        void refetch();
      } else if (outcome.reason === "full") {
        setSyncStatus({
          phase: "error",
          pending: pendingCount(io),
          message:
            "This browser is out of room, so syncing is paused to keep your account safe. Save a backup from Settings, then clear finished tasks in Done.",
        });
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
  }, [userId, email, refetch]);

  // Signed in, with that account's tasks on screen: sync now. Otherwise sync is off.
  const onScreen = store.workspace.kind === "account" ? store.workspace.userId : null;
  const active = userId !== null && onScreen === userId;
  useEffect(() => {
    if (!active) {
      if (known && !userId) setSyncStatus({ phase: "off", at: null, pending: 0, message: "" });
      registerSyncRunner(null);
      return;
    }
    registerSyncRunner(run);
    void run();
    return () => registerSyncRunner(null);
  }, [active, known, userId, run]);

  // Something changed here: send it, once typing has paused.
  const data = store.data;
  useEffect(() => {
    if (!active || data === settled.current) return;
    const timer = window.setTimeout(() => void run(), 1200);
    return () => window.clearTimeout(timer);
  }, [data, active, run]);

  // Back online, back to the tab, or a while has passed: check what other devices did.
  useEffect(() => {
    if (!active) return;
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
  }, [active, run]);

  if (!offer || !active) return null;

  const bringIn = () => {
    const storage = safeStorage();
    const { data: combined, tasks } = withGuestItems(latest.current.read(), readGuest(storage, latest.current.read().settings));
    latest.current.load(combined);
    clearGuestItems(storage);
    setOffer(null);
    latest.current.notify(tasks > 0 ? `${plural(tasks, "task", "tasks")} added to your account.` : "Added to your account.");
  };
  const what = [offer.tasks > 0 ? plural(offer.tasks, "task", "tasks") : "", offer.lists > 0 ? plural(offer.lists, "list", "lists") : ""]
    .filter(Boolean)
    .join(" and ");
  const them = offer.tasks + offer.lists === 1 ? "it" : "them";

  return (
    <Sheet
      title="Add your guest tasks?"
      small
      onClose={() => setOffer(null)}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={() => setOffer(null)}>
            Not now
          </button>
          <button type="button" className="btn" onClick={bringIn}>
            Add to my account
          </button>
        </>
      }
    >
      <div className="prose">
        <p>
          You have {what} as a guest in this browser. Add {them} to <strong>{email}</strong> to have {them} on all your
          devices?
        </p>
        <p className="hint">Not now keeps them here as guest tasks. You will see them again when you sign out.</p>
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
  const { workspace } = useStore();
  if (session.isPending && !session.data) return null;
  if (!session.data && session.error && workspace.kind === "account") {
    // The check failed, and someone is signed in here: they still are, as far as anyone knows.
    const name = loadSyncState(safeStorage(), syncKey(workspace.userId))?.email || "Your account";
    const note = "Cannot reach your account right now";
    return (
      <NavLink to="/account" className="nav__link" data-tip={`${name}. ${note}`}>
        <Icon name="user" />
        <span className="nav__name nav__label">{name}</span>
        <span className="sync-dot" data-phase="offline">
          <span className="sr-only">{note}</span>
        </span>
      </NavLink>
    );
  }
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

/**
 * Signing out: whatever has not reached the account is sent first, then this browser forgets the
 * account's tasks and goes back to the guest's. Only unsent changes make it ask twice.
 */
export function SignOutSheet({ onClose }: { onClose(): void }) {
  const store = useStore();
  const navigate = useNavigate();
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState<number | null>(null);
  const [problem, setProblem] = useState("");
  const ws = store.workspace;
  const userId = ws.kind === "account" ? ws.userId : null;

  // Send whatever has not gone out yet, so nothing is lost when the copy here is removed.
  useEffect(() => {
    let live = true;
    void requestSync().then((ok) => {
      if (!live || !userId) return;
      const storage = safeStorage();
      setUnsent(ok ? 0 : pendingCount({ user: { id: userId, email: "" }, read: () => store.read(), storage, stateKey: syncKey(userId) }));
    });
    return () => {
      live = false;
    };
    // Once, when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    setBusy(true);
    setProblem("");
    // Signing out needs the server: until it has ended the session, this browser is still signed in.
    let failed = "";
    try {
      const { error } = await authClient.signOut();
      // 401: the session had already ended, which is what signing out is for.
      if (error && error.status !== 401) failed = "Could not sign out. Please try again.";
    } catch {
      failed = "You are offline. Connect to the internet to sign out.";
    }
    if (failed) {
      setProblem(failed);
      setBusy(false);
      return;
    }
    if (userId) forgetAccountCopy(safeStorage(), userId);
    store.switchWorkspace(GUEST);
    store.notify("Signed out. Your tasks are safe in your account.");
    onClose();
    navigate("/");
  };

  const risky = unsent !== null && unsent > 0;
  return (
    <Sheet
      title="Sign out"
      onClose={onClose}
      small
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={risky ? "btn btn--danger" : "btn"} disabled={busy || unsent === null} onClick={() => void signOut()}>
            {unsent === null ? "Saving your changes…" : risky ? "Sign out and lose them" : "Sign out"}
          </button>
        </>
      }
    >
      <div className="prose">
        <p>Your tasks stay in your account. This browser goes back to guest mode and no longer shows them.</p>
        {risky && (
          <p className="form__alert" role="alert">
            {plural(unsent, "change has", "changes have")} not reached your account yet ({syncLabel(status).toLowerCase()}).
            Connect to the internet and wait a moment, or sign out and lose {unsent === 1 ? "it" : "them"}.
          </p>
        )}
        {problem && (
          <p className="form__alert" role="alert">
            {problem}
          </p>
        )}
      </div>
    </Sheet>
  );
}

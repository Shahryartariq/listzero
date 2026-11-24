/**
 * Keeps shared lists in step with the server for whoever is signed in. Loaded only where accounts
 * exist (App's AccountRuntime), so a copy of Listzero without them carries none of this.
 *
 * It syncs when the app opens, soon after each change, when the window comes back into view or the
 * connection returns, and every 10 seconds while a shared list is on screen (every minute otherwise),
 * so a tick on one person's phone shows on the other's within seconds.
 */
import { useEffect } from "react";
import { authClient } from "../account/client";
import {
  applyReply,
  forgetSpace,
  loadSpace,
  pendingChanges,
  readSpace,
  registerSharedRunner,
  setSharedStatus,
  setSpace,
  type SharedReply,
} from "./space";

const ROUNDS = 10;

async function post(body: unknown): Promise<SharedReply> {
  const response = await fetch("/api/shared/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as SharedReply;
}

export function SharedRunner() {
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;
  const known = !session.isPending && !session.error;

  // Follow the session: this account's shared lists, or none.
  useEffect(() => {
    if (!known) return;
    const current = readSpace();
    if (!userId) {
      if (current) {
        forgetSpace(current.userId);
        setSpace(null);
      }
      return;
    }
    if (current?.userId !== userId) setSpace(loadSpace(userId));
  }, [known, userId]);

  useEffect(() => {
    if (!userId) return;
    let running = false;
    let again = false;
    let last = 0;

    const run = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        for (let round = 0; round < ROUNDS; round++) {
          const base = readSpace();
          if (!base || base.userId !== userId) break;
          const changes = pendingChanges(base);
          const reply = await post({ cursors: base.cursors, changes });
          const now = readSpace();
          if (!now || now.userId !== userId) break;
          const next = applyReply(now, base, reply);
          setSpace(next);
          const more = Object.values(reply.items).some((i) => i.more);
          if (!more && pendingChanges(next).length === 0) break;
        }
        last = Date.now();
        setSharedStatus(navigator.onLine === false ? "offline" : "ok");
      } catch {
        setSharedStatus(navigator.onLine === false ? "offline" : "error");
      } finally {
        running = false;
        if (again) {
          again = false;
          void run();
        }
      }
    };

    registerSharedRunner(run);
    void run();
    const visible = () => document.visibilityState === "visible";
    const tick = window.setInterval(() => {
      if (!visible()) return;
      const open = location.pathname.startsWith("/shared/");
      if (open || Date.now() - last > 60_000) void run();
    }, 10_000);
    const now = () => visible() && void run();
    window.addEventListener("focus", now);
    window.addEventListener("online", now);
    document.addEventListener("visibilitychange", now);
    return () => {
      registerSharedRunner(null);
      window.clearInterval(tick);
      window.removeEventListener("focus", now);
      window.removeEventListener("online", now);
      document.removeEventListener("visibilitychange", now);
    };
  }, [userId]);

  return null;
}

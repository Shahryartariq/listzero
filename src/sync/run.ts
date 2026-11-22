/**
 * One sync, start to finish: send what this device changed, apply what others changed, and repeat
 * until both sides agree. Everything it touches comes in through `io`, so the same code is driven
 * by the app in the browser and by the tests against a real server.
 */
import type { AppData } from "../lib/types";
import {
  applyChanges,
  changedBetween,
  emptyFingerprints,
  loadSyncState,
  localChanges,
  saveSyncState,
  settle,
  type Change,
  type SyncState,
} from "./engine";

/** The most changes one request carries. The server allows 2,000. */
const BATCH = 1000;
const MAX_ROUNDS = 60;

export interface SyncReply {
  cursor: number;
  changes: Change[];
  more: boolean;
  reset: boolean;
}

export class SyncFailure extends Error {
  constructor(
    readonly reason: "unauthorized" | "offline" | "too-many" | "server",
    message = "",
  ) {
    super(message);
  }
}

export interface SyncIO {
  user: { id: string; email: string };
  /** The data as it is this instant. */
  read(): AppData;
  /** Puts new data in place. */
  load(next: AppData): void;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Where this account's sync state is kept on the device (one key per account). */
  stateKey?: string;
  /** Sends a request to /api/sync. Throws SyncFailure. */
  post(body: { cursor: number; changes: Change[] }): Promise<SyncReply>;
}

export type Outcome =
  | {
      ok: true;
      /** This device had never synced with this account before. */
      first: boolean;
      /** How many of this device's items were sent to the account. */
      sent: number;
      received: number;
    }
  /** The device holds another account's data, and nobody has said what to do with it. */
  | { ok: false; reason: "other-account"; email: string }
  | { ok: false; reason: SyncFailure["reason"]; message: string };

/** What this device has that the account does not, without contacting anyone. */
export function pendingCount(io: Pick<SyncIO, "read" | "storage" | "user" | "stateKey">): number {
  const state = loadSyncState(io.storage, io.stateKey);
  if (!state || state.userId !== io.user.id) return io.read().tasks.length + io.read().lists.length;
  return localChanges(io.read(), state.known).length;
}

export async function syncOnce(io: SyncIO, adopt?: "merge" | "replace"): Promise<Outcome> {
  let state: SyncState | null = loadSyncState(io.storage, io.stateKey);

  if (state && state.userId !== io.user.id) {
    // The question is only worth asking when the other account left something here.
    const here = io.read();
    const nothingHere = here.tasks.length === 0 && here.lists.length === 0;
    adopt ??= nothingHere ? "replace" : undefined;
    if (!adopt) return { ok: false, reason: "other-account", email: state.email };
    if (adopt === "replace") {
      const data = io.read();
      io.load({ ...data, tasks: [], lists: [], settings: { ...data.settings, display: {} } });
    }
    state = null;
  }

  // A first sync asks before it tells: the account's copy of anything both sides have wins,
  // and only what the account lacks is then sent.
  const first = state === null;
  let asking = first;
  let current: SyncState = state ?? { userId: io.user.id, email: io.user.email, cursor: 0, known: emptyFingerprints() };
  let sent = 0;
  let received = 0;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const base = io.read();
      const waiting = asking ? [] : localChanges(base, current.known);
      const sending = waiting.slice(0, BATCH);
      const reply = await io.post({ cursor: current.cursor, changes: sending });

      // Anything edited here while the request was away stays as it is and goes out next round.
      const now = io.read();
      io.load(applyChanges(now, reply.changes, changedBetween(base, now)));

      current = {
        ...current,
        cursor: reply.cursor,
        known: settle(reply.reset ? emptyFingerprints() : current.known, sending, reply.changes),
      };
      saveSyncState(io.storage, current, io.stateKey);
      sent += sending.length;
      received += reply.changes.length;

      if (reply.more) continue;
      if (asking) {
        asking = false;
        continue;
      }
      if (localChanges(io.read(), current.known).length === 0) break;
    }
  } catch (error) {
    if (error instanceof SyncFailure) return { ok: false, reason: error.reason, message: error.message };
    throw error;
  }
  return { ok: true, first, sent, received };
}

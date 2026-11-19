/** Where sync stands, readable from anywhere (the sidebar entry, the Account page). */
import { useSyncExternalStore } from "react";

export type SyncPhase =
  /** Not signed in, or accounts are off. */
  | "off"
  | "syncing"
  | "synced"
  /** No connection. Changes are kept here and sent when it is back. */
  | "offline"
  /** The server refused or failed. `message` says what to do, if anything. */
  | "error";

export interface SyncStatus {
  phase: SyncPhase;
  /** When the last successful sync finished. */
  at: number | null;
  /** Changes on this device the account does not have yet. */
  pending: number;
  message: string;
}

let status: SyncStatus = { phase: "off", at: null, pending: 0, message: "" };
const listeners = new Set<() => void>();

export function setSyncStatus(patch: Partial<SyncStatus>) {
  const next = { ...status, ...patch };
  if (next.phase === status.phase && next.at === status.at && next.pending === status.pending && next.message === status.message) return;
  status = next;
  for (const listener of listeners) listener();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}

/** Lets other parts of the app ask for a sync now (the "Sync now" button, signing out). */
type Runner = (adopt?: "merge" | "replace") => Promise<boolean>;
let runner: Runner | null = null;
export const registerSyncRunner = (next: Runner | null) => {
  runner = next;
};
export const requestSync = (adopt?: "merge" | "replace"): Promise<boolean> => (runner ? runner(adopt) : Promise.resolve(false));

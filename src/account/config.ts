/**
 * Whether this copy of Listzero offers accounts at all, asked once from the server.
 *
 * Accounts are optional twice over: a copy with no database (or no server at all) has none, and
 * the whole account code is only downloaded when this says it is worth it. The last answer is
 * remembered, so a returning visitor sees their account entry at once, and offline too.
 */
import { useSyncExternalStore } from "react";

export interface AccountConfig {
  accounts: boolean;
  google: boolean;
  /** New accounts must confirm their email before signing in. */
  emailVerification: boolean;
  /** Password reset by email is available. */
  email: boolean;
}

const OFF: AccountConfig = { accounts: false, google: false, emailVerification: false, email: false };
const KEY = "listzero:accounts";

function read(raw: unknown): AccountConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.accounts !== "boolean") return null;
  return {
    accounts: v.accounts,
    google: v.google === true,
    emailVerification: v.emailVerification === true,
    email: v.email === true,
  };
}

function remembered(): AccountConfig | null {
  try {
    return read(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return null;
  }
}

/** null until the first answer (or a remembered one) is in. */
let current: AccountConfig | null = typeof localStorage === "undefined" ? null : remembered();
let asked = false;
const listeners = new Set<() => void>();

function set(next: AccountConfig) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* remembered for this visit only */
  }
  for (const listener of listeners) listener();
}

async function ask() {
  try {
    const response = await fetch("/api/config", { headers: { accept: "application/json" } });
    // A static host answers /api/config with a page or a 404: that is a copy without accounts.
    const body = response.ok && response.headers.get("content-type")?.includes("json") ? read(await response.json()) : null;
    set(body ?? OFF);
  } catch {
    // Offline: keep what was remembered, or assume there are none for now.
    if (current === null) set(OFF);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!asked) {
    asked = true;
    void ask();
  }
  return () => listeners.delete(listener);
}

export function useAccountConfig(): AccountConfig | null {
  return useSyncExternalStore(subscribe, () => current);
}

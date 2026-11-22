/**
 * Visit counting for the public site, with Google Analytics.
 *
 * What is sent: which screen was opened ("/today", "/list"), nothing else of the user's.
 * Task names, notes, list names, list ids, task ids and search words never leave the browser:
 * addresses and titles are replaced with fixed ones before anything is sent.
 *
 * It only runs on the public site, never on a local copy or a preview, and it stays off when
 * the user turns it off in Settings or their browser asks not to be tracked.
 */

export const GA_ID = "G-F20040CM1X";
export const SITE_HOST = "listzero.vercel.app";

/** The screens that are counted, by their fixed address and name. */
const SCREENS: Record<string, string> = {
  "/": "Home",
  "/today": "Today",
  "/inbox": "Inbox",
  "/upcoming": "Upcoming",
  "/board": "Board",
  "/done": "Done",
  "/focus": "Focus",
  "/search": "Search",
  "/settings": "Settings",
  "/about": "How it works",
  "/menu": "Menu",
  "/list": "List",
  "/sign-in": "Sign in",
  "/sign-up": "Create an account",
  "/verify-email": "Confirm your email",
  "/forgot-password": "Reset your password",
  "/reset-password": "Choose a new password",
  "/two-factor": "Two-factor code",
  "/account": "Account",
  "/admin": "People",
  "/not-found": "Page not found",
};

/** The address that is safe to report for a path: no ids, no query, no unknown text. */
export function screenPath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (/^\/list\/[^/]+$/.test(clean)) return "/list";
  return Object.prototype.hasOwnProperty.call(SCREENS, clean) ? clean : "/not-found";
}

export function screenTitle(path: string): string {
  return `${SCREENS[path] ?? "Page not found"} | Listzero`;
}

interface Signals {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

/** True when the browser itself asks sites not to track (Do Not Track or Global Privacy Control). */
export function browserObjects(nav: Signals): boolean {
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

export function analyticsAllowed(setting: boolean, host: string, nav: Signals): boolean {
  return setting && host === SITE_HOST && !browserObjects(nav);
}

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const DISABLE_FLAG = `ga-disable-${GA_ID}`;
let started = false;

function start(): Gtag {
  if (started && window.gtag) return window.gtag;
  started = true;
  const layer = (window.dataLayer = window.dataLayer ?? []);
  // The Google tag reads the `arguments` object itself, so a rest array will not do.
  const gtag: Gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  gtag("config", GA_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  // Loaded when the browser is idle, so it never delays the first screen.
  const load = () => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.append(script);
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 1500);
  return gtag;
}

/** Counts one screen view, or does nothing when counting is not allowed. */
export function countScreen(pathname: string, setting: boolean): void {
  const flags = window as unknown as Record<string, boolean>;
  if (!analyticsAllowed(setting, window.location.hostname, navigator as Signals)) {
    // Google's own switch: a tag that is already loaded stops sending.
    if (started) flags[DISABLE_FLAG] = true;
    return;
  }
  flags[DISABLE_FLAG] = false;
  const gtag = start();
  const path = screenPath(pathname);
  const page = { page_location: `https://${SITE_HOST}${path}`, page_title: screenTitle(path) };
  // "set" keeps later automatic events on the same safe address.
  gtag("set", page);
  gtag("event", "page_view", page);
}

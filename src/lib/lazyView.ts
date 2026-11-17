import { lazy, type ComponentType } from "react";

const RELOADED_AT = "listzero:reloaded-at";

/**
 * A screen that is downloaded when first needed.
 *
 * After a new version goes live, a tab still running the old one can ask for a file that no longer
 * exists. Reloading once gets the new version, which is what the visitor wanted anyway. If the
 * download still fails after that (offline before anything was cached, say), the error is passed on
 * to the screen's error boundary.
 */
export function lazyView<Props>(load: () => Promise<ComponentType<Props>>) {
  return lazy(() =>
    load().then(
      (component) => ({ default: component }),
      (error: unknown) => {
        try {
          const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
          if (Date.now() - last > 30_000 && navigator.onLine) {
            sessionStorage.setItem(RELOADED_AT, String(Date.now()));
            window.location.reload();
            // Never settles: the page is about to be replaced.
            return new Promise<{ default: ComponentType<Props> }>(() => undefined);
          }
        } catch {
          /* no session storage: fall through to the error */
        }
        throw error;
      },
    ),
  );
}

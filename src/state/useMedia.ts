import { useSyncExternalStore } from "react";

/** Phones: no sidebar, a tab bar instead. The same query as the phone layout in app.css. */
export const PHONE = "(max-width: 48rem), (max-height: 30rem) and (max-width: 60rem)";

/** Tablets and narrow windows: a sidebar, but little room beside it. public/theme.js uses it too. */
export const TABLET = "(min-width: 48.0625rem) and (max-width: 64rem)";

/** Whether a media query matches now, kept up to date as the window changes. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

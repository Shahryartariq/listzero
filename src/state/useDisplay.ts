import { DEFAULT_DISPLAY, type Display } from "../lib/display";
import { useStore } from "./store-context";

/** How one view is displayed, and a way to change it. Saved with the rest of the settings. */
export function useDisplay(view: string) {
  const store = useStore();
  const display = store.data.settings.display[view] ?? DEFAULT_DISPLAY;
  return {
    display,
    set: (next: Display) => store.setDisplay(view, next),
    reset: () => store.setDisplay(view, null),
    clearFilters: () => store.setDisplay(view, { ...display, filters: DEFAULT_DISPLAY.filters }),
  };
}

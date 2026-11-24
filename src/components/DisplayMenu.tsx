import { useId, useRef, type SyntheticEvent } from "react";
import {
  LAYOUTS,
  QUICK_MINUTES,
  SORTS,
  activeFilters,
  isDefault,
  type Display,
  type Filters,
  type Layout,
  type Sort,
} from "../lib/display";
import type { Priority } from "../lib/types";
import { useStore } from "../state/store-context";
import { useDisplay } from "../state/useDisplay";
import { Icon, type IconName } from "./Icon";
import { Picker } from "./Picker";

const LAYOUT_LABEL: Record<Layout, { label: string; icon: IconName }> = {
  list: { label: "List", icon: "list" },
  cards: { label: "Cards", icon: "cards" },
  board: { label: "Board", icon: "board" },
  calendar: { label: "Calendar", icon: "calendar" },
  table: { label: "Table", icon: "table" },
};

const SORT_LABEL: Record<Sort, string> = {
  smart: "Suggested",
  manual: "My order",
  priority: "Priority",
  day: "Day",
  name: "Name",
  newest: "Newest",
  length: "Shortest",
};

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 1, label: "High" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Low" },
  { value: 0, label: "None" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface DisplayMenuProps {
  /** The saved-settings key of the view: "inbox", "today", "upcoming" or "list:<id>". */
  view: string;
  /** Offer a filter by list. Views that are already one list leave it out. */
  byList?: boolean;
}

/** Room the panel keeps from the window's edges, and its width. */
const EDGE = 8;
const WIDTH = 416;

/**
 * The Display button and the small panel it opens, just under it: layout, sort, filters and reset
 * for one view. Changes apply as you make them. The panel is a popover, so a click elsewhere or
 * Escape closes it, and focus goes back to the button.
 */
export function DisplayMenu({ view, byList = false }: DisplayMenuProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const store = useStore();
  const { display, set, reset } = useDisplay(view);
  const changes = activeFilters(display.filters) + Number(display.sort !== "smart");
  const filters = (patch: Partial<Filters>) => set({ ...display, filters: { ...display.filters, ...patch } });
  const update = (patch: Partial<Display>) => set({ ...display, ...patch });

  return (
    <>
      <button
        ref={button}
        type="button"
        className="btn btn--quiet btn--small display-btn"
        popoverTarget={id}
        aria-haspopup="dialog"
      >
        <Icon name="display" size={18} />
        Display
        {changes > 0 && (
          <span className="display-btn__count">
            {changes}
            <span className="sr-only"> {changes === 1 ? "change" : "changes"} on</span>
          </span>
        )}
      </button>

      <div
        ref={panel}
        id={id}
        className="display-panel"
        role="dialog"
        aria-label="Display"
        popover="auto"
        onBeforeToggle={(e: SyntheticEvent<HTMLDivElement> & { newState?: string }) => {
          const anchor = button.current?.getBoundingClientRect();
          const el = panel.current;
          if (!anchor || !el || (e.nativeEvent as ToggleEvent).newState !== "open") return;
          // Under the button, lined up with its right edge, and inside the window.
          const width = Math.min(WIDTH, window.innerWidth - EDGE * 2);
          const left = Math.min(Math.max(EDGE, anchor.right - width), window.innerWidth - width - EDGE);
          el.style.width = `${width}px`;
          el.style.left = `${left}px`;
          const top = anchor.bottom + 8;
          el.style.top = `${top}px`;
          // Short windows scroll inside the panel, so Done stays in reach.
          el.style.maxHeight = `${window.innerHeight - top - EDGE}px`;
        }}
        onToggle={(e: SyntheticEvent<HTMLDivElement>) => {
          const el = panel.current;
          if ((e.nativeEvent as ToggleEvent).newState !== "open" || !el) return;
          // Start on the chosen layout, unless something in the panel already has focus.
          if (!el.contains(document.activeElement)) el.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
        }}
      >
        <div className="display">
          <div>
            <span className="label" id="layout-label">
              Layout
            </span>
            <div className="layouts" role="radiogroup" aria-labelledby="layout-label">
              {LAYOUTS.map((layout) => (
                <button
                  key={layout}
                  type="button"
                  role="radio"
                  className="layout-opt"
                  aria-checked={display.layout === layout}
                  onClick={() => update({ layout })}
                >
                  <Icon name={LAYOUT_LABEL[layout].icon} size={18} />
                  {LAYOUT_LABEL[layout].label}
                </button>
              ))}
            </div>
          </div>

          <div className="display__sort">
            <span className="label" aria-hidden="true">
              Sort by
            </span>
            <Picker
              label="Sort by"
              value={display.sort}
              options={SORTS.map((sort) => ({ value: sort, label: SORT_LABEL[sort] }))}
              onChange={(sort) => update({ sort })}
            />
          </div>

          <fieldset className="display__filters">
            <legend className="label">Show only</legend>

            <div className="display__row" role="group" aria-label="Priority">
              <span className="display__name" aria-hidden="true">
                Priority
              </span>
              <div className="seg">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className="seg__opt"
                    aria-pressed={display.filters.priorities.includes(p.value)}
                    onClick={() => filters({ priorities: toggle(display.filters.priorities, p.value) })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {byList && store.data.lists.length > 0 && (
              <div className="display__row" role="group" aria-label="List">
                <span className="display__name" aria-hidden="true">
                  List
                </span>
                <div className="seg">
                  <button
                    type="button"
                    className="seg__opt"
                    aria-pressed={display.filters.lists.includes("inbox")}
                    onClick={() => filters({ lists: toggle(display.filters.lists, "inbox") })}
                  >
                    Inbox
                  </button>
                  {store.data.lists.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="seg__opt"
                      aria-pressed={display.filters.lists.includes(l.id)}
                      onClick={() => filters({ lists: toggle(display.filters.lists, l.id) })}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="display__row" role="group" aria-label="More filters">
              <span className="display__name" aria-hidden="true">
                Also
              </span>
              <div className="seg">
                <button
                  type="button"
                  className="seg__opt"
                  aria-pressed={display.filters.doing}
                  onClick={() => filters({ doing: !display.filters.doing })}
                >
                  In progress
                </button>
                <button
                  type="button"
                  className="seg__opt"
                  aria-pressed={display.filters.quick}
                  onClick={() => filters({ quick: !display.filters.quick })}
                >
                  Quick ({QUICK_MINUTES} min or less)
                </button>
              </div>
            </div>
            <p className="hint">Filters only hide tasks here.</p>
          </fieldset>
        </div>
        <div className="display-panel__foot">
          <button type="button" className="btn btn--ghost btn--small" disabled={isDefault(display)} onClick={reset}>
            Reset
          </button>
          <button
            type="button"
            className="btn btn--small"
            popoverTarget={id}
            popoverTargetAction="hide"
            onClick={() => button.current?.focus()}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

/** Says how many tasks the filters are hiding, with a way out. Shows nothing when no filter is on. */
export function FilterNote({ view, shown, total }: { view: string; shown: number; total: number }) {
  const { display, clearFilters } = useDisplay(view);
  if (activeFilters(display.filters) === 0) return null;
  return (
    <div className="note filter-note" role="status">
      <p>
        {shown === 0 && total > 0
          ? `None of the ${total} ${total === 1 ? "task" : "tasks"} here match your filters.`
          : `Showing ${shown} of ${total} ${total === 1 ? "task" : "tasks"}.`}
      </p>
      <button type="button" className="btn btn--quiet btn--small" onClick={clearFilters}>
        Clear filters
      </button>
    </div>
  );
}

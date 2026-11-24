import { useState } from "react";
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
import { Sheet } from "./Sheet";

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

/** The Display button and its sheet: layout, sort, filters and reset for one view. */
export function DisplayMenu({ view, byList = false }: DisplayMenuProps) {
  const [open, setOpen] = useState(false);
  const store = useStore();
  const { display, set, reset } = useDisplay(view);
  const changes = activeFilters(display.filters) + Number(display.sort !== "smart");
  const filters = (patch: Partial<Filters>) => set({ ...display, filters: { ...display.filters, ...patch } });
  const update = (patch: Partial<Display>) => set({ ...display, ...patch });

  return (
    <>
      <button type="button" className="btn btn--quiet btn--small display-btn" onClick={() => setOpen(true)}>
        <Icon name="display" size={18} />
        Display
        {changes > 0 && (
          <span className="display-btn__count">
            {changes}
            <span className="sr-only"> {changes === 1 ? "change" : "changes"} on</span>
          </span>
        )}
      </button>

      {open && (
        <Sheet
          title="Display"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn--quiet" disabled={isDefault(display)} onClick={reset}>
                Reset
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Show tasks
              </button>
            </>
          }
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
                    <Icon name={LAYOUT_LABEL[layout].icon} size={22} />
                    {LAYOUT_LABEL[layout].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="label" id="sort-label">
                Sort by
              </span>
              <div className="seg" role="radiogroup" aria-labelledby="sort-label">
                {SORTS.map((sort) => (
                  <button
                    key={sort}
                    type="button"
                    role="radio"
                    className="seg__opt"
                    aria-checked={display.sort === sort}
                    onClick={() => update({ sort })}
                  >
                    {SORT_LABEL[sort]}
                  </button>
                ))}
              </div>
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
        </Sheet>
      )}
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

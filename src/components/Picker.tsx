import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Icon, type IconName } from "./Icon";

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  /** A colour dot before the label (a CSS colour). */
  dot?: string;
}

interface PickerProps<T extends string> {
  /** The name read out for the picker. */
  label: string;
  value: T;
  options: PickerOption<T>[];
  onChange(value: T): void;
  icon?: IconName;
  /** Where the list starts when the value is `empty`, so a long list opens somewhere useful. */
  startAt?: T;
  empty?: T;
  /** Fills its row like a text field, instead of sitting as a pill. */
  wide?: boolean;
  id?: string;
}

/**
 * A select that matches the app: a glass pill that opens a list of options.
 * The pattern is the "select-only combobox" from the ARIA authoring practices: focus stays on the
 * button, the arrow keys move through the list, Enter picks and Escape closes. The list opens in the
 * top layer, so a sheet's scrolling body cannot cut it off.
 */
export function Picker<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  startAt,
  empty,
  wide,
  id,
}: PickerProps<T>) {
  const auto = useId();
  const listId = `${id ?? auto}-list`;
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const chosen = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const current = options[chosen];

  const show = (at?: number) => {
    const start = value === empty && startAt !== undefined ? options.findIndex((o) => o.value === startAt) : -1;
    setActive(at ?? (start >= 0 ? start : chosen));
    setOpen(true);
  };

  const close = () => setOpen(false);

  const pick = (index: number) => {
    const option = options[index];
    close();
    if (option && option.value !== value) onChange(option.value);
  };

  // Open in the top layer, under the button (or over it when there is no room below).
  useLayoutEffect(() => {
    const el = list.current;
    const anchor = button.current;
    if (!el || !anchor || !open) return;
    if (!el.matches(":popover-open")) el.showPopover();
    const place = () => {
      const box = anchor.getBoundingClientRect();
      const margin = 8;
      el.style.minWidth = `${box.width}px`;
      const height = el.offsetHeight;
      const width = el.offsetWidth;
      const below = window.innerHeight - box.bottom - margin;
      const top = below >= height || box.top < height ? box.bottom + 6 : box.top - 6 - height;
      const left = box.left + width > window.innerWidth - margin ? Math.max(margin, box.right - width) : box.left;
      el.style.top = `${Math.max(margin, top)}px`;
      el.style.left = `${left}px`;
    };
    place();
    // Follow the button when what holds it scrolls; close when the window changes size.
    const onScroll = (e: Event) => {
      if (e.target !== el) place();
    };
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      if (el.matches(":popover-open")) el.hidePopover();
    };
  }, [open]);

  // A press anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!button.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // Keep the active option in sight.
  useEffect(() => {
    if (!open) return;
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  /** Type the start of an option to jump to it. */
  const jump = (key: string) => {
    const now = Date.now();
    const text = (now - typed.current.at < 700 ? typed.current.text : "") + key.toLowerCase();
    typed.current = { text, at: now };
    const from = open ? active : chosen;
    const order = [...options.slice(from + 1), ...options.slice(0, from + 1)];
    const hit = order.find((o) => o.label.toLowerCase().startsWith(text));
    if (!hit) return;
    const index = options.indexOf(hit);
    if (open) setActive(index);
    else show(index);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      if (open) setActive(Math.max(0, Math.min(last, to)));
      else show(Math.max(0, Math.min(last, to)));
    };
    switch (e.key) {
      case "ArrowDown":
        if (e.altKey && !open) return move(chosen);
        return open ? move(active + 1) : move(chosen);
      case "ArrowUp":
        if (e.altKey && open) {
          e.preventDefault();
          return pick(active);
        }
        return open ? move(active - 1) : move(chosen);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "PageDown":
        return open ? move(active + 8) : undefined;
      case "PageUp":
        return open ? move(active - 8) : undefined;
      case "Enter":
      case " ":
        if (e.key === " " && Date.now() - typed.current.at < 700) {
          e.preventDefault();
          return jump(" ");
        }
        e.preventDefault();
        return open ? pick(active) : show();
      case "Escape":
        if (!open) return;
        // Stops the sheet around the picker from closing too.
        e.preventDefault();
        e.stopPropagation();
        return close();
      case "Tab":
        return close();
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) jump(e.key);
    }
  };

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        className={wide ? "picker picker--wide" : "picker"}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        // Space would otherwise click the button again on the way up.
        onKeyUp={(e) => e.key === " " && e.preventDefault()}
        onBlur={close}
      >
        {icon && <Icon name={icon} size={18} />}
        {current?.dot && <span className="dot" style={{ "--dot": current.dot } as CSSProperties} />}
        <span className="picker__value">{current?.label}</span>
        <span className="picker__chev">
          <Icon name="chevronDown" size={16} />
        </span>
      </button>
      <ul
        ref={list}
        id={listId}
        role="listbox"
        aria-label={label}
        className="picker__list"
        popover="manual"
        tabIndex={-1}
        // Keeps focus on the button while an option is pressed.
        onMouseDown={(e) => e.preventDefault()}
      >
        {open &&
          options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              className="picker__opt"
              aria-selected={i === chosen && o.value === value}
              data-active={i === active || undefined}
              onPointerMove={() => i !== active && setActive(i)}
              onClick={() => pick(i)}
            >
              {o.dot && <span className="dot" style={{ "--dot": o.dot } as CSSProperties} />}
              <span className="picker__label">{o.label}</span>
              {o.value === value && (
                <span className="picker__check">
                  <Icon name="check" size={16} />
                </span>
              )}
            </li>
          ))}
      </ul>
    </>
  );
}

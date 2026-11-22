import { useEffect, useRef, useState, type RefObject } from "react";

interface Tip {
  text: string;
  keys: string | null;
  top: number;
  left: number;
}

/**
 * Names for the icon-only controls in the sidebar, shown beside them on hover and keyboard focus.
 *
 * The names are already the controls' accessible names, so the tip is for sighted people only and
 * hidden from screen readers. It sits outside the sidebar, because the sidebar scrolls and would
 * clip it. Escape hides it, and the pointer can move onto it without it disappearing.
 *
 * Everything with `data-tip` gets a tip while the sidebar is narrow (`narrow`). At full width only
 * things marked `data-tip-always` (icon buttons) and names that are cut short get one.
 */
export function SideTips({ side, narrow }: { side: RefObject<HTMLElement | null>; narrow: boolean }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const hideTimer = useRef(0);

  useEffect(() => {
    const root = side.current;
    if (!root) return;

    const owner = (target: EventTarget | null): HTMLElement | null => {
      const el = target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;
      if (!el || !root.contains(el)) return null;
      // At full width, a tip is only for icon buttons and for a name cut short.
      const label = el.querySelector<HTMLElement>(".nav__label");
      const cut = label !== null && label.scrollWidth > label.clientWidth + 1;
      return narrow || cut || el.hasAttribute("data-tip-always") ? el : null;
    };
    const show = (el: HTMLElement) => {
      window.clearTimeout(hideTimer.current);
      const box = el.getBoundingClientRect();
      // Just past the sidebar's edge, level with the control.
      const edge = root.getBoundingClientRect().right;
      const next = {
        text: el.dataset.tip ?? "",
        keys: el.dataset.tipKeys ?? null,
        top: Math.round(box.top + box.height / 2),
        left: Math.round(Math.max(box.right, edge) + 8),
      };
      setTip((now) =>
        now && now.text === next.text && now.keys === next.keys && now.top === next.top && now.left === next.left ? now : next,
      );
    };
    // A short pause lets the pointer cross the gap to the tip itself.
    const hideSoon = () => {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setTip(null), 140);
    };
    const hideNow = () => {
      window.clearTimeout(hideTimer.current);
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = owner(e.target);
      if (el) show(el);
    };
    const onOut = (e: PointerEvent) => {
      const from = owner(e.target);
      if (from && from.contains(e.relatedTarget as Node | null)) return;
      if (from) hideSoon();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = owner(e.target);
      if (el && el.matches(":focus-visible")) show(el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideNow();
    };

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", hideSoon);
    root.addEventListener("scroll", hideNow);
    root.addEventListener("click", hideNow);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", hideNow);
    return () => {
      window.clearTimeout(hideTimer.current);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", hideSoon);
      root.removeEventListener("scroll", hideNow);
      root.removeEventListener("click", hideNow);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", hideNow);
      setTip(null);
    };
  }, [side, narrow]);

  if (!tip) return null;
  return (
    <div
      className="side-tip"
      aria-hidden="true"
      style={{ top: tip.top, left: tip.left }}
      onPointerEnter={() => window.clearTimeout(hideTimer.current)}
      onPointerLeave={() => setTip(null)}
    >
      {tip.text}
      {tip.keys && <kbd>{tip.keys}</kbd>}
    </div>
  );
}

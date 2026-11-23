import { useLayoutEffect, type RefObject } from "react";

/**
 * Marks a scrolling box with `data-more-above` / `data-more-below` while there is more to see that
 * way, so the CSS can fade that edge. The box itself shows no scrollbar.
 */
export function useScrollHint(ref: RefObject<HTMLElement | null>, watch: unknown) {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const update = () => {
      box.toggleAttribute("data-more-above", box.scrollTop > 1);
      box.toggleAttribute("data-more-below", box.scrollTop + box.clientHeight < box.scrollHeight - 1);
    };
    update();
    box.addEventListener("scroll", update, { passive: true });
    const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    sizes?.observe(box);
    for (const child of box.children) sizes?.observe(child);
    return () => {
      box.removeEventListener("scroll", update);
      sizes?.disconnect();
    };
  }, [ref, watch]);
}

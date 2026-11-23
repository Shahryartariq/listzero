import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

/**
 * Dragging tasks up and down a list (or around a grid of cards) by a handle, with a pointer, a
 * finger or the arrow keys. Nothing moves in the data until the drop: while dragging, the rows
 * only slide out of the way with transforms. `onMove(id, to)` is called once, with the new index.
 */

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Drag {
  id: string;
  from: number;
  over: number;
  dx: number;
  dy: number;
  /** Each row's box when the drag started, in page coordinates, in the list's order. */
  boxes: Box[];
  gap: number;
  /** One column (a list): rows stack, so the others move by the dragged row's height. */
  stacked: boolean;
}

interface Measure {
  startX: number;
  startY: number;
  startScroll: number;
  pointerX: number;
  pointerY: number;
  frame: number;
}

export interface GripProps {
  onPointerDown(e: PointerEvent<HTMLButtonElement>): void;
  onKeyDown(e: KeyboardEvent<HTMLButtonElement>): void;
}

export function useReorder(
  ids: string[],
  list: RefObject<HTMLElement | null>,
  onMove: ((id: string, to: number) => void) | undefined,
) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [said, setSaid] = useState("");
  const measure = useRef<Measure | null>(null);
  const latest = useRef({ ids, onMove, drag });
  latest.current = { ids, onMove, drag };

  const finish = useCallback((commit: boolean) => {
    const m = measure.current;
    if (m) cancelAnimationFrame(m.frame);
    measure.current = null;
    const { drag: d, onMove: move, ids: all } = latest.current;
    setDrag(null);
    if (commit && d && d.over !== d.from && move) {
      move(d.id, d.over);
      setSaid(`Moved to ${d.over + 1} of ${all.length}.`);
    }
  }, []);

  // Escape puts everything back.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, finish]);

  const update = useCallback(() => {
    const m = measure.current;
    const d = latest.current.drag;
    if (!m || !d) return;
    const dx = m.pointerX - m.startX;
    const dy = m.pointerY - m.startY + (window.scrollY - m.startScroll);
    const me = d.boxes[d.from]!;
    const cx = me.left + me.width / 2 + dx;
    const cy = me.top + me.height / 2 + dy;
    let over = d.from;
    if (d.stacked) {
      // Past the middle of a row, take its place.
      over = 0;
      d.boxes.forEach((box, i) => {
        if (i !== d.from && cy > box.top + box.height / 2) over++;
      });
    } else {
      let best = Infinity;
      d.boxes.forEach((box, i) => {
        const dist = Math.hypot(cx - (box.left + box.width / 2), cy - (box.top + box.height / 2));
        if (dist < best) {
          best = dist;
          over = i;
        }
      });
    }
    setDrag({ ...d, over, dx: d.stacked ? 0 : dx, dy });
  }, []);

  // Near the top or bottom of the window, keep scrolling while the pointer stays there.
  const scrollLoop = useCallback(() => {
    const m = measure.current;
    if (!m) return;
    const edge = 80;
    const bottom = window.innerHeight - edge - (document.querySelector(".tabs")?.getBoundingClientRect().height ?? 0);
    const speed = m.pointerY < edge ? -(edge - m.pointerY) / 4 : m.pointerY > bottom ? (m.pointerY - bottom) / 4 : 0;
    if (speed !== 0) {
      window.scrollBy(0, Math.max(-24, Math.min(24, speed)));
      update();
    }
    m.frame = requestAnimationFrame(scrollLoop);
  }, [update]);

  const gripFor = (id: string): GripProps | undefined => {
    if (!onMove) return undefined;
    return {
      onPointerDown(e) {
        if (e.button !== 0 || !list.current) return;
        const rows = [...list.current.querySelectorAll<HTMLElement>(":scope > [data-task]")];
        const from = ids.indexOf(id);
        if (from < 0 || rows.length !== ids.length) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const boxes = rows.map((row) => {
          const r = row.getBoundingClientRect();
          return { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
        });
        const gap = parseFloat(getComputedStyle(list.current).rowGap) || 0;
        measure.current = {
          startX: e.clientX,
          startY: e.clientY,
          startScroll: window.scrollY,
          pointerX: e.clientX,
          pointerY: e.clientY,
          frame: 0,
        };
        const stacked = boxes.every((b) => Math.abs(b.left - boxes[0]!.left) < 2);
        const first = { id, from, over: from, dx: 0, dy: 0, boxes, gap, stacked };
        latest.current.drag = first;
        setDrag(first);
        measure.current.frame = requestAnimationFrame(scrollLoop);
        const target = e.currentTarget;
        const move = (ev: globalThis.PointerEvent) => {
          if (!measure.current) return;
          measure.current.pointerX = ev.clientX;
          measure.current.pointerY = ev.clientY;
          update();
        };
        const up = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", up);
          target.removeEventListener("pointercancel", cancel);
          finish(true);
        };
        const cancel = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", up);
          target.removeEventListener("pointercancel", cancel);
          finish(false);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
        target.addEventListener("pointercancel", cancel);
      },
      onKeyDown(e) {
        const from = ids.indexOf(id);
        const to = e.key === "ArrowUp" ? from - 1 : e.key === "ArrowDown" ? from + 1 : -2;
        if (to === -2) return;
        e.preventDefault();
        if (to < 0 || to >= ids.length) {
          setSaid(to < 0 ? "Already at the top." : "Already at the bottom.");
          return;
        }
        onMove(id, to);
        setSaid(`Moved to ${to + 1} of ${ids.length}.`);
      },
    };
  };

  /** Where each row is drawn while dragging. */
  const styleFor = (id: string): { style?: CSSProperties; dragging: boolean } => {
    if (!drag) return { dragging: false };
    const i = ids.indexOf(id);
    if (i < 0) return { dragging: false };
    if (i === drag.from) return { dragging: true, style: { transform: `translate(${drag.dx}px, ${drag.dy}px)` } };
    // Where this row lands if the drop happened now.
    let slot = i;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) slot = i - 1;
    if (drag.over < drag.from && i >= drag.over && i < drag.from) slot = i + 1;
    if (slot === i) return { dragging: false };
    const me = drag.boxes[i]!;
    if (drag.stacked) {
      const shift = drag.boxes[drag.from]!.height + drag.gap;
      return { dragging: false, style: { transform: `translateY(${slot < i ? -shift : shift}px)` } };
    }
    const to = drag.boxes[slot]!;
    return { dragging: false, style: { transform: `translate(${to.left - me.left}px, ${to.top - me.top}px)` } };
  };

  return { dragging: drag !== null, gripFor, styleFor, said };
}

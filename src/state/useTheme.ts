import { useEffect, useRef } from "react";
import type { Settings } from "../lib/types";

type Look = Pick<Settings, "theme" | "palette" | "textSize" | "calm">;

function apply(look: Look, systemDark: boolean) {
  const root = document.documentElement;
  root.dataset.theme = look.theme === "system" ? (systemDark ? "dark" : "light") : look.theme;
  root.dataset.palette = look.palette;
  if (look.textSize === "large") root.dataset.text = "large";
  else delete root.dataset.text;
  if (look.calm) root.dataset.calm = "true";
  else delete root.dataset.calm;
  // The browser's own chrome takes the page colour, whatever the palette.
  const paper = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (paper) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", paper);
}

/**
 * Applies the chosen look to <html> and follows the system while the mode is "system".
 * A change the user makes cross-fades; the first paint and reduced-motion users get it at once.
 */
export function useTheme({ theme, palette, textSize, calm }: Look) {
  const first = useRef(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const look = { theme, palette, textSize, calm };
    const run = () => apply(look, media.matches);
    const still = calm || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (first.current || still || typeof document.startViewTransition !== "function") run();
    else document.startViewTransition(run);
    first.current = false;

    media.addEventListener("change", run);
    return () => media.removeEventListener("change", run);
  }, [theme, palette, textSize, calm]);
}

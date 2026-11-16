import { useEffect } from "react";
import type { ThemeChoice } from "../lib/types";

const COLORS = { light: "#f1f2ec", dark: "#1b2726" } as const;

/** Applies the chosen theme to <html> and follows the system while the choice is "system". */
export function useTheme(choice: ThemeChoice, calm: boolean) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = choice === "system" ? (media.matches ? "dark" : "light") : choice;
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COLORS[theme]);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [choice]);

  useEffect(() => {
    if (calm) document.documentElement.dataset.calm = "true";
    else delete document.documentElement.dataset.calm;
  }, [calm]);
}

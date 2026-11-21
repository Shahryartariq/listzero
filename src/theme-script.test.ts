import { afterEach, describe, expect, it } from "vitest";
import source from "../public/theme.js?raw";

/** public/theme.js runs before the first paint; these run it the same way, against a DOM. */
const run = (saved: unknown) => {
  if (saved === undefined) localStorage.removeItem("listzero:v1");
  else localStorage.setItem("listzero:v1", typeof saved === "string" ? saved : JSON.stringify(saved));
  window.matchMedia ??= (() => ({ matches: false })) as unknown as typeof window.matchMedia;
  new Function(source)();
  return document.documentElement.dataset;
};

describe("the script that sets the look before the first paint", () => {
  afterEach(() => {
    for (const key of Object.keys(document.documentElement.dataset)) delete document.documentElement.dataset[key];
    localStorage.clear();
  });

  it("narrows the sidebar when that was chosen, so the layout does not jump on load", () => {
    expect(run({ version: 1, settings: { sidebarCollapsed: true } }).sidebar).toBe("collapsed");
  });

  it("leaves the full sidebar otherwise, and copes with nothing saved or something unreadable", () => {
    expect(run({ version: 1, settings: { sidebarCollapsed: "yes" } }).sidebar).toBeUndefined();
    expect(run(undefined).sidebar).toBeUndefined();
    expect(run("{not json").sidebar).toBeUndefined();
    expect(run("{not json").theme).toBe("light");
  });

  it("still sets the theme and palette", () => {
    const set = run({ version: 1, settings: { theme: "dark", palette: "sky", textSize: "large" } });
    expect([set.theme, set.palette, set.text]).toEqual(["dark", "sky", "large"]);
  });
});

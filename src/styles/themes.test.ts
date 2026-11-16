// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTES } from "../lib/types";

const css = readFileSync(new URL("./themes.css", import.meta.url), "utf8");
const themeJs = readFileSync(new URL("../../public/theme.js", import.meta.url), "utf8");

type Rgb = [number, number, number];
type Vars = Record<string, string>;

function rule(selector: string): Vars {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[,}]\\s*)${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m").exec(css);
  if (!match) throw new Error(`No rule for ${selector}`);
  const vars: Vars = {};
  for (const [, name, value] of (match[1] ?? "").matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name && value) vars[name] = value.trim();
  }
  return vars;
}

function hex(value: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  if (!m?.[1]) throw new Error(`Not a hex colour: ${value}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** color-mix(in srgb, a p%, b) */
const mix = (a: Rgb, b: Rgb, share: number): Rgb => a.map((v, i) => v * share + (b[i] ?? 0) * (1 - share)) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const shares = rule("[data-palette]");
const share = (name: string) => {
  const m = /var\(--ink\)\s+(\d+)%/.exec(shares[name] ?? "");
  if (!m?.[1]) throw new Error(`No ink share for --${name}`);
  return Number(m[1]) / 100;
};

const cases = PALETTES.flatMap((palette) => (["light", "dark"] as const).map((mode) => ({ palette, mode })));

describe.each(cases)("$palette, $mode", ({ palette, mode }) => {
  const own = rule(`[data-palette="${palette}"][data-theme="${mode}"]`);
  const shared = rule(`[data-theme="${mode}"]`);
  const bg = hex(own.bg ?? "");
  const surface = hex(own.surface ?? "");
  const ink = hex(own.ink ?? "");
  const papers = [bg, surface];

  it("has strong text contrast (AAA) on the page and on tiles", () => {
    for (const paper of papers) expect(contrast(ink, paper)).toBeGreaterThanOrEqual(7);
  });

  it("keeps muted text at AA on the page and on tiles", () => {
    const muted = mix(ink, bg, share("muted"));
    for (const paper of papers) expect(contrast(muted, paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps control outlines at 3:1", () => {
    const outline = mix(ink, bg, share("line-strong"));
    for (const paper of papers) expect(contrast(outline, paper)).toBeGreaterThanOrEqual(3);
  });

  it("keeps text on the accent at AA", () => {
    expect(contrast(hex(own["mark-ink"] ?? ""), hex(own.mark ?? ""))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps priority colours readable and list dots visible", () => {
    for (const paper of papers) {
      for (const name of ["p1", "p2", "p3"]) {
        expect(contrast(hex(shared[name] ?? ""), paper), `--${name}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const [name, value] of Object.entries(shared)) {
        if (name.startsWith("c-")) expect(contrast(hex(value), paper), `--${name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps text readable on a task's colour wash and in the board's columns", () => {
    const muted = mix(ink, bg, share("muted"));
    for (const [name, value] of Object.entries(shared)) {
      if (!name.startsWith("c-")) continue;
      // .row[data-color]: 10% of the colour over the tile.
      const wash = mix(hex(value), surface, 0.1);
      expect(contrast(ink, wash), `ink on ${name}`).toBeGreaterThanOrEqual(7);
      expect(contrast(muted, wash), `muted on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
    // .column: 5% ink over the page.
    const well = mix(ink, bg, 0.05);
    expect(contrast(muted, well)).toBeGreaterThanOrEqual(4.5);
  });

  it("is not harsh: no pure white or pure black, and the page is low in saturation", () => {
    for (const colour of [bg, surface, ink]) {
      expect(Math.max(...colour)).toBeLessThan(255);
      expect(Math.min(...colour)).toBeGreaterThan(0);
    }
    const spread = (Math.max(...bg) - Math.min(...bg)) / 255;
    expect(spread).toBeLessThan(0.12);
  });

  it("matches the page colour the pre-paint script gives the browser", () => {
    const entry = new RegExp(`${palette}:\\s*\\["(#[0-9a-f]{6})",\\s*"(#[0-9a-f]{6})"\\]`).exec(themeJs);
    expect(entry?.[mode === "light" ? 1 : 2]).toBe(own.bg);
  });
});

it("the default look is Chalk in light mode", () => {
  expect(css).toMatch(/:root,\s*\[data-palette="chalk"\]\[data-theme="light"\]/);
});

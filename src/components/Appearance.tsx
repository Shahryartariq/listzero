import { PALETTES, type Palette, type TextSize, type ThemeChoice } from "../lib/types";
import { useStore } from "../state/store-context";
import { Sheet } from "./Sheet";

const MODES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Match my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const PALETTE_NAME: Record<Palette, string> = {
  chalk: "Chalk",
  sage: "Sage",
  sky: "Sky",
  sand: "Sand",
  lilac: "Lilac",
  rose: "Rose",
};

const SIZES: { value: TextSize; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
];

/** Colour, light or dark, and text size. Every change applies at once and is saved. */
export function Appearance() {
  const store = useStore();
  const { settings } = store.data;
  // Previews follow the mode on screen, so a swatch shows exactly what choosing it gives.
  const mode = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const shown = settings.theme === "system" ? mode : settings.theme;

  return (
    <div className="appearance">
      <div>
        <span className="label" id="palette-label">
          Colour
        </span>
        <div className="palettes" role="radiogroup" aria-labelledby="palette-label">
          {PALETTES.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              className="palette"
              aria-checked={settings.palette === p}
              onClick={() => store.updateSettings({ palette: p })}
            >
              <span className="palette__preview" data-palette={p} data-theme={shown} aria-hidden="true">
                <span className="palette__dot" />
                <span className="palette__lines" />
              </span>
              <span className="palette__name">{PALETTE_NAME[p]}</span>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: "0.5rem" }}>
          All six are low-glare and easy to read.
        </p>
      </div>

      <div>
        <span className="label" id="mode-label">
          Light or dark
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="mode-label">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              className="seg__opt"
              aria-checked={settings.theme === m.value}
              onClick={() => store.updateSettings({ theme: m.value })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label" id="size-label">
          Text size
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="size-label">
          {SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              className="seg__opt"
              aria-checked={settings.textSize === s.value}
              onClick={() => store.updateSettings({ textSize: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppearanceSheet({ onClose }: { onClose(): void }) {
  return (
    <Sheet title="Appearance" small onClose={onClose}>
      <Appearance />
    </Sheet>
  );
}

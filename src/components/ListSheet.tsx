import { useState, type FormEvent } from "react";
import { LIST_COLORS, type ListColor, type TaskList } from "../lib/types";
import { Sheet } from "./Sheet";

const COLOR_NAME: Record<ListColor, string> = {
  slate: "Slate",
  brick: "Brick",
  ochre: "Ochre",
  moss: "Moss",
  teal: "Teal",
  blue: "Blue",
  plum: "Plum",
};

interface ListSheetProps {
  list?: TaskList;
  taken: string[];
  onSave(name: string, color: ListColor): void;
  onDelete?(): void;
  onClose(): void;
}

/** Create a list, or rename, recolour and delete an existing one. */
export function ListSheet({ list, taken, onSave, onDelete, onClose }: ListSheetProps) {
  const [name, setName] = useState(list?.name ?? "");
  const [color, setColor] = useState<ListColor>(list?.color ?? "moss");
  const clean = name.replace(/\s+/g, " ").trim();
  const clash = taken.some((n) => n.toLowerCase() === clean.toLowerCase() && n.toLowerCase() !== list?.name.toLowerCase());

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!clean || clash) return;
    onSave(clean, color);
    onClose();
  };

  return (
    <Sheet title={list ? "List options" : "New list"} small onClose={onClose}>
      <form onSubmit={onSubmit}>
        <label className="label" htmlFor="list-name">
          Name
        </label>
        <input
          id="list-name"
          className="field"
          value={name}
          maxLength={60}
          autoFocus
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          aria-describedby={clash ? "list-name-error" : undefined}
          aria-invalid={clash || undefined}
        />
        {clash && (
          <p className="hint" id="list-name-error" style={{ marginTop: "0.4rem" }}>
            You already have a list with this name.
          </p>
        )}
        <div className="detail__group">
          <span className="label" id="list-color">
            Colour
          </span>
          <div className="swatches" role="radiogroup" aria-labelledby="list-color">
            {LIST_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                className="swatch"
                aria-checked={color === c}
                aria-label={COLOR_NAME[c]}
                title={COLOR_NAME[c]}
                onClick={() => setColor(c)}
              >
                <span className="dot" style={{ "--dot": `var(--c-${c})` } as React.CSSProperties} />
              </button>
            ))}
          </div>
        </div>
        <div className="section__actions" style={{ justifyContent: "space-between", marginTop: "1.5rem" }}>
          {onDelete ? (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              Delete list
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn" disabled={!clean || clash}>
            {list ? "Save list" : "Create list"}
          </button>
        </div>
        {onDelete && (
          <p className="hint" style={{ marginTop: "0.75rem" }}>
            Deleting a list keeps its tasks. They move to the Inbox.
          </p>
        )}
      </form>
    </Sheet>
  );
}

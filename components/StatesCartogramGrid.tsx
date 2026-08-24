"use client";

import { stateFill, type MapMode, type StateRow } from "./StatesOverviewMap";

const UNFILLED = "var(--app-tab-bg)";

export default function StatesCartogramGrid({
  rows,
  mode,
  selected,
  onSelect,
}: {
  rows: StateRow[];
  mode: MapMode;
  selected: StateRow | null;
  onSelect: (row: StateRow | null) => void;
}) {
  return (
    <div
      className="grid gap-[5px]"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))" }}
    >
      {rows.map((row) => {
        const isSelected = selected?.abbr === row.abbr;
        const fill = stateFill(row, mode, UNFILLED);
        return (
          <button
            key={row.abbr}
            type="button"
            onClick={() => onSelect(isSelected ? null : row)}
            aria-label={row.name}
            aria-pressed={isSelected}
            className="aspect-square rounded-[5px] text-[11px] font-bold tracking-wide transition-transform hover:-translate-y-0.5"
            style={{
              background: fill,
              color: fill === UNFILLED ? "var(--app-text-muted)" : "#ffffff",
              outline: isSelected ? "2px solid var(--app-text-primary)" : "2px solid transparent",
              outlineOffset: 1,
            }}
          >
            {row.abbr}
          </button>
        );
      })}
    </div>
  );
}

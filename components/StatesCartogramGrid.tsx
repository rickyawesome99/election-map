"use client";

import { useState } from "react";
import type { Theme } from "./ForecastMap";
import PinnedMapCard, { PinnedCardClose, PinnedCardLink, pinFromEvent, type MapPin } from "./maps/PinnedMapCard";
import { STATE_CARD_BOX, STATE_PIN_WIDTH, StateCardBody, stateFill, stateHref, type MapMode, type StateRow } from "./StatesOverviewMap";

const UNFILLED = "var(--app-tab-bg)";

export default function StatesCartogramGrid({
  rows,
  theme: t,
  mode,
  selected,
  onSelect,
}: {
  theme: Theme;
  rows: StateRow[];
  mode: MapMode;
  selected: StateRow | null;
  onSelect: (row: StateRow | null) => void;
}) {
  // Phones: a tapped tile pins the map's state card over the grid, as a tapped state does on the map.
  const [pin, setPin] = useState<{ abbr: string; at: MapPin } | null>(null);
  return (
    <div className="relative" data-map-pin="">
    {selected && pin?.abbr === selected.abbr && (
      <PinnedMapCard pin={pin.at} width={STATE_PIN_WIDTH} label={selected.name} className="md:hidden">
        <div className="rounded-lg" style={STATE_CARD_BOX(t)}>
          <StateCardBody row={selected} mode={mode} t={t}
            aside={<PinnedCardClose onClick={() => onSelect(null)} />}
            footer={<PinnedCardLink href={stateHref(selected, mode)}>Go to {selected.name}</PinnedCardLink>} />
        </div>
      </PinnedMapCard>
    )}
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
            onClick={(e) => {
              const at = pinFromEvent(e);
              setPin(isSelected || !at ? null : { abbr: row.abbr, at });
              onSelect(isSelected ? null : row);
            }}
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
    </div>
  );
}

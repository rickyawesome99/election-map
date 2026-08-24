"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { formatPvi, type MapMode, type StateRow } from "./StatesOverviewMap";

export const MODE_LABELS: Record<MapMode, string> = {
  governor: "Governor",
  senate: "Senate",
  house: "House",
  legislature: "Legislature",
};

export function ModeValue({ row, mode, large }: { row: StateRow; mode: MapMode; large?: boolean }) {
  const sizeClass = large ? "text-2xl" : "text-sm";
  if (mode === "governor") {
    const p = row.govParty;
    const label = p === "D" ? "Dem" : p === "R" ? "Rep" : p === "I" ? "Ind" : "—";
    const color = p === "D" ? "var(--party-dem)" : p === "R" ? "var(--party-rep)" : p === "I" ? "#b8a020" : "var(--app-text-very-muted)";
    return <span className={`font-extrabold ${sizeClass}`} style={{ color }}>{label}</span>;
  }
  if (mode === "senate") {
    return (
      <span className={`tabular-nums font-extrabold ${sizeClass}`}>
        <span style={{ color: "var(--party-dem)" }}>{row.senateDem}D</span>
        <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
        <span style={{ color: "var(--party-rep)" }}>{row.senateRep}R</span>
        {row.senateInd > 0 && <span style={{ color: "#b8a020" }}>–{row.senateInd}I</span>}
      </span>
    );
  }
  if (mode === "house") {
    return (
      <span className={`tabular-nums font-extrabold ${sizeClass}`}>
        <span style={{ color: "var(--party-dem)" }}>{row.houseDem}D</span>
        <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
        <span style={{ color: "var(--party-rep)" }}>{row.houseRep}R</span>
      </span>
    );
  }
  return (
    <span className={`tabular-nums font-extrabold ${sizeClass}`}>
      <span style={{ color: "var(--party-dem)" }}>{row.stateLegHouseDem ?? "—"}D</span>
      <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
      <span style={{ color: "var(--party-rep)" }}>{row.stateLegHouseRep ?? "—"}R</span>
    </span>
  );
}

export default function StatesLedgerList({
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
  const sorted = [...rows].sort((a, b) => (a.pvi2026 ?? 999) - (b.pvi2026 ?? 999));
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) return;
    // Only autoscroll on desktop, where the list is its own capped scrollbox — on mobile
    // the list sits inline in the page and a mobile popup already surfaces the selection,
    // so scrolling here would just yank the whole page down to the row.
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-abbr="${selected.abbr}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div>
      <div
        className="flex items-baseline justify-between pb-2.5 mb-0.5"
        style={{ borderBottom: "2px solid var(--app-text-primary)" }}
      >
        <span className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
          States
        </span>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          {MODE_LABELS[mode]} · 50
        </span>
      </div>
      <div ref={listRef} className="flex flex-col">
        {sorted.map((row) => {
          const isSelected = selected?.abbr === row.abbr;
          return (
            <button
              key={row.abbr}
              type="button"
              data-abbr={row.abbr}
              onClick={() => onSelect(isSelected ? null : row)}
              className="text-left py-2.5 w-full"
              style={{
                borderBottom: "1px solid var(--app-border)",
                background: isSelected ? "var(--app-tab-bg)" : "transparent",
                marginLeft: isSelected ? "-0.6rem" : 0,
                marginRight: isSelected ? "-0.6rem" : 0,
                paddingLeft: isSelected ? "0.6rem" : 0,
                paddingRight: isSelected ? "0.6rem" : 0,
                borderRadius: isSelected ? 6 : 0,
                width: isSelected ? "calc(100% + 1.2rem)" : "100%",
              }}
            >
              <div className="flex items-center justify-between gap-3 min-w-0">
                <span className="min-w-0 truncate" style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", fontWeight: 700, color: "var(--app-text-primary)" }}>
                  {row.name}
                  <span className="ml-1.5 text-[10px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{row.abbr}</span>
                </span>
                <div className="shrink-0 flex items-center gap-2">
                  <ModeValue row={row} mode={mode} />
                </div>
              </div>
              {isSelected && (
                <div className="mt-1.5">
                  {mode === "legislature" && (
                    <div className="text-[11px] mb-1" style={{ color: "var(--app-text-muted)" }}>
                      St. Senate <span style={{ color: "var(--party-dem)" }}>{row.stateLegSenateDem ?? "—"}D</span>
                      <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
                      <span style={{ color: "var(--party-rep)" }}>{row.stateLegSenateRep ?? "—"}R</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                      PVI {formatPvi(row.pvi2026)}
                    </span>
                    <Link
                      href={`/states/${row.id}`}
                      className="text-[11px] font-semibold hover:underline"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      View state page →
                    </Link>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

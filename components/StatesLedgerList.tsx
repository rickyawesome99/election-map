"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { legislatureControl, type MapMode, type StateRow } from "./StatesOverviewMap";

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
    const seats = [
      { count: row.senateDem, party: "D", color: "var(--party-dem)" },
      { count: row.senateRep, party: "R", color: "var(--party-rep)" },
      { count: row.senateInd, party: "I", color: "#b8a020" },
    ].filter(({ count }) => count > 0);
    return (
      <span className={`tabular-nums font-extrabold ${sizeClass}`}>
        {seats.map(({ count, party, color }, index) => (
          <span key={party}>
            {index > 0 && <span style={{ color: "var(--app-text-very-muted)" }}>–</span>}
            <span style={{ color }}>{count}{party}</span>
          </span>
        ))}
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
  const control = legislatureControl(row);
  const demChambers = control.filter((party) => party === "D").length;
  const repChambers = control.filter((party) => party === "R").length;
  if (row.abbr === "NE") {
    const party = control[0];
    return <span className={`font-extrabold ${sizeClass}`} style={{ color: party === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>{party ?? "—"}</span>;
  }
  return (
    <span className={`tabular-nums font-extrabold ${sizeClass}`}>
      {demChambers > 0 && <span style={{ color: "var(--party-dem)" }}>{demChambers}D</span>}
      {demChambers > 0 && repChambers > 0 && " "}
      {repChambers > 0 && <span style={{ color: "var(--party-rep)" }}>{repChambers}R</span>}
      {control.length === 0 && <span style={{ color: "var(--app-text-very-muted)" }}>—</span>}
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
      <div ref={listRef} className="states-ledger-scroll flex flex-col">
        {sorted.map((row) => {
          const isSelected = selected?.abbr === row.abbr;
          return (
            <div
              key={row.abbr}
              role="button"
              tabIndex={0}
              data-abbr={row.abbr}
              onClick={() => onSelect(isSelected ? null : row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(isSelected ? null : row);
                }
              }}
              className={`cursor-pointer text-left py-2.5 w-full ${isSelected ? "states-ledger-row-selected" : ""}`}
              style={{
                borderBottom: "1px solid var(--app-border)",
                background: isSelected ? "var(--app-tab-bg)" : "transparent",
                borderRadius: isSelected ? 6 : 0,
              }}
            >
              <div className="flex items-center justify-between gap-3 min-w-0">
                <Link
                  href={`/states/${row.id}`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="min-w-0 truncate hover:underline"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", fontWeight: 700, color: "var(--app-text-primary)" }}
                >
                  {row.name}
                  <span className="ml-1.5 text-[10px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{row.abbr}</span>
                </Link>
                <div className="shrink-0 flex items-center gap-2">
                  <ModeValue row={row} mode={mode} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

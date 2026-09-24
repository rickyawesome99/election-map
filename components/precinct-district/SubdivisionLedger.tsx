"use client";

// The township / city ledger beside the map: one row per subdivision with the value the map is
// currently coloring by. Clicking a row filters the map and table to that subdivision.

export interface LedgerRow {
  id: string;
  name: string;
  count: number;
  ballots: number;
  valueLabel: string;
  valueColor: string;       // text color for the value
  swatch: string | null;    // fill color matching the map
}

export default function SubdivisionLedger({
  rows, active, onToggle, valueHeader, totalRow,
}: {
  rows: LedgerRow[];
  active: string | null;
  onToggle: (id: string | null) => void;
  valueHeader: string;
  totalRow?: { label: string; valueLabel: string; valueColor: string; ballots: number; count: number };
}) {
  return (
    <div className="text-[12.5px]">
      <div className="flex items-baseline justify-between pb-1.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Area</span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{valueHeader}</span>
      </div>
      {totalRow && (
        <button
          onClick={() => onToggle(null)}
          className="flex w-full items-center gap-2 py-1.5 text-left"
          style={{ borderBottom: "1px solid var(--app-border)", background: active == null ? "var(--app-tab-bg)" : undefined, margin: "0 -6px", padding: "6px 6px", width: "calc(100% + 12px)", borderRadius: 4 }}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: "transparent", border: "1px solid var(--app-border)" }} />
          <span className="min-w-0 flex-1 truncate font-bold" style={{ color: "var(--app-text-primary)" }}>{totalRow.label}</span>
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{totalRow.count}</span>
          <span className="w-14 shrink-0 text-right font-bold tabular-nums" style={{ color: totalRow.valueColor }}>{totalRow.valueLabel}</span>
        </button>
      )}
      {rows.map((r) => {
        const isActive = active === r.id;
        return (
          <button
            key={r.id}
            onClick={() => onToggle(isActive ? null : r.id)}
            aria-pressed={isActive}
            className="flex w-full items-center gap-2 py-1.5 text-left transition-colors"
            style={{ borderBottom: "1px solid var(--app-border)", background: isActive ? "var(--app-tab-bg)" : undefined, margin: "0 -6px", padding: "6px 6px", width: "calc(100% + 12px)", borderRadius: 4, opacity: active && !isActive ? 0.55 : 1 }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.swatch ?? "var(--map-unfilled)" }} />
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: "var(--app-text-primary)" }}>{r.name}</span>
            <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{r.count}</span>
            <span className="w-14 shrink-0 text-right font-semibold tabular-nums" style={{ color: r.valueColor }}>{r.valueLabel}</span>
          </button>
        );
      })}
      <div className="pt-1.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>count = precincts · click an area to focus it</div>
    </div>
  );
}

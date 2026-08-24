"use client";

import Link from "next/link";
import { formatPvi, type MapMode, type StateRow } from "./StatesOverviewMap";
import { MODE_LABELS, ModeValue } from "./StatesLedgerList";

// Mobile-only popup summary for a tapped state — appears right below the map/cartogram.
// Styled after the flat "Selected District" row on the individual state pages: a rule-anchored
// section label, then a borderless info row (name, detail, big value, "View" link) — no card chrome.
export default function StatesSelectedCard({
  row,
  mode,
  onClose,
}: {
  row: StateRow;
  mode: MapMode;
  onClose: () => void;
}) {
  return (
    <section>
      <div
        className="flex items-baseline justify-between gap-3 pb-2.5 mb-1"
        style={{ borderBottom: "2px solid var(--app-text-primary)" }}
      >
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
          Selected State
        </h2>
        <button onClick={onClose} aria-label="Close" className="shrink-0" style={{ color: "var(--app-text-very-muted)" }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="py-4 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="text-base font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}>
                {row.name}
              </span>
              <span className="text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{row.abbr}</span>
            </div>

            <div className="flex flex-col gap-0.5">
              {mode === "legislature" ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm" style={{ color: "var(--app-text-muted)" }}>State House</span>
                    <span className="tabular-nums font-bold text-sm">
                      <span style={{ color: "var(--party-dem)" }}>{row.stateLegHouseDem ?? "—"}D</span>
                      <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
                      <span style={{ color: "var(--party-rep)" }}>{row.stateLegHouseRep ?? "—"}R</span>
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm" style={{ color: "var(--app-text-muted)" }}>State Senate</span>
                    <span className="tabular-nums font-bold text-sm">
                      <span style={{ color: "var(--party-dem)" }}>{row.stateLegSenateDem ?? "—"}D</span>
                      <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
                      <span style={{ color: "var(--party-rep)" }}>{row.stateLegSenateRep ?? "—"}R</span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                  PVI {formatPvi(row.pvi2026)}
                </div>
              )}
            </div>

            <Link
              href={`/states/${row.id}`}
              className="mt-3 flex items-center gap-1 text-xs font-bold hover:underline"
              style={{ color: "var(--app-text-primary)" }}
            >
              View State Page
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="shrink-0">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1 text-right" style={{ color: "var(--app-text-muted)" }}>
              {MODE_LABELS[mode]}
            </div>
            <ModeValue row={row} mode={mode} large />
          </div>
        </div>
      </div>
    </section>
  );
}

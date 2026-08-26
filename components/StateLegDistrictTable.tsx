"use client";

import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { StateLegPres2024 } from "@/data/stateLegPres2024";
import { getRatingColors, fmtMargin } from "@/lib/colorScale";

const CHAMBER_LABEL: Record<Chamber, string> = {
  house: "State House",
  senate: "State Senate",
};

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-dem)",
  R: "var(--party-rep)",
  I: "var(--party-ind)",
  O: "var(--app-text-secondary)",
};

const COLUMN_HEADERS = ["District", "Incumbent", "Party", "Last Election", "Margin", "Rating", "2024 President"];

export default function StateLegDistrictTable({
  districts,
  chamber,
  stateName,
  isUnicameral = false,
  pres2024 = {},
}: {
  districts: StateLegDistrict[];
  chamber: Chamber;
  stateName: string;
  isUnicameral?: boolean;
  pres2024?: Record<string, StateLegPres2024>;
}) {
  const chamberLabel = isUnicameral ? "Legislature" : CHAMBER_LABEL[chamber];

  return (
    <section className="flex min-w-0 flex-col" style={{ height: "25rem" }}>
      <div
        className="flex shrink-0 items-baseline justify-between gap-3 pb-3 mb-1"
        style={{ borderBottom: "2px solid var(--app-text-primary)" }}
      >
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
          {chamberLabel} Districts
        </h2>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          {districts.length} district{districts.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10" style={{ background: "var(--app-bg)" }}>
              {COLUMN_HEADERS.map((label, i) => (
                <th
                  key={label}
                  className={`pb-2 pr-3 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${i === 0 ? "text-left" : i === 1 ? "text-left" : "text-right"}`}
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {districts.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_HEADERS.length} className="px-4 py-10 text-center">
                  <p className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
                    District data for {stateName} {chamberLabel} isn&apos;t available yet.
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                    Check back once 2026 boundaries and results are added.
                  </p>
                </td>
              </tr>
            ) : (
              districts.map((d) => {
                const incumbents = d.incumbents ?? [];
                const { bg, text } = d.rating ? getRatingColors(d.rating) : { bg: "", text: "" };
                const pres = pres2024[d.number];
                return (
                  <tr key={d.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className="py-3 pr-3 text-left font-semibold whitespace-nowrap tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                      {d.number}
                    </td>
                    <td className="py-3 pr-3 text-left" style={{ color: "var(--app-text-primary)" }}>
                      {incumbents.length > 0 ? (
                        incumbents.map((inc) => inc.name).join(", ")
                      ) : (
                        <span className="italic" style={{ color: "var(--app-text-very-muted)" }}>Vacant</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold whitespace-nowrap">
                      {incumbents.length > 0 ? (
                        incumbents.map((inc, j) => (
                          <span key={j} style={{ color: PARTY_COLOR[inc.party] }}>
                            {j > 0 && <span style={{ color: "var(--app-text-very-muted)" }}>, </span>}
                            {inc.party}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: "var(--app-text-very-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                      {incumbents.some((inc) => inc.lastElection != null) ? (
                        incumbents.map((inc, j) => (
                          <span key={j} style={{ color: (inc.lastElection ?? d.lastElection) != null ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                            {j > 0 && <span style={{ color: "var(--app-text-very-muted)" }}>, </span>}
                            {inc.lastElection ?? d.lastElection ?? "—"}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: d.lastElection != null ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>{d.lastElection ?? "—"}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: d.margin != null ? (d.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)") : "var(--app-text-very-muted)" }}>
                      {d.margin != null ? `${d.margin <= 0 ? "D" : "R"}+${Math.abs(d.margin).toFixed(1)}` : "—"}
                    </td>
                    <td className="py-3 pr-3 text-right whitespace-nowrap">
                      {d.rating ? (
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: bg, color: text }}>
                          {d.rating}
                        </span>
                      ) : (
                        <span style={{ color: "var(--app-text-very-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: pres ? (pres.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)") : "var(--app-text-very-muted)" }}>
                      {pres ? (
                        <span title={pres.estimated ? "Estimated - no 2024 election in this district" : undefined}>
                          {pres.estimated && "~"}{fmtMargin(pres.margin)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

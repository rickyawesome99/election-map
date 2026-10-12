"use client";

import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import type { AtlasDistrict, AtlasEra } from "@/lib/stateLegAtlas";
import { projectedMarginColor } from "@/lib/colorScale";

/** Margin text in the site's standard party colors (not the Safe/Likely/Lean shade scale). */
const marginText = (m: number) => (Math.abs(m) < 0.05 ? "var(--app-text-primary)" : projectedMarginColor(m));

function fmtM(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.05) return "Even";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(digits)}`;
}
function signed(v: number, digits = 1): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}

/**
 * The district's 2026 outlook: the headline, the lean ledger (every row, with its relocation,
 * incumbency and environment strips), and the forward sum. Mirrors the race pages' Forecast
 * Calculation card in flat form.
 */
export default function AtlasOutlook({ district, eras, electionYear }: { district: AtlasDistrict; eras: AtlasEra[]; electionYear: number }) {
  const pr = district.projection;
  if (!pr) return null;
  const eraLabel = (key: string) => (key === "current" ? "today's lines" : `${eras.find((e) => e.key === key)?.label ?? key} map`);
  const decided = pr.contest === "uncontested-D" || pr.contest === "uncontested-R";
  const headline = pr.contest === "not-up"
    ? `Not on the ${electionYear} ballot`
    : pr.contest === "uncontested-D" ? "Democratic seat: no Republican on the ballot"
    : pr.contest === "uncontested-R" ? "Republican seat: no Democrat on the ballot"
    : pr.contest === "contested" && pr.margin != null ? fmtM(pr.margin)
    : "No projection";
  const headColor = pr.contest === "uncontested-D" ? "var(--party-dem)" : pr.contest === "uncontested-R" ? "var(--party-rep)" : pr.margin != null && pr.contest === "contested" ? marginText(pr.margin) : "var(--app-text-muted)";

  return (
    <section>
      <LedgerSectionHead label="Forecast Calculation" meta={pr.contest === "contested" ? `σ ${pr.sigma.toFixed(1)} · ${pr.rows.length} race-years` : undefined} />
      {/* The headline margin, rating and win probability sit in the page hero; this is the working. */}
      {(pr.contest !== "contested" || pr.margin == null) && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <span style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)", fontWeight: 700, color: headColor, lineHeight: 1 }}>{headline}</span>
        </div>
      )}
      {pr.seats > 1 && pr.contest === "contested" && <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{pr.seats} seats, each drawn on the same margin.</p>}

      {pr.contest !== "not-up" && pr.lean != null && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                  {["Race", "Lines", "Raw", "Relocation", "Incumbency", "Environment", "Neutral", "Weight"].map((h, i) => (
                    <th key={h} className={`py-1.5 pr-3 text-[10px] uppercase tracking-wider font-semibold ${i >= 2 ? "text-right" : "text-left"}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...pr.rows].sort((a, b) => b.year - a.year || (a.kind === "P" ? -1 : 1)).map((r) => (
                  <tr key={`${r.year}-${r.kind}`} style={{ borderBottom: "1px solid var(--app-border)", opacity: r.huber < 1 ? 0.75 : 1 }}>
                    <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">{r.label}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: r.relocated ? "var(--app-text-muted)" : "var(--app-text-primary)" }}>
                      {r.relocated ? `${eraLabel(r.era)} → today's` : "today's lines"}{r.coverage < 0.999 && <span style={{ color: "var(--app-text-very-muted)" }}> · {Math.round(r.coverage * 100)}% covered</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right" style={{ color: marginText(r.raw - r.presDelta) }}>{fmtM(r.raw - r.presDelta)}</td>
                    <td className="py-1.5 pr-3 text-right" style={{ color: "var(--app-text-muted)" }}>{r.relocated ? signed(r.presDelta) : "—"}</td>
                    <td className="py-1.5 pr-3 text-right" style={{ color: "var(--app-text-muted)" }}>{r.kind === "L" && r.incSign !== 0 ? signed(r.incPts) : "—"}</td>
                    <td className="py-1.5 pr-3 text-right" style={{ color: "var(--app-text-muted)" }}>{signed(r.envPts)}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: marginText(r.NM) }}>{fmtM(r.NM)}</td>
                    <td className="py-1.5 pr-0 text-right" style={{ color: "var(--app-text-muted)" }}>{(r.weight * 100).toFixed(0)}%{r.huber < 1 && <span title="Huber-downweighted outlier" style={{ color: "var(--app-text-very-muted)" }}> ↓</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 max-w-md text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            {[
              { label: "Structural lean", note: "weighted neutral margins above", value: fmtM(pr.lean) },
              { label: `+ ${electionYear} environment`, note: `β* ${pr.beta.toFixed(2)} × E`, value: signed(pr.envPts) },
              { label: "+ Incumbency", note: pr.incSign === 0 ? "open seat or none marked" : pr.incSign > 0 ? "Republican incumbent" : "Democratic incumbent", value: signed(pr.incPts) },
            ].map((l) => (
              <div key={l.label} className="flex items-baseline gap-3 py-1" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <span className="font-semibold">{l.label}</span>
                <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{l.note}</span>
                <span className="ml-auto">{l.value}</span>
              </div>
            ))}
            <div className="flex items-baseline gap-3 py-1.5" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
              <span className="font-bold">= Projected margin</span>
              <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{decided ? "the seat is decided by the field; the margin is the model's view of the district" : `σ ${pr.sigma.toFixed(1)}`}</span>
              <span className="ml-auto font-bold" style={{ color: pr.margin != null ? marginText(pr.margin) : undefined }}>{fmtM(pr.margin)}</span>
            </div>
          </div>
        </>
      )}
      {pr.contest === "not-up" && district.nextElection && (
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>This seat is next on the ballot in {district.nextElection}.</p>
      )}
    </section>
  );
}

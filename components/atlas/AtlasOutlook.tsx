"use client";

import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import type { AtlasDistrict, AtlasEra, AtlasIndependent } from "@/lib/stateLegAtlas";
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

/** "I+4.2" or "R+4.2": an independent's margin over the major-party nominee. */
function fmtI(advantage: number, opp: "D" | "R"): string {
  return Math.abs(advantage) < 0.05 ? "Even" : `${advantage > 0 ? "I" : opp}+${Math.abs(advantage).toFixed(1)}`;
}

const BASIS: Record<AtlasIndependent["basis"], string> = {
  incumbent: "sitting independent",
  record: "strong last race in the seat",
  endorsed: "backed by a major party",
};

/** The independent-vs-party sum that replaces the two-party one (lib/stateLegForecast.ts step 7). */
function IndependentSum({ indep, lean, envPts, beta, pI, electionYear }: { indep: AtlasIndependent; lean: number; envPts: number; beta: number; pI: number | null; electionYear: number }) {
  const opp = indep.slot === "D" ? "R" : "D";
  const flip = indep.slot === "R" ? 1 : -1;   // the generic absent-party nominee's advantage is ± the R-positive margin
  const inc = indep.sameElectorate ? indep.advantage : indep.advantage - flip * (lean + envPts) - indep.personal;
  const lines = indep.sameElectorate
    ? [{ label: "One electorate", note: `racing the ${opp === "D" ? "Democrats'" : "Republicans'"} last nominee for the district's final seat: no lean or environment`, value: "0.0" },
       { label: "+ Incumbency", note: inc === 0 ? "neither or both sitting" : inc > 0 ? "the independent is sitting" : "the nominee is sitting", value: signed(inc) }]
    : [
      { label: `Generic ${indep.slot === "D" ? "Democrat" : "Republican"}`, note: `the absent party's nominee: lean ${fmtM(lean)} + ${electionYear} environment (β* ${beta.toFixed(2)})`, value: signed(flip * (lean + envPts)) },
      { label: "+ Incumbency", note: inc === 0 ? "neither or both sitting (appointed: none)" : inc > 0 ? "the independent is sitting" : "the nominee is sitting", value: signed(inc) },
      { label: "+ Personal", note: indep.record.length ? `last ${Math.min(2, indep.record.length)} race${indep.record.length > 1 ? "s" : ""} above, shrunk toward the prior` : indep.basis === "endorsed" ? "no record here: the backing party's generic nominee" : "no record here: the prior for a sitting or proven independent", value: signed(indep.personal) },
    ];
  return (
    <div className="mt-4">
      <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
        <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{indep.name}</span> ({indep.partyLabel}, {BASIS[indep.basis]}{indep.endorsedBy ? `, ${indep.endorsedBy === "D" ? "Democratic" : "Republican"}-backed` : ""}) {indep.sameElectorate ? `races the ${opp === "D" ? "Democrats'" : "Republicans'"} ${indep.opponent ?? "nominees"} for one of the district's seats; the others go to the party.` : `takes the place of the absent ${indep.slot === "D" ? "Democrat" : "Republican"} against ${indep.opponent ?? `the ${opp}`}.`}{indep.note ? ` ${indep.note}` : ""}
      </p>
      {indep.record.length > 0 && (
        <table className="mt-3 w-full max-w-md text-xs" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
              {["Race", "Share", "Margin", "Expected", "Residual"].map((h, i) => (
                <th key={h} className={`py-1.5 pr-3 text-[10px] uppercase tracking-wider font-semibold ${i ? "text-right" : "text-left"}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...indep.record].reverse().map((r) => (
              <tr key={r.year} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="py-1.5 pr-3 font-semibold">{r.year} vs {r.opponentParty}</td>
                <td className="py-1.5 pr-3 text-right">{r.share.toFixed(1)}%</td>
                <td className="py-1.5 pr-3 text-right">{fmtI(r.advantage, r.opponentParty)}</td>
                <td className="py-1.5 pr-3 text-right" style={{ color: "var(--app-text-muted)" }}>{signed(r.expected)}</td>
                <td className="py-1.5 pr-0 text-right font-semibold">{signed(r.residual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-3 max-w-md text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline gap-3 py-1" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="font-semibold whitespace-nowrap">{l.label}</span>
            <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{l.note}</span>
            <span className="ml-auto">{l.value}</span>
          </div>
        ))}
        <div className="flex items-baseline gap-3 py-1.5" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
          <span className="font-bold">= Projected margin</span>
          <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{pI != null ? `P(${indep.name}) ${Math.round(pI * 100)}%` : ""}</span>
          <span className="ml-auto font-bold" style={{ color: indep.advantage > 0 ? "var(--party-ind)" : opp === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>{fmtI(indep.advantage, opp)}</span>
        </div>
      </div>
    </div>
  );
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
  const decided = pr.contest === "uncontested-D" || pr.contest === "uncontested-R" || pr.contest === "split";
  const g = pr.guaranteed ?? { dem: 0, rep: 0 };
  const guaranteedNote = g.dem || g.rep ? `${[g.dem ? `${g.dem} Democratic` : "", g.rep ? `${g.rep} Republican` : ""].filter(Boolean).join(" and ")} seat${g.dem + g.rep > 1 ? "s" : ""} decided by the field` : null;
  const headline = pr.contest === "not-up"
    ? `Not on the ${electionYear} ballot`
    : pr.contest === "uncontested-D" ? "Democratic seat: no Republican on the ballot"
    : pr.contest === "uncontested-R" ? "Republican seat: no Democrat on the ballot"
    : pr.contest === "contested" && pr.margin != null ? fmtM(pr.margin)
    : pr.contest === "independent" && pr.indep ? `${pr.indep.name} vs ${pr.indep.slot === "D" ? "R" : "D"}: ${fmtI(pr.indep.advantage, pr.indep.slot === "D" ? "R" : "D")}`
    : pr.contest === "other" && pr.pI === 1 ? "Independent seat: no major party on the ballot"
    : pr.contest === "split" ? `Every seat decided by the field: ${g.dem} D, ${g.rep} R`
    : "No projection";
  const headColor = pr.contest === "uncontested-D" ? "var(--party-dem)" : pr.contest === "uncontested-R" ? "var(--party-rep)" : pr.margin != null && pr.contest === "contested" ? marginText(pr.margin)
    : pr.contest === "independent" && pr.indep ? (pr.indep.advantage > 0 ? "var(--party-ind)" : pr.indep.slot === "D" ? "var(--party-rep)" : "var(--party-dem)")
    : pr.contest === "other" && pr.pI === 1 ? "var(--party-ind)" : "var(--app-text-muted)";

  return (
    <section>
      <LedgerSectionHead label="Forecast Calculation" meta={pr.contest === "contested" ? `σ ${pr.sigma.toFixed(1)} · ${pr.rows.length} race-years` : undefined} />
      {/* The headline margin, rating and win probability sit in the page hero; this is the working. */}
      {(pr.contest !== "contested" || pr.margin == null) && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <span style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)", fontWeight: 700, color: headColor, lineHeight: 1 }}>{headline}</span>
        </div>
      )}
      {pr.seats > 1 && pr.contest === "contested" && <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{guaranteedNote ? `${guaranteedNote}; the other ${pr.contestedSeats ?? pr.seats - g.dem - g.rep} drawn on the margin.` : `${pr.seats} seats, each drawn on the same margin.`}</p>}

      {pr.contest !== "not-up" && pr.lean != null && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                  {["Race", "Lines", "Raw", "Relocation", "Incumbency", "Environment", "Money", "Neutral", "Weight"].map((h, i) => (
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
                    <td className="py-1.5 pr-3 text-right" style={{ color: "var(--app-text-muted)" }} title={r.kind === "L" ? "the race's money term, taken out of its margin (0 where either side's money is not on file)" : undefined}>{r.kind === "L" && r.moneyPts ? signed(-r.moneyPts) : "—"}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: marginText(r.NM) }}>{fmtM(r.NM)}</td>
                    <td className="py-1.5 pr-0 text-right" style={{ color: "var(--app-text-muted)" }}>{(r.weight * 100).toFixed(0)}%{r.huber < 1 && <span title="Huber-downweighted outlier" style={{ color: "var(--app-text-very-muted)" }}> ↓</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pr.contest === "independent" && pr.indep ? (
            <IndependentSum indep={pr.indep} lean={pr.lean} envPts={pr.envPts} beta={pr.beta} pI={pr.pI ?? null} electionYear={electionYear} />
          ) : (
          <div className="mt-3 max-w-md text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            {[
              { label: "Structural lean", note: "weighted neutral margins above", value: fmtM(pr.lean) },
              { label: `+ ${electionYear} environment`, note: `β* ${pr.beta.toFixed(2)} × E`, value: signed(pr.envPts) },
              { label: "+ Incumbency", note: pr.incSign === 0 ? "open seat or none marked" : pr.incSign > 0 ? "Republican incumbent" : "Democratic incumbent", value: signed(pr.incPts) },
              { label: "+ Money", note: pr.money
                ? `raised ${fmtM(pr.money.gapPct)}${pr.money.scale !== 1 ? ` (× ${pr.money.scale} to date)` : ""} vs ${fmtM(pr.money.structuralGapPct)} expected`
                : "either side's money not on file: the typical gap for the seat", value: signed(pr.money?.pts ?? 0) },
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
          )}
        </>
      )}
      {pr.contest === "not-up" && district.nextElection && (
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>This seat is next on the ballot in {district.nextElection}.</p>
      )}
    </section>
  );
}

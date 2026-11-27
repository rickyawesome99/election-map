"use client";

import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import FinalForecastPill from "@/components/FinalForecastPill";
import type { AtlasDistrict, AtlasIndependent } from "@/lib/stateLegAtlas";
import { projectedMarginColor, fmtMargin } from "@/lib/colorScale";

// Rows tint on hover and fade in staggered, as in the race pages' ledgers (globals.css .vh-row).
const ROW = "vh-row vh-row-boxed vh-row-fade";
// Table rows take the table form (.vh-tr): a ::before on a <tr> becomes an extra cell and shifts the columns.
const TR = "vh-tr vh-hover";
const enter = (i: number) => Math.min(i, 8) * 55;

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
  return advantage === 0 ? "Even" : `${advantage > 0 ? "I" : opp}+${Math.abs(advantage).toFixed(1)}`;
}

const BASIS: Record<AtlasIndependent["basis"], string> = {
  incumbent: "sitting independent",
  record: "strong last race in the seat",
  endorsed: "backed by a major party",
};

const LABEL = "text-[10.5px] font-bold uppercase tracking-wider";
const SERIF = { fontFamily: "var(--font-serif)", fontWeight: 700 } as const;
const partyOf = (v: number) => (Math.abs(v) < 0.05 ? "var(--app-text-primary)" : v > 0 ? "var(--party-rep)" : "var(--party-dem)");

/** A term in points, named for the side it helps ("D+4.3"); a term of nothing is "0.0", not a tie. */
const fmtTerm = (v: number) => (Math.abs(v) < 0.05 ? "0.0" : fmtM(v));

type Term = { label: string; value: string; color: string; note?: string; total?: boolean };

/** The race pages' term cells: a small label over a serif figure, a note under it; the total set apart. */
function TermCells({ terms }: { terms: Term[] }) {
  return (
    <div className="-mx-2 grid grid-cols-2 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none">
      {terms.map((t, i) => (
        <div key={t.label} className={`${ROW} flex flex-col gap-1 px-2 py-2.5 hover:z-10`} style={{ animationDelay: `${enter(i)}ms` }}>
          <span className={LABEL} style={{ color: t.total ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{t.label}</span>
          <span className="tabular-nums leading-tight whitespace-nowrap" style={{ ...SERIF, fontSize: "1.35rem", color: t.color }}>{t.value}</span>
          {t.note && <span className="text-[11px] leading-snug" style={{ color: "var(--app-text-very-muted)" }}>{t.note}</span>}
        </div>
      ))}
    </div>
  );
}

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
        <table className="mt-3 w-full max-w-md text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
              {["Race", "Share", "Margin", "Expected", "Residual"].map((h, i) => (
                <th key={h} className={`py-1.5 pr-3 text-[10px] uppercase tracking-wider font-semibold ${i ? "text-right" : "text-left"}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...indep.record].reverse().map((r, i) => (
              <tr key={r.year} className={TR} style={{ borderBottom: "1px solid var(--app-border)", animationDelay: `${enter(i)}ms` }}>
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
      <div className="mt-3">
        <TermCells terms={[
          ...lines.map((l) => ({ label: l.label, value: l.value, color: "var(--app-text-primary)", note: l.note })),
          {
            label: "= Projected margin", total: true, value: fmtI(indep.advantage, opp),
            color: indep.advantage > 0 ? "var(--party-ind)" : opp === "D" ? "var(--party-dem)" : "var(--party-rep)",
            note: pI != null ? `P(${indep.name}) ${Math.round(pI * 100)}%` : undefined,
          },
        ]} />
      </div>
    </div>
  );
}

/**
 * The district's frozen 2026 outlook: the headline and the forward sum (structural lean + environment +
 * incumbency + money). The structural lean's race-by-race working was removed on 2026-11-27 (user): the
 * District TPL section below the electoral history is the district's measured lean. Mirrors the race
 * pages' Forecast Calculation card in flat form.
 */
export default function AtlasOutlook({ district, electionYear }: { district: AtlasDistrict; electionYear: number }) {
  const pr = district.projection;
  if (!pr) return null;
  const decided = pr.contest === "uncontested-D" || pr.contest === "uncontested-R" || pr.contest === "split";
  const g = pr.guaranteed ?? { dem: 0, rep: 0 };
  const guaranteedNote = g.dem || g.rep ? `${[g.dem ? `${g.dem} Democratic` : "", g.rep ? `${g.rep} Republican` : ""].filter(Boolean).join(" and ")} seat${g.dem + g.rep > 1 ? "s" : ""} decided by the field` : null;
  const headline = pr.contest === "not-up"
    ? `Not on the ${electionYear} ballot`
    : pr.contest === "uncontested-D" ? "Democratic seat: no Republican on the ballot"
    : pr.contest === "uncontested-R" ? "Republican seat: no Democrat on the ballot"
    : pr.contest === "contested" && pr.margin != null ? fmtMargin(pr.margin)
    : pr.contest === "independent" && pr.indep ? `${pr.indep.name} vs ${pr.indep.slot === "D" ? "R" : "D"}: ${fmtI(pr.indep.advantage, pr.indep.slot === "D" ? "R" : "D")}`
    : pr.contest === "other" && pr.pI === 1 ? "Independent seat: no major party on the ballot"
    : pr.contest === "split" ? `Every seat decided by the field: ${g.dem} D, ${g.rep} R`
    : "No projection";
  const headColor = pr.contest === "uncontested-D" ? "var(--party-dem)" : pr.contest === "uncontested-R" ? "var(--party-rep)" : pr.margin != null && pr.contest === "contested" ? projectedMarginColor(pr.margin)
    : pr.contest === "independent" && pr.indep ? (pr.indep.advantage > 0 ? "var(--party-ind)" : pr.indep.slot === "D" ? "var(--party-rep)" : "var(--party-dem)")
    : pr.contest === "other" && pr.pI === 1 ? "var(--party-ind)" : "var(--app-text-muted)";

  const contested = pr.contest === "contested" && pr.margin != null;
  // 80% of outcomes: ± 1.2816 σ around the projected margin.
  const lo = contested ? pr.margin! - 1.2816 * pr.sigma : null;
  const hi = contested ? pr.margin! + 1.2816 * pr.sigma : null;
  const winD = pr.pD != null && pr.pD >= 0.5;
  const winPct = pr.pD == null ? null : Math.max(pr.pD, 1 - pr.pD) * 100;
  const fmtPct = (v: number) => (v > 99.5 ? ">99" : v < 0.5 ? "<1" : String(Math.round(v)));

  return (
    <section>
      <LedgerSectionHead label="Forecast Calculation" right={<FinalForecastPill />} rightClassName="self-center -my-1.5" />

      {/* Headline: the projected margin and the win chance, as on the race pages. */}
      {contested ? (
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <div className={LABEL} style={{ color: "var(--app-text-muted)" }}>Projected Margin</div>
            <div className="vh-margin tabular-nums" style={{ ...SERIF, fontSize: "clamp(2.2rem, 6vw, 3rem)", lineHeight: 1.05, color: projectedMarginColor(pr.margin!) }}>{fmtMargin(pr.margin)}</div>
          </div>
          {winPct != null && (
            <div className="text-right shrink-0">
              <div className={LABEL} style={{ color: "var(--app-text-muted)" }}>{winD ? "Dem" : "Rep"} Win Chance</div>
              <div className="tabular-nums" style={{ ...SERIF, fontSize: "clamp(1.8rem, 5vw, 2.4rem)", lineHeight: 1.05, color: winD ? "var(--party-dem)" : "var(--party-rep)" }}>{fmtPct(winPct)}%</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...SERIF, fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)", color: headColor, lineHeight: 1.1 }}>{headline}</div>
      )}
      {pr.seats > 1 && pr.contest === "contested" && (
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>{guaranteedNote ? `${guaranteedNote}; the other ${pr.contestedSeats ?? pr.seats - g.dem - g.rep} drawn on the margin.` : `${pr.seats} seats, each drawn on the same margin.`}</p>
      )}

      {pr.contest !== "not-up" && pr.lean != null && (
        <>
          {pr.contest === "independent" && pr.indep ? (
            <IndependentSum indep={pr.indep} lean={pr.lean} envPts={pr.envPts} beta={pr.beta} pI={pr.pI ?? null} electionYear={electionYear} />
          ) : (
            <div className="mt-5">
              <TermCells terms={[
                { label: "Structural lean", value: fmtM(pr.lean), color: partyOf(pr.lean), note: `weighted neutral margins, ${pr.rows.length} race-years` },
                { label: `+ ${electionYear} Environment`, value: fmtTerm(pr.envPts), color: partyOf(pr.envPts), note: `β* ${pr.beta.toFixed(2)} × E` },
                { label: "+ Incumbency", value: fmtTerm(pr.incPts), color: partyOf(pr.incPts), note: pr.incSign === 0 ? "open seat or none marked" : pr.incSign > 0 ? "Republican incumbent" : "Democratic incumbent" },
                { label: "+ Money", value: fmtTerm(pr.money?.pts ?? 0), color: partyOf(pr.money?.pts ?? 0), note: pr.money
                  ? `raised ${fmtM(pr.money.gapPct)}${pr.money.scale !== 1 ? ` (× ${pr.money.scale} to date)` : ""} vs ${fmtM(pr.money.structuralGapPct)} expected`
                  : "either side's money not on file: the typical gap for the seat" },
                { label: "= Projected margin", total: true, value: fmtMargin(pr.margin), color: pr.margin != null ? projectedMarginColor(pr.margin) : "var(--app-text-muted)",
                  note: decided ? "decided by the field; the model's view of the district" : `σ ${pr.sigma.toFixed(1)}` },
              ]} />
              {contested && (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
                  <span className={LABEL}>80% range</span>
                  <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{fmtMargin(lo)} to {fmtMargin(hi)}</span>
                  <span style={{ color: "var(--app-text-very-muted)" }}>· σ {pr.sigma.toFixed(1)}</span>
                </div>
              )}
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

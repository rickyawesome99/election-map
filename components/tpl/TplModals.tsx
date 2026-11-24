"use client";

import { useEffect, type ReactNode } from "react";
import { ELIGIBILITY_LABELS } from "@/data/raceEligibility";
import { fmt2, marginBg, marginColor, RACE_TYPE_LABELS, signed } from "./format";
import type { LeanTrend, TplRace } from "./types";

// The popups the pipeline tables open: a strip's formula, one race's step-by-step calculation,
// an imputed row's provenance, and the state's elasticity derivation with the fitted E table.

export type FormulaKey = "Adjusted" | "IF" | "FF" | "ENV" | "BS" | "NM" | "WT" | "YW";

/** One strip's explainer: a plain-language lede, the equation, then short points. Margins are
 *  R minus D, so a positive number leans Republican. */
export type FormulaPanel = { title: string; lede: string; equation: string; example?: string; points: { label: string; text: string }[]; note?: string };

export const FORMULA_PANELS: Record<FormulaKey, FormulaPanel> = {
  Adjusted: {
    title: "Adjusted Margin",
    lede: "The race's actual margin, unless it wasn't a real Republican-vs-Democrat contest. Then the seat's nearest presidential result stands in for it.",
    equation: "Adjusted = Raw                          eligible race\nAdjusted = nearest presidential margin   ⊘ ineligible race\n           + E(race year) − E(its year)",
    points: [
      { label: "Ineligible", text: "One major party had no nominee, or both finalists were from the same party (California and Washington top-two, Louisiana runoffs)." },
      { label: "Stand-in", text: "The seat's closest presidential result. For House races it comes from the same district lines." },
      { label: "Its year", text: "A presidential margin from another year carries that year's national environment. It is moved into the race year's environment (the difference between the two years' E), so every row of a year sits in the same environment and it can be removed once, on the year's total." },
      { label: "Independents", text: "Bernie Sanders and Angus King count as Democrats. Other independents don't." },
      { label: "Afterwards", text: "Imputed rows skip the incumbency and fundraising adjustments and count half as much." },
    ],
  },
  IF: {
    title: "Incumbency Points (IF)",
    lede: "Incumbents tend to run ahead of their party. IF takes that head start back out, so the margin measures the party rather than the officeholder.",
    equation: "IF = −pts   Republican incumbent\nIF = +pts   Democratic incumbent\nIF = 0      open seat",
    points: [
      { label: "Size", text: "House: 3 points, fixed. Senate and Governor: estimated by the model together with the fundraising adjustment, so the two don't overlap." },
      { label: "Always 0", text: "President (the national mood is ENV's job), state legislature (a whole chamber has no single incumbent), and imputed rows. An appointed incumbent who never won the seat counts as an open seat." },
      { label: "Win or lose", text: "The same points come out whether the incumbent won or lost, and they're added back when forecasting." },
    ],
  },
  FF: {
    title: "Fundraising Points (FF)",
    lede: "The candidate who raises more tends to run a little ahead. FF removes that edge, with a cap so money can never swamp the result.",
    equation: "gap = (R$ − D$) ÷ (R$ + D$) × 100\nFF  = −clamp(0.02 × gap, ±2)",
    example: "R raises $3M, D raises $1M → gap = 50 → FF = −1.0",
    points: [
      { label: "Data", text: "Each candidate's total campaign receipts for the cycle, from the FEC (state filings for governors)." },
      { label: "Applies", text: "Only when both candidates' totals are known. Never for President or imputed rows." },
      { label: "Why small", text: "Money also follows lean: favorites raise more because they're favored. So the effect is kept small and capped, both tuned on past results." },
    ],
    note: "$0 means the candidate never crossed the FEC's $5,000 filing threshold.",
  },
  ENV: {
    title: "Environment Adjustment (ENV)",
    lede: "Some years are simply good for one party. ENV removes that year's national tilt, so 2018 and 2022 can be compared on equal terms. It is taken off once, from the year's margin, not from each race.",
    equation: "ENV = −E(year)      the same in every state\nWRS = year's margin + ENV",
    points: [
      { label: "E(year)", text: "How far the country leaned that year: positive for Republicans, negative for Democrats. One number per year, 2016–2026, odd years included." },
      { label: "How it's found", text: "Estimated alongside every state's lean from contested races, using how each state moved against its own past. Which seats happen to be up, uncontested races, and big swings in a few large states can't distort it, as they would the popular vote." },
      { label: "Zero", text: "E = 0 is a year in which the national House vote, with every seat contested, would be tied." },
      { label: "Sign", text: "Negative ENV takes out a Republican-leaning year; positive takes out a Democratic-leaning one." },
      { label: "Where it shows", text: "The race table and the matrix show margins before the environment is removed. The result table lists each year's margin, its ENV and the WRS that is left." },
      { label: "Imputed rows", text: "A stand-in presidential margin from another year is first moved into the race year's environment (see Adjusted), so the year's single ENV is right for it too." },
    ],
    note: "Until November 19, 2026 each state also had its own multiplier on E. It didn't predict which states swung more in 2026, so it was removed.",
  },
  BS: {
    title: "Boundary Shift (BS)",
    lede: "District lines change. A House race run on older lines measured a somewhat different set of voters, so BS moves it onto today's map.",
    equation: "shift = pres margin (old lines) − pres margin (2026 lines)\nBS    = −shift",
    points: [
      { label: "Same year", text: "Both presidential margins come from the same election, so the gap is purely the lines." },
      { label: "President rows", text: "Already recounted onto the 2026 lines from precinct results, so they need no shift." },
      { label: "Applies", text: "District TPL only. State TPL averages House races statewide, where lines don't matter." },
      { label: "Weight", text: "No extra weight in District TPL. In the candidate table a race on very different lines counts less: 1 ÷ (1 + (|shift| ÷ 10)²)." },
    ],
  },
  NM: {
    title: "Neutralized Margin (NM)",
    lede: "The race with the candidates' structural edges taken out: what a generic Republican would get against a generic Democrat here, in that year. The year's national environment is still in it and comes off afterwards, once, from the year's total.",
    equation: "NM = Adjusted + IF + FF\n     (+ BS for a district's House race)",
    points: [
      { label: "Just addition", text: "Every adjustment is in points and applied once. Nothing is multiplied or counted twice." },
      { label: "Imputed rows", text: "NM = the stand-in presidential margin, moved into the race year's environment. A Senate or governor row counts half." },
      { label: "Candidates", text: "Not an adjustment. Unusually strong or weak candidates (Manchin, Scott, Hogan…) are downweighted when races are averaged, and what's left over becomes their WAR." },
    ],
  },
  WT: {
    title: "Weight (WT)",
    lede: "How much a race counts when the year's races are averaged. Most count 1. A race that sits far from the state's usual result counts less, and House districts count by how many people voted in them.",
    equation: "President, Senate, Governor, Legislature\n  WT = outlier factor\nHouse district\n  WT = its votes ÷ average district's votes\n\noutlier factor   (gap = NM + ENV − state's lean)\n  1          gap within 15 pts\n  15 ÷ gap   gap larger than that",
    example: "30 pts from the state's lean → 15 ÷ 30 = 0.50",
    points: [
      { label: "Outliers", text: "A candidate who runs far from the state's usual result (Manchin, Scott, Hogan) would otherwise drag the lean. Their race counts less, smoothly and never down to zero, so the lean describes the state rather than one politician." },
      { label: "House", text: "No outlier factor on a single district: a lopsided district is still part of the state. Districts count by votes cast, so together they add up to the state's real House vote. The outlier check is made once, on the state's whole House result for the year." },
      { label: "Legislature", text: "One row for the whole chamber, with every seat filled in, so its weight is just the outlier factor." },
      { label: "Imputed ⊘", text: "A Senate or governor race filled in from the presidential vote counts half, times its outlier factor. An uncontested House district keeps its full share, using its presidential turnout." },
      { label: "What it changes", text: "How races of the same office are averaged that year, and how much that office counts against the others. A lone race at 0.50 makes its office count half as much that year." },
      { label: "Office shares", text: "A separate step. In a presidential year: President 60%, House 20%, Senate 10%, Legislature 7%, Governor 3%. In any other year: House 25, Legislature 10, Senate 4, Governor 1, scaled up to fill the year." },
      { label: "District TPL", text: "Every row counts 1. A district has one House race and one presidential result a year, so there is nothing to weigh them against." },
    ],
    note: "The state's lean used for the outlier check is fitted together with every year's national environment, so an outlier race can't move that either.",
  },
  YW: {
    title: "Year Weights",
    lede: "Recent elections count more than old ones, and so do years with more of the ballot on offer. The weights are then scaled to add up to 100%.",
    equation: "raw(y)    = 0.75^(2026 − y) × coverage(y)\nweight(y) = raw(y) ÷ Σ raw",
    example: "before coverage, 2024 counts 0.75² ≈ 0.56 as much as 2026",
    points: [
      { label: "Recency", text: "Each year back is worth 0.75 of the year after it." },
      { label: "Coverage", text: "How much of the full set of offices the place had on the ballot that year, adding up the office shares of the races it held. A year with fewer offices counts less." },
      { label: "No races", text: "A year with no race in the place gets weight 0." },
      { label: "Centering", text: "The weighted sum is TPL. Subtracting the median of all 50 states (or all 435 districts) gives the centered figure, so places compare on one scale." },
    ],
  },
};

export const GLOSSARY: { abbr: string; term: string; desc: string }[] = [
  { abbr: "TPL", term: "True Partisan Lean", desc: "The place's neutral partisan composition — what a generic R vs generic D race in a neutral year would produce. Recency-weighted average of WRS scores, 2016–2026, odd years included. A baseline, not a forecast." },
  { abbr: "Centered TPL", term: "Centered True Partisan Lean", desc: "TPL minus the median TPL of the 50 states (or 435 districts). How a place compares to the typical one, with systematic model bias removed." },
  { abbr: "NM", term: "Neutralized Margin", desc: "Adjusted + IF pts + FF pts (+ BS pts for a district's House race): the race with incumbency and money removed, still in its own year's environment. Every strip is additive and applied exactly once." },
  { abbr: "WRS", term: "Weighted Race Score", desc: "One year's TPL signal: the year's margin (the weighted average of NMs across the race types present) plus ENV, which removes that year's national environment." },
  { abbr: "IF", term: "Incumbency Points", desc: "Additive, party-signed strip subtracted in the incumbent party's direction. Senate and Governor values are estimated inside the joint fit; House keeps a fixed 3." },
  { abbr: "FF", term: "Fundraising Points", desc: "Additive fundraising strip, −clamp(0.02 × money-gap%, ±2), where both candidates' receipts are known." },
  { abbr: "ENV", term: "Environment Adjustment", desc: "−E(y): strips the fitted national environment, the same in every state, once from each year's margin. Negative when a Republican-leaning year is being removed." },
  { abbr: "BS", term: "Boundary Shift", desc: "District TPL only: relocates a House race run on earlier lines onto today's." },
  { abbr: "E(y)", term: "Fitted National Environment", desc: "One number per year, estimated jointly with every state's lean from within-state changes. Positive = R-favored; zero is a tied national House vote with every seat contested." },
  { abbr: "Since 2024", term: "Change Since 2024", desc: "The lean now minus the lean as it stood after the 2024 election, both under today's model and today's fitted environment. It is what the 2025 and 2026 results added for this place, with the national environment removed." },
  { abbr: "Trend", term: "Trend", desc: "A place's presidential shift between the last two presidential elections, minus the change in the national environment over the same years. The environment is the one TPL removes, fitted with every state counting equally, so it is not the national popular vote. Shown beside TPL and never part of it: TPL says where a place stands, the trend which way it has been moving." },
  { abbr: "⊘", term: "Imputed Race", desc: "An ineligible race (missing major-party nominee or same-party general): the margin is replaced by the seat's nearest presidential result, moved into the race year's environment. A Senate or governor row carries half weight." },
  { abbr: "WAR", term: "Wins Above Replacement", desc: "How far a candidate's actual margin ran ahead of what a replacement-level nominee of their party would have managed against the same opponent, in points." },
  { abbr: "P G S H L", term: "Race Type Codes", desc: "P = President, G = Governor, S = U.S. Senate, H = U.S. House, L = State Legislature." },
];

function ModalShell({ onClose, label, maxW = "max-w-lg", children }: { onClose: () => void; label: string; maxW?: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} className={`max-h-[92vh] w-full ${maxW} overflow-y-auto rounded-t-2xl shadow-2xl sm:rounded-2xl`}
        style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ title, sub, onClose }: { title: ReactNode; sub?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="min-w-0">
        <div className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{title}</div>
        {sub && <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{sub}</div>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close"
        className="-my-1.5 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--app-text-primary)_8%,transparent)] active:bg-[color-mix(in_srgb,var(--app-text-primary)_14%,transparent)]"
        style={{ color: "var(--app-text-muted)" }}>
        {/* Negative vertical margin: the bigger target doesn't make the header taller. */}
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

/** A plain list of what each column of a table means, opened from a small button above it. */
export function ColumnGuideModal({ title, sub, columns, onClose }: { title: string; sub?: string; columns: { name: string; desc: string }[]; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} label={title}>
      <ModalHead title={title} sub={sub} onClose={onClose} />
      <dl className="px-5 pb-5 pt-2">
        {columns.map((c, i) => (
          <div key={c.name} className="grid grid-cols-[84px_1fr] gap-3 py-2.5 text-xs leading-relaxed" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-border)" }}>
            <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-primary)", paddingTop: 2 }}>{c.name}</dt>
            <dd style={{ color: "var(--app-text-muted)" }}>{c.desc}</dd>
          </div>
        ))}
      </dl>
    </ModalShell>
  );
}

export function FormulaModal({ formula, onClose }: { formula: FormulaKey; onClose: () => void }) {
  const panel = FORMULA_PANELS[formula];
  return (
    <ModalShell onClose={onClose} label={panel.title}>
      <ModalHead title={panel.title} onClose={onClose} />
      <div className="px-5 pb-5 pt-4">
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-text-primary)" }}>{panel.lede}</p>
        <div className="mt-4 overflow-x-auto rounded-lg px-4 py-3" style={{ background: "var(--app-tab-bg)" }}>
          <pre className="font-mono text-xs leading-relaxed" style={{ color: "var(--app-text-primary)" }}>{panel.equation}</pre>
          {panel.example && <div className="mt-2 font-mono text-[11px]" style={{ color: "var(--app-text-muted)" }}>e.g. {panel.example}</div>}
        </div>
        <dl className="mt-4 space-y-2.5">
          {panel.points.map((pt) => (
            <div key={pt.label} className="grid gap-x-4 gap-y-0.5 text-xs leading-relaxed sm:grid-cols-[6.5rem_1fr]">
              <dt className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{pt.label}</dt>
              <dd style={{ color: "var(--app-text-muted)" }}>{pt.text}</dd>
            </div>
          ))}
        </dl>
        {panel.note && <p className="mt-4 pt-3 text-[11px] leading-relaxed" style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}>{panel.note}</p>}
      </div>
    </ModalShell>
  );
}

export function AdjustedModal({ race, onClose }: { race: TplRace; onClose: () => void }) {
  const rows: { label: string; value: ReactNode; note?: string }[] = [
    { label: "Stored margin (not used)", value: <span style={{ color: marginColor(race.rawMargin) }}>{fmt2(race.rawMargin)}</span>, note: "The as-reported result of the ineligible race — shown for reference only." },
    { label: "Why ineligible", value: ELIGIBILITY_LABELS[race.eligibility as keyof typeof ELIGIBILITY_LABELS] ?? "Ineligible race", note: "Without a genuine nominee from each major party, the margin is not an R-vs-D measurement." },
    { label: `Imputed from ${race.imputedSourceDesc ?? "presidential baseline"}${race.imputedSourceYear ? ` (${race.imputedSourceYear})` : ""}`, value: <span style={{ color: marginColor(race.adjustedMargin) }}>{fmt2(race.adjustedMargin)}</span>, note: race.raceType === "H" ? "Restricted to the district's current boundary vintage." : undefined },
    ...(race.envCarry ? [{ label: `Moved into ${race.year}'s environment`, value: <span style={{ color: marginColor((race.adjustedMargin ?? 0) + race.envCarry) }}>{signed(race.envCarry)} → {fmt2((race.adjustedMargin ?? 0) + race.envCarry)}</span>, note: `E(${race.year}) − E(${race.imputedSourceYear}): the stand-in result sits in its own year's environment, so it is carried into this one before the year's environment is removed.` }] : []),
    { label: "Downstream treatment", value: race.raceType === "H" || race.raceType === "L" ? "IF / FF skipped — NM = imputed margin · full share in aggregation" : "IF / FF skipped — NM = imputed margin · half weight in aggregation" },
  ];
  return (
    <ModalShell onClose={onClose} label="Adjusted margin" maxW="max-w-sm">
      <ModalHead title="Adjusted Margin" sub={<>{race.race} · {race.year}{race.raceType === "H" && race.minValidYear > 0 && <span style={{ color: "var(--app-text-very-muted)" }}> · boundary from {race.minValidYear}</span>}</>} onClose={onClose} />
      <div className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {rows.map((row, i) => (
          <div key={i} className="px-5 py-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{row.label}</div>
            <div className="font-mono text-xs font-semibold" style={{ color: "var(--app-text-primary)" }}>{row.value}</div>
            {row.note && <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{row.note}</div>}
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

/** The Trend figure, worked through for one place. */
export function TrendModal({ name, trend, onClose }: { name: string; trend: LeanTrend; onClose: () => void }) {
  const shift = trend.to - trend.from;
  const v = (n: number) => <b className="tabular-nums" style={{ color: marginColor(n) }}>{fmt2(n)}</b>;
  const rows: { label: string; note?: string; value: ReactNode }[] = [
    { label: "2020 presidential margin", value: v(trend.from) },
    { label: "2024 presidential margin", value: v(trend.to) },
    { label: `${name}'s shift`, note: "2024 margin − 2020 margin", value: v(shift) },
    { label: "National environment's shift", note: "E(2024) − E(2020): the environment TPL removes from every race, fitted with each state counting equally. It is not the national popular vote, which a few large states can move.", value: v(trend.env) },
    { label: "Trend", note: "the place's shift − the environment's shift", value: v(trend.last) },
  ];
  return (
    <ModalShell onClose={onClose} label={`Trend 2020 to 2024, ${name}`}>
      <ModalHead title={`Trend 2020→24 · ${name}`} sub="How far the place moved beyond the national environment between the last two presidential elections" onClose={onClose} />
      <div className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 px-5 py-3 text-xs">
            <div className="min-w-0">
              <div className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{r.label}</div>
              {r.note && <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{r.note}</div>}
            </div>
            <div className="whitespace-nowrap">{r.value}</div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 text-[11px] leading-relaxed" style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
        R+ means the place moved toward Republicans by more than the environment did; D+ means it moved right by less, or moved left.
        {trend.prior != null && <> The same figure for 2016 to 2020 was {v(trend.prior)}, which shows whether the move is sustained or a single cycle.</>}
        {" "}Trend is a companion to TPL and never part of it: TPL says where a place stands, Trend which way it has been moving.
      </div>
    </ModalShell>
  );
}

/** What a State Legislature row's margin is made of. */
function legPoolsText(p: NonNullable<TplRace["legPools"]>): string {
  const n = (k: number, what: string) => `${k} ${what}`;
  const est = [p.unopposed > 0 ? n(p.unopposed, "unopposed") : null, p.notUp > 0 ? n(p.notUp, "not up this year") : null].filter(Boolean).join(" and ");
  return `${p.contested} contested seat${p.contested === 1 ? "" : "s"} on their votes${est ? `; ${est} estimated as the seat's presidential margin plus the gap the contested seats ran from theirs` : ""}`;
}

export function RaceCalcModal({ race, E, incumbentAdvantage, onClose, onFormula, onAdjusted }: {
  race: TplRace; E: Record<number, number>; incumbentAdvantage: Record<string, number>;
  onClose: () => void; onFormula: (k: FormulaKey) => void; onAdjusted: () => void;
}) {
  const r = race;
  const outcome = r.raceType === "P" ? "—"
    : r.incumbent === "R" && r.rawMargin != null ? (r.rawMargin > 0 ? "R won" : "R lost")
    : r.incumbent === "D" && r.rawMargin != null ? (r.rawMargin < 0 ? "D won" : "D lost")
    : r.incumbent;
  const e = E[r.year] ?? 0;
  const adjusted = r.adjustedMargin == null ? null : r.adjustedMargin + r.envCarry;
  const cell = "px-1.5 py-2";
  const head = (label: string, formula?: FormulaKey, onClick?: () => void) => (
    <td className={`${cell} font-semibold ${formula || onClick ? "cursor-pointer select-none" : ""}`} style={{ color: "var(--app-text-primary)" }} onClick={formula ? () => onFormula(formula) : onClick}>
      {label}{(formula || onClick) && <span className="ml-1 opacity-50">ⓘ</span>}
    </td>
  );
  const rows: { head: ReactNode; detail: string; value: ReactNode }[] = [
    { head: head("Raw margin"), detail: r.legPools ? legPoolsText(r.legPools) : "repPct − demPct, live from site data", value: <b style={{ color: marginColor(r.rawMargin) }}>{fmt2(r.rawMargin)}</b> },
    { head: head("Adjusted", undefined, r.imputed ? onAdjusted : undefined), detail: r.imputed ? `⊘ ${ELIGIBILITY_LABELS[r.eligibility as keyof typeof ELIGIBILITY_LABELS] ?? "Ineligible race"} — imputed from ${r.imputedSourceDesc} (${r.imputedSourceYear})${r.envCarry ? `, moved ${signed(r.envCarry)} into ${r.year}'s environment` : ""}` : "Unchanged — eligible race (both major parties on the ballot)", value: <b style={{ color: marginColor(adjusted) }}>{fmt2(adjusted)}</b> },
    { head: head("Incumbency", "IF"), detail: r.imputed ? "Imputed row — no incumbency to strip" : r.incumbent === "R" || r.incumbent === "D" ? `${r.incumbent} incumbent — ${(incumbentAdvantage[r.raceType] ?? 0).toFixed(1)} pts stripped toward ${r.incumbent === "R" ? "D" : "R"}` : r.raceType === "P" ? "President — national approval effects live in E(y)" : r.raceType === "L" ? "Chamber aggregate — no single incumbent" : "Open seat — no adjustment", value: <b style={{ color: r.incumbencyPts ? marginColor(r.incumbencyPts) : "var(--app-text-very-muted)" }}>{r.incumbencyPts ? signed(r.incumbencyPts) : "—"}</b> },
    { head: head("Fundraising", "FF"), detail: r.ffDetail ? `R $${(r.ffDetail.rep / 1e6).toFixed(2)}M vs D $${(r.ffDetail.dem / 1e6).toFixed(2)}M raised` : "No receipts data (President, imputed, or unavailable)", value: <b style={{ color: r.FF_pts ? marginColor(r.FF_pts) : "var(--app-text-very-muted)" }}>{r.FF_pts ? signed(r.FF_pts) : "—"}</b> },
    ...(r.BS_pts != null && r.raceType === "H" ? [{ head: head("Boundary shift", "BS" as FormulaKey), detail: `Run on earlier lines that leaned ${fmt2(r.boundaryShift)} relative to today's · weight ${r.aggWeight.toFixed(2)}`, value: <b style={{ color: r.BS_pts ? marginColor(r.BS_pts) : "var(--app-text-very-muted)" }}>{r.BS_pts ? signed(r.BS_pts) : "—"}</b> }] : []),
  ];
  return (
    <ModalShell onClose={onClose} label={`${r.race} ${r.year} calculation`} maxW="max-w-3xl">
      <div className="px-5 py-4">
        <button type="button" onClick={onClose} aria-label="Close" className="float-right -mt-0.5 ml-3 text-lg leading-none" style={{ color: "var(--app-text-muted)" }}>×</button>
        <div className="flex flex-wrap items-end justify-between gap-4 pb-3.5" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{RACE_TYPE_LABELS[r.raceType]} · {r.year} · {outcome}</div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--app-text-primary)" }}>{r.race}</div>
            {(r.demCandidate || r.repCandidate) && <div className="mt-0.5 text-xs" style={{ color: "var(--app-text-muted)" }}>{r.demCandidate ?? "—"} <span style={{ color: "var(--party-dem)" }}>D</span> · {r.repCandidate ?? "—"} <span style={{ color: "var(--party-rep)" }}>R</span></div>}
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Neutralized margin</div>
            <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, color: marginColor(r.preEnv) }}>{fmt2(r.preEnv)}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-1 w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                {["Step", "Detail", "Contribution"].map((h, i) => (
                  <th key={h} className={`${cell} text-[10px] font-semibold uppercase tracking-wide ${i === 2 ? "text-right" : "text-left"}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  {row.head}
                  <td className={cell} style={{ color: "var(--app-text-muted)" }}>{row.detail}</td>
                  <td className={`${cell} text-right tabular-nums`}>{row.value}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                <td colSpan={2} className="px-1.5 py-2.5 font-bold" style={{ color: "var(--app-text-primary)" }}>Neutralized margin</td>
                <td className="px-1.5 py-2.5 text-right font-bold tabular-nums" style={{ color: marginColor(r.preEnv), background: marginBg(r.preEnv) }}>{fmt2(r.preEnv)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          {r.year}&apos;s national environment, <button type="button" onClick={() => onFormula("ENV")} className="underline decoration-dotted underline-offset-2">E({r.year})</button> = <b style={{ color: marginColor(e) }}>{fmt2(e)}</b>, is still in this margin. It is removed once, from the year&apos;s total, in the result table.
        </p>
      </div>
    </ModalShell>
  );
}

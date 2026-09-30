"use client";

import { useEffect, type ReactNode } from "react";
import { ELIGIBILITY_LABELS } from "@/data/raceEligibility";
import type { TplFitStateBeta } from "@/lib/tplCompute";
import { fmt2, marginBg, marginColor, RACE_TYPE_LABELS, signed } from "./format";
import type { TplRace } from "./types";

// The popups the pipeline tables open: a strip's formula, one race's step-by-step calculation,
// an imputed row's provenance, and the state's elasticity derivation with the fitted E table.

export type FormulaKey = "Adjusted" | "IF" | "FF" | "ENV" | "BS" | "NM";

export const FORMULA_PANELS: Record<FormulaKey, { title: string; rows: { label: string; formula: string; note?: string }[] }> = {
  Adjusted: {
    title: "Adjusted Margin",
    rows: [
      { label: "Eligible race", formula: "Adjusted = Raw — a genuine (or caucus-aligned) nominee of each major party was on the ballot" },
      { label: "Ineligible race (⊘)", formula: "Missing major-party nominee, or a same-party general (CA/WA top-two, LA runoff) — the margin is not an R-vs-D measurement" },
      { label: "Imputation", formula: "Adjusted = the seat's nearest presidential result (district-level for House, restricted to the same boundary vintage)" },
      { label: "Aligned independents", formula: "Bernie Sanders and Angus King count as Democratic nominees; other independents do not", note: "Crosswalk lives in data/raceEligibility.ts." },
      { label: "Downstream", formula: "Imputed rows skip IF / FF (NM = imputed lean) and carry half weight in aggregation" },
    ],
  },
  IF: {
    title: "Incumbency Points (IF)",
    rows: [
      { label: "Formula", formula: "IF pts = −pts if R incumbent · +pts if D incumbent · 0 if open seat" },
      { label: "Office values", formula: "House = 3 (fixed) · Senate and Governor estimated inside the joint fit, net of the fundraising strip" },
      { label: "President", formula: "0 — national approval effects belong to the environment term E(y)" },
      { label: "State Legislature", formula: "0 — a chamber aggregate has no single incumbent to attribute" },
      { label: "Imputed rows", formula: "0 — the imputed value is already an incumbency-free lean" },
      { label: "Interpretation", formula: "Additive and symmetric: the same points are stripped whether the incumbent won or lost, and added back when forecasting." },
    ],
  },
  FF: {
    title: "Fundraising Points (FF)",
    rows: [
      { label: "Advantage in margin", formula: "clamp( k × moneyGapPct, ±cap )    moneyGapPct = (R$ − D$) ⁄ (R$ + D$) × 100" },
      { label: "Strip", formula: "FF pts = −(that advantage) — subtracted like IF and ENV" },
      { label: "Data", formula: "FEC candidate-committee total receipts per cycle, 2016–2026; state filings for governors" },
      { label: "Coverage", formula: "Where both candidates' receipts are known. President excluded by design; imputed rows carry no FF." },
      { label: "Endogeneity", formula: "Money follows lean, so k stays small and the cap tight — both harness-calibrated.", note: "$0 means the candidate never crossed the FEC's $5k filing threshold." },
    ],
  },
  ENV: {
    title: "Environment Adjustment (−β* × E)",
    rows: [
      { label: "Formula", formula: "ENV pts = −β*(state) × E(year)" },
      { label: "E(y)", formula: "Fitted national environment, one number per year 2016–2025 (odd years included), estimated jointly with all 50 state leans by Huber-weighted alternating least squares" },
      { label: "Why fitted, not the popular vote", formula: "E is identified from within-state changes — which Senate/Governor seats happen to be up, uncontested seats, and big-state swings cannot skew it" },
      { label: "β*", formula: "State elasticity: β* = clamp(1 + 0.5 × (β̂ − 1), 0.5, 1.6) — the β* figure in the page header opens this state's derivation and the full E table" },
      { label: "Imputed rows", formula: "Strip the environment of the SOURCE presidential year the value was imputed from" },
      { label: "Sign convention", formula: "Negative ENV = an R-leaning year is being removed. Positive = a D-leaning year is being removed." },
    ],
  },
  BS: {
    title: "Boundary Shift (BS)",
    rows: [
      { label: "What it undoes", formula: "A House race run on earlier lines measured a different electorate. shift = pres(old lines) − pres(2026 lines), same presidential year" },
      { label: "Strip", formula: "BS pts = −shift — the row is re-expressed as if it had been run on today's lines" },
      { label: "Confidence", formula: "boundary weight = 1 / (1 + (|shift| / 10)²) — a race moved 26 points keeps about an eighth of its weight" },
      { label: "Presidential rows", formula: "Already re-aggregated from precincts onto the 2026 lines, so they carry no BS" },
      { label: "Where it applies", formula: "District TPL only. The state model averages House races statewide, where lines do not matter." },
    ],
  },
  NM: {
    title: "Neutralized Margin (NM)",
    rows: [
      { label: "Formula", formula: "NM = Adjusted + IF pts + FF pts + ENV pts   (+ BS pts for a district's House race)" },
      { label: "All additive", formula: "Every distortion is stripped exactly once, in points — no compounding, no double-counting" },
      { label: "Imputed rows", formula: "NM = imputed lean − β* × E(source year) · half weight in aggregation" },
      { label: "Candidate quality", formula: "Not a term: outlier candidates (Manchin, Scott, Hogan…) are downweighted by the Huber fit, and their residuals become WAR" },
      { label: "Purpose", formula: "NM is the stripped partisan signal: the race re-expressed as generic R vs generic D in a neutral national year." },
    ],
  },
};

export const GLOSSARY: { abbr: string; term: string; desc: string }[] = [
  { abbr: "TPL", term: "True Partisan Lean", desc: "The place's neutral partisan composition — what a generic R vs generic D race in a neutral year would produce. Recency-weighted average of WRS scores, 2016–2025, odd years included." },
  { abbr: "Centered TPL", term: "Centered True Partisan Lean", desc: "TPL minus the median TPL of the 50 states (or 435 districts). How a place compares to the typical one, with systematic model bias removed." },
  { abbr: "NM", term: "Neutralized Margin", desc: "Adjusted + IF pts + FF pts + ENV pts (+ BS pts for a district's House race). Every strip is additive and applied exactly once." },
  { abbr: "WRS", term: "Weighted Race Score", desc: "One year's TPL signal: the weighted average of NMs across all race types present that cycle." },
  { abbr: "IF", term: "Incumbency Points", desc: "Additive, party-signed strip subtracted in the incumbent party's direction. Senate and Governor values are estimated inside the joint fit; House keeps a fixed 3." },
  { abbr: "FF", term: "Fundraising Points", desc: "Additive fundraising strip, −clamp(0.02 × money-gap%, ±2), where both candidates' receipts are known." },
  { abbr: "ENV", term: "Environment Adjustment", desc: "−β* × E(y): strips the fitted national environment from the margin. Negative when a Republican-leaning year is being removed." },
  { abbr: "BS", term: "Boundary Shift", desc: "District TPL only: relocates a House race run on earlier lines onto today's, and discounts its weight by how far it had to move." },
  { abbr: "E(y)", term: "Fitted National Environment", desc: "One number per year, estimated jointly with every state's lean from within-state changes. Positive = R-favored; centered so the period average is ≈ 0." },
  { abbr: "β*", term: "Elasticity", desc: "The state's fitted sensitivity to the national environment, shrunk toward 1 (β* = 1 + 0.5(β̂ − 1)) and clamped to [0.5, 1.6]." },
  { abbr: "⊘", term: "Imputed Race", desc: "An ineligible race (missing major-party nominee or same-party general): the margin is replaced by the seat's nearest presidential result and the row carries half weight." },
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
      <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none" style={{ color: "var(--app-text-muted)" }}>×</button>
    </div>
  );
}

export function FormulaModal({ formula, onClose }: { formula: FormulaKey; onClose: () => void }) {
  const panel = FORMULA_PANELS[formula];
  return (
    <ModalShell onClose={onClose} label={panel.title}>
      <ModalHead title={panel.title} onClose={onClose} />
      <div className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {panel.rows.map((row, i) => (
          <div key={i} className="px-5 py-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{row.label}</div>
            <div className="font-mono text-xs" style={{ color: "var(--app-text-primary)" }}>{row.formula}</div>
            {row.note && <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{row.note}</div>}
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

export function BetaModal({ stateName, abbr, beta, E, years, onClose }: { stateName: string; abbr: string; beta: TplFitStateBeta | null; E: Record<number, number>; years: number[]; onClose: () => void }) {
  const b = beta?.shrunk ?? 1;
  return (
    <ModalShell onClose={onClose} label={`Elasticity for ${stateName}`}>
      <ModalHead title={<>Elasticity β* — {stateName} <span className="ml-1 font-mono text-xs font-normal" style={{ color: "var(--app-text-muted)" }}>= {b.toFixed(2)}</span></>} onClose={onClose} />
      <div className="px-5 py-3 text-xs" style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
        <div className="font-mono" style={{ color: "var(--app-text-primary)" }}>β* = clamp(1 + 0.5 × (β̂ − 1), 0.5, 1.6)</div>
        <div className="mt-1.5">
          β̂ = <span className="font-mono" style={{ color: "var(--app-text-primary)" }}>{beta ? beta.raw.toFixed(2) : "—"}</span>, fit from{" "}
          <span className="font-mono" style={{ color: "var(--app-text-primary)" }}>{beta?.n ?? 0}</span> eligible races across every office and year,
          jointly with the state&apos;s lean and each year&apos;s national environment E (Huber-weighted so crossover outliers don&apos;t drag the fit).
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
            {["Year", "Fitted E", `${abbr} strip (−β* × E)`].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const e = E[y] ?? 0;
            return (
              <tr key={y} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="px-4 py-2 font-mono tabular-nums" style={{ color: "var(--app-text-muted)" }}>{y}</td>
                <td className="px-4 py-2 font-semibold tabular-nums" style={{ color: marginColor(e) }}>{fmt2(e)}</td>
                <td className="px-4 py-2 font-mono tabular-nums" style={{ color: "var(--app-text-primary)" }}>{signed(-(b * e))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ModalShell>
  );
}

export function AdjustedModal({ race, onClose }: { race: TplRace; onClose: () => void }) {
  const rows: { label: string; value: ReactNode; note?: string }[] = [
    { label: "Stored margin (not used)", value: <span style={{ color: marginColor(race.rawMargin) }}>{fmt2(race.rawMargin)}</span>, note: "The as-reported result of the ineligible race — shown for reference only." },
    { label: "Why ineligible", value: ELIGIBILITY_LABELS[race.eligibility as keyof typeof ELIGIBILITY_LABELS] ?? "Ineligible race", note: "Without a genuine nominee from each major party, the margin is not an R-vs-D measurement." },
    { label: `Imputed from ${race.imputedSourceDesc ?? "presidential baseline"}${race.imputedSourceYear ? ` (${race.imputedSourceYear})` : ""}`, value: <span style={{ color: marginColor(race.adjustedMargin) }}>{fmt2(race.adjustedMargin)}</span>, note: race.raceType === "H" ? "Restricted to the district's current boundary vintage." : undefined },
    { label: "Downstream treatment", value: "IF / FF skipped — NM = imputed lean · half weight in aggregation" },
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

export function RaceCalcModal({ race, beta, E, incumbentAdvantage, onClose, onFormula, onAdjusted }: {
  race: TplRace; beta: number; E: Record<number, number>; incumbentAdvantage: Record<string, number>;
  onClose: () => void; onFormula: (k: FormulaKey) => void; onAdjusted: () => void;
}) {
  const r = race;
  const outcome = r.raceType === "P" ? "—"
    : r.incumbent === "R" && r.rawMargin != null ? (r.rawMargin > 0 ? "R won" : "R lost")
    : r.incumbent === "D" && r.rawMargin != null ? (r.rawMargin < 0 ? "D won" : "D lost")
    : r.incumbent;
  const envYear = r.imputed ? r.imputedSourceYear ?? r.year : r.year;
  const e = E[envYear] ?? 0;
  const cell = "px-1.5 py-2";
  const head = (label: string, formula?: FormulaKey, onClick?: () => void) => (
    <td className={`${cell} font-semibold ${formula || onClick ? "cursor-pointer select-none" : ""}`} style={{ color: "var(--app-text-primary)" }} onClick={formula ? () => onFormula(formula) : onClick}>
      {label}{(formula || onClick) && <span className="ml-1 opacity-50">ⓘ</span>}
    </td>
  );
  const rows: { head: ReactNode; detail: string; value: ReactNode }[] = [
    { head: head("Raw margin"), detail: "repPct − demPct, live from site data", value: <b style={{ color: marginColor(r.rawMargin) }}>{fmt2(r.rawMargin)}</b> },
    { head: head("Adjusted", undefined, r.imputed ? onAdjusted : undefined), detail: r.imputed ? `⊘ ${ELIGIBILITY_LABELS[r.eligibility as keyof typeof ELIGIBILITY_LABELS] ?? "Ineligible race"} — imputed from ${r.imputedSourceDesc} (${r.imputedSourceYear})` : "Unchanged — eligible race (both major parties on the ballot)", value: <b style={{ color: marginColor(r.adjustedMargin) }}>{fmt2(r.adjustedMargin)}</b> },
    { head: head("Incumbency", "IF"), detail: r.imputed ? "Imputed row — no incumbency to strip" : r.incumbent === "R" || r.incumbent === "D" ? `${r.incumbent} incumbent — ${(incumbentAdvantage[r.raceType] ?? 0).toFixed(1)} pts stripped toward ${r.incumbent === "R" ? "D" : "R"}` : r.raceType === "P" ? "President — national approval effects live in E(y)" : r.raceType === "L" ? "Chamber aggregate — no single incumbent" : "Open seat — no adjustment", value: <b style={{ color: r.incumbencyPts ? marginColor(r.incumbencyPts) : "var(--app-text-very-muted)" }}>{r.incumbencyPts ? signed(r.incumbencyPts) : "—"}</b> },
    { head: head("Fundraising", "FF"), detail: r.ffDetail ? `R $${(r.ffDetail.rep / 1e6).toFixed(2)}M vs D $${(r.ffDetail.dem / 1e6).toFixed(2)}M raised` : "No receipts data (President, imputed, or unavailable)", value: <b style={{ color: r.FF_pts ? marginColor(r.FF_pts) : "var(--app-text-very-muted)" }}>{r.FF_pts ? signed(r.FF_pts) : "—"}</b> },
    ...(r.BS_pts != null && r.raceType === "H" ? [{ head: head("Boundary shift", "BS" as FormulaKey), detail: `Run on earlier lines that leaned ${fmt2(r.boundaryShift)} relative to today's · weight ${r.aggWeight.toFixed(2)}`, value: <b style={{ color: r.BS_pts ? marginColor(r.BS_pts) : "var(--app-text-very-muted)" }}>{r.BS_pts ? signed(r.BS_pts) : "—"}</b> }] : []),
    { head: head("Environment", "ENV"), detail: `−β* ${beta.toFixed(2)} × E(${envYear}) ${e >= 0 ? "R" : "D"}+${Math.abs(e).toFixed(1)}${r.imputed ? " (source year)" : ""}`, value: <span className="font-mono" style={{ color: "var(--app-text-muted)" }}>{r.envPts ? signed(r.envPts) : "—"}</span> },
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
            <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, color: marginColor(r.NM) }}>{fmt2(r.NM)}</div>
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
                <td className="px-1.5 py-2.5 text-right font-bold tabular-nums" style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}>{fmt2(r.NM)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ModalShell>
  );
}

"use client";

import { useState, useMemo } from "react";
import {
  presPastResults,
  senateData,
  senateHoldovers,
  senateNoElection,
  governorData,
  governorNoElection,
  houseData,
  houseStatewideResults,
  stateLegData,
  type PastResult,
} from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import {
  TPL_GLOBAL_CONSTANTS as G,
  STATE_MODEL_CONSTANTS,
  STATE_RACE_INPUTS,
  STATE_S_CALCULATIONS,
  WQ_VALUES,
  LQ_VALUES,
  type RaceModelInputs,
  type CQTier,
} from "@/data/tplModelData";

// ── Race stub type (input to computation) ───────────────────────────────────

interface RaceStub {
  race: string;
  district?: string;
  raceType: "P" | "S" | "G" | "H" | "L";
  year: number;
  incumbent: string;
  wqTier: CQTier;
  lqTier: CQTier;
  CQ: number;
  FF: number;
  PIF: number;
  historicalMargins: { year: number; margin: number }[];
}

// ── Dynamic race list generation ────────────────────────────────────────────

function generateRaceList(stateAbbr: string, stateName: string): RaceStub[] {
  const modelInputs: RaceModelInputs[] = STATE_RACE_INPUTS[stateAbbr] ?? [];
  const stubs: RaceStub[] = [];

  function incumbentFromResult(result?: Pick<PastResult, "demIncumbent" | "repIncumbent">): string {
    if (result?.demIncumbent) return "D";
    if (result?.repIncumbent) return "R";
    return "Open";
  }

  function overlay(race: string, year: number) {
    return modelInputs.find((i) => i.race === race && i.year === year);
  }

  function makeStub(
    race: string,
    raceType: RaceStub["raceType"],
    year: number,
    district?: string,
    incumbent = "Open",
    historicalMargins: RaceStub["historicalMargins"] = []
  ): RaceStub {
    const inp = overlay(race, year);
    return {
      race,
      district,
      raceType,
      year,
      incumbent,
      wqTier: inp?.wqTier ?? "Generic",
      lqTier: inp?.lqTier ?? "Generic",
      CQ: WQ_VALUES[inp?.wqTier ?? "Generic"] * LQ_VALUES[inp?.lqTier ?? "Generic"],
      FF: inp?.FF ?? 1.00,
      PIF: inp?.PIF ?? 1.00,
      historicalMargins,
    };
  }

  // President (2017+)
  const presidentialResults = presPastResults[stateAbbr] ?? [];
  const presidentialMargins = presidentialResults.map((result) => ({
    year: result.year,
    margin: result.repPct - result.demPct,
  }));
  for (const r of presidentialResults) {
    if (r.year >= 2017) {
      stubs.push(
        makeStub(
          "President",
          "P",
          r.year,
          undefined,
          incumbentFromResult(r),
          presidentialMargins
        )
      );
    }
  }

  // Senate — all seats for this state (multiple seats OK — distinguished by year)
  const allSenate = [
    ...senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-")),
    ...senateHoldovers.filter((d) => d.abbr === stateAbbr),
    ...senateNoElection.filter((d) => d.abbr === stateAbbr),
  ];
  for (const seat of allSenate) {
    const historicalMargins = (seat.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2017) {
        stubs.push(
          makeStub(
            "Senate",
            "S",
            r.year,
            undefined,
            incumbentFromResult(r),
            historicalMargins
          )
        );
      }
    }
  }

  // Governor (2017+ — catches NJ/VA odd-year elections)
  const allGov = [
    ...governorData.filter((d) => d.id === stateAbbr),
    ...governorNoElection.filter((d) => d.abbr === stateAbbr),
  ];
  for (const seat of allGov) {
    const historicalMargins = (seat.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2017) {
        stubs.push(
          makeStub(
            "Governor",
            "G",
            r.year,
            undefined,
            incumbentFromResult(r),
            historicalMargins
          )
        );
      }
    }
  }

  // House — each district, each election year (2017+)
  for (const dist of houseData.filter((r) => r.state === stateName)) {
    const historicalMargins = (dist.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of dist.pastResults ?? []) {
      if (r.year >= 2017) {
        stubs.push(
          makeStub(
            `House ${dist.name}`,
            "H",
            r.year,
            dist.name,
            incumbentFromResult(r),
            historicalMargins
          )
        );
      }
    }
  }

  // State Legislature — 2 most recent years with two-party vote data
  const legEntries = stateLegData[stateName] ?? [];
  const legYears = [
    ...new Set(
      legEntries
        .filter((e) => e.demVotes != null && e.repVotes != null)
        .map((e) => e.year)
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 2)
    .reverse();

  for (const year of legYears) {
    const historicalMargins = [
      ...new Set(
        legEntries
          .filter((entry) => entry.demVotes != null && entry.repVotes != null)
          .map((entry) => entry.year)
      ),
    ].map((historicalYear) => {
      const entries = legEntries.filter((entry) => entry.year === historicalYear);
      const demVotes = entries.reduce((sum, entry) => sum + (entry.demVotes ?? 0), 0);
      const repVotes = entries.reduce((sum, entry) => sum + (entry.repVotes ?? 0), 0);
      return {
        year: historicalYear,
        margin: ((repVotes - demVotes) / (demVotes + repVotes)) * 100,
      };
    });
    stubs.push(
      makeStub("State Legislature", "L", year, undefined, "-", historicalMargins)
    );
  }

  const RACE_TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3, L: 4 };
  return stubs.sort((a, b) => {
    const typeOrder = (RACE_TYPE_ORDER[a.raceType] ?? 9) - (RACE_TYPE_ORDER[b.raceType] ?? 9);
    if (typeOrder !== 0) return typeOrder;
    if (a.year !== b.year) return b.year - a.year;
    return a.race.localeCompare(b.race);
  });
}

// ── Raw margin lookup (R-positive: positive = R wins) ──────────────────────

function getRawMargin(
  race: string,
  district: string | undefined,
  year: number,
  stateAbbr: string,
  stateName: string
): number | null {
  if (race === "President") {
    const e = (presPastResults[stateAbbr] ?? []).find((r) => r.year === year);
    return e != null ? e.repPct - e.demPct : null;
  }

  if (race === "Senate") {
    const all = [
      ...senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-")),
      ...senateHoldovers.filter((d) => d.abbr === stateAbbr),
      ...senateNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of all) {
      const e = (seat.pastResults ?? []).find((r) => r.year === year);
      if (e != null) return e.repPct - e.demPct;
    }
    return null;
  }

  if (race === "Governor") {
    const all = [
      ...governorData.filter((d) => d.id === stateAbbr),
      ...governorNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of all) {
      const e = (seat.pastResults ?? []).find((r) => r.year === year);
      if (e != null) return e.repPct - e.demPct;
    }
    return null;
  }

  if (district) {
    const dist = houseData.find((r) => r.name === district);
    const e = (dist?.pastResults ?? []).find((r) => r.year === year);
    return e != null ? e.repPct - e.demPct : null;
  }

  if (race === "State Legislature") {
    const entries = (stateLegData[stateName] ?? []).filter((e) => e.year === year);
    let dem = 0, rep = 0;
    for (const e of entries) {
      if (e.demVotes != null && e.repVotes != null) {
        dem += e.demVotes;
        rep += e.repVotes;
      }
    }
    const total = dem + rep;
    return total > 0 ? ((rep - dem) / total) * 100 : null;
  }

  return null;
}

// ── Competitiveness adjustment for margins greater than 65 points ──────────

const NONCOMPETITIVE_MARGIN_THRESHOLD = 65;
const PRIOR_CONTESTED_WEIGHT = 0.6;
const PRESIDENTIAL_BASELINE_WEIGHT = 0.4;

interface CompetitivenessAdjustment {
  adjustedMargin: number;
  adjusted: boolean;
  priorContestedMargin: number | null;
  presidentialBaselineMargin: number | null;
}

function getPriorPresidentialMargin(
  stateAbbr: string,
  district: string | undefined,
  year: number
): number | null {
  if (district) {
    const districtId = houseData.find((race) => race.name === district)?.id;
    const result = districtId
      ? (houseStatewideResults[districtId] ?? [])
          .filter((entry) => entry.race === "President" && entry.year < year)
          .sort((a, b) => b.year - a.year)[0]
      : undefined;
    return result ? result.repPct - result.demPct : null;
  }

  const result = (presPastResults[stateAbbr] ?? [])
    .filter((entry) => entry.year < year)
    .sort((a, b) => b.year - a.year)[0];
  return result ? result.repPct - result.demPct : null;
}

function computeCompetitivenessAdjustment(
  rawMargin: number,
  stub: RaceStub,
  stateAbbr: string
): CompetitivenessAdjustment {
  if (Math.abs(rawMargin) <= NONCOMPETITIVE_MARGIN_THRESHOLD) {
    return {
      adjustedMargin: rawMargin,
      adjusted: false,
      priorContestedMargin: null,
      presidentialBaselineMargin: null,
    };
  }

  const priorResults = stub.historicalMargins
    .filter((result) => result.year < stub.year)
    .sort((a, b) => b.year - a.year);
  const priorContested =
    priorResults.find(
      (result) => Math.abs(result.margin) <= NONCOMPETITIVE_MARGIN_THRESHOLD
    ) ??
    [...priorResults].sort(
      (a, b) => Math.abs(a.margin) - Math.abs(b.margin)
    )[0];
  const presidentialBaselineMargin = getPriorPresidentialMargin(
    stateAbbr,
    stub.district,
    stub.year
  );

  // If one source is unavailable, use the available source for both sides of
  // the blend so an extreme raw margin never silently re-enters the model.
  const priorContestedMargin =
    priorContested?.margin ?? presidentialBaselineMargin ?? rawMargin;
  const presidentialMargin =
    presidentialBaselineMargin ?? priorContested?.margin ?? rawMargin;

  return {
    adjustedMargin:
      PRIOR_CONTESTED_WEIGHT * priorContestedMargin +
      PRESIDENTIAL_BASELINE_WEIGHT * presidentialMargin,
    adjusted: true,
    priorContestedMargin,
    presidentialBaselineMargin,
  };
}

// ── WF formula: 1/(1+NES×S×k×sign), bounded [0.6, 1.6] ────────────────────

function computeWF(
  base: number,
  NES: number,
  S: number,
  k_mult: number
): { wf: number; capped: boolean } {
  if (base === 0) return { wf: 1.0, capped: false };
  const sign = base > 0 ? 1 : -1;
  const unclamped = 1 / (1 + NES * S * k_mult * sign);
  const clamped = Math.max(0.6, Math.min(1.6, unclamped));
  return { wf: clamped, capped: Math.abs(unclamped - clamped) > 0.0001 };
}

// ── IF formula ──────────────────────────────────────────────────────────────

const IF_INCUMBENT_WINS: Record<string, number> = { P: 0.935, S: 0.875, G: 0.835, H: 0.80, L: 0.875 };
const IF_CHALLENGER_WINS: Record<string, number> = { P: 1.07, S: 1.14, G: 1.20, H: 1.25, L: 1.14 };

function computeIF(raceType: string, incumbent: string, rawMargin: number | null): number {
  if (raceType === "P" || incumbent === "Open" || incumbent === "-" || rawMargin === null) return 1.00;
  const incumbentWon = (incumbent === "R" && rawMargin > 0) || (incumbent === "D" && rawMargin < 0);
  return incumbentWon ? (IF_INCUMBENT_WINS[raceType] ?? 1.00) : (IF_CHALLENGER_WINS[raceType] ?? 1.00);
}

// ── Display helpers ─────────────────────────────────────────────────────────

function fmtMargin(v: number | null): string {
  if (v === null) return "—";
  if (Math.abs(v) < 0.005) return "EVEN";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(2)}`;
}

function marginColor(v: number | null): string {
  if (v === null || Math.abs(v) < 0.005) return "var(--app-text-primary)";
  return v > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

function marginBg(v: number | null): string {
  if (v === null || Math.abs(v) < 0.005) return "transparent";
  return v > 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)";
}

// ── Glossary ────────────────────────────────────────────────────────────────

const GLOSSARY = [
  { abbr: "CF", term: "Candidate Factor", desc: "Combined point contribution of IF and CQ: Adjusted Margin × (IF × CQ − 1). IF and CQ compound multiplicatively; the result is expressed as a signed point contribution." },
  { abbr: "CQ", term: "Candidate Quality Factor", desc: "<1.0 when the winning party had the quality advantage; >1.0 when the winner overcame a quality disadvantage. CQ = WQ × LQ." },
  { abbr: "FF", term: "Fundraising Factor", desc: "Adjusts margin based on fundraising advantage. 1.00 = no adjustment. Pending calibration." },
  { abbr: "IF", term: "Incumbency Factor", desc: "Discounts margin attributable to incumbency advantage. Open seats = 1.00. Losing incumbents treated as 1.00." },
  { abbr: "k", term: "Wave Scaling Constants", desc: "k_add = 0.35 (additive component), k_mult = 0.05 (multiplicative component). Both placeholders pending calibration." },
  { abbr: "NES", term: "National Environment Score", desc: "National partisan lean per cycle. Blended President+House popular vote (presidential years) or House alone (midterms). Positive = R-favored." },
  { abbr: "NM", term: "Neutralized Margin", desc: "Adjusted Margin × (IF × CQ) + FF + PIF − WA. IF and CQ compound; FF, PIF, and WA contribute independently." },
  { abbr: "PGSHL", term: "Race Type Codes", desc: "P = President, G = Governor, S = U.S. Senate, H = U.S. House, L = State Legislature." },
  { abbr: "PIF", term: "Presidential Incumbent Factor", desc: "Adjusts margin based on whether the presidential incumbent's party affects down-ballot races. 1.00 = no adjustment. Pending calibration." },
  { abbr: "Pre-TPL", term: "Pre-True Partisan Lean", desc: "The state's recency-weighted score before centering against the 50-state median." },
  { abbr: "S", term: "State Wave Sensitivity Coefficient", desc: "How much a state amplifies or dampens national swings, calculated from cycle-over-cycle state and national House-margin swing ratios." },
  { abbr: "TPL", term: "True Partisan Lean", desc: "A state's neutral structural partisan lean, centered against the median of all 50 states." },
  { abbr: "WA", term: "Wave Adjustment", desc: "Hybrid point shift: 70% additive (NES × S × k_add) + 30% multiplicative (base × (1−WF)) converted to points. Positive = R wave stripped." },
  { abbr: "WRS", term: "Weighted Race Score", desc: "One year's TPL signal: the weighted average of NMs across all race types present that cycle." },
];

const RACE_TYPE_LABELS: Record<string, string> = {
  P: "President", S: "Senate", G: "Governor", H: "House", L: "State Leg",
};

// ── Formula panels ───────────────────────────────────────────────────────────

const FORMULA_PANELS: Record<string, { title: string; rows: { label: string; formula: string; note?: string }[] }> = {
  "Adjusted ↗": {
    title: "Adjusted Margin (AM)",
    rows: [
      { label: "Uncontested check", formula: "|Raw Margin| ≤ 65  →  Adjusted Margin = Raw Margin" },
      { label: "Non-competitive", formula: "|Raw Margin| > 65  →  Adjusted Margin = 0.6 × Prior Contested + 0.4 × Prior Presidential", note: "Prior Contested = most recent prior result with |margin| ≤ 65 for the same seat. If either source is unavailable, the available source fills both weights." },
    ],
  },
  "IF ↗": {
    title: "Incumbency Factor (IF)",
    rows: [
      { label: "Shown as", formula: "Multiplier — compounds with CQ into Candidate Factor" },
      { label: "No incumbent / President", formula: "IF = 1.00" },
      { label: "Incumbent won (H)", formula: "IF = 0.80" },
      { label: "Incumbent won (S / Leg)", formula: "IF = 0.875" },
      { label: "Incumbent won (G)", formula: "IF = 0.835" },
      { label: "Challenger won (H)", formula: "IF = 1.25" },
      { label: "Challenger won (S / Leg)", formula: "IF = 1.14" },
      { label: "Challenger won (G)", formula: "IF = 1.20" },
      { label: "Interpretation", formula: "< 1.00 = incumbent advantage discounted. > 1.00 = challenger upset inflates signal.", note: "President is excluded — a separate popularity-based metric is planned." },
    ],
  },
  "CQ ↗": {
    title: "Candidate Quality Factor (CQ = WQ × LQ)",
    rows: [
      { label: "Shown as", formula: "Multiplier — compounds with IF into Candidate Factor" },
      { label: "WQ — Winning Candidate Quality", formula: "Elite=0.75 · Strong=0.88 · Generic=1.00 · Weak=1.12 · Sacrificial=1.25" },
      { label: "LQ — Losing Candidate Quality", formula: "Elite=1.25 · Strong=1.12 · Generic=1.00 · Weak=0.88 · Sacrificial=0.75" },
      { label: "Default", formula: "Generic / Generic  →  CQ = 1.00" },
      { label: "Example (Elite winner vs Sacrificial loser)", formula: "0.75 × 0.75 = 0.5625" },
      { label: "Example (Weak winner vs Strong loser)", formula: "1.12 × 1.12 = 1.2544" },
    ],
  },
  "CF ↗": {
    title: "Candidate Factor (CF)",
    rows: [
      { label: "Formula", formula: "CF = Adjusted Margin × (IF × CQ − 1)" },
      { label: "Interpretation", formula: "The combined point contribution of incumbency and candidate quality — the two compound rather than add." },
      { label: "Default (no incumbent, Generic/Generic)", formula: "IF=1.00, CQ=1.00  →  1.00×1.00−1 = 0  →  0 pts" },
      { label: "Example: R incumbent won, Elite/Generic", formula: "IF=0.80, CQ=0.75  →  0.80×0.75−1 = −0.40  →  CF = Adj × −0.40" },
      { label: "Example: Challenger won, Weak/Strong", formula: "IF=1.25, CQ=1.12×1.12  →  1.25×1.2544−1 = +0.568  →  CF = Adj × +0.568" },
    ],
  },
  "FF ↗": {
    title: "Fundraising Factor (FF)",
    rows: [
      { label: "Formula", formula: "FF = Adjusted Margin × (FF − 1)" },
      { label: "Default", formula: "FF = 1.00  →  FF = 0  (not yet calibrated)" },
      { label: "Interpretation", formula: "Positive FF = fundraising advantage amplifies signal. Negative = disadvantage suppresses it.", note: "FF values pending calibration from campaign finance data." },
    ],
  },
  "PIF ↗": {
    title: "Presidential Incumbent Factor (PIF)",
    rows: [
      { label: "Formula", formula: "PIF = Adjusted Margin × (PIF − 1)" },
      { label: "Default", formula: "PIF = 1.00  →  PIF = 0  (not yet calibrated)" },
      { label: "Interpretation", formula: "Captures down-ballot drag or boost from the presidential incumbent's party approval.", note: "PIF values pending calibration." },
    ],
  },
  "WA ↗": {
    title: "Wave Adjustment (WA)",
    rows: [
      { label: "Additive component (70%)", formula: "WA_add = NES × S × k_add   (k_add = 0.35)" },
      { label: "Multiplicative WF", formula: "WF = 1 / (1 + NES × S × k_mult × sign(Adj Margin))   (k_mult = 0.05, bounded [0.6, 1.6])" },
      { label: "Multiplicative component (30%)", formula: "WA_mult = Adjusted Margin × (1 − WF)" },
      { label: "Blended WA", formula: "WA = 0.70 × WA_add + 0.30 × WA_mult" },
      { label: "NES values", formula: "2018: D+7.1 · 2020: D+2.3 · 2022: R+4.2 · 2024: R+3.5" },
      { label: "Sign convention", formula: "Positive WA = R wave being stripped. Negative WA = D wave being stripped.", note: "WA = 0 for states without S on record." },
    ],
  },
  "NM ↗": {
    title: "Neutralized Margin (NM)",
    rows: [
      { label: "Formula", formula: "NM = Adjusted Margin × (IF × CQ) + FF + PIF − WA" },
      { label: "Additive view", formula: "NM = Adjusted Margin + CF + FF + PIF − WA" },
      { label: "Pipeline", formula: "Raw → Adjusted → ×(IF×CQ) → +FF → +PIF → −WA → NM" },
      { label: "Note", formula: "IF and CQ compound with each other (multiplicative). FF, PIF, and WA contribute independently (additive)." },
      { label: "Purpose", formula: "NM is the stripped partisan signal: what the race result would look like without incumbency, candidate quality, or national wave effects." },
    ],
  },
};

// ── Computed race type ───────────────────────────────────────────────────────

interface ComputedRace extends RaceStub {
  rawMargin: number | null;
  IF: number;
  candidateFactor_pts: number | null;
  FF_pts: number | null;
  PIF_pts: number | null;
  adjustedMargin: number | null;
  competitivenessAdjusted: boolean;
  priorContestedMargin: number | null;
  presidentialBaselineMargin: number | null;
  WA: number;
  WFCapped: boolean;
  NM: number | null;
  inAggregation: boolean; // false for odd-year races not in YEAR_WEIGHTS
}

interface YearAggregation {
  year: number;
  racesPresent: string[];
  redistributedWeights: Record<string, number>;
  typeNMs: Record<string, number | null>;
  WRS: number;
}

interface StateModelCalculation {
  races: ComputedRace[];
  yearAggregations: YearAggregation[];
  preTpl: number;
}

function calculateStateModel(
  stateAbbr: string,
  stateName: string
): StateModelCalculation {
  const S = STATE_MODEL_CONSTANTS[stateAbbr]?.S ?? null;
  const stubs = generateRaceList(stateAbbr, stateName);
  const races: ComputedRace[] = stubs.map((stub) => {
    const rawMargin = getRawMargin(
      stub.race,
      stub.district,
      stub.year,
      stateAbbr,
      stateName
    );
    const NES = G.NES_BY_YEAR[stub.year] ?? null;
    const inAggregation = stub.year in G.YEAR_WEIGHTS;
    const competitiveness =
      rawMargin == null
        ? null
        : computeCompetitivenessAdjustment(rawMargin, stub, stateAbbr);
    const adjustedMargin = competitiveness?.adjustedMargin ?? null;
    const IF = computeIF(stub.raceType, stub.incumbent, rawMargin);
    const candidateFactor_pts = adjustedMargin != null ? adjustedMargin * (IF * stub.CQ - 1) : null;
    const FF_pts = adjustedMargin != null ? adjustedMargin * (stub.FF - 1) : null;
    const PIF_pts = adjustedMargin != null ? adjustedMargin * (stub.PIF - 1) : null;
    let WA = 0;
    let wfCapped = false;
    if (adjustedMargin != null && S != null && NES != null) {
      const WA_add = NES * S * G.k_add;
      const { wf, capped } = computeWF(adjustedMargin, NES, S, G.k_mult);
      const WA_mult = adjustedMargin * (1 - wf);
      WA = 0.70 * WA_add + 0.30 * WA_mult;
      wfCapped = capped;
    }

    const NM = adjustedMargin != null
      ? adjustedMargin * IF * stub.CQ + (FF_pts ?? 0) + (PIF_pts ?? 0) - WA
      : null;
    return {
      ...stub,
      rawMargin,
      IF,
      candidateFactor_pts,
      FF_pts,
      PIF_pts,
      adjustedMargin,
      competitivenessAdjusted: competitiveness?.adjusted ?? false,
      priorContestedMargin: competitiveness?.priorContestedMargin ?? null,
      presidentialBaselineMargin:
        competitiveness?.presidentialBaselineMargin ?? null,
      WA,
      WFCapped: wfCapped,
      NM,
      inAggregation,
    };
  });

  const yearAggregations = G.YEARS.map((year) => {
    const yearRaces = races.filter((race) => race.year === year && race.NM != null);

    const typeNMs: Record<string, number | null> = {};
    for (const type of ["P", "G", "S", "H", "L"]) {
      const typeRaces = yearRaces.filter((race) => race.raceType === type);
      typeNMs[type] = typeRaces.length > 0
        ? typeRaces.reduce((sum, race) => sum + (race.NM ?? 0), 0) / typeRaces.length
        : null;
    }

    const racesPresent = ["P", "G", "S", "H", "L"].filter((t) => typeNMs[t] != null);
    const totalBase = racesPresent.reduce((sum, type) => sum + (G.RACE_TYPE_WEIGHTS[type] ?? 0), 0);
    const redistributedWeights: Record<string, number> = {};
    for (const type of racesPresent) {
      redistributedWeights[type] = (G.RACE_TYPE_WEIGHTS[type] ?? 0) / totalBase;
    }

    const WRS = racesPresent.reduce(
      (sum, type) => sum + redistributedWeights[type] * (typeNMs[type] ?? 0),
      0
    );

    return { year, racesPresent, redistributedWeights, typeNMs, WRS };
  });

  const preTpl = yearAggregations.reduce(
    (sum, aggregation) =>
      sum + (G.YEAR_WEIGHTS[aggregation.year] ?? 0) * aggregation.WRS,
    0
  );

  return { races, yearAggregations, preTpl };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TplModelPage() {
  const [selectedAbbr, setSelectedAbbr] = useState("IA");
  const [raceFilter, setRaceFilter] = useState<string>("All");
  const [yearFilter, setYearFilter] = useState<string>("All");
  const [showGlossary, setShowGlossary] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState<string | null>(null);
  const [showAllStates, setShowAllStates] = useState(false);
  const [allStatesSort, setAllStatesSort] = useState<"tpl" | "preTpl" | "absTpl" | "name">("tpl");
  const [allStatesSortDir, setAllStatesSortDir] = useState<"asc" | "desc">("asc");

  // Derive full state name from abbreviation
  const selectedStateName = useMemo(
    () => statesData.find((s) => s.abbr === selectedAbbr)?.name ?? selectedAbbr,
    [selectedAbbr]
  );

  const S = STATE_MODEL_CONSTANTS[selectedAbbr]?.S ?? null;
  const hasS = S != null;

  const selectedCalculation = useMemo(
    () => calculateStateModel(selectedAbbr, selectedStateName),
    [selectedAbbr, selectedStateName]
  );
  const allRaces = selectedCalculation.races;
  const yearAggregations = selectedCalculation.yearAggregations;
  const preTpl = selectedCalculation.preTpl;

  const nationalTpl = useMemo(() => {
    const stateScores = statesData.map((state) => ({
      ...state,
      preTpl: calculateStateModel(state.abbr, state.name).preTpl,
    }));
    const sortedScores = stateScores.map((state) => state.preTpl).sort((a, b) => a - b);
    const midpoint = sortedScores.length / 2;
    const medianPreTpl =
      sortedScores.length % 2 === 0
        ? (sortedScores[midpoint - 1] + sortedScores[midpoint]) / 2
        : sortedScores[Math.floor(midpoint)];

    return { stateScores, medianPreTpl };
  }, []);

  const finalTpl = preTpl - nationalTpl.medianPreTpl;

  const allStateRows = useMemo(() => {
    const rows = nationalTpl.stateScores.map((s) => ({
      abbr: s.abbr,
      name: s.name,
      preTpl: s.preTpl,
      tpl: s.preTpl - nationalTpl.medianPreTpl,
    }));
    return [...rows].sort((a, b) => {
      if (allStatesSort === "name") {
        return allStatesSortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const valA = allStatesSort === "absTpl" ? Math.abs(a.tpl) : allStatesSort === "tpl" ? a.tpl : a.preTpl;
      const valB = allStatesSort === "absTpl" ? Math.abs(b.tpl) : allStatesSort === "tpl" ? b.tpl : b.preTpl;
      return allStatesSortDir === "asc" ? valA - valB : valB - valA;
    });
  }, [nationalTpl, allStatesSort, allStatesSortDir]);

  // Available years for the year filter pill
  const availableYears = useMemo(
    () => [...new Set(allRaces.map((r) => r.year))].sort(),
    [allRaces]
  );

  // Filtered races for the per-race table
  const filteredRaces = useMemo(
    () =>
      allRaces.filter((r) => {
        if (raceFilter !== "All" && r.raceType !== raceFilter) return false;
        if (yearFilter !== "All" && r.year !== Number(yearFilter)) return false;
        return true;
      }),
    [allRaces, raceFilter, yearFilter]
  );

  const anyWFCapped = filteredRaces.some((r) => r.WFCapped);
  const hasOddYears = allRaces.some((r) => !r.inAggregation);

  // ── Render ───────────────────────────────────────────────────────────────

  function handleSortClick(col: "tpl" | "preTpl" | "absTpl" | "name") {
    if (allStatesSort === col) {
      setAllStatesSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setAllStatesSort(col);
      setAllStatesSortDir(col === "absTpl" ? "desc" : "asc");
    }
  }

  return (
    <div className="mt-1 md:mt-2">

      {/* ── All states toggle ── */}
      <div className="mb-4">
        <button
          onClick={() => setShowAllStates((v) => !v)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{
            background: showAllStates ? "var(--app-text-muted)" : "var(--app-panel)",
            color: showAllStates ? "var(--app-bg)" : "var(--app-text-muted)",
            border: "1px solid var(--app-border)",
          }}
        >
          {showAllStates ? "▲ Hide all states" : "▼ All 50 states overview"}
        </button>

        {showAllStates && (
          <div className="mt-3 rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                    <th
                      className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none"
                      style={{ color: allStatesSort === "name" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                      onClick={() => handleSortClick("name")}
                    >
                      State {allStatesSort === "name" ? (allStatesSortDir === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                    {([
                      ["Pre-TPL", "preTpl", "Before 50-state centering"],
                      ["TPL", "tpl", "Final centered score"],
                      ["|TPL| (even→partisan)", "absTpl", "Sort by how competitive or one-sided the state is"],
                    ] as const).map(([label, col, tip]) => (
                      <th
                        key={col}
                        title={tip}
                        className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap"
                        style={{ color: allStatesSort === col ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                        onClick={() => handleSortClick(col)}
                      >
                        {label} {allStatesSort === col ? (allStatesSortDir === "asc" ? "↑" : "↓") : "↕"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allStateRows.map((s, i) => (
                    <tr
                      key={s.abbr}
                      className="cursor-pointer"
                      style={{
                        background: s.abbr === selectedAbbr
                          ? "var(--app-border)"
                          : i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                        borderBottom: "1px solid var(--app-border)",
                      }}
                      onClick={() => { setSelectedAbbr(s.abbr); setShowAllStates(false); setRaceFilter("All"); setYearFilter("All"); }}
                    >
                      <td className="px-4 py-2 font-semibold" style={{ color: "var(--app-text-primary)" }}>
                        {s.name}
                        <span className="ml-1.5 text-[10px] font-mono" style={{ color: "var(--app-text-very-muted)" }}>{s.abbr}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold" style={{ color: marginColor(s.preTpl) }}>
                        {fmtMargin(s.preTpl)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-bold" style={{ color: marginColor(s.tpl), background: marginBg(s.tpl) }}>
                        {fmtMargin(s.tpl)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                        {Math.abs(s.tpl).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-[10px]" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-panel)", color: "var(--app-text-very-muted)" }}>
              Click a row to open that state. 50-state median Pre-TPL = {fmtMargin(nationalTpl.medianPreTpl)}.
            </div>
          </div>
        )}
      </div>

      {/* ── State selector ── */}
      <div
        className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl px-4 py-4"
        style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--app-text-very-muted)" }}>
            State
          </div>
          <select
            value={selectedAbbr}
            onChange={(e) => {
              setSelectedAbbr(e.target.value);
              setRaceFilter("All");
              setYearFilter("All");
            }}
            className="rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer"
            style={{
              background: "var(--app-bg)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text-primary)",
              minWidth: 200,
            }}
          >
            {[...statesData].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
              <option key={s.abbr} value={s.abbr}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="sm:ml-4 flex flex-wrap gap-x-6 gap-y-1.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-very-muted)" }}>S</div>
            <div
              className={hasS ? "text-sm font-bold font-mono cursor-pointer underline decoration-dotted underline-offset-2" : "text-sm font-bold font-mono"}
              style={{ color: hasS ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}
              onClick={hasS ? () => setFormulaOpen("S") : undefined}
              title={hasS ? "Click to see S derivation" : undefined}
            >
              {hasS ? S : "—"}{hasS && <span className="ml-0.5 text-[10px] opacity-50">ⓘ</span>}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-very-muted)" }}>WA Active</div>
            <div className="text-sm font-bold" style={{ color: hasS ? "var(--party-dem)" : "var(--app-text-very-muted)" }}>
              {hasS ? "Yes" : "No (WA = 0)"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-very-muted)" }}>Model Inputs</div>
            <div className="text-sm font-bold" style={{ color: (STATE_RACE_INPUTS[selectedAbbr]?.length ?? 0) > 0 ? "var(--party-dem)" : "var(--app-text-very-muted)" }}>
              {STATE_RACE_INPUTS[selectedAbbr]?.length
                ? `${STATE_RACE_INPUTS[selectedAbbr].length} races`
                : "All defaults (1.00)"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-very-muted)" }}>Races Loaded</div>
            <div className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{allRaces.length}</div>
          </div>
          {!hasS && (
            <div className="self-end text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              Add this state's S to <code className="font-mono text-[11px]">tplModelData.ts</code> to enable WA.
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="mb-5">
        <h2 className="text-xl font-bold sm:text-2xl" style={{ color: "var(--app-text-primary)" }}>
          True Partisan Lean (TPL) — {selectedStateName}
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
          Raw election data 2017–2024 · IF/CQ/WA{!hasS && " all"} defaulted to 1.00{hasS ? " where not yet calibrated" : " (no S set for this state)"}
        </p>
      </div>

      {/* Glossary (collapsible) */}
      <div className="mb-5 rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left transition-opacity hover:opacity-80"
          style={{ background: "var(--app-panel)" }}
          onClick={() => setShowGlossary((g) => !g)}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
            Abbreviations &amp; Factor Glossary
          </span>
          <span className="text-xs font-mono" style={{ color: "var(--app-text-muted)" }}>
            {showGlossary ? "▲ hide" : "▼ show"}
          </span>
        </button>
        {showGlossary && (
          <div style={{ borderTop: "1px solid var(--app-border)" }}>
            {GLOSSARY.map((item, i) => (
              <div
                key={item.abbr}
                className="px-4 py-2.5"
                style={{
                  background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                  borderBottom: i < GLOSSARY.length - 1 ? "1px solid var(--app-border)" : undefined,
                }}
              >
                <span className="font-mono text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>
                  {item.abbr}
                </span>
                <span className="text-xs mx-1.5" style={{ color: "var(--app-text-very-muted)" }}>—</span>
                <span className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  {item.term}
                </span>
                <span className="text-xs mx-1.5" style={{ color: "var(--app-text-very-muted)" }}>·</span>
                <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 1: Per-race table ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 1 — Per-Race Calculations
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          NM = Adjusted Margin × (IF × CQ) + FF + PIF − WA. IF and CQ compound; all others add independently. Margins greater than 65 points are first blended from 60% prior contested result and 40% prior presidential result.{" "}
          {!hasS && <span style={{ color: "var(--app-text-very-muted)" }}>WA = 0 (no S). </span>}
          Raw margins are live from the site's data.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Race</span>
            {["All", "P", "S", "G", "H", "L"].map((f) => (
              <button
                key={f}
                onClick={() => setRaceFilter(f)}
                className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: raceFilter === f ? "var(--app-tab-bg)" : "transparent",
                  color: raceFilter === f ? "var(--app-text-primary)" : "var(--app-text-muted)",
                  border: "1px solid var(--app-border)",
                  boxShadow: raceFilter === f ? "inset 0 0 0 1px var(--app-border)" : "none",
                }}
              >
                {f === "All" ? "All" : `${f} · ${RACE_TYPE_LABELS[f]}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Year</span>
            <button
              onClick={() => setYearFilter("All")}
              className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
              style={{
                background: yearFilter === "All" ? "var(--app-tab-bg)" : "transparent",
                color: yearFilter === "All" ? "var(--app-text-primary)" : "var(--app-text-muted)",
                border: "1px solid var(--app-border)",
                boxShadow: yearFilter === "All" ? "inset 0 0 0 1px var(--app-border)" : "none",
              }}
            >
              All
            </button>
            {availableYears.map((y) => (
              <button
                key={y}
                onClick={() => setYearFilter(String(y))}
                className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: yearFilter === String(y) ? "var(--app-tab-bg)" : "transparent",
                  color: yearFilter === String(y) ? "var(--app-text-primary)" : "var(--app-text-muted)",
                  border: "1px solid var(--app-border)",
                  boxShadow: yearFilter === String(y) ? "inset 0 0 0 1px var(--app-border)" : "none",
                  opacity: G.YEARS.includes(y) ? 1 : 0.6,
                }}
                title={!G.YEARS.includes(y) ? "Odd-year race — not included in Pre-TPL aggregation" : undefined}
              >
                {y}{!G.YEARS.includes(y) ? "*" : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Per-race table */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                  {[
                    ["Race", "Race type and name"],
                    ["Year", "Election year. * = odd-year race, not yet included in Pre-TPL aggregation"],
                    ["Raw", "Raw Margin = repPct − demPct. Positive = R wins. Live from site data."],
                    ["Adjusted ↗", "Adjusted Margin — raw margin unless |margin| > 65, then 60% prior contested + 40% prior presidential."],
                    ["Incumbent", "Incumbent party marker or Open. State Legislature = -."],
                    ["IF ↗", "Incumbency Factor multiplier. Compounds with CQ into CF."],
                    ["WQ / LQ", "Winning and losing candidate quality tiers. Generic/Generic = CQ of 1.00."],
                    ["CQ ↗", "Candidate Quality Factor = WQ × LQ. Compounds with IF into CF."],
                    ["CF ↗", "Candidate Factor = Adjusted Margin × (IF × CQ − 1). Combined compounded signal."],
                    ["FF ↗", "Fundraising Factor pts = AM × (FF − 1). 0 until calibrated."],
                    ["PIF ↗", "Presidential Incumbent Factor pts = AM × (PIF − 1). 0 until calibrated."],
                    ["WA ↗", "Wave Adjustment = NES × S × k. Subtracted from the sum. 0 if no S."],
                    ["NM ↗", "Adjusted × (IF × CQ) + FF + PIF − WA."],
                  ].map(([label, tip], ci) => {
                    const isClickable = label in FORMULA_PANELS;
                    return (
                      <th
                        key={label}
                        title={isClickable ? `Click to see ${label} formula` : tip}
                        className={`px-2 py-2 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap text-left ${isClickable ? "cursor-pointer select-none" : ""}`}
                        style={{ color: ci === 12 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                        onClick={isClickable ? () => setFormulaOpen(label) : undefined}
                      >
                        {label}{isClickable && <span className="ml-0.5 opacity-50">ⓘ</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredRaces.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                      opacity: r.inAggregation ? 1 : 0.75,
                    }}
                  >
                    <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
                        >
                          {r.raceType}
                        </span>
                        <span className="font-semibold">{r.race}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                      {r.year}{!r.inAggregation ? <span style={{ color: "var(--app-text-very-muted)" }}>*</span> : ""}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>
                      {fmtMargin(r.rawMargin)}
                    </td>
                    <td
                      className="px-2 py-2 text-left tabular-nums font-semibold"
                      style={{ color: marginColor(r.adjustedMargin) }}
                      title={
                        r.competitivenessAdjusted
                          ? `60% prior result (${fmtMargin(r.priorContestedMargin)}) + 40% prior presidential result (${fmtMargin(r.presidentialBaselineMargin)})`
                          : "Raw margin is 65 points or less; no competitiveness adjustment"
                      }
                    >
                      {fmtMargin(r.adjustedMargin)}
                      {r.competitivenessAdjusted && (
                        <span className="ml-0.5" style={{ color: "var(--app-text-very-muted)" }}>‡</span>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                      {r.raceType === "P"
                        ? "-"
                        : r.incumbent === "R" && r.rawMargin != null
                        ? r.rawMargin > 0 ? "R won" : "R lost"
                        : r.incumbent === "D" && r.rawMargin != null
                        ? r.rawMargin < 0 ? "D won" : "D lost"
                        : r.incumbent}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.IF !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                      {r.IF.toFixed(3)}
                    </td>
                    <td className="px-2 py-2 text-[11px]" style={{ color: r.wqTier === "Generic" && r.lqTier === "Generic" ? "var(--app-text-very-muted)" : "var(--app-text-muted)" }}>
                      {r.wqTier === "Generic" && r.lqTier === "Generic" ? "—" : `${r.wqTier} / ${r.lqTier}`}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.CQ !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                      {r.CQ.toFixed(4)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold" style={{ color: r.candidateFactor_pts != null && r.candidateFactor_pts !== 0 ? marginColor(r.candidateFactor_pts) : "var(--app-text-very-muted)" }}>
                      {r.candidateFactor_pts != null && r.candidateFactor_pts !== 0 ? (r.candidateFactor_pts > 0 ? "+" : "") + r.candidateFactor_pts.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.FF_pts != null && r.FF_pts !== 0 ? marginColor(r.FF_pts) : "var(--app-text-very-muted)" }}>
                      {r.FF_pts != null && r.FF_pts !== 0 ? (r.FF_pts > 0 ? "+" : "") + r.FF_pts.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.PIF_pts != null && r.PIF_pts !== 0 ? marginColor(r.PIF_pts) : "var(--app-text-very-muted)" }}>
                      {r.PIF_pts != null && r.PIF_pts !== 0 ? (r.PIF_pts > 0 ? "+" : "") + r.PIF_pts.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                      {r.WA !== 0 ? (-r.WA > 0 ? "+" : "") + (-r.WA).toFixed(2) : "—"}
                      {r.WFCapped && <span style={{ color: "var(--app-text-very-muted)" }}>†</span>}
                    </td>
                    <td
                      className="px-2 py-2 text-left tabular-nums font-bold"
                      style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}
                    >
                      {fmtMargin(r.NM)}
                    </td>
                  </tr>
                ))}
                {filteredRaces.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-6 text-center text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                      No races match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 flex flex-wrap gap-x-5 text-[10px]" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-panel)", color: "var(--app-text-very-muted)" }}>
            {filteredRaces.some((r) => r.competitivenessAdjusted) && (
              <span>‡ Raw margin was greater than 65 points and replaced by the 60/40 competitiveness blend.</span>
            )}
            {anyWFCapped && <span>† Multiplicative WF component was capped at the [0.6, 1.6] bound.</span>}
            {hasOddYears && <span>* Odd-year race (NJ/VA governor elections). Shown in table but not yet included in Pre-TPL aggregation.</span>}
            {!hasS && <span>WA = 0 for all races (no S on record for {selectedStateName}).</span>}
          </div>
        </div>

        {/* NES strip */}
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
          {G.YEARS.map((year) => {
            const nes = G.NES_BY_YEAR[year] ?? 0;
            return (
              <span key={year} className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                {year} NES:{" "}
                <span className="font-semibold" style={{ color: nes >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                  {nes >= 0 ? "R" : "D"}+{Math.abs(nes)}
                </span>
              </span>
            );
          })}
          {hasS && (
            <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
              {selectedStateName} S: <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>{S}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Step 2: Year aggregation ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 2 — Year-Level Aggregation
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          House districts averaged into one state-level signal per year.
          Race type weights redistributed among types present.
          <strong style={{ color: "var(--app-text-primary)" }}> WRS</strong> = weighted average of ARMs.
        </p>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-xs">
              <thead>
                <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                  {(["Year", "President", "Governor", "Senate", "House Avg", "Leg", "WRS"] as const).map((label) => (
                    <th
                      key={label}
                      className={`px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${label === "Year" ? "text-left" : "text-right"}`}
                      style={{ color: label === "WRS" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearAggregations.map((agg, i) => (
                  <tr
                    key={agg.year}
                    style={{
                      background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                      {agg.year}
                    </td>
                    {(["P", "G", "S", "H", "L"] as const).map((type) => {
                      const val = agg.typeNMs[type] ?? null;
                      const wt = agg.redistributedWeights[type];
                      return (
                        <td key={type} className="px-3 py-2 text-right tabular-nums">
                          <div className="font-semibold" style={{ color: val != null ? marginColor(val) : "var(--app-text-very-muted)" }}>
                            {val != null ? fmtMargin(val) : "—"}
                          </div>
                          {wt != null && (
                            <div className="text-[10px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>
                              {(wt * 100).toFixed(1)}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td
                      className="px-3 py-2.5 text-right tabular-nums font-bold"
                      style={{ color: marginColor(agg.WRS || null), background: marginBg(agg.WRS || null) }}
                    >
                      {agg.racesPresent.length > 0 ? fmtMargin(agg.WRS) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
          {G.YEARS.map((year) => (
            <span key={year} className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
              {year} weight: <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                {((G.YEAR_WEIGHTS[year] ?? 0) * 100).toFixed(0)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Step 3: TPL card ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 3 — Final Calculation
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          Pre-TPL = recency-weighted average of annual WRS scores. Final TPL centers that score against the 50-state median.
        </p>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
          {/* Formula */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-very-muted)" }}>Formula</p>
            <div className="rounded-lg px-4 py-3 font-mono text-xs leading-relaxed" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
              <div style={{ color: "var(--app-text-muted)" }}>Pre-TPL =</div>
              {yearAggregations.filter((a) => a.racesPresent.length > 0).map((agg, i) => {
                const w = G.YEAR_WEIGHTS[agg.year] ?? 0;
                return (
                  <div key={agg.year} className="ml-4">
                    <span style={{ color: "var(--app-text-very-muted)" }}>{i === 0 ? "  " : "+ "}</span>
                    <span style={{ color: "var(--app-text-primary)" }}>{w.toFixed(2)}</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> × </span>
                    <span style={{ color: agg.WRS >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                      {agg.WRS >= 0 ? "R" : "D"}+{Math.abs(agg.WRS).toFixed(2)}
                    </span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> ({agg.year})</span>
                  </div>
                );
              })}
              {yearAggregations.every((a) => a.racesPresent.length === 0) && (
                <div style={{ color: "var(--app-text-very-muted)" }} className="ml-4">No data available for this state</div>
              )}
              <div className="mt-2" style={{ color: "var(--app-text-muted)" }}>Final TPL =</div>
              <div className="ml-4">
                <span style={{ color: marginColor(preTpl) }}>{fmtMargin(preTpl)}</span>
                <span style={{ color: "var(--app-text-very-muted)" }}> − median </span>
                <span style={{ color: marginColor(nationalTpl.medianPreTpl) }}>
                  {fmtMargin(nationalTpl.medianPreTpl)}
                </span>
                <span style={{ color: "var(--app-text-very-muted)" }}> = </span>
                <span style={{ color: marginColor(finalTpl) }}>{fmtMargin(finalTpl)}</span>
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col sm:flex-row gap-0">
            <div className="grid grid-cols-2 sm:w-[28rem] sm:shrink-0" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div
                className="flex flex-col items-center justify-center py-8 px-4"
                style={{
                  borderRight: "1px solid var(--app-border)",
                  background: preTpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)",
                }}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center"
                  style={{ color: preTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  Pre-TPL
                </div>
                <div
                  className="text-4xl font-bold tabular-nums leading-none"
                  style={{ color: preTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {Math.abs(preTpl) < 0.05
                    ? "EVEN"
                    : `${preTpl >= 0 ? "R" : "D"}+${Math.abs(preTpl).toFixed(1)}`}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>
                  Before centering
                </div>
              </div>
              <div
                className="flex flex-col items-center justify-center py-8 px-4"
                style={{ background: finalTpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)" }}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center"
                  style={{ color: finalTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {selectedStateName} TPL
                </div>
                <div
                  className="text-4xl font-bold tabular-nums leading-none"
                  style={{ color: finalTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {Math.abs(finalTpl) < 0.05
                    ? "EVEN"
                    : `${finalTpl >= 0 ? "R" : "D"}+${Math.abs(finalTpl).toFixed(1)}`}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>
                  Provisional centered score
                </div>
              </div>
            </div>

            <div className="flex-1 px-5 py-5 flex flex-col gap-3 text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>50-state centering: </span>
                The median Pre-TPL is {fmtMargin(nationalTpl.medianPreTpl)}. Final TPL subtracts this
                common baseline so the median state is centered at EVEN.
              </div>
              {!hasS && (
                <div style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>WA not active: </span>
                  No S on record for {selectedStateName}. WA = 0 for all races, so NM = Adjusted Margin × (IF × CQ) + FF + PIF.
                  Add <code className="font-mono">"{selectedAbbr}": {"{ S: X.XX }"}</code> to{" "}
                  <code className="font-mono">STATE_MODEL_CONSTANTS</code> in{" "}
                  <code className="font-mono">tplModelData.ts</code> to enable it.
                </div>
              )}
              {STATE_RACE_INPUTS[selectedAbbr] == null && (
                <div style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>All factors = 1.00: </span>
                  No per-race IF/CQ inputs have been entered for this state yet. Its centered TPL uses
                  live raw margins and WF, but remains a provisional baseline rather than a fully calibrated estimate.
                </div>
              )}
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Placeholder factors: </span>
                FF and PIF are 1.00 for every state. NM recalculates automatically
                as inputs are filled in.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── S modal ── */}
      {formulaOpen === "S" && (() => {
        const calc = STATE_S_CALCULATIONS[selectedAbbr];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setFormulaOpen(null)}
          >
            <div
              className="rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div>
                  <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>S — {selectedStateName}</span>
                  <span className="ml-2 text-xs font-mono" style={{ color: "var(--app-text-muted)" }}>= {calc?.S ?? "—"}</span>
                </div>
                <button onClick={() => setFormulaOpen(null)} className="text-lg leading-none" style={{ color: "var(--app-text-muted)" }}>×</button>
              </div>
              <div className="px-5 py-3 text-xs" style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                <span className="font-mono" style={{ color: "var(--app-text-primary)" }}>S = avg( state_swing / national_swing )</span>
                <span className="ml-2">over cycles where |national swing| ≥ 1 pt</span>
              </div>
              {calc ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
                      {["Cycle", "State Swing", "National Swing", "Ratio", ""].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calc.intervals.map((iv, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--app-border)", opacity: iv.ratio == null ? 0.5 : 1 }}>
                        <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color: "var(--app-text-muted)" }}>{iv.fromYear}→{iv.toYear}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: marginColor(iv.stateSwing) }}>{iv.stateSwing > 0 ? "+" : ""}{iv.stateSwing.toFixed(1)}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: marginColor(iv.nationalSwing) }}>{iv.nationalSwing > 0 ? "+" : ""}{iv.nationalSwing.toFixed(1)}</td>
                        <td className="px-4 py-2.5 tabular-nums font-mono" style={{ color: "var(--app-text-primary)" }}>{iv.ratio != null ? iv.ratio.toFixed(2) : "—"}</td>
                        <td className="px-4 py-2.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{iv.ratio == null ? "excluded (|nat swing| < 1)" : "included"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--app-panel)" }}>
                      <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>Average of included ratios</td>
                      <td className="px-4 py-2.5 font-bold font-mono tabular-nums" style={{ color: "var(--app-text-primary)" }}>{calc.S.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <div className="px-5 py-6 text-xs text-center" style={{ color: "var(--app-text-very-muted)" }}>No S data for {selectedStateName}.</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Formula modal ── */}
      {formulaOpen && formulaOpen !== "S" && FORMULA_PANELS[formulaOpen] && (() => {
        const panel = FORMULA_PANELS[formulaOpen];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setFormulaOpen(null)}
          >
            <div
              className="rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{panel.title}</span>
                <button
                  onClick={() => setFormulaOpen(null)}
                  className="text-lg leading-none"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  ×
                </button>
              </div>
              {/* Rows */}
              <div className="divide-y" style={{ borderColor: "var(--app-border)" }}>
                {panel.rows.map((row, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-very-muted)" }}>
                      {row.label}
                    </div>
                    <div className="font-mono text-xs" style={{ color: "var(--app-text-primary)" }}>
                      {row.formula}
                    </div>
                    {row.note && (
                      <div className="text-[11px] mt-1" style={{ color: "var(--app-text-muted)" }}>
                        {row.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

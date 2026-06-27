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
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { popVoteData, presIncParty } from "@/data/popVoteData";

// ── District lookup: state abbreviation → sorted list of districts ───────────

const DISTRICTS_BY_STATE: Record<string, { id: string; code: string; num: number }[]> = {};
for (const [id, d] of Object.entries(districtPresidentialData)) {
  if (!DISTRICTS_BY_STATE[d.state]) DISTRICTS_BY_STATE[d.state] = [];
  DISTRICTS_BY_STATE[d.state].push({ id, code: d.code, num: parseInt(d.code.split("-")[1]) });
}
for (const arr of Object.values(DISTRICTS_BY_STATE)) arr.sort((a, b) => a.num - b.num);

// ── Presidential CQ inputs by year (national-level candidate quality) ─────────
// These apply to the presidential race in each cycle when computing district IF/CQ.
// 2016: Generic/Generic (Trump vs Clinton — no extreme tier assignment)
// 2020: Generic/Generic (Biden vs Trump — symmetric)
// 2024: Strong winner (Trump) / Weak loser (Harris)

const PRESIDENTIAL_INPUTS_BY_YEAR: Record<number, { wqTier: CQTier; lqTier: CQTier }> = {
  2016: { wqTier: "Generic", lqTier: "Generic" },
  2020: { wqTier: "Generic", lqTier: "Generic" },
  2024: { wqTier: "Strong", lqTier: "Weak" },
};

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
    const presBase = raceType === "P" ? PRESIDENTIAL_INPUTS_BY_YEAR[year] : undefined;
    const wqTier = inp?.wqTier ?? presBase?.wqTier ?? "Generic";
    const lqTier = inp?.lqTier ?? presBase?.lqTier ?? "Generic";
    return {
      race,
      district,
      raceType,
      year,
      incumbent,
      wqTier,
      lqTier,
      CQ: WQ_VALUES[wqTier] * LQ_VALUES[lqTier],
      FF: inp?.FF ?? 1.00,
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

  // State Legislature — all years where BOTH a House entry AND a Senate entry have vote data.
  // Nebraska exception (unicameral): any year with any entry having vote data is included.
  const legEntries = stateLegData[stateName] ?? [];
  const isUnicameral = stateName === "Nebraska";
  const legYears = [...new Set(legEntries.map((e) => e.year))]
    .filter((year) => {
      const yearEntries = legEntries.filter((e) => e.year === year);
      if (isUnicameral) {
        return yearEntries.some((e) => e.demVotes != null && e.repVotes != null);
      }
      const hasHouseData = yearEntries.some(
        (e) => e.type === "House" && e.demVotes != null && e.repVotes != null
      );
      const hasSenateData = yearEntries.some(
        (e) => e.type === "Senate" && e.demVotes != null && e.repVotes != null
      );
      return hasHouseData && hasSenateData;
    })
    .sort((a, b) => a - b);

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

// ── Competitiveness adjustment for margins of 50 points or greater ──────────

const NONCOMPETITIVE_MARGIN_THRESHOLD = 50;
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
  if (Math.abs(rawMargin) < NONCOMPETITIVE_MARGIN_THRESHOLD) {
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
      (result) => Math.abs(result.margin) < NONCOMPETITIVE_MARGIN_THRESHOLD
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
  { abbr: "CF", term: "Candidate Factor", desc: "Combined point contribution of IF and CQ. Non-P: Adjusted × (IF × CQ − 1) — multiplicative. P: Adjusted × (IF−1) + cappedAdj × (CQ−1) — additive." },
  { abbr: "Centered TPL", term: "Centered True Partisan Lean", desc: "TPL minus the 50-state median TPL. Shows how a state compares to the typical state, with systematic model bias removed." },
  { abbr: "CQ", term: "Candidate Quality Factor", desc: "<1.0 when the winning party had the quality advantage; >1.0 when the winner overcame a quality disadvantage. CQ = WQ × LQ." },
  { abbr: "FF", term: "Fundraising Factor", desc: "Adjusts margin based on fundraising advantage. 1.00 = no adjustment. Pending calibration." },
  { abbr: "IF", term: "Incumbency Factor", desc: "Multiplier capturing seat-level incumbent effects (G/S/H/L races) or presidential approval (P races). For P races: IF = 1 + presMargin × k_pif × partySign. Open non-P seats = 1.00." },
  { abbr: "k", term: "Wave Scaling Constants", desc: "k_add = 0.35 (additive component), k_mult = 0.05 (multiplicative component). Both placeholders pending calibration." },
  { abbr: "NES", term: "National Environment Score", desc: "National partisan lean per cycle. Blended President+House popular vote (presidential years) or House alone (midterms). Positive = R-favored." },
  { abbr: "NM", term: "Neutralized Margin", desc: "Adjusted Margin × (IF × CQ) + FF pts − WA. IF encodes incumbency (G/S/H/L) or presidential approval (P); all compound into CF." },
  { abbr: "PGSHL", term: "Race Type Codes", desc: "P = President, G = Governor, S = U.S. Senate, H = U.S. House, L = State Legislature." },
  { abbr: "S", term: "State Wave Sensitivity Coefficient", desc: "How much a state amplifies or dampens national swings, calculated from cycle-over-cycle state and national House-margin swing ratios." },
  { abbr: "TPL", term: "True Partisan Lean", desc: "The state's neutral partisan composition — what a Generic R vs Generic D race with no wave would produce. Recency-weighted average of WRS scores." },
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
      { label: "Uncontested check", formula: "|Raw Margin| < 50  →  Adjusted Margin = Raw Margin" },
      { label: "Non-competitive", formula: "|Raw Margin| ≥ 50  →  Adjusted Margin = 0.6 × Prior Contested + 0.4 × Prior Presidential", note: "Prior Contested = most recent prior result with |margin| < 50 for the same seat. If either source is unavailable, the available source fills both weights." },
    ],
  },
  "IF ↗": {
    title: "Incumbency Factor (IF)",
    rows: [
      { label: "Shown as", formula: "Multiplier — compounds with CQ into Candidate Factor (CF)" },
      { label: "G / S / H / L — incumbent won", formula: "Open seat = 1.00 · H = 0.80 · S/Leg = 0.875 · G = 0.835" },
      { label: "G / S / H / L — challenger won", formula: "H = 1.25 · S/Leg = 1.14 · G = 1.20" },
      { label: "P — formula", formula: "IF = 1 + presMargin × k_pif × partySign   (k_pif = 0.005, placeholder)", note: "presMargin = approval − disapproval on election day. partySign: D president = +1, R president = −1." },
      { label: "P — examples", formula: "2024: D incumbent, presMargin = −15.2  →  IF = 0.924     2020: R incumbent, presMargin = −6.6  →  IF = 1.033" },
      { label: "Interpretation", formula: "< 1.00 = advantage discounted from margin. > 1.00 = signal inflated (challenger upset or approval drag)." },
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
      { label: "G / S / H / L formula", formula: "CF = Adjusted × (IF × CQ − 1)   [multiplicative: incumbent IS the candidate]" },
      { label: "P formula", formula: "CF = Adjusted × (IF − 1) + cappedAdj × (CQ − 1)   [additive; CQ capped at ±15 pts margin]", note: "CQ is capped because structural blowouts are driven by partisan lean, not candidate quality." },
      { label: "Default (open seat, Generic/Generic)", formula: "IF=1.00, CQ=1.00  →  CF = 0 pts" },
      { label: "Example: R incumbent won, Elite/Generic (non-P)", formula: "IF=0.80, CQ=0.75  →  0.80×0.75−1 = −0.40  →  CF = Adj × −0.40" },
      { label: "Example: P 2024 (Strong/Weak, D pres. approval −15.2)", formula: "IF=0.924, CQ=0.66  →  CF = Adj×(−0.076) + Adj×(−0.34)  →  CF = Adj × −0.416" },
    ],
  },
  "District CQ ↗": {
    title: "District Candidate Quality Factor (CQ = WQ × LQ)",
    rows: [
      { label: "Formula", formula: "CQ = WQ × LQ" },
      { label: "WQ — Winning Candidate Quality", formula: "Elite=0.75 · Strong=0.88 · Generic=1.00 · Weak=1.12 · Sacrificial=1.25" },
      { label: "LQ — Losing Candidate Quality", formula: "Elite=1.25 · Strong=1.12 · Generic=1.00 · Weak=0.88 · Sacrificial=0.75" },
      { label: "Default", formula: "Generic / Generic  →  CQ = 1.00  →  CQ term in CF = 0" },
      { label: "2024 (Strong/Weak)", formula: "WQ=0.88 × LQ=0.75 = 0.66" },
    ],
  },
  "District NM ↗": {
    title: "District Neutralized Margin (NM)",
    rows: [
      { label: "Formula", formula: "NM = Raw + CF" },
      { label: "Expanded", formula: "NM = Raw + Raw×(IF−1) + cappedRaw×(CQ−1)" },
      { label: "No WA", formula: "Wave adjustment is omitted — three-cycle presidential averaging dampens wave effects" },
      { label: "No FF", formula: "Fundraising factor is omitted — no per-district campaign finance data" },
      { label: "Purpose", formula: "What the presidential result would look like with generic candidates and neutral presidential approval" },
    ],
  },
  "District IF ↗": {
    title: "District Incumbency Factor (IF) — Presidential Approval",
    rows: [
      { label: "Formula", formula: "IF = 1 + presMargin × k_pif × partySign" },
      { label: "presMargin", formula: "Incumbent president's net approval (approval − disapproval) on election day" },
      { label: "partySign", formula: "+1 if D incumbent president · −1 if R incumbent president" },
      { label: "k_pif", formula: "0.005  (scaling constant, pending calibration)" },
      { label: "2016 (Obama D, presMargin = +7.8)", formula: "IF = 1 + 7.8 × 0.005 × (+1) = 1.039" },
      { label: "2020 (Trump R, presMargin = −6.6)", formula: "IF = 1 + (−6.6) × 0.005 × (−1) = 1.033" },
      { label: "2024 (Biden D, presMargin = −15.2)", formula: "IF = 1 + (−15.2) × 0.005 × (+1) = 0.924" },
    ],
  },
  "District CF ↗": {
    title: "District Candidate Factor (CF)",
    rows: [
      { label: "Formula", formula: "CF = Raw × (IF − 1) + cappedRaw × (CQ − 1)" },
      { label: "cappedRaw", formula: "sign(Raw) × min(|Raw|, 15)" },
      { label: "Default (Generic/Generic)", formula: "CQ = 1.00  →  CF = Raw × (IF − 1)" },
      { label: "Example: 2024 (IF=0.924, CQ=0.66, Raw=R+13)", formula: "13×(−0.076) + 13×(−0.34) = −0.99 + −4.42 = −5.41" },
      { label: "Example: 2024 blowout (Raw=R+22, cap=15)", formula: "22×(−0.076) + 15×(−0.34) = −1.67 + −5.10 = −6.77" },
    ],
  },
  "FF ↗": {
    title: "Fundraising Factor (FF)",
    rows: [
      { label: "Formula", formula: "FF pts = Adjusted × (FF − 1)" },
      { label: "Default", formula: "FF = 1.00  →  0 pts  (not yet calibrated)" },
      { label: "Interpretation", formula: "Positive FF = fundraising advantage amplifies signal. Negative = disadvantage suppresses it.", note: "FF values pending calibration from campaign finance data." },
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
      { label: "G/S/H/L formula", formula: "NM = Adjusted × (IF × CQ) + FF pts − WA" },
      { label: "P formula", formula: "NM = Adjusted + CF + FF pts − WA   where CF = Adjusted×(IF−1) + cappedAdj×(CQ−1)" },
      { label: "Both views", formula: "NM = Adjusted + CF + FF pts − WA" },
      { label: "Note", formula: "For P races, IF (presidential approval) and CQ (candidate quality) are independent effects — they add into CF rather than compound. For all other races they multiply." },
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
  tpl: number;
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
    let IF: number;
    if (stub.raceType === "P") {
      const pifRow = popVoteData.find((r) => r.type === "President" && r.year === stub.year);
      IF = pifRow
        ? 1 + pifRow.presMargin * G.k_pif * (presIncParty(pifRow.presInc) === "dem" ? 1 : -1)
        : 1.00;
    } else {
      IF = computeIF(stub.raceType, stub.incumbent, rawMargin);
    }
    // P races: IF (approval) and CQ (candidate quality) are independent → additive, CQ capped
    // Non-P races: incumbent IS candidate → IF and CQ compound multiplicatively
    const cappedAdj = adjustedMargin != null
      ? Math.sign(adjustedMargin) * Math.min(Math.abs(adjustedMargin), G.CQ_MARGIN_CAP)
      : null;
    const candidateFactor_pts = adjustedMargin != null
      ? stub.raceType === "P"
        ? adjustedMargin * (IF - 1) + (cappedAdj ?? 0) * (stub.CQ - 1)
        : adjustedMargin * (IF * stub.CQ - 1)
      : null;
    const FF_pts = adjustedMargin != null ? adjustedMargin * (stub.FF - 1) : null;
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
      ? stub.raceType === "P"
        ? adjustedMargin + (candidateFactor_pts ?? 0) + (FF_pts ?? 0) - WA
        : adjustedMargin * IF * stub.CQ + (FF_pts ?? 0) - WA
      : null;
    return {
      ...stub,
      rawMargin,
      IF,
      candidateFactor_pts,
      FF_pts,
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

  const tpl = yearAggregations.reduce(
    (sum, aggregation) =>
      sum + (G.YEAR_WEIGHTS[aggregation.year] ?? 0) * aggregation.WRS,
    0
  );

  return { races, yearAggregations, tpl };
}

// ── District TPL types ────────────────────────────────────────────────────────

interface DistrictComputedRace {
  year: number;
  rawMargin: number;
  IF: number;
  wqTier: CQTier;
  lqTier: CQTier;
  CQ: number;
  candidateFactor_pts: number;
  NM: number;
}

interface DistrictModelCalculation {
  races: DistrictComputedRace[];
  tpl: number;
}

// ── District TPL calculation ──────────────────────────────────────────────────

function calculateDistrictModel(districtId: string): DistrictModelCalculation {
  const d = districtPresidentialData[districtId];
  if (!d) return { races: [], tpl: 0 };

  const marginsById: Record<number, number> = {
    2016: d.pres16Margin,
    2020: d.pres20Margin,
    2024: d.pres24Margin,
  };

  const races: DistrictComputedRace[] = G.DISTRICT_YEARS.map((year) => {
    const rawMargin = marginsById[year];
    const pifRow = popVoteData.find((r) => r.type === "President" && r.year === year);
    const IF = pifRow
      ? 1 + pifRow.presMargin * G.k_pif * (presIncParty(pifRow.presInc) === "dem" ? 1 : -1)
      : 1.00;
    const presBase = PRESIDENTIAL_INPUTS_BY_YEAR[year];
    const wqTier: CQTier = presBase?.wqTier ?? "Generic";
    const lqTier: CQTier = presBase?.lqTier ?? "Generic";
    const CQ = WQ_VALUES[wqTier] * LQ_VALUES[lqTier];
    const cappedAdj = Math.sign(rawMargin) * Math.min(Math.abs(rawMargin), G.CQ_MARGIN_CAP);
    const candidateFactor_pts = rawMargin * (IF - 1) + cappedAdj * (CQ - 1);
    const NM = rawMargin + candidateFactor_pts;
    return { year, rawMargin, IF, wqTier, lqTier, CQ, candidateFactor_pts, NM };
  });

  const tpl = races.reduce(
    (sum, r) => sum + (G.DISTRICT_YEAR_WEIGHTS[r.year] ?? 0) * r.NM,
    0
  );
  return { races, tpl };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TplModelPage() {
  const [selectedAbbr, setSelectedAbbr] = useState(statesData[0].abbr);
  const [raceFilter, setRaceFilter] = useState<string>("All");
  const [yearFilter, setYearFilter] = useState<string>("All");
  const [showGlossary, setShowGlossary] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState<string | null>(null);
  const [allStatesSort, setAllStatesSort] = useState<"centeredTpl" | "tpl" | "absCenteredTpl" | "name">("centeredTpl");
  const [allStatesSortDir, setAllStatesSortDir] = useState<"asc" | "desc">("asc");

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState<"state" | "district" | "table" | "districtTable">("state");

  // District TPL state
  const initialDistrictStateAbbr = Object.keys(DISTRICTS_BY_STATE).sort()[0];
  const [selectedDistrictStateAbbr, setSelectedDistrictStateAbbr] = useState(initialDistrictStateAbbr);
  const [selectedDistrictId, setSelectedDistrictId] = useState(
    () => DISTRICTS_BY_STATE[initialDistrictStateAbbr]?.[0]?.id ?? ""
  );

  // District Table sort state
  const [allDistrictsSort, setAllDistrictsSort] = useState<"tpl" | "centeredTpl" | "absCenteredTpl" | "district">("centeredTpl");
  const [allDistrictsSortDir, setAllDistrictsSortDir] = useState<"asc" | "desc">("asc");

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
  const tpl = selectedCalculation.tpl;

  const nationalTpl = useMemo(() => {
    const stateScores = statesData.map((state) => ({
      ...state,
      tpl: calculateStateModel(state.abbr, state.name).tpl,
    }));
    const sortedScores = stateScores.map((state) => state.tpl).sort((a, b) => a - b);
    const midpoint = sortedScores.length / 2;
    const medianTpl =
      sortedScores.length % 2 === 0
        ? (sortedScores[midpoint - 1] + sortedScores[midpoint]) / 2
        : sortedScores[Math.floor(midpoint)];

    return { stateScores, medianTpl };
  }, []);

  const centeredTpl = tpl - nationalTpl.medianTpl;

  const allStateRows = useMemo(() => {
    const rows = nationalTpl.stateScores.map((s) => ({
      abbr: s.abbr,
      name: s.name,
      tpl: s.tpl,
      centeredTpl: s.tpl - nationalTpl.medianTpl,
    }));
    return [...rows].sort((a, b) => {
      if (allStatesSort === "name") {
        return allStatesSortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const valA = allStatesSort === "absCenteredTpl" ? Math.abs(a.tpl) : allStatesSort === "centeredTpl" ? a.centeredTpl : a.tpl;
      const valB = allStatesSort === "absCenteredTpl" ? Math.abs(b.tpl) : allStatesSort === "centeredTpl" ? b.centeredTpl : b.tpl;
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

  // ── District TPL computed values ──────────────────────────────────────────

  const selectedDistrictCalc = useMemo(
    () => calculateDistrictModel(selectedDistrictId),
    [selectedDistrictId]
  );

  const nationalDistrictTpl = useMemo(() => {
    const districtScores = Object.entries(districtPresidentialData).map(([id, d]) => ({
      id,
      code: d.code,
      state: d.state,
      stateName: d.stateName,
      tpl: calculateDistrictModel(id).tpl,
    }));
    const sorted = [...districtScores.map((d) => d.tpl)].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const medianTpl =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[Math.floor(mid)];
    return { districtScores, medianTpl };
  }, []);

  const centeredDistrictTpl = selectedDistrictCalc.tpl - nationalDistrictTpl.medianTpl;

  const selectedDistrictData = districtPresidentialData[selectedDistrictId];

  const allDistrictRows = useMemo(() => {
    const rows = nationalDistrictTpl.districtScores.map((d) => ({
      ...d,
      centeredTpl: d.tpl - nationalDistrictTpl.medianTpl,
    }));
    return [...rows].sort((a, b) => {
      if (allDistrictsSort === "district") {
        return allDistrictsSortDir === "asc" ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
      }
      const valA = allDistrictsSort === "absCenteredTpl" ? Math.abs(a.tpl) : allDistrictsSort === "centeredTpl" ? a.centeredTpl : a.tpl;
      const valB = allDistrictsSort === "absCenteredTpl" ? Math.abs(b.tpl) : allDistrictsSort === "centeredTpl" ? b.centeredTpl : b.tpl;
      return allDistrictsSortDir === "asc" ? valA - valB : valB - valA;
    });
  }, [nationalDistrictTpl, allDistrictsSort, allDistrictsSortDir]);

  // ── Render ───────────────────────────────────────────────────────────────

  function handleDistrictSortClick(col: "tpl" | "centeredTpl" | "absCenteredTpl" | "district") {
    if (allDistrictsSort === col) {
      setAllDistrictsSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setAllDistrictsSort(col);
      setAllDistrictsSortDir(col === "absCenteredTpl" ? "desc" : "asc");
    }
  }

  function handleSortClick(col: "centeredTpl" | "tpl" | "absCenteredTpl" | "name") {
    if (allStatesSort === col) {
      setAllStatesSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setAllStatesSort(col);
      setAllStatesSortDir(col === "absCenteredTpl" ? "desc" : "asc");
    }
  }

  return (
    <div className="mt-1 md:mt-2">

      {/* ── Sub-tab bar ── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(["state", "district", "table", "districtTable"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{
              background: activeSubTab === tab ? "var(--app-text-muted)" : "var(--app-panel)",
              color: activeSubTab === tab ? "var(--app-bg)" : "var(--app-text-muted)",
              border: "1px solid var(--app-border)",
            }}
          >
            {tab === "state" ? "State TPL" : tab === "district" ? "District TPL" : tab === "districtTable" ? "District Table" : "Table"}
          </button>
        ))}
      </div>

      {/* ── State TPL ── */}
      {activeSubTab === "state" && (<>

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
              Add this state&apos;s S to <code className="font-mono text-[11px]">tplModelData.ts</code> to enable WA.
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
          NM = Adjusted Margin × (IF × CQ) + FF pts − WA. IF encodes seat incumbency for G/S/H/L races and presidential approval for P races; both compound with CQ into CF. Margins of 50 points or greater are first blended from 60% prior contested result and 40% prior presidential result.{" "}
          {!hasS && <span style={{ color: "var(--app-text-very-muted)" }}>WA = 0 (no S). </span>}
          Raw margins are live from the site&apos;s data.
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
                title={!G.YEARS.includes(y) ? "Odd-year race — not included in TPL aggregation" : undefined}
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
                    ["Year", "Election year. * = odd-year race, not yet included in TPL aggregation"],
                    ["Raw", "Raw Margin = repPct − demPct. Positive = R wins. Live from site data."],
                    ["Adjusted ↗", "Adjusted Margin — raw margin unless |margin| ≥ 50, then 60% prior contested + 40% prior presidential."],
                    ["Incumbent", "Incumbent party marker or Open. State Legislature = -."],
                    ["IF ↗", "Incumbency Factor multiplier. For G/S/H/L: seat incumbency (0.80–1.25). For P: approval-based (1 + presMargin × k_pif × partySign). Compounds with CQ into CF."],
                    ["WQ / LQ", "Winning and losing candidate quality tiers. Generic/Generic = CQ of 1.00."],
                    ["CQ ↗", "Candidate Quality Factor = WQ × LQ. Compounds with IF into CF."],
                    ["CF ↗", "Candidate Factor = Adjusted Margin × (IF × CQ − 1). Combined compounded signal."],
                    ["FF ↗", "Fundraising Factor pts = AM × (FF − 1). 0 until calibrated."],
                    ["WA ↗", "Wave Adjustment = NES × S × k. Subtracted from the sum. 0 if no S."],
                    ["NM ↗", "Adjusted × (IF × CQ) + FF pts − WA."],
                  ].map(([label, tip], ci) => {
                    const isClickable = label in FORMULA_PANELS;
                    return (
                      <th
                        key={label}
                        title={isClickable ? `Click to see ${label} formula` : tip}
                        className={`px-2 py-2 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap text-left ${isClickable ? "cursor-pointer select-none" : ""}`}
                        style={{ color: ci === 11 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
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
                          : "Raw margin is under 50 points; no competitiveness adjustment"
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
                    <td className="px-2 py-2 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                      {`${r.wqTier} / ${r.lqTier}`}
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
                    <td colSpan={12} className="px-4 py-6 text-center text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                      No races match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 flex flex-wrap gap-x-5 text-[10px]" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-panel)", color: "var(--app-text-very-muted)" }}>
            {filteredRaces.some((r) => r.competitivenessAdjusted) && (
              <span>‡ Raw margin was 50 points or greater and replaced by the 60/40 competitiveness blend.</span>
            )}
            {anyWFCapped && <span>† Multiplicative WF component was capped at the [0.6, 1.6] bound.</span>}
            {hasOddYears && <span>* Odd-year race (NJ/VA governor elections). Shown in table but not yet included in TPL aggregation.</span>}
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
          TPL = recency-weighted average of annual WRS scores — the state&apos;s neutral partisan composition. Centered TPL subtracts the 50-state median for cross-state comparison.
        </p>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
          {/* Formula */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-very-muted)" }}>Formula</p>
            <div className="rounded-lg px-4 py-3 font-mono text-xs leading-relaxed" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
              <div style={{ color: "var(--app-text-muted)" }}>TPL =</div>
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
              <div className="mt-2" style={{ color: "var(--app-text-muted)" }}>Centered TPL =</div>
              <div className="ml-4">
                <span style={{ color: marginColor(tpl) }}>{fmtMargin(tpl)}</span>
                <span style={{ color: "var(--app-text-very-muted)" }}> − median </span>
                <span style={{ color: marginColor(nationalTpl.medianTpl) }}>
                  {fmtMargin(nationalTpl.medianTpl)}
                </span>
                <span style={{ color: "var(--app-text-very-muted)" }}> = </span>
                <span style={{ color: marginColor(centeredTpl) }}>{fmtMargin(centeredTpl)}</span>
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
                  background: centeredTpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)",
                }}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center"
                  style={{ color: centeredTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {selectedStateName} Centered TPL
                </div>
                <div
                  className="text-4xl font-bold tabular-nums leading-none"
                  style={{ color: centeredTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {Math.abs(centeredTpl) < 0.05
                    ? "EVEN"
                    : `${centeredTpl >= 0 ? "R" : "D"}+${Math.abs(centeredTpl).toFixed(1)}`}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>
                  vs. median state
                </div>
              </div>
              <div
                className="flex flex-col items-center justify-center py-8 px-4"
                style={{ background: tpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)" }}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center"
                  style={{ color: tpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {selectedStateName} TPL
                </div>
                <div
                  className="text-4xl font-bold tabular-nums leading-none"
                  style={{ color: tpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {Math.abs(tpl) < 0.05
                    ? "EVEN"
                    : `${tpl >= 0 ? "R" : "D"}+${Math.abs(tpl).toFixed(1)}`}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>
                  Neutral partisan lean
                </div>
              </div>
            </div>

            <div className="flex-1 px-5 py-5 flex flex-col gap-3 text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>50-state centering: </span>
                The 50-state median TPL is {fmtMargin(nationalTpl.medianTpl)}. Centered TPL subtracts this
                common baseline so the median state sits at EVEN.
              </div>
              {!hasS && (
                <div style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>WA not active: </span>
                  No S on record for {selectedStateName}. WA = 0 for all races, so NM = Adjusted Margin × (IF × CQ) + FF pts.
                  Add <code className="font-mono">&quot;{selectedAbbr}&quot;: {"{ S: X.XX }"}</code> to{" "}
                  <code className="font-mono">STATE_MODEL_CONSTANTS</code> in{" "}
                  <code className="font-mono">tplModelData.ts</code> to enable it.
                </div>
              )}
              {STATE_RACE_INPUTS[selectedAbbr] == null && (
                <div style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>All factors = 1.00: </span>
                  No per-race IF/CQ inputs have been entered for this state yet. Its TPL and Centered TPL use
                  live raw margins and WA, but remain provisional baselines rather than fully calibrated estimates.
                </div>
              )}
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Placeholder factors: </span>
                FF is 0 for every state. IF for presidential races is auto-computed from incumbent approval (k_pif = 0.005). NM recalculates automatically as inputs are filled in.
              </div>
            </div>
          </div>
        </div>
      </div>

      </>)}

      {/* ── District TPL ── */}
      {activeSubTab === "district" && (
        <>
          {/* State + District selectors */}
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl px-4 py-4"
            style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--app-text-very-muted)" }}>State</div>
              <select
                value={selectedDistrictStateAbbr}
                onChange={(e) => {
                  const abbr = e.target.value;
                  setSelectedDistrictStateAbbr(abbr);
                  const first = DISTRICTS_BY_STATE[abbr]?.[0]?.id ?? "";
                  setSelectedDistrictId(first);
                }}
                className="rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer"
                style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)", minWidth: 180 }}
              >
                {Object.keys(DISTRICTS_BY_STATE).sort().map((abbr) => {
                  const name = statesData.find((s) => s.abbr === abbr)?.name ?? abbr;
                  return <option key={abbr} value={abbr}>{name}</option>;
                })}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--app-text-very-muted)" }}>District</div>
              <select
                value={selectedDistrictId}
                onChange={(e) => setSelectedDistrictId(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer"
                style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)", minWidth: 120 }}
              >
                {(DISTRICTS_BY_STATE[selectedDistrictStateAbbr] ?? []).map((dist) => (
                  <option key={dist.id} value={dist.id}>{dist.code}</option>
                ))}
              </select>
            </div>
          </div>


          {/* Header */}
          <div className="mb-5">
            <h2 className="text-xl font-bold sm:text-2xl" style={{ color: "var(--app-text-primary)" }}>
              District True Partisan Lean — {selectedDistrictData?.code ?? "—"}
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
              Presidential results 2016–2024 reaggregated to 2026 boundaries · IF (presidential approval) · CQ (candidate quality)
            </p>
          </div>

          {/* Step 1 — Race table */}
          <div className="mb-7">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
              Step 1 — Per-Race Calculations
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
              NM = Raw Margin + CF. IF encodes presidential approval; CQ encodes candidate quality. No FF or wave adjustment for district model.
            </p>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-xs">
                  <thead>
                    <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                      {[
                        ["Year", "Election year"],
                        ["Raw", "Presidential two-party margin (R-positive). Reaggregated to 2026 boundaries."],
                        ["IF ↗", "Presidential approval IF = 1 + presMargin × k_pif × partySign. Click for details."],
                        ["WQ / LQ", "Winning and losing candidate quality tiers"],
                        ["CQ ↗", "Candidate Quality Factor = WQ × LQ. Click for details."],
                        ["CF ↗", "Candidate Factor = Raw×(IF−1) + cappedRaw×(CQ−1). Click for full breakdown."],
                        ["NM ↗", "Neutralized Margin = Raw + CF. Click for details."],
                      ].map(([label, tip], ci) => {
                        const panelKey = label === "CF ↗" ? "District CF ↗" : label === "IF ↗" ? "District IF ↗" : label === "CQ ↗" ? "District CQ ↗" : label === "NM ↗" ? "District NM ↗" : null;
                        return (
                        <th
                          key={label}
                          title={panelKey ? `Click to see ${label} formula` : tip}
                          className={`px-2 py-2 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap text-left ${panelKey ? "cursor-pointer select-none" : ""}`}
                          style={{ color: ci === 6 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                          onClick={panelKey ? () => setFormulaOpen(panelKey) : undefined}
                        >
                          {label}{panelKey && <span className="ml-0.5 opacity-50">ⓘ</span>}
                        </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDistrictCalc.races.map((r, i) => (
                      <tr
                        key={r.year}
                        style={{
                          background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                          borderBottom: "1px solid var(--app-border)",
                        }}
                      >
                        <td className="px-2 py-2 tabular-nums font-semibold" style={{ color: "var(--app-text-primary)" }}>{r.year}</td>
                        <td className="px-2 py-2 tabular-nums font-mono" style={{ color: marginColor(r.rawMargin) }}>
                          {fmtMargin(r.rawMargin)}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-mono" style={{ color: r.IF !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                          {r.IF.toFixed(3)}
                        </td>
                        <td className="px-2 py-2 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                          {`${r.wqTier} / ${r.lqTier}`}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-mono" style={{ color: r.CQ !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                          {r.CQ.toFixed(4)}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-semibold" style={{ color: r.candidateFactor_pts !== 0 ? marginColor(r.candidateFactor_pts) : "var(--app-text-very-muted)" }}>
                          {r.candidateFactor_pts !== 0 ? (r.candidateFactor_pts > 0 ? "+" : "") + r.candidateFactor_pts.toFixed(2) : "—"}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-bold" style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}>
                          {fmtMargin(r.NM)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Step 2 — Year aggregation */}
          <div className="mb-7">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
              Step 2 — Year Aggregation
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
              Weighted average of presidential NMs. Year weights: 2024 = 70% · 2020 = 20% · 2016 = 10%.
            </p>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                      {["Year", "Weight", "President NM", "Weighted"].map((label, ci) => (
                        <th key={label} className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-left"
                          style={{ color: ci === 3 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDistrictCalc.races.slice().reverse().map((r, i) => {
                      const w = G.DISTRICT_YEAR_WEIGHTS[r.year] ?? 0;
                      const weighted = w * r.NM;
                      return (
                        <tr key={r.year} style={{ background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
                          <td className="px-3 py-2 font-semibold" style={{ color: "var(--app-text-primary)" }}>{r.year}</td>
                          <td className="px-3 py-2 font-mono" style={{ color: "var(--app-text-muted)" }}>{(w * 100).toFixed(0)}%</td>
                          <td className="px-3 py-2 tabular-nums font-mono" style={{ color: marginColor(r.NM) }}>{fmtMargin(r.NM)}</td>
                          <td className="px-3 py-2 tabular-nums font-bold" style={{ color: marginColor(weighted) }}>{fmtMargin(weighted)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Step 3 — District TPL card */}
          <div className="mb-7">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
              Step 3 — Final Calculation
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
              District TPL = weighted average of presidential NMs. Centered District TPL subtracts the 435-district median.
            </p>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
              {/* Formula */}
              <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-very-muted)" }}>Formula</p>
                <div className="rounded-lg px-4 py-3 font-mono text-xs leading-relaxed" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
                  <div style={{ color: "var(--app-text-muted)" }}>District TPL =</div>
                  {selectedDistrictCalc.races.slice().reverse().map((r, i) => {
                    const w = G.DISTRICT_YEAR_WEIGHTS[r.year] ?? 0;
                    return (
                      <div key={r.year} className="ml-4">
                        <span style={{ color: "var(--app-text-very-muted)" }}>{i === 0 ? "  " : "+ "}</span>
                        <span style={{ color: "var(--app-text-primary)" }}>{w.toFixed(2)}</span>
                        <span style={{ color: "var(--app-text-very-muted)" }}> × </span>
                        <span style={{ color: r.NM >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                          {r.NM >= 0 ? "R" : "D"}+{Math.abs(r.NM).toFixed(2)}
                        </span>
                        <span style={{ color: "var(--app-text-very-muted)" }}> ({r.year})</span>
                      </div>
                    );
                  })}
                  <div className="mt-2" style={{ color: "var(--app-text-muted)" }}>Centered District TPL =</div>
                  <div className="ml-4">
                    <span style={{ color: marginColor(selectedDistrictCalc.tpl) }}>{fmtMargin(selectedDistrictCalc.tpl)}</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> − median </span>
                    <span style={{ color: marginColor(nationalDistrictTpl.medianTpl) }}>{fmtMargin(nationalDistrictTpl.medianTpl)}</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> = </span>
                    <span style={{ color: marginColor(centeredDistrictTpl) }}>{fmtMargin(centeredDistrictTpl)}</span>
                  </div>
                </div>
              </div>
              {/* Cards */}
              <div className="grid grid-cols-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div className="flex flex-col items-center justify-center py-8 px-4"
                  style={{ borderRight: "1px solid var(--app-border)", background: centeredDistrictTpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center"
                    style={{ color: centeredDistrictTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                    {selectedDistrictData?.code ?? "—"} Centered
                  </div>
                  <div className="text-4xl font-bold tabular-nums leading-none"
                    style={{ color: centeredDistrictTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                    {Math.abs(centeredDistrictTpl) < 0.05 ? "EVEN" : `${centeredDistrictTpl >= 0 ? "R" : "D"}+${Math.abs(centeredDistrictTpl).toFixed(1)}`}
                  </div>
                  <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>vs. median district</div>
                </div>
                <div className="flex flex-col items-center justify-center py-8 px-4"
                  style={{ background: selectedDistrictCalc.tpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center"
                    style={{ color: selectedDistrictCalc.tpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                    {selectedDistrictData?.code ?? "—"} District TPL
                  </div>
                  <div className="text-4xl font-bold tabular-nums leading-none"
                    style={{ color: selectedDistrictCalc.tpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                    {Math.abs(selectedDistrictCalc.tpl) < 0.05 ? "EVEN" : `${selectedDistrictCalc.tpl >= 0 ? "R" : "D"}+${Math.abs(selectedDistrictCalc.tpl).toFixed(1)}`}
                  </div>
                  <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>Neutral partisan lean</div>
                </div>
              </div>
              <div className="px-5 py-4 text-xs" style={{ color: "var(--app-text-muted)" }}>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>435-district centering: </span>
                The median district TPL is {fmtMargin(nationalDistrictTpl.medianTpl)}. Centered District TPL subtracts this baseline.
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Table ── */}
      {activeSubTab === "table" && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[11px] md:min-w-[720px] md:text-xs">
              <colgroup>
                <col className="w-[34%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                  <th
                    className="px-1 py-2.5 text-left text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap md:px-4 md:text-[10px]"
                    style={{ color: allStatesSort === "name" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                    onClick={() => handleSortClick("name")}
                  >
                    State {allStatesSort === "name" ? (allStatesSortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  {([
                    [<><span className="md:hidden">Centered</span><span className="hidden md:inline">Centered TPL</span></>, "centeredTpl", "TPL minus 50-state median"],
                    ["TPL", "tpl", "Neutral partisan lean — Generic R vs Generic D with no wave"],
                    ["Competitive", "absCenteredTpl", "Sort by absolute TPL"],
                  ] as const).map(([label, col, tip]) => (
                    <th
                      key={col}
                      title={tip}
                      className="px-1 py-2.5 text-left text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap md:px-4 md:text-[10px]"
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
                      background: s.abbr === selectedAbbr ? "var(--app-border)" : i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                    onClick={() => {
                      setSelectedAbbr(s.abbr);
                      setActiveSubTab("state");
                      setRaceFilter("All");
                      setYearFilter("All");
                      window.scrollTo({ top: 0, behavior: "instant" });
                    }}
                  >
                    <td className="px-2 py-2 font-semibold break-words md:px-4" style={{ color: "var(--app-text-primary)" }}>
                      {s.name}
                      <span className="ml-1.5 text-[10px] font-mono" style={{ color: "var(--app-text-very-muted)" }}>{s.abbr}</span>
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold md:px-4" style={{ color: marginColor(s.centeredTpl) }}>
                      {fmtMargin(s.centeredTpl)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-bold md:px-4" style={{ color: marginColor(s.tpl), background: marginBg(s.tpl) }}>
                      {fmtMargin(s.tpl)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono md:px-4" style={{ color: "var(--app-text-muted)" }}>
                      {Math.abs(s.tpl).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[10px]" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-panel)", color: "var(--app-text-very-muted)" }}>
            Click a row to open that state in State TPL. 50-state median TPL = {fmtMargin(nationalTpl.medianTpl)}.
          </div>
        </div>
      )}


      {/* ── District Table ── */}
      {activeSubTab === "districtTable" && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[11px] md:min-w-[720px] md:text-xs">
              <colgroup>
                <col className="w-[34%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                  <th
                    className="px-1 py-2.5 text-left text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap md:px-4 md:text-[10px]"
                    style={{ color: allDistrictsSort === "district" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                    onClick={() => handleDistrictSortClick("district")}
                  >
                    District {allDistrictsSort === "district" ? (allDistrictsSortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  {([
                    [<><span className="md:hidden">Centered</span><span className="hidden md:inline">Centered TPL</span></>, "centeredTpl", "District TPL minus 435-district median"],
                    ["TPL", "tpl", "Neutral presidential lean — 2016/2020/2024 weighted average"],
                    ["Competitive", "absCenteredTpl", "Sort by absolute TPL"],
                  ] as const).map(([label, col, tip]) => (
                    <th
                      key={col}
                      title={tip}
                      className="px-1 py-2.5 text-left text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap md:px-4 md:text-[10px]"
                      style={{ color: allDistrictsSort === col ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                      onClick={() => handleDistrictSortClick(col)}
                    >
                      {label} {allDistrictsSort === col ? (allDistrictsSortDir === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDistrictRows.map((d, i) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer"
                    style={{
                      background: d.id === selectedDistrictId ? "var(--app-border)" : i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                    onClick={() => {
                      setSelectedDistrictStateAbbr(d.state);
                      setSelectedDistrictId(d.id);
                      setActiveSubTab("district");
                      window.scrollTo({ top: 0, behavior: "instant" });
                    }}
                  >
                    <td className="px-2 py-2 font-semibold break-words md:px-4" style={{ color: "var(--app-text-primary)" }}>
                      {d.code}
                      <span className="ml-1.5 text-[10px] font-mono" style={{ color: "var(--app-text-very-muted)" }}>{d.state}</span>
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold md:px-4" style={{ color: marginColor(d.centeredTpl) }}>
                      {fmtMargin(d.centeredTpl)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-bold md:px-4" style={{ color: marginColor(d.tpl), background: marginBg(d.tpl) }}>
                      {fmtMargin(d.tpl)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono md:px-4" style={{ color: "var(--app-text-muted)" }}>
                      {Math.abs(d.tpl).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[10px]" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-panel)", color: "var(--app-text-very-muted)" }}>
            Click a row to open that district in District TPL. 435-district median TPL = {fmtMargin(nationalDistrictTpl.medianTpl)}.
          </div>
        </div>
      )}

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

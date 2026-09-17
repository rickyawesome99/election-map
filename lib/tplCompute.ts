import {
  presPastResults,
  senateData,
  senateHoldovers,
  senateNoElection,
  governorData,
  governorNoElection,
  houseData,
  houseStatewideResults,
  houseDistrictInfo,
  stateLegData,
  type PastResult,
} from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { candidateOffices } from "@/data/candidateOffices";
import { TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { nationalEnvironmentHistory } from "@/data/nationalEnvironmentHistory";
import { fundraisingData, fundraisingSources } from "@/data/fundraisingData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { presByBoundaryVintage, boundaryVintageForHouseYear } from "@/data/presByBoundaryVintage";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData } from "@/data/countyHouseData";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { getRacePollAverage, pollWeight, racePollKey, type RacePollAverage } from "@/lib/racePollAverage";
import { FIPS_TO_STATE } from "@/lib/fips";
import { classifyEligibility, alignedParty, type RaceEligibility } from "@/data/raceEligibility";

// ── Generic ballot ────────────────────────────────────────────────────────────
// R-positive convention: negative = D-favored (e.g. D+5.3 → -5.3).
// Sourced live from the weighted polling average (§lib/genericBallotAverage) — the
// same number shown in the "Generic Ballot Polling Average" box on the Overview tab.

export const GENERIC_BALLOT = computeGenericBallotAverage().diff;

// ── Race stub type ────────────────────────────────────────────────────────────

export interface RaceStub {
  race: string;
  district?: string;
  raceType: "P" | "S" | "G" | "H" | "L";
  detailHref?: string;
  year: number;
  eligibility: RaceEligibility;
  incumbent: string;
  incumbentAppointed?: boolean; // the incumbent holds the seat by appointment/succession
  demCandidate?: string;
  repCandidate?: string;
  demParty?: string; // true party of the dem-slot candidate ("I" for independents, etc.)
  repParty?: string;
  historicalMargins: { year: number; margin: number }[];
}

// ── Computed race types ───────────────────────────────────────────────────────

export interface ComputedRace extends RaceStub {
  rawMargin: number | null;
  incumbencyPts: number | null; // additive strip: R incumbent → −pts, D incumbent → +pts
  FF_pts: number | null; // additive strip of the fundraising advantage present in the margin
  ffDetail: { dem: number; rep: number } | null; // candidate-committee receipts behind FF_pts
  adjustedMargin: number | null;
  imputed: boolean;
  imputedSourceYear: number | null;
  imputedSourceDesc: string | null;
  minValidYear: number;
  envPts: number | null; // −β*(state) × E(year): strips the fitted national environment
  aggWeight: number; // weight in aggregation: ×0.5 if imputed, × Huber factor vs the fitted lean (state model)
  BS_pts?: number | null; // additive strip relocating a pre-2026 House race onto today's lines
  boundaryShift?: number | null; // the raw shift it undoes, pres(old lines) − pres(2026 lines)
  boundaryWeight?: number; // confidence in that relocation, 1 / (1 + (|shift| / k)²)
  NM: number | null;
  inAggregation: boolean;
}

export interface YearAggregation {
  year: number;
  racesPresent: string[];
  redistributedWeights: Record<string, number>;
  typeNMs: Record<string, number | null>;
  WRS: number;
  coverage: number;    // Σ base type weights of types present — scales the year weight
  finalWeight: number; // normalized share of TPL contributed by this year
}

export interface StateModelCalculation {
  races: ComputedRace[];
  yearAggregations: YearAggregation[];
  tpl: number;
}

// ── District TPL types ────────────────────────────────────────────────────────
// Since the Phase 6 reconciliation the district model shares the state pipeline:
// district presidential results (2026 boundaries) plus the district's House races
// from its CURRENT boundary era, with the same additive strips and aggregation.

export interface DistrictModelCalculation {
  races: ComputedRace[];
  yearAggregations: YearAggregation[];
  tpl: number;
  stateAbbr: string;
  eraStart: number; // start year of the district's current boundary era
}

// ── Race eligibility & imputation ─────────────────────────────────────────────
// An ineligible race (missing major-party nominee, or a same-party general such
// as a CA/WA top-two or LA runoff) has no usable R-vs-D margin. Instead of the
// old ≥50-pt competitiveness blend, the seat's structural lean is imputed from
// the nearest presidential result (boundary-vintage-aware for House districts)
// and the row enters aggregation at IMPUTED_RACE_WEIGHT. Imputed rows skip
// IF/CQ/FF/WA entirely — the imputed value is already a lean, not an outcome.

export const IMPUTED_RACE_WEIGHT = 0.5;

interface ImputedLean {
  margin: number;
  year: number;
  desc: string;
}

function byNearestYear(raceYear: number) {
  return (a: { year: number }, b: { year: number }) =>
    Math.abs(a.year - raceYear) - Math.abs(b.year - raceYear) || b.year - a.year;
}

function nearestPresidentialLean(
  stateAbbr: string,
  district: string | undefined,
  raceYear: number,
  minValidYear: number,
  maxValidYear: number
): ImputedLean | null {
  if (district) {
    const districtId = houseData.find((race) => race.name === district)?.id;
    const entry = districtId
      ? (houseStatewideResults[districtId] ?? [])
          .filter((e) => e.race === "President" && e.year >= minValidYear && e.year < maxValidYear)
          .sort(byNearestYear(raceYear))[0]
      : undefined;
    if (entry) return { margin: entry.repPct - entry.demPct, year: entry.year, desc: "district presidential result" };
  }
  const entry = (presPastResults[stateAbbr] ?? []).slice().sort(byNearestYear(raceYear))[0];
  return entry
    ? { margin: entry.repPct - entry.demPct, year: entry.year, desc: "statewide presidential result" }
    : null;
}

// ── Additive incumbency (shared with the forward projection) ─────────────────
// Points the incumbent's party is worth on the margin. Stripping subtracts them
// (R incumbent → −pts toward D); forecasting adds them back via computeIncumbentPts.
// Senate/Governor values are estimated inside getTplFit(); House is the fixed
// prior in INCUMBENT_ADVANTAGE_FIXED. P: national approval effects belong to
// E(y). L: chamber aggregate, no single incumbent.

function incumbencyPtsFor(raceType: string, incumbent: string, appointed = false): number {
  const pts = (getTplFit().incumbency[raceType] ?? 0) * (appointed ? F.APPOINTED_INCUMBENCY_SHARE : 1);
  if (incumbent === "R") return -pts;
  if (incumbent === "D") return pts;
  return 0;
}

// ── Fundraising lookup (FEC receipts, see data/fundraisingData.ts) ───────────
// The cycle the forward-looking forecast draws live receipts from.
const ELECTION_CYCLE = 2026;

// FF applies only where both general-election candidates' receipts are known:
// a null side means unknown (api-pending, or governor state filings not yet
// collected), and skipping beats guessing. President is excluded by design and
// imputed rows carry no fundraising signal.

function raceFundraisingFor(
  raceType: string,
  stateAbbr: string,
  district: string | undefined,
  race: string,
  year: number
): { dem: number; rep: number } | null {
  let key: string | null = null;
  if (raceType === "H" && district) key = `H:${district}:${year}`;
  else if (raceType === "S") key = `S:${stateAbbr}:${year}:${race === "Senate Special" ? "Special" : "Regular"}`;
  else if (raceType === "G") key = `G:${stateAbbr}:${year}`;
  if (key == null) return null;
  const entry = fundraisingData[key];
  if (entry == null || entry.dem == null || entry.rep == null) return null;
  return { dem: entry.dem, rep: entry.rep };
}

// The strip is the negative of the R-positive advantage present in the margin.
function ffStripPts(money: { dem: number; rep: number } | null): number {
  return money ? -computeFundraisingPts(money.rep, money.dem) : 0;
}

// Current-cycle lookups keyed the way the race pages hold a race (raceType + race
// id, e.g. "house"/"0406" or "senate"/"FL-2"), so computeProjectedMargin and the
// Fundraising section on the race detail pages read the same rows. A senate seat is
// tried as a regular election first, then as a special.
function fundraising2026Keys(raceType: string, raceId: string): string[] {
  if (raceType === "house") {
    const districtName = houseData.find((r) => r.id === raceId)?.name;
    return districtName ? [`H:${districtName}:${ELECTION_CYCLE}`] : [];
  }
  // senate/governor ids may carry a seat suffix (e.g. "DE-2"); strip it for the state abbr.
  const abbr = raceId.replace(/-\d+$/, "");
  if (raceType === "senate") return [`S:${abbr}:${ELECTION_CYCLE}:Regular`, `S:${abbr}:${ELECTION_CYCLE}:Special`];
  if (raceType === "governor") return [`G:${abbr}:${ELECTION_CYCLE}`];
  return [];
}

// null = at least one side unknown, so no FF applies and the page shows TBD.
export function raceFundraising2026(raceType: string, raceId: string): { dem: number; rep: number } | null {
  for (const key of fundraising2026Keys(raceType, raceId)) {
    const entry = fundraisingData[key];
    if (entry?.dem != null && entry.rep != null) return { dem: entry.dem, rep: entry.rep };
  }
  return null;
}

// Display-ready attribution for the receipts above ("FEC filings", state filings, …).
export function raceFundraisingSource2026(raceType: string, raceId: string): string | null {
  for (const key of fundraising2026Keys(raceType, raceId)) {
    if (fundraisingSources[key]) return fundraisingSources[key];
  }
  return null;
}

// R-positive fundraising points for a forecast race; 0 where receipts are unknown.
export function computeRaceFundraisingPts(raceType: string, raceId: string): number {
  const money = raceFundraising2026(raceType, raceId);
  return money ? computeFundraisingPts(money.rep, money.dem) : 0;
}

// ── Helper: incumbent from past result ────────────────────────────────────────

function appointedFromResult(result?: Pick<PastResult, "demIncumbent" | "repIncumbent" | "demAppointed" | "repAppointed">): boolean {
  return !!((result?.demIncumbent && result.demAppointed) || (result?.repIncumbent && result.repAppointed));
}

function incumbentFromResult(result?: Pick<PastResult, "demIncumbent" | "repIncumbent">): string {
  if (result?.demIncumbent) return "D";
  if (result?.repIncumbent) return "R";
  return "Open";
}

// ── aggregateYears ────────────────────────────────────────────────────────────
// Shared by the state and county models: redistributes race-type weights among whichever
// types are actually present each year, then produces the recency-weighted TPL.

function aggregateYears(races: ComputedRace[]): { yearAggregations: YearAggregation[]; tpl: number } {
  const yearAggregations = G.YEARS.map((year) => {
    const yearRaces = races.filter((race) => race.year === year && race.NM != null);
    const typeNMs: Record<string, number | null> = {};
    for (const type of ["P", "G", "S", "H", "L"]) {
      const typeRaces = yearRaces.filter((race) => race.raceType === type);
      const typeWeight = typeRaces.reduce((sum, race) => sum + race.aggWeight, 0);
      typeNMs[type] = typeWeight > 0
        ? typeRaces.reduce((sum, race) => sum + race.aggWeight * (race.NM ?? 0), 0) / typeWeight
        : null;
    }
    const racesPresent = ["P", "G", "S", "H", "L"].filter((t) => typeNMs[t] != null);
    const totalBase = racesPresent.reduce((sum, type) => sum + (G.RACE_TYPE_WEIGHTS[type] ?? 0), 0);
    const redistributedWeights: Record<string, number> = {};
    for (const type of racesPresent) {
      redistributedWeights[type] = (G.RACE_TYPE_WEIGHTS[type] ?? 0) / totalBase;
    }
    const WRS = racesPresent.reduce((sum, type) => sum + redistributedWeights[type] * (typeNMs[type] ?? 0), 0);
    return { year, racesPresent, redistributedWeights, typeNMs, WRS, coverage: totalBase, finalWeight: 0 };
  });

  // Year weight = recency decay × base type-weight coverage, so a sparse year
  // (an odd-year governor race alone) cannot dominate via redistribution.
  const yearsPresent = yearAggregations.filter((agg) => agg.racesPresent.length > 0);
  const totalYearWeight = yearsPresent.reduce(
    (sum, agg) => sum + (G.YEAR_WEIGHTS[agg.year] ?? 0) * agg.coverage,
    0
  );
  for (const agg of yearsPresent) {
    agg.finalWeight = totalYearWeight > 0 ? ((G.YEAR_WEIGHTS[agg.year] ?? 0) * agg.coverage) / totalYearWeight : 0;
  }
  const tpl = yearsPresent.reduce((sum, agg) => sum + agg.finalWeight * agg.WRS, 0);
  return { yearAggregations, tpl };
}

// ── getRawMargin ──────────────────────────────────────────────────────────────

export function getRawMargin(
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

  if (race === "Senate" || race === "Senate Special") {
    const isSpecial = race === "Senate Special";
    const all = [
      ...senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-")),
      ...senateHoldovers.filter((d) => d.abbr === stateAbbr),
      ...senateNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of all) {
      const e = (seat.pastResults ?? []).find(
        (r) => r.year === year && (isSpecial ? r.electionType === "Special" : r.electionType !== "Special")
      );
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
    // Chamber-aggregate margin as a share of the FULL total (third parties and
    // minor-party candidates included), matching every other margin in the model.
    // Every sourced entry carries totalVotes alongside demVotes/repVotes.
    const entries = (stateLegData[stateName] ?? []).filter((e) => e.year === year);
    let dem = 0, rep = 0, total = 0;
    for (const e of entries) {
      if (e.demVotes != null && e.repVotes != null && e.totalVotes != null) {
        dem += e.demVotes;
        rep += e.repVotes;
        total += e.totalVotes;
      }
    }
    return total > 0 ? ((rep - dem) / total) * 100 : null;
  }

  return null;
}

// ── generateRaceList ──────────────────────────────────────────────────────────

export function generateRaceList(stateAbbr: string, stateName: string): RaceStub[] {
  const stubs: RaceStub[] = [];
  const stateId = statesData.find((state) => state.abbr === stateAbbr)?.id ?? stateAbbr.toLowerCase();
  const stateHref = `/states/${stateId}`;

  function makeStub(
    race: string,
    raceType: RaceStub["raceType"],
    year: number,
    district?: string,
    incumbent = "Open",
    historicalMargins: RaceStub["historicalMargins"] = [],
    detailHref?: string,
    eligibility: RaceEligibility = "eligible",
    who?: { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string },
    incumbentAppointed = false
  ): RaceStub {
    return {
      race,
      district,
      raceType,
      detailHref,
      year,
      eligibility,
      incumbent,
      incumbentAppointed,
      demCandidate: who?.demCandidate,
      repCandidate: who?.repCandidate,
      demParty: who?.demParty,
      repParty: who?.repParty,
      historicalMargins,
    };
  }

  function whoOf(r: PastResult): { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string } {
    const x = r as PastResult & { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string };
    return { demCandidate: x.demCandidate, repCandidate: x.repCandidate, demParty: x.demParty, repParty: x.repParty };
  }

  // President
  const presidentialResults = presPastResults[stateAbbr] ?? [];
  const presidentialMargins = presidentialResults.map((result) => ({
    year: result.year,
    margin: result.repPct - result.demPct,
  }));
  for (const r of presidentialResults) {
    if (r.year >= 2016) {
      stubs.push(makeStub("President", "P", r.year, undefined, incumbentFromResult(r), presidentialMargins, stateHref, classifyEligibility(r, stateAbbr), whoOf(r), appointedFromResult(r)));
    }
  }

  function addSenateSeat(seat: { pastResults?: PastResult[] }, detailHref: string) {
    const historicalMargins = (seat.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2016) {
        const raceName = r.electionType === "Special" ? "Senate Special" : "Senate";
        stubs.push(makeStub(raceName, "S", r.year, undefined, incumbentFromResult(r), historicalMargins, detailHref, classifyEligibility(r, stateAbbr), whoOf(r), appointedFromResult(r)));
      }
    }
  }

  for (const seat of senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-"))) {
    addSenateSeat(seat, `/senate/${seat.id.toLowerCase().replace(/-2$/, "2")}`);
  }
  for (const seat of senateHoldovers.filter((d) => d.abbr === stateAbbr)) {
    addSenateSeat(seat, `/senate/${seat.abbr.toLowerCase()}2`);
  }
  for (const seat of senateNoElection.filter((d) => d.abbr === stateAbbr)) {
    addSenateSeat(seat, `/senate/${seat.abbr.toLowerCase()}`);
  }

  function addGovernorSeat(seat: { pastResults?: PastResult[] }, detailHref: string) {
    const historicalMargins = (seat.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2016) {
        stubs.push(makeStub("Governor", "G", r.year, undefined, incumbentFromResult(r), historicalMargins, detailHref, classifyEligibility(r, stateAbbr), whoOf(r), appointedFromResult(r)));
      }
    }
  }
  for (const seat of governorData.filter((d) => d.id === stateAbbr)) {
    addGovernorSeat(seat, `/governor/${seat.id.toLowerCase()}`);
  }
  for (const seat of governorNoElection.filter((d) => d.abbr === stateAbbr)) {
    addGovernorSeat(seat, `/governor/${seat.abbr.toLowerCase()}`);
  }

  // House
  for (const dist of houseData.filter((r) => r.state === stateName)) {
    const historicalMargins = (dist.pastResults ?? []).map((result) => ({
      year: result.year,
      margin: result.repPct - result.demPct,
    }));
    for (const r of dist.pastResults ?? []) {
      if (r.year >= 2016) {
        stubs.push(makeStub(`House ${dist.name}`, "H", r.year, dist.name, incumbentFromResult(r), historicalMargins, `/house/${dist.name.toLowerCase()}`, classifyEligibility(r, stateAbbr), whoOf(r), appointedFromResult(r)));
      }
    }
  }

  // State Legislature
  const legEntries = stateLegData[stateName] ?? [];
  const isUnicameral = stateName === "Nebraska";
  // A year counts once every chamber that WAS on the ballot has a vote total — not once both
  // chambers do. Staggered senates (MI, MN, SC, KS, NM) sit out specific even years, and demanding
  // a Senate figure for those years discarded the state's complete House result: Michigan 2024's
  // 5.4 million House votes were being thrown away because no Senate seat was up.
  //
  // The two cases are told apart by the shape of data-entry/state_leg.csv, which carries exactly
  // one row per chamber-year that actually happened (verified against data/stateLegCalendar.ts —
  // its election years and the CSV's chamber-years agree exactly). So a chamber that did not elect
  // has NO ROW, while a chamber that elected but is unsourced has a row with null votes. Requiring
  // every PRESENT row to carry votes therefore keeps a partially-sourced year out while letting a
  // genuine single-chamber year in.
  const legYears = [...new Set(legEntries.map((e) => e.year))]
    .filter((year) => {
      if (year < 2016) return false;
      const yearEntries = legEntries.filter((e) => e.year === year);
      const sourced = yearEntries.filter((e) => e.demVotes != null && e.repVotes != null);
      // Nebraska's unicameral body is stored under "House"; its "Senate" rows are deliberate
      // empty placeholders marked "Unicameral", so it can never satisfy the all-rows-sourced test.
      if (isUnicameral) return sourced.length > 0;
      return sourced.length > 0 && sourced.length === yearEntries.length;
    })
    .sort((a, b) => a - b);

  for (const year of legYears) {
    const historicalMargins = [
      ...new Set(legEntries.filter((e) => e.demVotes != null && e.repVotes != null).map((e) => e.year)),
    ].map((historicalYear) => {
      const entries = legEntries.filter((e) => e.year === historicalYear);
      const demVotes = entries.reduce((sum, e) => sum + (e.demVotes ?? 0), 0);
      const repVotes = entries.reduce((sum, e) => sum + (e.repVotes ?? 0), 0);
      // Share of the FULL chamber total, not two-party - see the L branch of getRawMargin.
      const totalVotes = entries.reduce((sum, e) => sum + (e.totalVotes ?? 0), 0);
      return { year: historicalYear, margin: ((repVotes - demVotes) / totalVotes) * 100 };
    });
    stubs.push(makeStub("State Legislature", "L", year, undefined, "-", historicalMargins, stateHref));
  }

  const RACE_TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3, L: 4 };
  return stubs.sort((a, b) => {
    const typeOrder = (RACE_TYPE_ORDER[a.raceType] ?? 9) - (RACE_TYPE_ORDER[b.raceType] ?? 9);
    if (typeOrder !== 0) return typeOrder;
    if (a.year !== b.year) return b.year - a.year;
    return a.race.localeCompare(b.race);
  });
}

// ── Environment, elasticity & incumbency fit ──────────────────────────────────
// Alternating robust least squares over the full eligible race panel (all 50
// states, every office, 2016–2025 incl. odd years):
//
//   margin + FF strip  ≈  lean(state) + β(state) × E(year) + sign(incumbent) × inc(office)
//
// E(y) is the fitted national environment (R-positive; identified from
// within-state changes, so which seats happen to be up cannot skew it, and
// centered so the period average is ≈ 0). β̂ is each state's elasticity,
// shrunk (β* = 1 + BETA_SHRINK·(β̂−1)) and clamped to [BETA_MIN, BETA_MAX].
// inc(office) is the incumbency advantage, estimated for Senate and Governor
// from the incumbent-signed residual against lean + β·E with the fundraising
// strip already applied — so it is the advantage net of the money incumbents
// raise, and the two terms cannot double-count. House is not estimable against
// a state-level lean (R incumbents sit in R districts) and keeps the fixed prior.
// Huber weights (w = min(1, HUBER_C/|residual|)) keep crossover outliers —
// Manchin, Scott, Hogan — from dragging a state's lean or the incumbency
// estimate; those residuals are the raw material for WAR later.

export interface TplFitStateBeta {
  raw: number;
  shrunk: number;
  n: number;
}

export interface TplFit {
  E: Record<number, number>;
  beta: Record<string, TplFitStateBeta>;
  lean: Record<string, number>; // Huber-protected static lean — anchors race weights in aggregation
  incumbency: Record<string, number>; // pts per office: S/G fitted, H fixed (INCUMBENT_ADVANTAGE_FIXED), P/L 0
  incumbencyN: Record<string, number>; // incumbent-held rows each fitted value rests on
  years: number[];
  rowsUsed: number;
}

let _fitCache: TplFit | null = null;

export function getTplFit(): TplFit {
  if (_fitCache) return _fitCache;
  // raw = margin with the fundraising strip applied; adj = raw with the current
  // incumbency estimate stripped too (recomputed each round as inc(office) moves).
  interface FitRow { abbr: string; year: number; type: string; incSign: number; raw: number; adj: number; base: number; w: number; }
  const rows: FitRow[] = [];
  const typeCount: Record<string, number> = {};
  const pending: { abbr: string; year: number; raw: number; incSign: number; key: string; type: string }[] = [];
  for (const { abbr, name } of statesData) {
    for (const stub of generateRaceList(abbr, name)) {
      if (stub.eligibility !== "eligible") continue;
      const margin = getRawMargin(stub.race, stub.district, stub.year, abbr, name);
      if (margin == null) continue;
      const ff = ffStripPts(raceFundraisingFor(stub.raceType, abbr, stub.district, stub.race, stub.year));
      const key = `${abbr}:${stub.year}:${stub.raceType}`;
      typeCount[key] = (typeCount[key] ?? 0) + 1;
      const incSign = (stub.incumbent === "R" ? 1 : stub.incumbent === "D" ? -1 : 0) * (stub.incumbentAppointed ? F.APPOINTED_INCUMBENCY_SHARE : 1);
      pending.push({ abbr, year: stub.year, raw: margin + ff, incSign, key, type: stub.raceType });
    }
  }
  // Incumbency: Senate and Governor start at the pre-rebuild priors and are
  // re-estimated each round; House keeps its fixed prior; P and L carry none.
  const inc: Record<string, number> = { ...INCUMBENT_ADVANTAGE_FIXED, S: 2, G: 7 };
  const incumbencyN: Record<string, number> = { H: 0, S: 0, G: 0 };
  const stripInc = (r: { type: string; incSign: number }) => r.incSign * (inc[r.type] ?? 0);
  // Mirror the aggregation's type weighting: a state-year's House rows share the
  // House weight rather than outvoting its single presidential row, so the fitted
  // lean answers the same question TPL does instead of a downballot-heavy average.
  for (const r of pending) {
    if (r.incSign !== 0 && r.type in incumbencyN) incumbencyN[r.type] += 1;
    rows.push({ abbr: r.abbr, year: r.year, type: r.type, incSign: r.incSign, raw: r.raw, adj: r.raw - stripInc(r), base: (G.RACE_TYPE_WEIGHTS[r.type] ?? 0.05) / typeCount[r.key], w: 1 });
  }
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const E: Record<number, number> = Object.fromEntries(years.map((y) => [y, 0]));
  const lean: Record<string, number> = {};
  const beta: Record<string, TplFitStateBeta> = {};
  const rowsByState: Record<string, FitRow[]> = {};
  const rowsByYear: Record<number, FitRow[]> = {};
  for (const r of rows) {
    (rowsByState[r.abbr] ??= []).push(r);
    (rowsByYear[r.year] ??= []).push(r);
  }
  for (const { abbr } of statesData) {
    const sr = rowsByState[abbr] ?? [];
    lean[abbr] = sr.length > 0 ? sr.reduce((a, r) => a + r.adj, 0) / sr.length : 0;
    beta[abbr] = { raw: 1, shrunk: 1, n: sr.length };
  }
  for (let iter = 0; iter < G.FIT_ITERATIONS; iter += 1) {
    for (const r of rows) {
      const res = r.adj - lean[r.abbr] - beta[r.abbr].shrunk * E[r.year];
      r.w = r.base * (Math.abs(res) <= G.HUBER_C ? 1 : G.HUBER_C / Math.abs(res));
    }
    for (const y of years) {
      const yr = rowsByYear[y] ?? [];
      let num = 0;
      let den = 0;
      for (const r of yr) {
        const b = beta[r.abbr].shrunk;
        num += r.w * b * (r.adj - lean[r.abbr]);
        den += r.w * b * b;
      }
      E[y] = den > 0 ? (num / den) * (yr.length / (yr.length + G.SPARSE_YEAR_K)) : 0;
    }
    for (const abbr of Object.keys(beta)) {
      const sr = rowsByState[abbr] ?? [];
      let num = 0;
      let den = 0;
      for (const r of sr) {
        const e = E[r.year];
        num += r.w * e * (r.adj - lean[abbr]);
        den += r.w * e * e;
      }
      const raw = den > 0 ? num / den : 1;
      beta[abbr] = {
        raw,
        shrunk: Math.max(G.BETA_MIN, Math.min(G.BETA_MAX, 1 + G.BETA_SHRINK * (raw - 1))),
        n: sr.length,
      };
    }
    for (const abbr of Object.keys(lean)) {
      const sr = rowsByState[abbr] ?? [];
      let num = 0;
      let den = 0;
      for (const r of sr) {
        num += r.w * (r.adj - beta[abbr].shrunk * E[r.year]);
        den += r.w;
      }
      if (den > 0) lean[abbr] = num / den;
    }
    // Incumbency per fitted office: weighted regression of the incumbency-free
    // residual on the incumbent sign (±1), i.e. how far incumbent-held races sit
    // from lean + β·E in the incumbent's direction, Huber-weighted like everything else.
    for (const type of FITTED_INCUMBENCY_OFFICES) {
      let num = 0;
      let den = 0;
      for (const r of rows) {
        if (r.type !== type || r.incSign === 0) continue;
        num += r.w * r.incSign * (r.raw - lean[r.abbr] - beta[r.abbr].shrunk * E[r.year]);
        den += r.w;
      }
      if (den > 0) inc[type] = num / den;
    }
    for (const r of rows) r.adj = r.raw - stripInc(r);
  }
  _fitCache = { E, beta, lean, incumbency: inc, incumbencyN, years, rowsUsed: rows.length };
  return _fitCache;
}

// ── calculateStateModel ───────────────────────────────────────────────────────

export function calculateStateModel(stateAbbr: string, stateName: string): StateModelCalculation {
  const fit = getTplFit();
  const beta = fit.beta[stateAbbr]?.shrunk ?? 1;
  const stubs = generateRaceList(stateAbbr, stateName);
  const races: ComputedRace[] = stubs.map((stub) => {
    const rawMargin = getRawMargin(stub.race, stub.district, stub.year, stateAbbr, stateName);
    const inAggregation = stub.year in G.YEAR_WEIGHTS;
    let minValidYear = 0;
    let maxValidYear = Number.POSITIVE_INFINITY;
    if (stub.raceType === "H" && stub.district) {
      const districtId = houseData.find((r) => r.name === stub.district)?.id;
      if (districtId) {
        const infoYears = (houseDistrictInfo[districtId] ?? []).map((e) => e.year);
        const pastYears = infoYears.filter((y) => y <= stub.year);
        if (pastYears.length > 0) minValidYear = Math.max(...pastYears);
        const futureYears = infoYears.filter((y) => y > stub.year);
        if (futureYears.length > 0) maxValidYear = Math.min(...futureYears);
      }
    }
    const ineligible = stub.eligibility !== "eligible";
    const imputation = ineligible
      ? nearestPresidentialLean(stateAbbr, stub.district, stub.year, minValidYear, maxValidYear)
      : null;
    const imputed = imputation != null;
    const adjustedMargin = ineligible ? (imputation?.margin ?? null) : rawMargin;
    // Imputed rows strip the environment of the SOURCE presidential year — the
    // imputed value inherits that year's national conditions, nothing else.
    const envYear = imputed ? imputation!.year : stub.year;
    const envPts = adjustedMargin == null ? null : -(beta * (fit.E[envYear] ?? 0));
    const incumbencyPts = adjustedMargin == null ? null : imputed ? 0 : incumbencyPtsFor(stub.raceType, stub.incumbent, stub.incumbentAppointed);
    const money = imputed ? null : raceFundraisingFor(stub.raceType, stateAbbr, stub.district, stub.race, stub.year);
    const FF_pts = adjustedMargin == null ? null : ffStripPts(money);
    const NM = adjustedMargin != null
      ? adjustedMargin + (incumbencyPts ?? 0) + (FF_pts ?? 0) + (envPts ?? 0)
      : null;
    // Aggregation weight: imputed rows enter at IMPUTED_RACE_WEIGHT, and every row is
    // Huber-downweighted by its residual against the state's fitted lean — so a
    // crossover outlier (Manchin, Scott, Hogan) cannot drag the headline TPL either.
    const stateLean = fit.lean[stateAbbr];
    const residual = NM != null && stateLean != null ? NM - stateLean : 0;
    const huberW = Math.abs(residual) <= G.HUBER_C ? 1 : G.HUBER_C / Math.abs(residual);
    const aggWeight = (imputed ? IMPUTED_RACE_WEIGHT : 1) * huberW;
    return {
      ...stub,
      rawMargin,
      incumbencyPts,
      FF_pts,
      ffDetail: money,
      adjustedMargin,
      imputed,
      imputedSourceYear: imputation?.year ?? null,
      imputedSourceDesc: imputation?.desc ?? null,
      minValidYear,
      envPts,
      aggWeight,
      NM,
      inAggregation,
    };
  });

  const { yearAggregations, tpl } = aggregateYears(races);

  return { races, yearAggregations, tpl };
}

// ── calculateDistrictModel ────────────────────────────────────────────────────
// Phase 6 reconciliation: districts run the SAME additive pipeline as states.
// Inputs: the district's presidential results (2016/2020/2024, reaggregated to
// current boundaries) plus EVERY House race 2016–2024, each relocated onto today's
// lines by the boundary shift (BS, below) and weighted by how far it had to move.
// House rows get the incumbency and fundraising strips; every
// row strips β*(parent state) × E(year); ineligible House races are skipped —
// the presidential rows already carry the district's lean, so imputing from
// them would double-count. Aggregation, decay and Huber weighting are the same
// helpers and constants the state model uses, which puts District TPL on the
// same scale as State TPL (review finding F9).

// ── Boundary shift (BS pts, additive) ────────────────────────────────────────
// A House margin is a fact about the map that race was run on; District TPL is a property
// of the 2026 map. NC-14 2022 and NC-14 2026 are 32 presidential points apart — the same
// number attached to different territory. Reconstructing the House race on today's lines
// is not possible even in principle: today's NC-14 is assembled from pieces of three 2022
// districts, each of which held a DIFFERENT contest, so the summed "result" corresponds to
// no election anyone ran. (This is why pres-by-CD datasets exist for every vintage and
// House-by-new-CD datasets exist for none.)
//
// So the race is relocated instead, by the presidential delta between the two maps:
//
//   BS = pres_P(2026 lines) − pres_P(lines used in year Y)      [same election P, two maps]
//   NM = Raw + IF + FF + BS + ENV
//
// P is the presidential year contemporaneous with Y; a MIDTERM uses both neighbours weighted by
// distance (2018 = ½·[2016 delta] + ½·[2020 delta]). With one election, a 2018 Orange County race
// was relocated as if 2016 still described its turf, when the old and new CA-45 areas had moved
// ~17 pts apart by 2020 (shift +16.0 single-election, +7.4 averaged).
//
// What transfers is the candidate's performance RELATIVE TO the presidential baseline, not
// their margin: Jackson's D+15.4 on D+16.4 turf becomes R+17.1 on today's R+16.1 turf —
// "ran a point behind the top of the ticket" carries over, "won by 15" does not. That is
// the same relative-to-baseline logic the whole model is built on, so BS is a strip of the
// same kind as IF and FF rather than a new concept.
//
// WEIGHT. The uniform shift assumes performance-vs-baseline is constant across the
// district's territory, which is weakest exactly where the shift is largest: a member's
// home-county overperformance does not transfer to voters they never represented, and a
// 32-point rebuild extrapolates far outside the observation's support. So a relocated row
// is downweighted by how far it was moved:
//
//   weight = 1 / (1 + (|shift| / BS_WEIGHT_K)²)
//
// Zero-shift races (266 of 435 in the 2022 era, 301 in 2024 — most states did not redraw)
// keep full weight and are unaffected by the choice of K.
function boundaryStripFor(
  districtId: string,
  houseYear: number,
  d: { pres16RepPct: number; pres16DemPct: number; pres20RepPct: number; pres20DemPct: number; pres24RepPct: number; pres24DemPct: number }
): { BS_pts: number; shift: number | null; weight: number } {
  const vintage = boundaryVintageForHouseYear(houseYear);
  if (vintage == null) return { BS_pts: 0, shift: null, weight: 1 }; // 2026 IS the reference map
  const on2026 = (py: number) =>
    py === 2016 ? d.pres16RepPct - d.pres16DemPct
    : py === 2020 ? d.pres20RepPct - d.pres20DemPct
    : d.pres24RepPct - d.pres24DemPct;
  // A midterm is measured with BOTH neighbouring presidential elections, weighted by distance —
  // the same interpolation the WAR trend term uses (2018 = ½·2016 + ½·2020). Each term is a
  // same-election, two-map difference, so no election-to-election trend leaks into the shift.
  // A neighbour missing on the old map (a district number that did not exist) drops out and the
  // remaining weight is renormalised.
  let shift = 0;
  let wsum = 0;
  for (const [py, w] of presInterpWeights(houseYear)) {
    const onOld = presByBoundaryVintage[vintage][py]?.[districtId]?.margin;
    if (onOld == null) continue;
    shift += w * (onOld - on2026(py));
    wsum += w;
  }
  if (wsum === 0) return { BS_pts: 0, shift: null, weight: 1 };
  shift /= wsum;
  const weight = 1 / (1 + (Math.abs(shift) / G.BS_WEIGHT_K) ** 2);
  return { BS_pts: -shift, shift, weight };
}

export function calculateDistrictModel(districtId: string): DistrictModelCalculation {
  const d = districtPresidentialData[districtId];
  if (!d) return { races: [], yearAggregations: [], tpl: 0, stateAbbr: "", eraStart: 2016 };
  const fit = getTplFit();
  const stateAbbr = d.state;
  const beta = fit.beta[stateAbbr]?.shrunk ?? 1;
  const houseRace = houseData.find((r) => parseInt(r.id, 10).toString() === districtId);
  const infoYears = houseRace ? (houseDistrictInfo[houseRace.id] ?? []).map((e) => e.year) : [];
  const eraStart = infoYears.length > 0 ? Math.max(...infoYears) : 2016;

  const rows: ComputedRace[] = [];
  const presMargins: [number, number][] = [
    [2016, d.pres16RepPct - d.pres16DemPct],
    [2020, d.pres20RepPct - d.pres20DemPct],
    [2024, d.pres24RepPct - d.pres24DemPct],
  ];
  for (const [year, margin] of presMargins) {
    const envPts = -(beta * (fit.E[year] ?? 0));
    rows.push({
      race: "President", raceType: "P", year, eligibility: "eligible", incumbent: "-",
      historicalMargins: [], rawMargin: margin, adjustedMargin: margin,
      incumbencyPts: 0, FF_pts: 0, ffDetail: null,
      imputed: false, imputedSourceYear: null, imputedSourceDesc: null,
      minValidYear: eraStart, envPts, aggWeight: 1, NM: margin + envPts, inAggregation: true,
    });
  }
  for (const r of houseRace?.pastResults ?? []) {
    if (r.year < 2016 || r.year > 2025) continue;
    if (classifyEligibility(r, stateAbbr) !== "eligible") continue;
    const margin = r.repPct - r.demPct;
    const incumbent = incumbentFromResult(r);
    const incumbencyPts = incumbencyPtsFor("H", incumbent);
    const money = raceFundraisingFor("H", stateAbbr, houseRace!.name, "House", r.year);
    const FF_pts = ffStripPts(money);
    const envPts = -(beta * (fit.E[r.year] ?? 0));
    const { BS_pts, shift, weight } = boundaryStripFor(districtId, r.year, d);
    const x = r as PastResult & { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string };
    rows.push({
      race: `House ${houseRace!.name}`, raceType: "H", district: houseRace!.name, year: r.year,
      eligibility: "eligible", incumbent,
      demCandidate: x.demCandidate, repCandidate: x.repCandidate, demParty: x.demParty, repParty: x.repParty,
      historicalMargins: [], rawMargin: margin, adjustedMargin: margin,
      incumbencyPts, FF_pts, ffDetail: money,
      imputed: false, imputedSourceYear: null, imputedSourceDesc: null,
      minValidYear: eraStart, envPts, aggWeight: weight,
      BS_pts, boundaryShift: shift, boundaryWeight: weight,
      NM: margin + incumbencyPts + FF_pts + BS_pts + envPts, inAggregation: true,
    });
  }

  // Two-pass Huber: anchor on the plain aggregate, then downweight outlier races.
  // A relocated House row carries its boundary weight THROUGH the Huber pass — the two
  // multiply, since a race can be both a poor relocation and an outlier on its own terms.
  const lean0 = aggregateYears(rows).tpl;
  for (const row of rows) {
    const resid = (row.NM ?? 0) - lean0;
    const huber = Math.abs(resid) <= G.HUBER_C ? 1 : G.HUBER_C / Math.abs(resid);
    row.aggWeight = huber * (row.boundaryWeight ?? 1);
  }
  const { yearAggregations, tpl } = aggregateYears(rows);
  return { races: rows, yearAggregations, tpl, stateAbbr, eraStart };
}

// ── County TPL ────────────────────────────────────────────────────────────────
// Reuses the exact same per-race formula pipeline as the state model (competitiveness
// blend, IF, CQ, FF, WA, year aggregation — via the shared helpers above), so a change
// to the state TPL formula automatically applies here too. Only the inputs differ:
// - President/Senate/Governor are genuinely the same statewide race, just measured at
//   county granularity, so incumbent + WQ/LQ/FF inputs are reused from the parent
//   state's race list (STATE_RACE_INPUTS) — but raw margins, historical margins, and
//   the presidential baseline used for the competitiveness blend all come from the
//   county's own results, so the county TPL updates whenever county data changes.
// - House: county data is already a same-year aggregate across every district touching
//   the county (see data/countyHouseData.ts), so there's no single incumbent/candidate
//   to attribute — IF and CQ default to neutral (Open / Generic / Generic).
// - Wave Adjustment reuses the parent state's S (Wave Sensitivity Coefficient); no
//   separate county-level S is computed.

// A "Senate Special" row must read countySenateData's specialYears bucket, not `years`:
// the two live in sibling maps whenever a state held a separate special (MN/MS 2018,
// GA 2020, OK 2022, NE 2024) and in specialYears alone when the special was the only
// Senate race that cycle (AZ 2020). Reading `years` for a special row therefore either
// found nothing (AZ 2020 — a blank Senate row on every AZ county) or silently returned
// the REGULAR race's margin, duplicating it onto both of that year's Senate rows.
// Governor needs no equivalent split: governor specials (OR 2016) are named plain
// "Governor" by generateRaceList and countyGovernorData stores them in `years`.
function getCountyHistoricalMargins(race: string, fips: string): { year: number; margin: number }[] {
  const years =
    race === "President" ? countyPresidentialData[fips]?.years
    : race === "Senate Special" ? countySenateData[fips]?.specialYears
    : race === "Senate" ? countySenateData[fips]?.years
    : race === "Governor" ? countyGovernorData[fips]?.years
    : undefined;
  if (!years) return [];
  const out: { year: number; margin: number }[] = [];
  for (const [year, result] of Object.entries(years)) {
    if (result) out.push({ year: Number(year), margin: result.margin });
  }
  return out;
}

function getCountyNearestPresidential(fips: string, raceYear: number): ImputedLean | null {
  const entry = getCountyHistoricalMargins("President", fips).sort(byNearestYear(raceYear))[0];
  return entry ? { margin: entry.margin, year: entry.year, desc: "county presidential result" } : null;
}

function generateCountyRaceList(fips: string, stateAbbr: string, stateName: string): RaceStub[] {
  const statewideStubs: RaceStub[] = generateRaceList(stateAbbr, stateName)
    .filter((stub) => stub.raceType === "P" || stub.raceType === "S" || stub.raceType === "G")
    .map((stub) => ({ ...stub, historicalMargins: getCountyHistoricalMargins(stub.race, fips) }));

  const houseYears = countyHouseData[fips]?.years;
  const houseHistoricalMargins: { year: number; margin: number }[] = [];
  if (houseYears) {
    for (const [year, result] of Object.entries(houseYears)) {
      if (result) houseHistoricalMargins.push({ year: Number(year), margin: result.margin });
    }
  }
  const houseStubs: RaceStub[] = houseHistoricalMargins
    .filter((m) => m.year >= 2016)
    .map((m) => ({
      race: "House",
      raceType: "H",
      year: m.year,
      eligibility: "eligible" as const,
      incumbent: "Open",
      historicalMargins: houseHistoricalMargins,
    }));

  const RACE_TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3 };
  return [...statewideStubs, ...houseStubs].sort((a, b) => {
    const typeOrder = (RACE_TYPE_ORDER[a.raceType] ?? 9) - (RACE_TYPE_ORDER[b.raceType] ?? 9);
    if (typeOrder !== 0) return typeOrder;
    if (a.year !== b.year) return b.year - a.year;
    return a.race.localeCompare(b.race);
  });
}

export function calculateCountyModel(fips: string): StateModelCalculation | null {
  const county = countyPresidentialData[fips];
  if (!county) return null;
  const stateAbbr = county.state;
  const stateName = FIPS_TO_STATE[fips.slice(0, 2)]?.name ?? stateAbbr;
  const fit = getTplFit();
  const beta = fit.beta[stateAbbr]?.shrunk ?? 1; // county reuses the parent state's elasticity
  const stubs = generateCountyRaceList(fips, stateAbbr, stateName);

  const races: ComputedRace[] = stubs.map((stub) => {
    const rawMargin = stub.historicalMargins.find((m) => m.year === stub.year)?.margin ?? null;
    const inAggregation = stub.year in G.YEAR_WEIGHTS;
    const ineligible = stub.eligibility !== "eligible";
    const imputation = ineligible ? getCountyNearestPresidential(fips, stub.year) : null;
    const imputed = imputation != null;
    const adjustedMargin = ineligible ? (imputation?.margin ?? null) : rawMargin;
    const envYear = imputed ? imputation!.year : stub.year;
    const envPts = adjustedMargin == null ? null : -(beta * (fit.E[envYear] ?? 0));
    const incumbencyPts = adjustedMargin == null ? null : imputed ? 0 : incumbencyPtsFor(stub.raceType, stub.incumbent, stub.incumbentAppointed);
    const money = imputed ? null : raceFundraisingFor(stub.raceType, stateAbbr, stub.district, stub.race, stub.year);
    const FF_pts = adjustedMargin == null ? null : ffStripPts(money);
    const NM = adjustedMargin != null
      ? adjustedMargin + (incumbencyPts ?? 0) + (FF_pts ?? 0) + (envPts ?? 0)
      : null;
    return {
      ...stub,
      rawMargin,
      incumbencyPts,
      FF_pts,
      ffDetail: money,
      adjustedMargin,
      imputed,
      imputedSourceYear: imputation?.year ?? null,
      imputedSourceDesc: imputation?.desc ?? null,
      minValidYear: 0,
      envPts,
      // County rows measure the county, so a residual vs the STATE lean is not an
      // outlier signal — only the imputed discount applies at county granularity.
      aggWeight: imputed ? IMPUTED_RACE_WEIGHT : 1,
      NM,
      inAggregation,
    };
  });

  const { yearAggregations, tpl } = aggregateYears(races);
  return { races, yearAggregations, tpl };
}

export function calculateCountyTpl(fips: string): number {
  return calculateCountyModel(fips)?.tpl ?? 0;
}

// ── Public convenience functions ──────────────────────────────────────────────

export function calculateStateTpl(stateAbbr: string, stateName: string): number {
  return calculateStateModel(stateAbbr, stateName).tpl;
}

// There's no national TPL - the model is built state/district/county-up, not
// aggregated from a national race. The median state TPL is used as a stand-in "how does
// this compare to a typical state" baseline (median, not mean, so no single blowout state
// skews it). Memoized since it's the same computation for every one of this app's ~3,100
// county pages.
let _medianStateTplCache: number | null = null;
export function getMedianStateTpl(): number {
  if (_medianStateTplCache != null) return _medianStateTplCache;
  const tpls = statesData
    .map(({ abbr, name }) => calculateStateTpl(abbr, name))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const mid = Math.floor(tpls.length / 2);
  _medianStateTplCache = tpls.length % 2 !== 0 ? tpls[mid] : (tpls[mid - 1] + tpls[mid]) / 2;
  return _medianStateTplCache;
}

export function calculateDistrictTpl(districtId: string): number {
  // houseData ids are zero-padded ("0804") but districtPresidentialData keys strip leading zeros ("804")
  const normalizedId = parseInt(districtId, 10).toString();
  return calculateDistrictModel(normalizedId).tpl;
}

// ── Race polling (Phase 5) ────────────────────────────────────────────────────
// The poll average (lib/racePollAverage.ts, from data/racePolls.ts) enters the final
// margin with weight w = nEff / (nEff + POLL_K[office]): a race with no polls is the
// model alone; one fresh poll gives a Senate race 25% polling, a Governor race 90%.
export interface RacePolling { avg: RacePollAverage | null; weight: number; key: string; }

export function racePollLabel(race: { raceType: string; name: string; electionType?: string }): string {
  if (race.raceType === "house") return `House ${race.name}`;
  if (race.raceType === "governor") return "Governor";
  return race.electionType?.toLowerCase() === "special" ? "Senate Special" : "Senate";
}

export function racePollingFor(race: { id: string; state: string; raceType: string; name: string; electionType?: string }, asOf: Date = new Date()): RacePolling {
  const office = race.raceType === "house" ? "H" : race.raceType === "senate" ? "S" : "G";
  const stateAbbr = race.raceType === "house" ? statesData.find((s) => s.name === race.state)?.abbr ?? "" : race.id.replace(/-\d+$/, "");
  const key = racePollKey(office, stateAbbr, racePollLabel(race));
  const avg = getRacePollAverage(office, stateAbbr, racePollLabel(race), asOf);
  return { avg, weight: avg ? pollWeight(avg.nEff, office) : 0, key };
}

// Single source of truth for a race's projected margin: structural forecast (TPL + generic
// ballot + incumbent, plus fundraising/candidate points once that data exists) blended with the
// RCP Average when available. Every consumer (map, table, state page, race detail pages) should
// read margin off this function so changing an input here updates margin everywhere.
export interface ProjectedMarginInput {
  id: string;
  state: string;
  name: string;
  raceType: string;
  electionType?: string;
  candidates?: { dem: { name: string; party: "D" | "R" | "I"; incumbent: boolean; appointed?: boolean }; rep: { name: string; party: "D" | "R" | "I"; incumbent: boolean; appointed?: boolean } };
}

export function computeProjectedMargin(race: ProjectedMarginInput): number {
  return projectRace(race).margin;
}

/** The structural model margin, the poll average and the blend behind computeProjectedMargin. */
export function projectRace(race: ProjectedMarginInput): { model: number; polling: RacePolling; margin: number } {
  const raceTypeMap: Record<string, "H" | "S" | "G"> = { house: "H", senate: "S", governor: "G" };
  const shortType = raceTypeMap[race.raceType];
  const incumbentCandidate = race.candidates
    ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null
    : null;
  const incumbentParty = incumbentCandidate ? alignedParty(incumbentCandidate) : null;
  const incumbentPts = shortType ? computeIncumbentPts(shortType, incumbentParty, incumbentCandidate?.appointed ?? false) : 0;

  // Live 2026 fundraising points from FEC receipts (additive, capped — same
  // computeFundraisingPts the backward model strips with).
  const ffPts = computeRaceFundraisingPts(race.raceType, race.id);
  // Candidate quality: the nominees' ridge track-record effects (Phase 4).
  const qualityPts = candidateQuality(race).pts;

  let structuralMargin: number;
  if (race.raceType === "house") {
    const stateAbbr = statesData.find((s) => s.name === race.state)?.abbr ?? "";
    structuralMargin = calculateDistrictTpl(race.id) + effectiveEnvironment(stateAbbr) + incumbentPts + ffPts + qualityPts;
  } else {
    // senate/governor: id may have a numeric suffix (e.g. "DE-2"); strip it to get state abbr
    const stateAbbr = race.id.replace(/-\d+$/, "");
    structuralMargin = calculateStateTpl(stateAbbr, race.state) + effectiveEnvironment(stateAbbr) + incumbentPts + ffPts + qualityPts;
  }

  const polling = racePollingFor(race);
  const margin = polling.avg ? (1 - polling.weight) * structuralMargin + polling.weight * polling.avg.diff : structuralMargin;
  return { model: structuralMargin, polling, margin };
}

// ── National environment (Phase 2 of the forecast revamp) ────────────────────
// The generic ballot is not on E's scale. E(y) is centered on the 2016–2025
// average environment and is fitted jointly across every office, so it is damped
// relative to the House popular vote. Both are properties of THIS model, so they
// are estimated from the fitted E against the actual House vote:
//
//   E = c + s × PV                      (c, s from the even years on file)
//
// Polling error is treated as uncertainty, not a prediction (decision
// 2026-09-16): only ENV_MISS_SHRINK of the historical mean miss (PV − final
// generic ballot) moves the point estimate; the miss variance and the
// September→November drift variance become the shared national error σ_E that
// every race's probability and the chamber simulation carry.
//
//   PV_hat  = GB_now + ENV_MISS_SHRINK × mean(miss)
//   E_hat   = c + s × PV_hat
//   σ_E     = |s| × sqrt(sd(miss)² + (horizon × sd(drift))²)
//   race environment term = β*(state) × E_hat

export const ELECTION_DATE = new Date(Date.UTC(2026, 10, 3));

export interface EnvironmentModel {
  c: number; s: number; pv0: number; // E = c + s × PV; pv0 = the House vote at which E = 0
  meanMiss: number; sdMiss: number;  // PV − final generic ballot (R-positive)
  sdDrift: number;                   // final − mid-September generic ballot, RMS around zero
  years: number[];
}

const envMean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
let environmentModelCache: EnvironmentModel | null = null;

export function getEnvironmentModel(): EnvironmentModel {
  if (environmentModelCache) return environmentModelCache;
  const E = getTplFit().E;
  const rows = nationalEnvironmentHistory.filter((r) => E[r.year] != null && r.housePv != null && r.gbFinal != null && r.gbMidSept != null);
  const xs = rows.map((r) => r.housePv!), ys = rows.map((r) => E[r.year]);
  const mx = envMean(xs), my = envMean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const s = sxx > 0 ? sxy / sxx : 1;
  const c = my - s * mx;
  const miss = rows.map((r) => r.housePv! - r.gbFinal!);
  const drift = rows.map((r) => r.gbFinal! - r.gbMidSept!);
  const meanMiss = envMean(miss);
  const sdMiss = miss.length > 1 ? Math.sqrt(miss.reduce((a, x) => a + (x - meanMiss) ** 2, 0) / (miss.length - 1)) : 0;
  const sdDrift = drift.length ? Math.sqrt(envMean(drift.map((d) => d * d))) : 0;
  environmentModelCache = { c, s, pv0: s ? -c / s : 0, meanMiss, sdMiss, sdDrift, years: rows.map((r) => r.year) };
  return environmentModelCache;
}

export interface NationalEnvironment {
  gb: number;             // live generic ballot average (R-positive)
  pvHat: number;          // GB + shrunk historical miss
  eHat: number;           // on the model's E scale — the number β* multiplies
  sigmaE: number;         // shared national error, E scale
  daysToElection: number;
  horizon: number;        // days to election / mid-September horizon, capped at 1.5
}

let nationalEnvironmentCache: NationalEnvironment | null = null;
export function getNationalEnvironment(asOf: Date = new Date()): NationalEnvironment {
  if (nationalEnvironmentCache) return nationalEnvironmentCache;
  const m = getEnvironmentModel();
  const gb = GENERIC_BALLOT;
  const pvHat = gb + F.ENV_MISS_SHRINK * m.meanMiss;
  const daysToElection = Math.max(0, (ELECTION_DATE.getTime() - asOf.getTime()) / 86400000);
  const horizon = Math.min(1.5, daysToElection / F.ENV_DAYS_MID_SEPT_TO_ELECTION);
  const sigmaPv = Math.sqrt(m.sdMiss ** 2 + (horizon * m.sdDrift) ** 2);
  nationalEnvironmentCache = { gb, pvHat, eHat: m.c + m.s * pvHat, sigmaE: Math.abs(m.s) * sigmaPv, daysToElection, horizon };
  return nationalEnvironmentCache;
}

// The environment points a race receives: β*(state) × E_hat.
export function effectiveEnvironment(stateAbbr: string): number {
  return getNationalEnvironment().eHat * (getTplFit().beta[stateAbbr]?.shrunk ?? 1);
}

// ── Forecast uncertainty (Phase 3 of the forecast revamp) ────────────────────
// error = β*(state) × national shock (σ_E, shared by every race)  +  race noise
// (RACE_SIGMA per office). Probability is the normal tail of that total spread.

// pollWeight = the poll average's share of the margin (0 without polls): the race-level
// noise is the blend of the model's and the poll average's independent errors, while
// the national shock applies to both (polls miss nationally too).
export function raceSigma(raceType: "H" | "S" | "G", stateAbbr: string, pollWeight = 0): number {
  const beta = getTplFit().beta[stateAbbr]?.shrunk ?? 1;
  const w = pollWeight;
  return Math.sqrt((beta * getNationalEnvironment().sigmaE) ** 2 + ((1 - w) * F.RACE_SIGMA[raceType]) ** 2 + (w * F.POLL_SIGMA[raceType]) ** 2);
}

export function normalCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26 erf approximation (|error| < 1.5e-7)
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + Math.sign(z) * erf);
}

// P(Democrat wins) for an R-positive margin with total spread sigma; clamped so no
// race is ever shown as certain.
export function winProbabilityD(margin: number, sigma: number): number {
  return Math.max(0.005, Math.min(0.995, normalCdf(-margin / sigma)));
}

// ── Candidate quality (forward projection, Phase 4) ──────────────────────────
// A nominee's quality is their ridge track-record effect: how much better than a
// generic nominee of their party they have run, net of lean, environment,
// incumbency and the FULL money gap (money is a separate forward term, so the
// effect must not contain it — decision 2026-09-16). Effects are solved "as of
// 2026" over every race through 2025 (recency-weighted), pooled across offices
// by state|party|name. A nominee with no record is replacement level (0).
//   quality pts (R-positive) = QUALITY_WEIGHT[office] × (effect_R − effect_D)

export interface CandidateRecord { effect: number; n: number; w: number; latestYear: number; latestOffice: string; prior: number; }
export interface CandidateQuality {
  pts: number;
  dem: (CandidateRecord & { name: string }) | null;
  rep: (CandidateRecord & { name: string }) | null;
  /** Layer B observable prior per nominee (the whole term for one with no track record). */
  demPrior: number;
  repPrior: number;
}

const _effectsCache = new Map<string, Map<string, CandidateRecord>>();
const _observablePriorCache = new Map<string, ObservablePrior>();

/** The fitted observable-prior coefficients behind computeCandidateEffects (same cache key). */
export function getObservablePrior(asOf: number = ELECTION_CYCLE, maxYear: number = ELECTION_CYCLE - 1): ObservablePrior {
  computeCandidateEffects(asOf, maxYear);
  return _observablePriorCache.get(`${asOf}:${maxYear}`)!;
}

/** Candidate effects as of `asOf`, from races with year ≤ maxYear, full-money expected margins. */
export function computeCandidateEffects(asOf: number = ELECTION_CYCLE, maxYear: number = ELECTION_CYCLE - 1): Map<string, CandidateRecord> {
  const cacheKey = `${asOf}:${maxYear}`;
  const hit = _effectsCache.get(cacheKey);
  if (hit) return hit;
  const races: EffectRace[] = [];
  const latest = new Map<string, { year: number; office: string }>();
  for (const p of buildWarPending()) {
    if (p.r.year > maxYear) continue;
    const ffPts = p.withMoney && p.gap != null ? Math.max(-FF_MAX, Math.min(FF_MAX, FF_K * p.gap)) : 0;
    const race: EffectRace = { r: p.r.rawMargin! - (p.base + ffPts), year: p.r.year, actual: p.r.rawMargin!, inc: p.r.incumbent === "R" ? "R" : p.r.incumbent === "D" ? "D" : null, office: p.office, w: p.boundaryWeight ?? 1 };
    if (p.r.demCandidate) race.D = warCandidateKey(p.state, p.r.demParty ?? "D", p.r.demCandidate);
    if (p.r.repCandidate) race.R = warCandidateKey(p.state, p.r.repParty ?? "R", p.r.repCandidate);
    for (const k of [race.D, race.R]) {
      if (!k) continue;
      const l = latest.get(k);
      if (!l || p.r.year > l.year) latest.set(k, { year: p.r.year, office: p.office });
    }
    races.push(race);
  }
  // Incumbents of the cycle being forecast get no observable features (incumbency is its own term).
  const incumbentsAsOf = new Set<string>();
  if (asOf === ELECTION_CYCLE) {
    for (const race of [...senateData, ...governorData, ...houseData]) {
      const abbr = race.raceType === "house" ? statesData.find((s) => s.name === race.state)?.abbr ?? "" : race.id.replace(/-\d+$/, "");
      for (const c of [race.candidates?.dem, race.candidates?.rep]) if (c?.incumbent && c.name) incumbentsAsOf.add(warCandidateKey(abbr, c.party, c.name));
    }
  }
  const ob = buildObservablePrior(races, asOf, incumbentsAsOf);
  _observablePriorCache.set(cacheKey, ob);
  const { a, stats } = solveCandidateEffects(races, asOf, undefined, ob.prior);
  const out = new Map<string, CandidateRecord>();
  for (const [k, effect] of a) {
    const st = stats.get(k)!; const l = latest.get(k)!;
    out.set(k, { effect, n: st.n, w: st.w, latestYear: l.year, latestOffice: l.office, prior: ob.prior.get(k) ?? 0 });
  }
  _effectsCache.set(cacheKey, out);
  return out;
}

const PLACEHOLDER_NOMINEE = /^(Democratic|Republican|Generic) (Candidate|Democrat|Republican)$|^TBD$/i;

export function candidateQuality(race: {
  id: string;
  state: string;
  raceType: string;
  candidates?: { dem: { name: string; party: string; incumbent?: boolean }; rep: { name: string; party: string; incumbent?: boolean } };
}): CandidateQuality {
  const abbr = race.raceType === "house"
    ? statesData.find((s) => s.name === race.state)?.abbr ?? ""
    : race.id.replace(/-\d+$/, "");
  const effects = computeCandidateEffects();
  const ob = getObservablePrior();
  const openSeat = !race.candidates?.dem.incumbent && !race.candidates?.rep.incumbent;
  const lookup = (c?: { name: string; party: string; incumbent?: boolean }) => {
    if (!c || !c.name || PLACEHOLDER_NOMINEE.test(c.name.trim())) return { rec: null, prior: 0 };
    // An aligned independent (Kiley) keeps the record filed under their former party.
    const key = warCandidateKey(abbr, alignedParty(c) ?? c.party, c.name);
    const rec = effects.get(key);
    return { rec: rec ? { ...rec, name: c.name } : null, prior: ob.valueFor(key, ELECTION_CYCLE, !!c.incumbent, openSeat) };
  };
  const dem = lookup(race.candidates?.dem);
  const rep = lookup(race.candidates?.rep);
  const office = race.raceType === "house" ? "H" : race.raceType === "senate" ? "S" : "G";
  // A nominee with a track record carries their ridge effect (already shrunk toward the
  // prior); one without any record is worth exactly their observable prior.
  const effectOf = (x: typeof dem) => x.rec?.effect ?? x.prior;
  return { pts: F.QUALITY_WEIGHT[office] * (effectOf(rep) - effectOf(dem)), dem: dem.rec, rep: rep.rec, demPrior: dem.prior, repPrior: rep.prior };
}

// ── Fundraising factor (forward projection) ───────────────────────────────────

// Phase 5 calibration (2026-09-07, scripts/tplCalibrate.ts FF sweep): the clean
// President target optimizes at a very small strip (k=0.02, cap=2); larger values
// overcorrect — the receipts gap partly double-counts incumbency, which is already
// stripped. S/H targets are biased against any strip (they contain the effect), so
// the P target is the judge. Shared by the backward strip and forward projection.
export const FF_K = 0.02;
export const FF_MAX = 2;

// rCash and dCash in any consistent unit (dollars, thousands, etc.)
// Returns R-positive pts: positive = R fundraising advantage
export function computeFundraisingPts(rCash: number, dCash: number): number {
  const total = rCash + dCash;
  if (total === 0) return 0;
  const gapPct = ((rCash - dCash) / total) * 100;
  return Math.max(-FF_MAX, Math.min(FF_MAX, gapPct * FF_K));
}

// ── Incumbent factor (forward projection) ────────────────────────────────────
// Senate and Governor incumbency are fitted (see getTplFit); House keeps a fixed
// prior because the state-level fit cannot tell House incumbency from district
// lean. incumbentAdvantage() is the single table both directions use.

export const FITTED_INCUMBENCY_OFFICES = ["S", "G"] as const;
export const INCUMBENT_ADVANTAGE_FIXED: Record<string, number> = { H: 3 };

export function incumbentAdvantage(): Record<string, number> {
  return getTplFit().incumbency;
}

export function computeIncumbentPts(raceType: "H" | "S" | "G", incumbentParty: "D" | "R" | null, appointed = false): number {
  if (!incumbentParty) return 0;
  const pts = (incumbentAdvantage()[raceType] ?? 0) * (appointed ? F.APPOINTED_INCUMBENCY_SHARE : 1);
  return incumbentParty === "R" ? pts : -pts;
}

// ── WAR (Wins Above Replacement) ─────────────────────────────────────────────
// WAR = actual margin − expected margin AGAINST THIS OPPONENT, signed toward the
// candidate: how much better (or worse) a candidate ran than a generic nominee
// of their party would have against the same opponent in the same situation.
//
//   expected           = lean + β*(state) × E(year) + incumbency advantage + STRUCTURAL money advantage
//                        (generic vs generic; structural = the money gap a generic pair in this
//                         situation would have — the idiosyncratic remainder stays in the residual)
//   expectedVsOpponent = expected − opponent's ridge effect   (generic vs this specific opponent)
//   WAR                = actual − expectedVsOpponent = own effect + the race's unexplained leftover
//
// Anchors: Senate/Governor/President races use the state's Huber-fitted lean
// (stable, outlier-resistant — Manchin's own wins don't inflate his baseline).
// House races use the district's TPL (the only district-level lean available;
// a candidate's own races contribute to it, which slightly shrinks House WAR).
// Ineligible races with a real challenger (Osborn-class) are scored against
// the imputed presidential baseline. State Legislature rows carry no candidate
// and are skipped. Only the structural part of the money gap is in expected, so
// WAR reads as "quality including the money you raised beyond your situation".

export interface WarRow {
  candidate: string;
  party: string;
  office: "P" | "S" | "G" | "H";
  race: string;
  state: string;
  year: number;
  actual: number;   // R-positive margin as run
  expected: number; // R-positive expected margin (lean + β*E + incumbency + structural money)
  moneyGapPct: number | null; // (R$ − D$)/(R$ + D$) × 100 where both receipts are known
  structuralGapPct: number;   // the money gap a generic pair in this situation would have (see WarMoneyModel)
  ffStructuralPts: number;    // R-positive pts of that structural gap in `expected` (FF_K × structural, capped ±FF_MAX)
  residual: number; // actual − expected, signed toward this candidate (the race's net two-candidate effect)
  effect: number;   // ridge-estimated candidate effect as of this race's year, signed toward this candidate
  effectN: number;  // races the effect is estimated from (count)
  effectW: number;  // effective races: Σ recency weights over those races (this race = 1)
  opponentEffect: number;     // the opponent's ridge effect as of this race's year, signed toward the OPPONENT (0 if no opponent)
  expectedVsOpponent: number; // R-positive expected margin for a generic nominee of this party vs this specific opponent
  war: number;      // actual − expectedVsOpponent, signed toward this candidate = effect + the race's unexplained leftover
  /** < 1 for a House race relocated across a redistricting — how far it had to move, as a
   *  confidence multiplier. Discounts it in the ridge exactly as it is discounted in TPL. */
  boundaryWeight?: number;
  note: string;
}

// Ridge prior on candidate effects. A race yields one residual r = a_R − a_D + ε; the penalty
// λ·Σa_c² encodes "an unseen candidate is replacement level", which makes the system solvable
// for one-race candidates (their effect is what is left after the opponent's, shrunk by 1/(1+λ))
// and splits singleton-vs-singleton residuals evenly. Effects pool across offices by
// state|party|name. WAR itself is scored against the opponent-specific expectation
// (expected − opponent effect): the candidate keeps their own effect plus the whole
// unexplained leftover ε, so the two sides' WARs do not sum to the residual — each side
// is measured against "a generic nominee facing the opponent I actually faced". λ=1 matches the observed leave-one-out persistence slope (~0.68) of repeat
// candidates' residuals; calibration via the harness is a later refinement.
export const WAR_LAMBDA = 1;
// Recency: a candidate's effect is estimated AS OF each race's year. The solve for target year
// Y weights every race by WAR_RECENCY_DECAY^|year − Y|, so the race being scored always carries
// full weight and a candidate's other races fade with distance (2 yrs 0.64 · 4 yrs 0.41 ·
// 6 yrs 0.26 · 8 yrs 0.17). Measured persistence of repeat candidates' residuals (|r| < 25):
// slope ≈ 0.45 at 1–4 yr gaps, 0.26 at 5–6, ≈ 0 at 7–9 — roughly this curve. One weighted
// solve per distinct year (10), warm-started from the previous year's effects.
// Statewide races (Senate / Governor / President) decay more slowly: a personal brand built
// statewide persists longer than a House record (user decision 2026-09-16; value set by
// forwardBacktest --decay-sweep). The decay is a property of the PAST race being weighted.
export const WAR_RECENCY_DECAY = 0.8;
export const WAR_RECENCY_DECAY_STATEWIDE = 0.9;
export const recencyDecayFor = (office?: string) => (office === "S" || office === "G" || office === "P" ? WAR_RECENCY_DECAY_STATEWIDE : WAR_RECENCY_DECAY);

export const warCandidateKey = (state: string, party: string, name: string) =>
  `${state}|${party}|${name.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()}`;

/** Fit recency-weighted ridge candidate effects over race residuals and fill effect/war on each row (mutates rows). */
export interface EffectRace { r: number; year: number; R?: string; D?: string; actual?: number; inc?: "R" | "D" | null; office?: string;
  /** Extra confidence multiplier on top of recency decay — < 1 for a House race relocated
   *  across a redistricting, whose residual is a noisy read on the candidate. */
  w?: number; }

// ── Observable prior (Layer B) ────────────────────────────────────────────────
// What a nominee's record says before their own residuals are read. Features that
// are knowable in September of the election year:
//   legislator        held state-legislative or higher elected office by that year
//   federalStatewide  held U.S. House / statewide or higher office (increment over legislator)
//   local             highest office held was local (mayor, council, county, DA, sheriff…)
//   priorWin          won a general election in our own results before that year
//   openLegislator    legislator-or-higher, counted only in an open seat (no incumbent on either side)
// Office tiers come from data/candidateOffices.ts (Wikipedia officeholder infoboxes,
// data-entry/candidate_office_history.csv). Every feature is 0 for the incumbent in the
// race at hand — incumbency is its own term, and an incumbent's tier just re-measures it.
// The coefficients are an OLS of race residuals on the R−D feature difference; the fitted
// value becomes each candidate's ridge shrinkage target, and the forward term for a
// nominee with no track record at all.
export type ObservableFeature = "legislator" | "federalStatewide" | "local" | "priorWin" | "openLegislator";
export const OBSERVABLE_FEATURES: ObservableFeature[] = ["legislator", "federalStatewide", "local", "priorWin", "openLegislator"];
export interface ObservablePrior {
  prior: Map<string, number>;
  coef: Record<ObservableFeature, number>;
  n: number;
  features: ObservableFeature[];
  /** Prior for any candidate key as of `year` (0 for an incumbent, or with no observables); `openSeat` = no incumbent in the race. */
  valueFor: (key: string, year: number, incumbent: boolean, openSeat: boolean) => number;
}

/** Highest elected-office tier (1–5, see build-candidate-offices.js) a candidate had held by `year`; 0 = none known. */
export function priorOfficeTier(key: string, year: number): number {
  const rec = candidateOffices[key];
  if (!rec) return 0;
  let best = 0;
  for (const o of rec.offices) {
    const heldBy = o.s != null ? o.s <= year : o.e != null && o.e <= year;
    if (heldBy && o.t > best) best = o.t;
  }
  return best;
}

// Solve M·x = b (small dense system) by Gaussian elimination with partial pivoting; null if singular.
function solveLinear(M: number[][], b: number[]): number[] | null {
  const n = b.length; const A = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-9) return null;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((row, i) => row[n] / row[i]);
}

export function buildObservablePrior(races: EffectRace[], asOf: number, incumbentsAsOf?: Set<string>, features: ObservableFeature[] = F.OBSERVABLE_PRIOR_FEATURES as ObservableFeature[]): ObservablePrior {
  const scored = races.filter((rc) => rc.actual != null).sort((x, y) => x.year - y.year);
  const wins = new Map<string, number[]>();
  for (const rc of scored) {
    const winner = rc.actual! > 0 ? rc.R : rc.D;
    if (winner) wins.set(winner, [...(wins.get(winner) ?? []), rc.year]);
  }
  const wonBefore = (k: string, y: number) => (wins.get(k) ?? []).some((yr) => yr < y);
  const x = (k: string | undefined, y: number, inc: boolean, open: boolean): number[] => {
    if (!k || inc) return features.map(() => 0);
    const tier = priorOfficeTier(k, y);
    return features.map((f) => f === "legislator" ? (tier >= 3 ? 1 : 0) : f === "federalStatewide" ? (tier >= 4 ? 1 : 0) : f === "local" ? (tier === 2 ? 1 : 0) : f === "openLegislator" ? (open && tier >= 3 ? 1 : 0) : (wonBefore(k, y) ? 1 : 0));
  };
  // Race-level regressors Δx = x_R − x_D; only races where some feature differs identify anything.
  const X: number[][] = [], Yv: number[] = [];
  for (const rc of scored) {
    const xr = x(rc.R, rc.year, rc.inc === "R", !rc.inc), xd = x(rc.D, rc.year, rc.inc === "D", !rc.inc);
    const dx = xr.map((v, i) => v - xd[i]);
    if (dx.every((v) => v === 0)) continue;
    X.push(dx); Yv.push(rc.r);
  }
  const k = features.length;
  let beta: number[] = features.map(() => 0);
  if (k > 0 && X.length >= 20) {
    const M = features.map(() => features.map(() => 0)), b = features.map(() => 0);
    X.forEach((row, i) => { for (let a = 0; a < k; a++) { b[a] += row[a] * Yv[i]; for (let c = 0; c < k; c++) M[a][c] += row[a] * row[c]; } });
    beta = solveLinear(M, b) ?? beta;
  }
  const coef = { legislator: 0, federalStatewide: 0, local: 0, priorWin: 0, openLegislator: 0 } as Record<ObservableFeature, number>;
  features.forEach((f, i) => { coef[f] = beta[i]; });
  const valueFor = (key: string, year: number, incumbent: boolean, openSeat: boolean) => x(key, year, incumbent, openSeat).reduce((t, v, i) => t + v * beta[i], 0);
  const prior = new Map<string, number>();
  const keys = new Set<string>();
  for (const rc of races) { if (rc.R) keys.add(rc.R); if (rc.D) keys.add(rc.D); }
  // The shrinkage target cannot know the next race's incumbency; open-seat-only features enter there as 0.
  for (const key of keys) prior.set(key, valueFor(key, asOf, incumbentsAsOf?.has(key) ?? false, false));
  return { prior, coef, n: X.length, features, valueFor };
}

// Ridge solve of candidate effects as of target year Y over the given races
// (r = actual − expected, R-positive; R/D = candidate keys). Weighted coordinate
// descent on the normal equations, warm-startable. Returns the effects and each
// candidate's race count / recency-weighted count.
export function solveCandidateEffects(
  races: Iterable<EffectRace>,
  Y: number,
  warm?: Map<string, number>,
  prior?: Map<string, number>,
  decay: (office?: string) => number = recencyDecayFor
): { a: Map<string, number>; stats: Map<string, { n: number; w: number }> } {
  const list = [...races];
  const obs = new Map<string, { race: EffectRace; s: number }[]>();
  for (const rc of list) {
    if (rc.R) (obs.get(rc.R) ?? obs.set(rc.R, []).get(rc.R)!).push({ race: rc, s: 1 });
    if (rc.D) (obs.get(rc.D) ?? obs.set(rc.D, []).get(rc.D)!).push({ race: rc, s: -1 });
  }
  const a = warm ?? new Map<string, number>();
  const pred = (rc: EffectRace) => (rc.R ? a.get(rc.R) ?? 0 : 0) - (rc.D ? a.get(rc.D) ?? 0 : 0);
  const wt = (race: EffectRace) => (race.w ?? 1) * decay(race.office) ** Math.abs(race.year - Y);
  for (let it = 0; it < 200; it++) {
    let maxDelta = 0;
    for (const [c, o] of obs) {
      const prev = a.get(c) ?? 0;
      let num = WAR_LAMBDA * (prior?.get(c) ?? 0);
      let den = WAR_LAMBDA;
      for (const { race, s } of o) {
        const w = wt(race);
        num += w * (s * (race.r - pred(race)) + prev);
        den += w;
      }
      const next = num / den;
      a.set(c, next);
      maxDelta = Math.max(maxDelta, Math.abs(next - prev));
    }
    if (maxDelta < 1e-6) break;
  }
  const stats = new Map<string, { n: number; w: number }>();
  for (const [c, o] of obs) stats.set(c, { n: o.length, w: o.reduce((acc, { race }) => acc + wt(race), 0) });
  return { a, stats };
}

function attributeWar(rows: WarRow[]): void {
  type Race = EffectRace & { rows: WarRow[] };
  const races = new Map<string, Race>();
  for (const row of rows) {
    const k = `${row.state}|${row.office}|${row.race}|${row.year}`;
    const rc = races.get(k) ?? races.set(k, { r: row.actual - row.expected, year: row.year, office: row.office, w: row.boundaryWeight ?? 1, rows: [] }).get(k)!;
    rc.rows.push(row);
    if (row.party === "R") rc.R = warCandidateKey(row.state, row.party, row.candidate);
    else rc.D = warCandidateKey(row.state, row.party, row.candidate);
  }
  const years = [...new Set([...races.values()].map((rc) => rc.year))].sort((x, y) => x - y);
  let a = new Map<string, number>();
  for (const Y of years) {
    // Solve as of Y (warm-started from the previous target year's solution).
    const solved = solveCandidateEffects(races.values(), Y, a);
    a = solved.a;
    const pred = (rc: Race) => (rc.R ? a.get(rc.R) ?? 0 : 0) - (rc.D ? a.get(rc.D) ?? 0 : 0);
    for (const rc of races.values()) {
      if (rc.year !== Y) continue;
      const eps = rc.r - pred(rc);
      for (const row of rc.rows) {
        const s = row.party === "R" ? 1 : -1;
        const key = warCandidateKey(row.state, row.party, row.candidate);
        const oppKey = row.party === "R" ? rc.D : rc.R;
        const st = solved.stats.get(key);
        row.residual = s * rc.r;
        row.effect = a.get(key) ?? 0;
        row.effectN = st?.n ?? 0;
        row.effectW = st?.w ?? 0;
        row.opponentEffect = oppKey ? a.get(oppKey) ?? 0 : 0;
        // R-positive: an above-replacement D opponent lowers the R-positive expectation; an
        // above-replacement R opponent raises it. s·(actual − expectedVsOpponent) = effect + s·ε.
        row.expectedVsOpponent = row.expected - s * row.opponentEffect;
        row.war = row.effect + s * eps; // = s·(actual − expectedVsOpponent)
      }
    }
  }
}

// ── Structural money (WAR expected margin only) ──────────────────────────────
// The TPL pipeline strips the FULL fundraising gap (it wants the seat's lean).
// WAR asks a different question — candidate quality — and money is partly the
// candidate. Split the gap: the STRUCTURAL part is what a generic pair in this
// situation would have, predicted per office from the incumbent sign and the
// race's expected margin before money (gap ≈ a + b·incSign + c·base, in-sample
// OLS over races with both receipts known; R² ≈ .67 S / .53 G / .81 H). Only
// that part enters WAR's expected margin; the IDIOSYNCRATIC remainder — money
// a candidate raised beyond their situation — stays in the residual and is
// credited to them. Because the prediction needs no receipts, every race gets
// the structural term, receipts known or not.

export interface WarMoneyModel { intercept: number; incSign: number; base: number; n: number; r2: number; }

function fitWarMoneyModel(rows: { gap: number; incSign: number; base: number }[]): WarMoneyModel {
  const n = rows.length;
  if (n < 5) return { intercept: 0, incSign: 0, base: 0, n, r2: 0 };
  // 3×3 normal equations for gap ~ 1 + incSign + base
  const X = rows.map((r) => [1, r.incSign, r.base]);
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  rows.forEach((r, i) => { for (let a = 0; a < 3; a++) { M[a][3] += X[i][a] * r.gap; for (let b = 0; b < 3; b++) M[a][b] += X[i][a] * X[i][b]; } });
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return { intercept: 0, incSign: 0, base: 0, n, r2: 0 };
    for (let r = 0; r < 3; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  const coef = [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  const mean = rows.reduce((a, r) => a + r.gap, 0) / n;
  let ssr = 0, sst = 0;
  for (const r of rows) { const yh = coef[0] + coef[1] * r.incSign + coef[2] * r.base; ssr += (r.gap - yh) ** 2; sst += (r.gap - mean) ** 2; }
  return { intercept: coef[0], incSign: coef[1], base: coef[2], n, r2: sst > 0 ? 1 - ssr / sst : 0 };
}

let _warCache: WarRow[] | null = null;
let _warMoneyCache: Record<string, WarMoneyModel> | null = null;
type WarPending = { r: ComputedRace; office: WarRow["office"]; raceLabel: string; state: string; base: number; incSign: number; gap: number | null; withMoney: boolean; boundaryWeight?: number; note: string };
let _warPendingCache: WarPending[] | null = null;

// Every scorable race with its pre-money expected margin (base = anchor lean + β*E +
// incumbency), shared by the WAR table (structural money) and the forward candidate
// effects (full money).
// ── Year-local anchoring for WAR ─────────────────────────────────────────────
// A lean (state fitted lean, or District TPL) is a single number across 2016–2025, but a
// race is a fact about its own year. Scoring an old race against a present-day lean charges
// the candidate for everything the electorate did since — NY-06 swung 34 pts right between
// the 2016 and 2024 presidential results, and Florida 10. So each race's expectation is moved
// by the TREND: how far that year's environment-neutral presidential margin sat from the
// presidential average the lean embodies. Presidential margins exist only every four years,
// so any other year is linearly interpolated between the bracketing ones.

const PRES_ANCHOR_YEARS = [2016, 2020, 2024];

/** Bracketing presidential years for a race year, with linear-interpolation weights.
 *  2018 → {2016: .5, 2020: .5}; 2017 → {2016: .75, 2020: .25}; 2025 clamps to 2024. */
export function presInterpWeights(year: number): [number, number][] {
  const P = PRES_ANCHOR_YEARS;
  if (year <= P[0]) return [[P[0], 1]];
  if (year >= P[P.length - 1]) return [[P[P.length - 1], 1]];
  for (let i = 0; i < P.length - 1; i += 1) {
    const [a, b] = [P[i], P[i + 1]];
    if (year < a || year > b) continue;
    const t = (year - a) / (b - a);
    return t === 0 ? [[a, 1]] : t === 1 ? [[b, 1]] : [[a, 1 - t], [b, t]];
  }
  return [[P[P.length - 1], 1]];
}

/** Environment-neutral presidential margin interpolated to `year`, from P-row NMs by year. */
function interpolatedPresNM(presNM: Map<number, number>, year: number): number | null {
  let acc = 0;
  let wsum = 0;
  for (const [py, w] of presInterpWeights(year)) {
    const v = presNM.get(py);
    if (v == null) continue;
    acc += w * v;
    wsum += w;
  }
  return wsum > 0 ? acc / wsum : null;
}

function buildWarPending(): WarPending[] {
  if (_warPendingCache) return _warPendingCache;
  const fit = getTplFit();
  const pending: WarPending[] = [];
  const gapOf = (r: ComputedRace) => r.ffDetail && r.ffDetail.dem + r.ffDetail.rep > 0 ? ((r.ffDetail.rep - r.ffDetail.dem) / (r.ffDetail.rep + r.ffDetail.dem)) * 100 : null;
  const incSignOf = (r: ComputedRace) => (r.incumbent === "R" ? 1 : r.incumbent === "D" ? -1 : 0);

  for (const { abbr, name } of statesData) {
    const lean = fit.lean[abbr];
    const beta = fit.beta[abbr]?.shrunk ?? 1;
    if (lean == null) continue;
    const stateRaces = calculateStateModel(abbr, name).races;
    // The fitted lean has NO recency decay (getTplFit is a flat least-squares fit over
    // 2016–2025), so the presidential average it embodies is an EQUAL-year one — unlike
    // District TPL, whose recency weighting the district anchor below mirrors. Mixing the two
    // would bake a decay-shaped bias back in. Huber factors (aggWeight) are kept.
    const presRows = stateRaces.filter((x) => x.raceType === "P" && x.NM != null && x.year <= 2025);
    const presWSum = presRows.reduce((a, x) => a + x.aggWeight, 0);
    const presBar = presWSum > 0 ? presRows.reduce((a, x) => a + x.aggWeight * x.NM!, 0) / presWSum : null;
    const presNM = new Map(presRows.map((x) => [x.year, x.NM!]));
    for (const r of stateRaces) {
      if (r.raceType === "L" || r.raceType === "H" || r.year > 2025 || r.rawMargin == null) continue;
      const E = fit.E[r.year] ?? 0;
      const office = r.raceType as WarRow["office"];
      if (!r.imputed && r.eligibility === "eligible") {
        // Presidential rows are NOT trend-anchored: their own margin IS the trend input, so the
        // residual would collapse to the constant down-ballot offset by construction.
        const yearPres = r.raceType === "P" ? null : interpolatedPresNM(presNM, r.year);
        const trend = yearPres != null && presBar != null ? yearPres - presBar : 0;
        pending.push({ r, office, raceLabel: r.race, state: abbr, base: lean + trend + beta * E - (r.incumbencyPts ?? 0), incSign: incSignOf(r), gap: gapOf(r), withMoney: true, note: r.raceType === "P" ? "vs state fitted lean" : `vs state lean in ${r.year}` });
      } else if (r.imputed && r.NM != null && (r.eligibility === "no-dem" || r.eligibility === "no-rep")) {
        // Same-party and jungle-fragmented generals carry no signable R-vs-D margin.
        // Imputed baselines carry no money term (the imputation is a presidential lean).
        pending.push({ r, office, raceLabel: r.race, state: abbr, base: r.NM + beta * E - incumbencyPtsFor(r.raceType, r.incumbent, r.incumbentAppointed), incSign: incSignOf(r), gap: null, withMoney: false, note: "vs imputed presidential baseline" });
      }
    }
  }
  for (const districtId of Object.keys(districtPresidentialData)) {
    const calc = calculateDistrictModel(districtId);
    const beta = fit.beta[calc.stateAbbr]?.shrunk ?? 1;
    // District TPL is ONE recency-weighted lean — in practice ~2024 politics. A House race is
    // a fact about its own year, so scoring a 2016 race against it charges the candidate for
    // everything the district did since: NY-06 went D+40 → D+29 → D+6 on the 2016/2020/2024
    // presidential margins, and Grace Meng's 2016 race (12.6 pts ahead of Clinton on the same
    // turf) was being scored 18 pts more Republican than Clinton's own result, for WAR +22.
    //
    // So the expectation is anchored on the district's lean IN THAT YEAR: TPL, moved by how
    // far that year's environment-neutral presidential margin sat from the presidential
    // average TPL embodies (the trend), and by the boundary shift (the turf):
    //
    //   presBar  = aggregation-weighted mean of the P rows' NM (neutral pres, 2026 lines) —
    //              RECENCY-weighted, because District TPL is (the state anchor is not)
    //   trend(Y) = NM interpolated to year Y on 2026 lines − presBar
    //   base     = TPL + trend(Y) + shift + β·E(Y) − IF
    //
    // Midterms interpolate the trend (2018 = ½·2016 + ½·2020). The trend is measured on
    // today's lines, where all three presidential years exist, so it needs no old-map data;
    // only the boundary SHIFT depends on what the old maps' presidential results are.
    const presRows = calc.races.filter((x) => x.raceType === "P" && x.NM != null);
    const presW = presRows.map((x) => (G.YEAR_WEIGHTS[x.year] ?? 0) * x.aggWeight);
    const presWSum = presW.reduce((a, b) => a + b, 0);
    const presBar = presWSum > 0 ? presRows.reduce((acc, x, i) => acc + presW[i] * x.NM!, 0) / presWSum : calc.tpl;
    const presNM = new Map(presRows.map((x) => [x.year, x.NM!]));
    for (const r of calc.races) {
      if (r.raceType !== "H" || r.rawMargin == null) continue;
      const yearPres = interpolatedPresNM(presNM, r.year);
      const trend = yearPres != null ? yearPres - presBar : 0;
      // `actual` is the margin as recorded on the map the race was RUN on, so the expectation
      // must sit on that turf too (−BS_pts is the shift). Without it Doyle's D+48.7 in the
      // 2016 Pittsburgh PA-14 was scored against today's rural R+27 PA-14.
      const shift = -(r.BS_pts ?? 0);
      const relocated = r.boundaryShift != null && Math.abs(r.boundaryShift) >= 0.5;
      pending.push({ r, office: "H", raceLabel: r.race, state: calc.stateAbbr, base: calc.tpl + trend + shift + beta * (fit.E[r.year] ?? 0) - (r.incumbencyPts ?? 0), incSign: incSignOf(r), gap: gapOf(r), withMoney: true, boundaryWeight: r.boundaryWeight ?? 1, note: relocated ? `vs district lean in ${r.year}, on that year's lines` : `vs district lean in ${r.year}` });
    }
  }
  _warPendingCache = pending;
  return pending;
}

/** Per-office structural money model behind WAR's expected margin (fitted inside computeWarTable). */
export function getWarMoneyModel(): Record<string, WarMoneyModel> {
  if (!_warMoneyCache) computeWarTable();
  return _warMoneyCache!;
}

export function computeWarTable(): WarRow[] {
  if (_warCache) return _warCache;
  const pending = buildWarPending();

  // Structural money model per office, from races with both receipts known.
  const money: Record<string, WarMoneyModel> = {};
  for (const office of ["S", "G", "H"] as const) {
    money[office] = fitWarMoneyModel(pending.filter((p) => p.office === office && p.withMoney && p.gap != null).map((p) => ({ gap: p.gap!, incSign: p.incSign, base: p.base })));
  }
  money.P = { intercept: 0, incSign: 0, base: 0, n: 0, r2: 0 };
  _warMoneyCache = money;

  const out: WarRow[] = [];
  for (const p of pending) {
    const m = money[p.office];
    const structuralGapPct = p.withMoney ? m.intercept + m.incSign * p.incSign + m.base * p.base : 0;
    const ffStructuralPts = p.withMoney ? Math.max(-FF_MAX, Math.min(FF_MAX, FF_K * structuralGapPct)) : 0;
    const expected = p.base + ffStructuralPts;
    // residual/effect/war are filled by attributeWar() once every race is collected.
    const base = { office: p.office, race: p.raceLabel, state: p.state, year: p.r.year, actual: p.r.rawMargin!, expected, moneyGapPct: p.gap, structuralGapPct, ffStructuralPts, residual: 0, effect: 0, effectN: 0, effectW: 0, opponentEffect: 0, expectedVsOpponent: 0, war: 0, boundaryWeight: p.boundaryWeight ?? 1, note: p.note };
    if (p.r.demCandidate) out.push({ candidate: p.r.demCandidate, party: p.r.demParty ?? "D", ...base });
    if (p.r.repCandidate) out.push({ candidate: p.r.repCandidate, party: p.r.repParty ?? "R", ...base });
  }

  attributeWar(out);
  out.sort((a, b) => b.war - a.war);
  _warCache = out;
  return _warCache;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatForecastMargin(v: number, decimals = 1): string {
  if (Math.abs(v) < 0.05) return "EVEN";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(decimals)}`;
}

// Legacy logistic curve, P(D wins) = 1 / (1 + e^(0.13 × margin)), kept only as the
// comparison baseline in scripts/forwardBacktest.ts. The site uses winProbabilityD.
export function marginToProbability(margin: number): number {
  const raw = 1 / (1 + Math.exp(0.13 * margin));
  return Math.max(0.02, Math.min(0.98, raw));
}

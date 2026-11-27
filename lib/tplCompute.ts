import { legislativeRacesOf } from "./warCross";
import "server-only";
import {
  presPastResults,
  senateData,
  senateHoldovers,
  senateNoElection,
  governorData,
  governorNoElection,
  houseStatewideResults,
  houseDistrictInfo,
  stateLegData,
  houseData,
  type PastResult,
} from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { candidateOffices, type CandidateOfficeRecord } from "@/data/candidateOffices";
import { SAME_PERSON, SAME_PERSON_IN_STATE } from "@/lib/candidateSlug";
import { TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F, TPL_NEUTRAL_ANCHOR } from "@/data/tplModelData";
import { nationalEnvironmentHistory } from "@/data/nationalEnvironmentHistory";
import { fundraisingData, fundraisingSources, fundraisingDetails, type RaceFinanceDetail } from "@/data/fundraisingData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { presByBoundaryVintage, boundaryVintageForHouseYear } from "@/data/presByBoundaryVintage";
// The corrected historical data. The 2026 forecast read the rows as they stood at its lock
// (lib/locked2026HousePast.ts, lib/locked2026CountyData.ts); that forecast is now a set of frozen
// files (lib/final2026.ts), so the model reads the corrected rows from 2026-11-19 on.
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData, type CountyYearResult } from "@/data/countyHouseData";
import { computeGenericBallotAverage, genericBallotSeries } from "@/lib/genericBallotAverage";
import { getRacePollAverage, pollAgingShift, pollWeight, racePollKey, type RacePollAverage, allocateUndecided } from "@/lib/racePollAverage";
import { computeHouseEffects, type HouseEffects } from "@/lib/pollsterHouseEffects";
import { racePolls } from "@/data/racePolls";
import { FIPS_TO_STATE } from "@/lib/fips";
import { forecastNow } from "@/lib/forecastClock";
import { classifyEligibility, alignedParty, type RaceEligibility } from "@/data/raceEligibility";
import { getChamberMargins, legislatureRowPool, unopposedPresPool, type NotUpMode, type UnopposedMode } from "@/lib/chamberMargins";
import type { ChamberMarginYear } from "@/lib/stateLegChamberMargin";
import { tplInputs2026, TPL_2026, type Tpl2026Race } from "@/lib/tpl2026Inputs";
import { districtBallot, type DistrictBallotEntry } from "@/lib/districtBallot";
import { laHouseNovemberPartyVote, type LaNovemberPartyVote } from "@/data/laHouseNovemberPartyVote";
import { countyHousePieces, houseSeatInfo } from "@/lib/houseRaceInfo";

// ── Louisiana November party vote ────────────────────────────────────────────
// Through 2024 Louisiana's November House election was an all-party primary. The results file
// keeps the top candidate of each party (or the December runoff), which says how two people did,
// not how many Democrats and Republicans voted: Higgins's 2016 runoff was Republican against
// Republican, and a field of eight Republicans reads as a 20-point race for the leader. State and
// District TPL score those seats on the party split instead: every Democratic candidate's November
// votes against every Republican candidate's, as a share of the total (user decision 2026-11-24).
// A seat where one party ran nobody is still imputed. WAR keeps the candidate-level rows.
const LA_NOVEMBER = new Map(laHouseNovemberPartyVote.map((v) => [`${v.district}:${v.year}`, v]));
export function laNovemberPartyVote(district: string | undefined, year: number): LaNovemberPartyVote | undefined {
  return district ? LA_NOVEMBER.get(`${district}:${year}`) : undefined;
}
const laNovemberMargin = (v: LaNovemberPartyVote) => ((v.rep - v.dem) / v.total) * 100;
const laNovemberEligibility = (v: LaNovemberPartyVote): RaceEligibility => (v.dem > 0 && v.rep > 0 ? "eligible" : v.dem > 0 ? "no-rep" : "no-dem");

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
  totalVotes?: number; // House and State Legislature rows: ballots behind the row (its turnout weight in the state model)
  /**
   * An ineligible row's imputation decided at stub time rather than by nearestPresidentialLean:
   * the State Legislature's unopposed pool carries the turnout-weighted presidential lean of its
   * uncontested districts on the lines they were run on (lib/stateLegChamberMargin.ts).
   */
  presetImputation?: { margin: number; year: number; desc: string; totalVotes?: number };
  /** The State Legislature row's makeup: seats counted as contested, and seats estimated (unopposed; not up). */
  legPools?: { contested: number; unopposed: number; notUp: number };
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
  aggWeight: number; // weight in aggregation: ×0.5 if imputed; statewide rows × Huber factor vs the fitted lean, House rows × turnoutWeight (state model)
  turnoutWeight?: number; // House rows in the state model: total votes relative to the state-year mean House turnout (imputed rows use their source presidential year's turnout)
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
  typeFactors: Record<string, number>; // per-type Huber factor on the year's type mean (House in the state model; 1 otherwise)
  WRS: number;
  coverage: number;    // Σ base type weight × type factor of types present — scales the year weight
  finalWeight: number; // normalized share of TPL contributed by this year
  /** E(year), set by lib/modelSlices.ts for display: the pages show a year's margins before the environment is removed (typeNMs + env, WRS + env) and remove it once, on the year's total. */
  env?: number;
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
// A state model's House rows are turnout-weighted shares of the state's House vote, so an
// imputed (uncontested / same-party) district keeps its full share: halving it would drop
// half that district's voters out of the state's sum. The imputed value is that district's
// own presidential lean, which is a better estimate of its share than a missing race.
export const IMPUTED_HOUSE_ROW_WEIGHT = 1;
// The State Legislature's unopposed pool: like a House seat, it is a share of the chamber's
// electorate, so it keeps its full turnout share. Tested against 0.5 (decision 6 of the atlas
// plan): see methodologyChangelog 2026-10-10.
export const IMPUTED_LEG_ROW_WEIGHT = 1;
// A staggered chamber's seats NOT up in a year join the State Legislature row as estimates —
// each seat's presidential margin plus the gap the contested seats up that year ran from theirs
// (lib/chamberMargins.ts notUpPool) — so the row measures the whole chamber, not the seat class
// that happened to be on the ballot. "slope" lets the gap vary with presidential lean, its slope
// shrunk by n/(n + LEG_NOT_UP_SLOPE_K) on n contested seats. Backtest: methodologyChangelog
// 2026-10-19. TPL_LEG_NOT_UP=off|flat|slope and TPL_LEG_NOT_UP_K override them for the harnesses.
export const LEG_NOT_UP_MODE: NotUpMode = "slope";
export const LEG_NOT_UP_SLOPE_K = 10;
// The unopposed seats join the same row the same way: presidential margin plus the contested
// seats' gap (user decision 2026-11-19). Until then they were a separate row at the presidential
// margin alone, which left out the down-ballot gap the not-up seats were given. A chamber with no
// gap to use (fewer than five contested seats in either chamber) keeps the old treatment, as the
// "State Legislature (unopposed seats)" row. TPL_LEG_UNOPPOSED=pres|gap overrides for the harnesses.
export const LEG_UNOPPOSED_MODE: UnopposedMode = "gap";
const legUnopposedMode = (process.env.TPL_LEG_UNOPPOSED as UnopposedMode | undefined) ?? LEG_UNOPPOSED_MODE;
const legRowPool = (cm: ChamberMarginYear) => legislatureRowPool(cm, legNotUpMode, legNotUpK, legUnopposedMode);
const legNotUpMode = (process.env.TPL_LEG_NOT_UP as NotUpMode | undefined) ?? LEG_NOT_UP_MODE;
const legNotUpK = process.env.TPL_LEG_NOT_UP_K != null ? Number(process.env.TPL_LEG_NOT_UP_K) : LEG_NOT_UP_SLOPE_K;

interface ImputedLean {
  margin: number;
  year: number;
  desc: string;
  totalVotes?: number; // turnout of the source result (House rows carry it as their aggregation weight)
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
    // A 2026 race was run on today's lines, where the presidential vote is districtPresidentialData.
    const current = raceYear >= TPL_2026 && districtId ? districtPresidentialData[parseInt(districtId, 10).toString()] : undefined;
    if (current) return { margin: current.pres24RepPct - current.pres24DemPct, year: 2024, desc: "district presidential result on 2026 lines", totalVotes: current.pres24Total };
    const entry = districtId
      ? (houseStatewideResults[districtId] ?? [])
          .filter((e) => e.race === "President" && e.year >= minValidYear && e.year < maxValidYear)
          .sort(byNearestYear(raceYear))[0]
      : undefined;
    if (entry) return { margin: entry.repPct - entry.demPct, year: entry.year, desc: "district presidential result", totalVotes: entry.totalVotes };
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

export function incumbencyPtsFor(raceType: string, incumbent: string, appointed = false): number {
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

export function raceFundraisingFor(
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
export function ffStripPts(money: { dem: number; rep: number } | null): number {
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

// Cash on hand / spending / outside spending / small-dollar share (FEC House/Senate only).
export function raceFinanceDetail2026(raceType: string, raceId: string): RaceFinanceDetail | null {
  for (const key of fundraising2026Keys(raceType, raceId)) {
    if (fundraisingDetails[key]) return fundraisingDetails[key];
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


// ── Helper: incumbent from past result ────────────────────────────────────────

function appointedFromResult(result?: Pick<PastResult, "demIncumbent" | "repIncumbent" | "demAppointed" | "repAppointed">): boolean {
  return !!((result?.demIncumbent && result.demAppointed) || (result?.repIncumbent && result.repAppointed));
}

function incumbentFromResult(result?: Pick<PastResult, "demIncumbent" | "repIncumbent">): string {
  if (result?.demIncumbent) return "D";
  if (result?.repIncumbent) return "R";
  return "Open";
}

// ── The 2026 election (overlay) ───────────────────────────────────────────────
// 2026 is in the model's years from 2026-11-19, on the counts as they stand: the results are not
// certified and are not yet in the *_past_results.csv files every other year is read from, so its
// rows come from lib/tpl2026Inputs.ts (data/generated/tpl-inputs-2026.json). They are treated
// exactly as a past year's rows. Rerun `npm run tpl-inputs-2026` after the results CSVs are
// refreshed; retire the overlay once 2026 is merged into the historical files.

// TPL_NO_2026=1 and TPL_NEUTRAL_ANCHOR=window|house-vote override the two for the harnesses (the
// decomposition of what each 2026-11-19 change moved was measured this way).
const HAS_2026 = G.YEARS.includes(TPL_2026) && process.env.TPL_NO_2026 !== "1";
const neutralAnchor = (process.env.TPL_NEUTRAL_ANCHOR as typeof TPL_NEUTRAL_ANCHOR | undefined) ?? TPL_NEUTRAL_ANCHOR;
const races2026 = (stateAbbr: string, office: Tpl2026Race["office"]): Tpl2026Race[] =>
  HAS_2026 ? tplInputs2026().races.filter((r) => r.abbr === stateAbbr && r.office === office) : [];

/** Corrected chamber margins by year, with the 2026 count added. */
function chamberMarginsOf(stateAbbr: string): Record<number, ChamberMarginYear> {
  const past = getChamberMargins(stateAbbr);
  const now = HAS_2026 ? tplInputs2026().legislature[stateAbbr] : undefined;
  return now ? { ...past, [TPL_2026]: now } : past;
}

/** Base race-type weights for a year: presidential years and every other year have their own set. */
export function raceTypeWeightsFor(year: number): Record<string, number> {
  return year % 4 === 0 ? G.RACE_TYPE_WEIGHTS : G.RACE_TYPE_WEIGHTS_MIDTERM;
}

// ── aggregateYears ────────────────────────────────────────────────────────────
// Shared by the state, district and county models: redistributes race-type weights among
// whichever types are actually present each year, then produces the recency-weighted TPL.
//
// houseAnchor (state and county models): the state's fitted lean, or the county's statewide-rows lean. A state's House rows are NOT
// Huber-weighted individually — a packed D+60 district is not an outlier, it is a district,
// and downweighting it by its distance from the state lean skewed every packed-map state's
// House aggregate toward the party with more middling seats (GA 2024: R+10 vs a turnout-
// weighted R+0.4). The districts sum to the state, so the House year is taken as a turnout-
// weighted mean and the outlier check is applied ONCE to that whole House year: its base
// type weight is multiplied by min(1, HUBER_C / |House NM − lean|) before redistribution
// and coverage, so a delegation-wide result that contradicts the state's lean counts less
// within its year and, through coverage, against the other years.

// TPL_ROW_DISCOUNT=off restores the pre-2026-11-19 behaviour for the harnesses.
const ROW_DISCOUNT_AS_TYPE_FACTOR = process.env.TPL_ROW_DISCOUNT !== "off";

export function houseYearFactor(houseNM: number | null, houseAnchor: number | null | undefined): number {
  if (houseNM == null || houseAnchor == null) return 1;
  const resid = Math.abs(houseNM - houseAnchor);
  return resid <= G.HUBER_C ? 1 : G.HUBER_C / resid;
}

/** checkedTypes: the offices whose whole year gets the outlier check against houseAnchor ("H" everywhere;
 * the legislative-district model, lib/stateLegTpl.ts, also checks its legislature years). */
export function aggregateYears(races: ComputedRace[], houseAnchor?: number | null, checkedTypes: readonly string[] = ["H"]): { yearAggregations: YearAggregation[]; tpl: number } {
  const checked = new Set(checkedTypes);
  const yearAggregations = G.YEARS.map((year) => {
    const yearRaces = races.filter((race) => race.year === year && race.NM != null);
    const typeNMs: Record<string, number | null> = {};
    const typeDiscount: Record<string, number> = {};
    for (const type of ["P", "G", "S", "H", "L"]) {
      const typeRaces = yearRaces.filter((race) => race.raceType === type);
      const typeWeight = typeRaces.reduce((sum, race) => sum + race.aggWeight, 0);
      typeNMs[type] = typeWeight > 0
        ? typeRaces.reduce((sum, race) => sum + race.aggWeight * (race.NM ?? 0), 0) / typeWeight
        : null;
      // What the rows' own discounts (Huber, the imputed half weight) average to, on the rows'
      // turnout shares. A row's weight acts only against other rows of its office that year, and
      // a state-year nearly always has ONE presidential, Senate, governor or legislature row, so
      // until 2026-11-19 those discounts cancelled and an outlier or an imputed race entered at
      // its office's full weight. They now scale the office's weight in the year as well.
      const full = typeRaces.reduce((sum, race) => sum + (race.turnoutWeight ?? 1), 0);
      typeDiscount[type] = full > 0 ? Math.min(1, typeWeight / full) : 1;
    }
    const racesPresent = ["P", "G", "S", "H", "L"].filter((t) => typeNMs[t] != null);
    const typeFactors: Record<string, number> = {};
    for (const type of racesPresent) typeFactors[type] = checked.has(type) ? houseYearFactor(typeNMs[type], houseAnchor) : ROW_DISCOUNT_AS_TYPE_FACTOR ? typeDiscount[type] : 1;
    const W = raceTypeWeightsFor(year);
    const totalBase = racesPresent.reduce((sum, type) => sum + (W[type] ?? 0) * typeFactors[type], 0);
    const redistributedWeights: Record<string, number> = {};
    for (const type of racesPresent) {
      redistributedWeights[type] = ((W[type] ?? 0) * typeFactors[type]) / totalBase;
    }
    const WRS = racesPresent.reduce((sum, type) => sum + redistributedWeights[type] * (typeNMs[type] ?? 0), 0);
    return { year, racesPresent, redistributedWeights, typeNMs, typeFactors, WRS, coverage: totalBase, finalWeight: 0 };
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

/**
 * The lean as it stood after the elections of `maxYear`, under TODAY's model: the same rows,
 * strips, weights and fitted environment, aggregated over the years up to maxYear only. The
 * environment scale (E by year, the neutral point, incumbency) is held at the current fit on
 * purpose, so the difference from the current lean is what the later elections added for this
 * place and nothing else; refitting the scale on the shorter window would add a shift common to
 * every place. Pass the state's fitted lean as houseAnchor for a state model, nothing for a district.
 */
export function leanAsOf(races: ComputedRace[], maxYear: number, houseAnchor?: number | null, checkedTypes: readonly string[] = ["H"]): number | null {
  const rows = races.filter((r) => r.year <= maxYear);
  if (!rows.some((r) => r.NM != null && r.inAggregation)) return null;
  return aggregateYears(rows, houseAnchor, checkedTypes).tpl;
}

// ── getRawMargin ──────────────────────────────────────────────────────────────

export function getRawMargin(
  race: string,
  district: string | undefined,
  year: number,
  stateAbbr: string
): number | null {
  if (year === TPL_2026 && HAS_2026 && !race.startsWith("State Legislature")) {
    const office = district ? "H" : race === "Governor" ? "G" : race === "President" ? null : "S";
    const r = office == null ? undefined : races2026(stateAbbr, office).find((x) => (office === "H" ? x.label === district : office === "S" ? x.special === (race === "Senate Special") : true));
    return r && r.totalVotes > 0 ? r.repPct - r.demPct : null;
  }
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
    const la = laNovemberPartyVote(district, year);
    if (la) return laNovemberMargin(la);
    const dist = houseData.find((r) => r.name === district);
    const e = (dist?.pastResults ?? []).find((r) => r.year === year);
    return e != null ? e.repPct - e.demPct : null;
  }

  if (race === "State Legislature") {
    // The whole chamber: the contested pool (every seat where both major parties drew votes, as
    // a share of the full total vote) plus the unopposed seats and a staggered chamber's seats not
    // up, each estimated as its presidential margin on the lines it was run on plus the gap the
    // contested seats ran from theirs (lib/chamberMargins.ts). Unopposed seats with no gap to use
    // are the separate "State Legislature (unopposed seats)" row. The old chamber aggregate
    // (every counted district summed) survives as `rawMargin`.
    const cm = chamberMarginsOf(stateAbbr)[year];
    return cm ? legRowPool(cm).margin : null;
  }
  if (race === "State Legislature (unopposed seats)") {
    const cm = chamberMarginsOf(stateAbbr)[year];
    return cm ? unopposedPresPool(cm, legUnopposedMode).margin : null;
  }
  if (race === "State Legislature (raw aggregate)") {
    return chamberMarginsOf(stateAbbr)[year]?.rawMargin ?? null;
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
        const la = laNovemberPartyVote(dist.name, r.year);
        stubs.push({ ...makeStub(`House ${dist.name}`, "H", r.year, dist.name, incumbentFromResult(r), historicalMargins, `/house/${dist.name.toLowerCase()}`, la ? laNovemberEligibility(la) : classifyEligibility(r, stateAbbr), la ? undefined : whoOf(r), appointedFromResult(r)), totalVotes: la?.total ?? r.totalVotes });
      }
    }
  }

  // 2026, from the overlay: the same stubs a past year's rows make.
  for (const r of races2026(stateAbbr, "S")) {
    const seatHref = `/senate/${r.id.toLowerCase().replace(/-2$/, "2")}`;
    stubs.push(makeStub(r.special ? "Senate Special" : "Senate", "S", TPL_2026, undefined, r.incumbent, [], seatHref, r.eligibility, r, r.appointed));
  }
  for (const r of races2026(stateAbbr, "G")) {
    stubs.push(makeStub("Governor", "G", TPL_2026, undefined, r.incumbent, [], `/governor/${r.id.toLowerCase()}`, r.eligibility, r, r.appointed));
  }
  for (const r of races2026(stateAbbr, "H")) {
    stubs.push({ ...makeStub(`House ${r.label}`, "H", TPL_2026, r.label, r.incumbent, [], `/house/${r.label.toLowerCase()}`, r.eligibility, r), totalVotes: r.totalVotes });
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
  const chamberMargins = chamberMarginsOf(stateAbbr);
  if (chamberMargins[TPL_2026] && !legYears.includes(TPL_2026)) legYears.push(TPL_2026);

  // One row per year for the whole chamber (contested seats, plus the unopposed and not-up seats
  // estimated from their presidential margin and the contested seats' gap). A second row appears
  // only where unopposed seats have no gap to use: an imputed row at the turnout-weighted
  // presidential margin of those districts, stripping the environment of that presidential year
  // as an imputed House seat does; the two then share the L type weight on their turnout.
  // Ablation for the backtest and the change log: TPL_RAW_LEG=1 restores the pre-2026-10-10
  // single row per year carrying the raw chamber aggregate (every counted district summed).
  const rawLeg = process.env.TPL_RAW_LEG === "1";
  const historicalMargins = Object.values(chamberMargins)
    .filter((y) => y.correctedMargin != null)
    .map((y) => ({ year: y.year, margin: y.correctedMargin! }))
    .sort((a, b) => a.year - b.year);
  for (const year of legYears) {
    const cm = chamberMargins[year];
    if (!cm) continue;
    if (rawLeg) {
      if (cm.rawMargin != null) stubs.push(makeStub("State Legislature (raw aggregate)", "L", year, undefined, "-", historicalMargins, stateHref));
      continue;
    }
    if (cm.contested.margin != null) {
      const row = legRowPool(cm);
      stubs.push({ ...makeStub("State Legislature", "L", year, undefined, "-", historicalMargins, stateHref), totalVotes: row.weight, legPools: { contested: cm.contested.districts, unopposed: row.unopposed, notUp: row.notUp } });
    }
    const rest = unopposedPresPool(cm, legUnopposedMode);
    if (rest.margin != null && rest.srcYear != null) {
      stubs.push({
        ...makeStub("State Legislature (unopposed seats)", "L", year, undefined, "-", historicalMargins, stateHref, "unopposed"),
        totalVotes: rest.weight,
        presetImputation: {
          margin: rest.margin,
          year: rest.srcYear,
          desc: `presidential vote of the ${rest.districts} unopposed district${rest.districts === 1 ? "" : "s"} on the lines they were run on`,
          totalVotes: rest.weight,
        },
      });
    }
  }

  const RACE_TYPE_ORDER: Record<string, number> = { P: 0, G: 1, S: 2, H: 3, L: 4 };
  return stubs.sort((a, b) => {
    const typeOrder = (RACE_TYPE_ORDER[a.raceType] ?? 9) - (RACE_TYPE_ORDER[b.raceType] ?? 9);
    if (typeOrder !== 0) return typeOrder;
    if (a.year !== b.year) return b.year - a.year;
    return a.race.localeCompare(b.race);
  });
}

// ── Environment & incumbency fit ──────────────────────────────────────────────
// Alternating robust least squares over the full eligible race panel (all 50
// states, every office, every model year incl. odd years):
//
//   margin + FF strip  ≈  lean(state) + E(year) + sign(incumbent) × inc(office)
//
// E(y) is the fitted national environment (R-positive), identified from
// within-state changes, so which seats happen to be up cannot skew it, and from
// contested races only, so a missing candidate cannot either. It is the SAME in
// every state: the per-state elasticity β* the model carried until 2026-11-19 was
// removed after the 2026 review (it did not persist between halves of the data,
// did not predict which states swung more in 2026, and scored worse than β = 1
// over six holdout rounds; methodologyChangelog 2026-11-19).
//
// NEUTRAL POINT. lean + E is only identified up to a constant: add c to every E
// and subtract it from every lean and nothing in the fit changes. The fit alone
// therefore puts E = 0 at the average of whatever years are in the window, and
// every lean moved when a wave year entered (adding 2026 moved the median state
// 1.7 pts Democratic). The level is now pinned to a quantity with a meaning:
// E = 0 is the year in which the national U.S. House vote, with every seat
// contested, is tied. E is regressed on that vote over the even years
// (E = c + s × PV, the uncontested-imputed basis of lib/genericBallotPopularVote.ts)
// and c, the E of a tied vote, is subtracted from every E and added to every lean.
//
// inc(office) is the incumbency advantage, estimated for Senate and Governor
// from the incumbent-signed residual against lean + E with the fundraising
// strip already applied, so it is the advantage net of the money incumbents
// raise, and the two terms cannot double-count. House is not estimable against
// a state-level lean (R incumbents sit in R districts) and keeps the fixed value.
// Huber weights (w = min(1, HUBER_C/|residual|)) keep crossover outliers
// (Manchin, Scott, Hogan) from dragging a state's lean or the incumbency
// estimate; those residuals are the raw material for WAR later.

export interface TplFitStateBeta {
  raw: number;
  shrunk: number;
  n: number;
}

export interface TplFitNeutral {
  /** E of a tied every-seat-contested House vote on the fit's own scale; subtracted from every E, added to every lean. */
  shift: number;
  /** Slope of E on that House vote: how many points of E one point of House vote is. */
  slope: number;
  points: { year: number; housePv: number; E: number }[];
}

export interface TplFit {
  E: Record<number, number>;
  /** Every state at 1 since 2026-11-19 (the elasticity was removed). Kept so code written for the 2026 forecast still reads a multiplier. */
  beta: Record<string, TplFitStateBeta>;
  /** Where the level of E and of every lean was pinned (TPL_NEUTRAL_ANCHOR); null when left at the window average. */
  neutral: TplFitNeutral | null;
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
      const margin = getRawMargin(stub.race, stub.district, stub.year, abbr);
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
    rows.push({ abbr: r.abbr, year: r.year, type: r.type, incSign: r.incSign, raw: r.raw, adj: r.raw - stripInc(r), base: (raceTypeWeightsFor(r.year)[r.type] ?? 0.05) / typeCount[r.key], w: 1 });
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
      const res = r.adj - lean[r.abbr] - E[r.year];
      r.w = r.base * (Math.abs(res) <= G.HUBER_C ? 1 : G.HUBER_C / Math.abs(res));
    }
    for (const y of years) {
      const yr = rowsByYear[y] ?? [];
      let num = 0;
      let den = 0;
      for (const r of yr) {
        num += r.w * (r.adj - lean[r.abbr]);
        den += r.w;
      }
      E[y] = den > 0 ? (num / den) * (yr.length / (yr.length + G.SPARSE_YEAR_K)) : 0;
    }
    for (const abbr of Object.keys(lean)) {
      const sr = rowsByState[abbr] ?? [];
      let num = 0;
      let den = 0;
      for (const r of sr) {
        num += r.w * (r.adj - E[r.year]);
        den += r.w;
      }
      if (den > 0) lean[abbr] = num / den;
    }
    // Incumbency per fitted office: weighted regression of the incumbency-free
    // residual on the incumbent sign (±1), i.e. how far incumbent-held races sit
    // from lean + E in the incumbent's direction, Huber-weighted like everything else.
    for (const type of FITTED_INCUMBENCY_OFFICES) {
      let num = 0;
      let den = 0;
      for (const r of rows) {
        if (r.type !== type || r.incSign === 0) continue;
        num += r.w * r.incSign * (r.raw - lean[r.abbr] - E[r.year]);
        den += r.w;
      }
      if (den > 0) inc[type] = num / den;
    }
    for (const r of rows) r.adj = r.raw - stripInc(r);
  }

  // Pin the level (see NEUTRAL POINT above). Needs at least three even years with a House vote.
  let neutral: TplFitNeutral | null = null;
  if (neutralAnchor === "house-vote") {
    const points: TplFitNeutral["points"] = [];
    for (const h of nationalEnvironmentHistory) {
      const pv = h.housePvImputed ?? h.housePv;
      if (pv != null && E[h.year] != null) points.push({ year: h.year, housePv: pv, E: E[h.year] });
    }
    if (HAS_2026 && E[TPL_2026] != null && !points.some((p) => p.year === TPL_2026)) points.push({ year: TPL_2026, housePv: tplInputs2026().housePv.imputed, E: E[TPL_2026] });
    if (points.length >= 3) {
      const mx = points.reduce((a, p) => a + p.housePv, 0) / points.length, my = points.reduce((a, p) => a + p.E, 0) / points.length;
      let sxy = 0, sxx = 0;
      for (const p of points) { sxy += (p.housePv - mx) * (p.E - my); sxx += (p.housePv - mx) ** 2; }
      const slope = sxx > 0 ? sxy / sxx : 1;
      const shift = my - slope * mx;
      for (const y of years) E[y] -= shift;
      for (const abbr of Object.keys(lean)) lean[abbr] += shift;
      neutral = { shift, slope, points: points.map((p) => ({ ...p, E: p.E - shift })) };
    }
  }
  _fitCache = { E, beta, neutral, lean, incumbency: inc, incumbencyN, years, rowsUsed: rows.length };
  return _fitCache;
}

// ── calculateStateModel ───────────────────────────────────────────────────────

export function calculateStateModel(stateAbbr: string, stateName: string): StateModelCalculation {
  const fit = getTplFit();
  const stubs = generateRaceList(stateAbbr, stateName);
  const races: ComputedRace[] = stubs.map((stub) => {
    const rawMargin = getRawMargin(stub.race, stub.district, stub.year, stateAbbr);
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
      ? (stub.presetImputation ?? nearestPresidentialLean(stateAbbr, stub.district, stub.year, minValidYear, maxValidYear))
      : null;
    const imputed = imputation != null;
    const adjustedMargin = ineligible ? (imputation?.margin ?? null) : rawMargin;
    // Imputed rows strip the environment of the SOURCE presidential year — the
    // imputed value inherits that year's national conditions, nothing else.
    const envYear = imputed ? imputation!.year : stub.year;
    const envPts = adjustedMargin == null ? null : -(fit.E[envYear] ?? 0);
    const incumbencyPts = adjustedMargin == null ? null : imputed ? 0 : incumbencyPtsFor(stub.raceType, stub.incumbent, stub.incumbentAppointed);
    const money = imputed ? null : raceFundraisingFor(stub.raceType, stateAbbr, stub.district, stub.race, stub.year);
    const FF_pts = adjustedMargin == null ? null : ffStripPts(money);
    const NM = adjustedMargin != null
      ? adjustedMargin + (incumbencyPts ?? 0) + (FF_pts ?? 0) + (envPts ?? 0)
      : null;
    // Aggregation weight: imputed statewide rows enter at IMPUTED_RACE_WEIGHT, imputed House
    // rows at IMPUTED_HOUSE_ROW_WEIGHT (their share of the state stays whole). Statewide rows are
    // Huber-downweighted by their residual against the state's fitted lean — so a crossover
    // outlier (Manchin, Scott, Hogan) cannot drag the headline TPL either. House rows are
    // not: they are turnout-weighted below (the districts sum to the state), and the House
    // YEAR gets one Huber factor in aggregateYears instead.
    const stateLean = fit.lean[stateAbbr];
    const residual = NM != null && stateLean != null ? NM - stateLean : 0;
    const huberW = stub.raceType === "H" ? 1 : Math.abs(residual) <= G.HUBER_C ? 1 : G.HUBER_C / Math.abs(residual);
    const imputedWeight = stub.raceType === "H" ? IMPUTED_HOUSE_ROW_WEIGHT : stub.raceType === "L" ? IMPUTED_LEG_ROW_WEIGHT : IMPUTED_RACE_WEIGHT;
    const aggWeight = (imputed ? imputedWeight : 1) * huberW;
    // Turnout behind a House row: the race's own total vote, or for an imputed row the
    // source presidential result's (an uncontested seat's depressed House turnout says
    // nothing about its share of the state).
    const totalVotes = stub.raceType === "H" || stub.raceType === "L" ? (imputed ? imputation?.totalVotes : stub.totalVotes) : undefined;
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
      turnoutWeight: totalVotes,
      NM,
      inAggregation,
    };
  });

  // House turnout weights: total votes relative to the state-year's mean House turnout, so
  // a row's weight reads as "this district's share of the state's House vote" (mean 1) and
  // a row with no vote count enters at that mean.
  // The State Legislature's two rows per year (contested pool, unopposed pool) are weighted the
  // same way, so the unopposed seats enter at their share of the chamber's electorate.
  for (const type of ["H", "L"] as const) for (const year of new Set(races.filter((r) => r.raceType === type).map((r) => r.year))) {
    const rows = races.filter((r) => r.raceType === type && r.year === year);
    const known = rows.filter((r) => (r.turnoutWeight ?? 0) > 0);
    const meanVotes = known.length > 0 ? known.reduce((a, r) => a + r.turnoutWeight!, 0) / known.length : 0;
    for (const r of rows) {
      r.turnoutWeight = meanVotes > 0 && (r.turnoutWeight ?? 0) > 0 ? r.turnoutWeight! / meanVotes : 1;
      r.aggWeight *= r.turnoutWeight;
    }
  }

  const { yearAggregations, tpl } = aggregateYears(races, fit.lean[stateAbbr]);

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
    const envPts = -(fit.E[year] ?? 0);
    rows.push({
      race: "President", raceType: "P", year, eligibility: "eligible", incumbent: "-",
      historicalMargins: [], rawMargin: margin, adjustedMargin: margin,
      incumbencyPts: 0, FF_pts: 0, ffDetail: null,
      imputed: false, imputedSourceYear: null, imputedSourceDesc: null,
      minValidYear: eraStart, envPts, aggWeight: 1, NM: margin + envPts, inAggregation: true,
    });
  }
  type HouseResult = { year: number; margin: number; incumbent: string; who: { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string } };
  const houseResults: HouseResult[] = [];
  for (const r of houseRace?.pastResults ?? []) {
    if (r.year < 2016 || r.year > 2025) continue;
    const la = laNovemberPartyVote(houseRace?.name, r.year);
    if ((la ? laNovemberEligibility(la) : classifyEligibility(r, stateAbbr)) !== "eligible") continue;
    const x = r as PastResult & { demCandidate?: string; repCandidate?: string; demParty?: string; repParty?: string };
    houseResults.push({ year: r.year, margin: la ? laNovemberMargin(la) : r.repPct - r.demPct, incumbent: incumbentFromResult(r), who: { demCandidate: x.demCandidate, repCandidate: x.repCandidate, demParty: x.demParty, repParty: x.repParty } });
  }
  // 2026 was run on today's lines, so it needs no relocation (boundaryStripFor returns 0).
  for (const r of houseRace ? races2026(stateAbbr, "H") : []) {
    if (r.districtId !== districtId || r.eligibility !== "eligible") continue;
    houseResults.push({ year: TPL_2026, margin: r.repPct - r.demPct, incumbent: r.incumbent, who: r });
  }
  for (const r of houseResults) {
    const incumbencyPts = incumbencyPtsFor("H", r.incumbent);
    const money = raceFundraisingFor("H", stateAbbr, houseRace!.name, "House", r.year);
    const FF_pts = ffStripPts(money);
    const envPts = -(fit.E[r.year] ?? 0);
    const { BS_pts, shift, weight } = boundaryStripFor(districtId, r.year, d);
    rows.push({
      race: `House ${houseRace!.name}`, raceType: "H", district: houseRace!.name, year: r.year,
      eligibility: "eligible", incumbent: r.incumbent,
      demCandidate: r.who.demCandidate, repCandidate: r.who.repCandidate, demParty: r.who.demParty, repParty: r.who.repParty,
      historicalMargins: [], rawMargin: r.margin, adjustedMargin: r.margin,
      incumbencyPts, FF_pts, ffDetail: money,
      imputed: false, imputedSourceYear: null, imputedSourceDesc: null,
      minValidYear: eraStart, envPts, aggWeight: 1,
      BS_pts, boundaryShift: shift, boundaryWeight: weight,
      NM: r.margin + incumbencyPts + FF_pts + BS_pts + envPts, inAggregation: true,
    });
  }

  // No row-level weights. A district-year holds one presidential row and at most one House row,
  // and the year's value is a mean WITHIN each office before the offices are blended, so a weight
  // on a single row cancels and never reaches the number. Until 2026-11-19 this function computed
  // a Huber factor and the boundary weight per row anyway and the documentation described them as
  // active; they never were. Tested on 2026 (scripts/tplReview2026.ts): applying them as described
  // scored worse than leaving them out (4.56 against 4.50), so they were removed, not repaired.
  // boundaryWeight stays on the row: the candidate table (WAR) uses it, and there it does act.
  const { yearAggregations, tpl } = aggregateYears(rows);
  return { races: rows, yearAggregations, tpl, stateAbbr, eraStart };
}

// ── County TPL ────────────────────────────────────────────────────────────────
// Reuses the exact same per-race pipeline as the state model (eligibility + imputation,
// incumbency / fundraising / environment strips, year aggregation — via the shared helpers
// above), so a change to the State TPL formula automatically applies here too. Only the
// inputs differ (specification: /analysis/internal-methodology/county-tpl):
// - President/Senate/Governor are genuinely the same statewide race, just measured at
//   county granularity, so the incumbent, appointed flag and receipts are inherited from the
//   parent state's race list — but raw margins and the presidential result used for
//   imputation are the county's own, so County TPL updates whenever county data changes.
// - House: county data is a same-year aggregate across every district touching the county
//   (see data/countyHouseData.ts). Since 2026-11-27 each contested district's piece takes out
//   its own race's incumbency and money, weighted by the piece's share of the county's House
//   vote (countyHouseTerms, COUNTY_HOUSE_STRIPS); before, a House row carried no terms. A year is
//   ineligible (imputed) only when one party drew no votes in the county (countyHouseEligibility).
// - The environment strip is the national E(year), as for a state; no county term is estimated.
// - 2026 rows come from the overlay's county counts (county2026), on the counts as they stand.
// - No row-level Huber: a county far from its STATE's lean is not an outlier, it is a county.
//   But each House year is Huber-checked as a whole against the county's OWN statewide lean
//   (P/S/G rows aggregated alone): the year's base weight × min(1, HUBER_C / |House NM − that
//   lean|), as the state model does against its fitted lean. A county's House vote is the
//   local candidates' as much as the county's — Cuellar won Zapata TX by D+34 in 2024 as Trump
//   carried it by R+22 — and with no incumbency strip possible (above) that gap entered at full
//   House weight, pulling every border county's lean 10–30 pts off its statewide record.

// A "Senate Special" row must read countySenateData's specialYears bucket, not `years`:
// the two live in sibling maps whenever a state held a separate special (MN/MS 2018,
// GA 2020, OK 2022, NE 2024) and in specialYears alone when the special was the only
// Senate race that cycle (AZ 2020). Reading `years` for a special row therefore either
// found nothing (AZ 2020 — a blank Senate row on every AZ county) or silently returned
// the REGULAR race's margin, duplicating it onto both of that year's Senate rows.
// Governor needs no equivalent split: governor specials (OR 2016) are named plain
// "Governor" by generateRaceList and countyGovernorData stores them in `years`.
// 2026 by county, from the overlay (data/generated/tpl-inputs-2026.json `counties`): the county
// data files stop at 2025 until 2026 is certified and merged into them. Counts are as they stand,
// and a county the results files have no row for gets no 2026 row.
function county2026(fips: string, office: "S" | "SS" | "G" | "H"): CountyYearResult | undefined {
  const v = HAS_2026 ? tplInputs2026().counties?.[fips]?.[office] : undefined;
  if (!v || v[2] <= 0) return undefined;
  const [demVotes, repVotes, totalVotes] = v;
  const demPct = +((demVotes / totalVotes) * 100).toFixed(2), repPct = +((repVotes / totalVotes) * 100).toFixed(2);
  return { demVotes, repVotes, othVotes: totalVotes - demVotes - repVotes, totalVotes, demPct, repPct, margin: +(repPct - demPct).toFixed(2), districts: [] };
}

function getCountyHistoricalMargins(race: string, fips: string): { year: number; margin: number }[] {
  const now =
    race === "Senate Special" ? county2026(fips, "SS")
    : race === "Senate" ? county2026(fips, "S")
    : race === "Governor" ? county2026(fips, "G")
    : undefined;
  const years =
    race === "President" ? countyPresidentialData[fips]?.years
    : race === "Senate Special" ? countySenateData[fips]?.specialYears
    : race === "Senate" ? countySenateData[fips]?.years
    : race === "Governor" ? countyGovernorData[fips]?.years
    : undefined;
  const out: { year: number; margin: number }[] = [];
  for (const [year, result] of Object.entries(years ?? {})) {
    if (result) out.push({ year: Number(year), margin: result.margin });
  }
  if (now && !out.some((m) => m.year === TPL_2026)) out.push({ year: TPL_2026, margin: now.margin });
  return out;
}

function getCountyNearestPresidential(fips: string, raceYear: number): ImputedLean | null {
  const entry = getCountyHistoricalMargins("President", fips).sort(byNearestYear(raceYear))[0];
  return entry ? { margin: entry.margin, year: entry.year, desc: "county presidential result" } : null;
}

// A county House year is a D-vs-R measurement only when both parties drew votes there. An
// unopposed race (votesKnown false — the 100/0 placeholder — or a counted race with one side
// at zero, e.g. Allen Parish LA 2024) is imputed like an uncontested seat in the state and
// district models, instead of entering as a ±100 margin. A county split between a contested
// and an unopposed district still reads as eligible: the aggregate carries no per-district
// breakdown to separate them. 2026 has the breakdown: its row sums only the districts the state
// model counts as D-vs-R races, and a county with none is marked in the overlay
// (countyHouseIneligible; scripts/buildTplInputs2026.ts).
function countyHouseEligibility(r: CountyYearResult): RaceEligibility {
  if (r.votesKnown === false) return r.margin > 0 ? "no-dem" : "no-rep";
  if (r.samePartyNote && (r.demVotes <= 0 || r.repVotes <= 0)) return "same-party";
  if (r.demVotes <= 0) return "no-dem";
  if (r.repVotes <= 0) return "no-rep";
  return "eligible";
}

function generateCountyRaceList(fips: string, stateAbbr: string, stateName: string): RaceStub[] {
  const statewideStubs: RaceStub[] = generateRaceList(stateAbbr, stateName)
    .filter((stub) => stub.raceType === "P" || stub.raceType === "S" || stub.raceType === "G")
    .map((stub) => ({ ...stub, historicalMargins: getCountyHistoricalMargins(stub.race, fips) }))
    // A 2026 statewide race enters only where the county has a 2026 count for it (county2026):
    // without one, an ineligible race would enter as a bare imputed presidential row.
    .filter((stub) => stub.year !== TPL_2026 || stub.historicalMargins.some((m) => m.year === TPL_2026));

  const house2026 = county2026(fips, "H");
  const houseYears: Partial<Record<number, CountyYearResult>> | undefined = house2026
    ? { ...countyHouseData[fips]?.years, [TPL_2026]: house2026 }
    : countyHouseData[fips]?.years;
  const houseHistoricalMargins: { year: number; margin: number }[] = [];
  const houseEligibility = new Map<number, RaceEligibility>();
  if (houseYears) {
    for (const [year, result] of Object.entries(houseYears)) {
      if (!result) continue;
      houseHistoricalMargins.push({ year: Number(year), margin: result.margin });
      const cls2026 = Number(year) === TPL_2026 && house2026 ? tplInputs2026().countyHouseIneligible?.[fips] : undefined;
      houseEligibility.set(Number(year), cls2026 ?? countyHouseEligibility(result));
    }
  }
  const houseStubs: RaceStub[] = houseHistoricalMargins
    .filter((m) => m.year >= 2016)
    .map((m) => ({
      race: "House",
      raceType: "H",
      year: m.year,
      eligibility: houseEligibility.get(m.year) ?? "eligible",
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

/**
 * County TPL's U.S. House candidate terms (adopted 2026-11-27, user decision after the test). A county's House row adds
 * up every district touching it; each contested district's piece takes out that race's incumbency (incumbencyPtsFor
 * "H") and money (ffStripPts), weighted by the piece's share of the county's House vote
 * (data-entry/house_district_county_results*.csv). scripts/countyTplValidation.ts: mean leftover 3.547 → 3.446 by
 * county, 3.984 → 3.906 vote-weighted (better in 2018–2024; 2026 vote-weighted 4.04 → 4.34). Off = the original rule.
 */
export const COUNTY_HOUSE_STRIPS = true;
let countyHouseStripsOverride: boolean | null = null;
/** For the harnesses (scripts/countyTplValidation.ts): force the variant on or off; null = COUNTY_HOUSE_STRIPS. */
export function setCountyHouseStrips(on: boolean | null): void { countyHouseStripsOverride = on; }

/** The House row's terms for one county-year, or null when the county has no district breakdown that year. */
function countyHouseTerms(fips: string, stateAbbr: string, year: number): { incumbencyPts: number; FF_pts: number } | null {
  const pieces = countyHousePieces(fips, year);
  const total = pieces.reduce((a, p) => a + p.total, 0);
  if (!pieces.length || total <= 0) return null;
  let incumbencyPts = 0, FF_pts = 0;
  for (const p of pieces) {
    const info = houseSeatInfo(stateAbbr, year, p.district);
    if (!info) continue;
    // A district without a Democrat against a Republican above write-in scale carries no candidate terms.
    const t = info.total || info.dVotes + info.rVotes;
    const dp = t > 0 ? (info.dVotes / t) * 100 : 0, rp = t > 0 ? (info.rVotes / t) * 100 : 0;
    const wi = (own: number, other: number) => own < 5 && (other >= 90 || own < 2);
    if (dp <= 0 || rp <= 0 || wi(dp, rp) || wi(rp, dp)) continue;
    const share = p.total / total;
    incumbencyPts += share * incumbencyPtsFor("H", info.incumbent);
    FF_pts += share * ffStripPts(raceFundraisingFor("H", stateAbbr, info.name, "House", year));
  }
  return { incumbencyPts, FF_pts };
}

export function calculateCountyModel(fips: string): StateModelCalculation | null {
  const county = countyPresidentialData[fips];
  if (!county) return null;
  const stateAbbr = county.state;
  const stateName = FIPS_TO_STATE[fips.slice(0, 2)]?.name ?? stateAbbr;
  const fit = getTplFit();
  const stubs = generateCountyRaceList(fips, stateAbbr, stateName);

  const races: ComputedRace[] = stubs.map((stub) => {
    const rawMargin = stub.historicalMargins.find((m) => m.year === stub.year)?.margin ?? null;
    const inAggregation = stub.year in G.YEAR_WEIGHTS;
    const ineligible = stub.eligibility !== "eligible";
    const imputation = ineligible ? getCountyNearestPresidential(fips, stub.year) : null;
    const imputed = imputation != null;
    const adjustedMargin = ineligible ? (imputation?.margin ?? null) : rawMargin;
    const envYear = imputed ? imputation!.year : stub.year;
    const envPts = adjustedMargin == null ? null : -(fit.E[envYear] ?? 0);
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

  if (countyHouseStripsOverride ?? COUNTY_HOUSE_STRIPS) {
    for (const r of races) {
      if (r.raceType !== "H" || r.imputed || r.NM == null) continue;
      const t = countyHouseTerms(fips, stateAbbr, r.year);
      if (!t) continue;
      r.incumbencyPts = t.incumbencyPts;
      r.FF_pts = t.FF_pts;
      r.NM += t.incumbencyPts + t.FF_pts;
    }
  }

  // Two passes: the county's lean from its statewide rows alone anchors the House years' Huber
  // check (see the County TPL note above); a county with no statewide rows keeps them unchecked.
  const { yearAggregations, tpl } = aggregateYears(races, countyHouseAnchor(races));
  return { races, yearAggregations, tpl };
}

/** The lean a county's House years are checked against: its President, Senate and Governor rows
 * aggregated alone (null with no statewide rows). Also the houseAnchor to pass leanAsOf for a county. */
export function countyHouseAnchor(races: ComputedRace[]): number | null {
  const statewide = races.filter((race) => race.raceType !== "H" && race.NM != null);
  return statewide.length > 0 ? aggregateYears(statewide).tpl : null;
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
// margin with weight w = min(POLL_W_MAX, nEff / (nEff + POLL_K[office])): a race with no polls is the
// model alone; one fresh poll gives a Senate race 25% polling, a House or Governor race 33%;
// no number of polls takes more than POLL_W_MAX from the model.
export interface RacePolling {
  avg: RacePollAverage | null;
  weight: number;
  key: string;
  /** R-positive pts added to avg.diff in the blend: POLL_MISS_SHRINK × POLL_MISS_HISTORICAL[office] (0 without polls). */
  shade: number;
}

/** The race-poll miss shade for an office (R-positive pts), applied to the poll average in the blend. */
export function pollMissShade(office: "H" | "S" | "G"): number {
  return F.POLL_MISS_SHRINK * (F.POLL_MISS_HISTORICAL[office] ?? 0);
}

export function racePollLabel(race: { raceType: string; name: string; electionType?: string }): string {
  if (race.raceType === "house") return `House ${race.name}`;
  if (race.raceType === "governor") return "Governor";
  return race.electionType?.toLowerCase() === "special" ? "Senate Special" : "Senate";
}

export function racePollingFor(race: { id: string; state: string; raceType: string; name: string; electionType?: string }, asOf: Date = forecastNow()): RacePolling {
  const office = race.raceType === "house" ? "H" : race.raceType === "senate" ? "S" : "G";
  const stateAbbr = race.raceType === "house" ? statesData.find((s) => s.name === race.state)?.abbr ?? "" : race.id.replace(/-\d+$/, "");
  const key = racePollKey(office, stateAbbr, racePollLabel(race));
  // Older polls are aged by the generic ballot's movement since their field date, through β*.
  const aging = pollAgingShift(liveGenericBallotSeries(), getTplFit().beta[stateAbbr]?.shrunk ?? 1, asOf);
  // …and read net of their pollster's lean relative to the field this cycle.
  const house = F.HOUSE_EFFECTS ? liveHouseEffects(asOf).of : undefined;
  const avg = getRacePollAverage(office, stateAbbr, racePollLabel(race), asOf, aging, house, F.POLL_HALF_LIFE_DAYS[office]);
  return { avg, weight: avg ? pollWeight(avg.nEff, office) : 0, key, shade: avg ? pollMissShade(office) : 0 };
}

// This cycle's pollster house effects, from every polled race (aged margins), per as-of day.
const houseEffectsCache = new Map<string, HouseEffects>();
export function liveHouseEffects(asOf: Date = forecastNow()): HouseEffects {
  const day = asOf.toISOString().slice(0, 10);
  let effects = houseEffectsCache.get(day);
  if (!effects) {
    const series = liveGenericBallotSeries(), beta = getTplFit().beta;
    const races = Object.entries(racePolls).map(([key, polls]) => ({ polls: polls.map((p) => allocateUndecided(p)), shiftFor: pollAgingShift(series, beta[key.split(":")[1]]?.shrunk ?? 1, asOf) }));
    effects = computeHouseEffects(races, asOf);
    houseEffectsCache.set(day, effects);
  }
  return effects;
}

let gbSeriesCache: ReturnType<typeof genericBallotSeries> | null = null;
function liveGenericBallotSeries() {
  return (gbSeriesCache ??= genericBallotSeries());
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

  // Candidate quality: the nominees' ridge track-record effects (Phase 4).
  const qualityPts = candidateQuality(race).pts;
  // Live 2026 fundraising points (additive, capped — same computeFundraisingPts the
  // backward model strips with); see raceMoneyTerm for the missing-receipts rule.
  const preMoney = preMoneyMargin(race, incumbentPts);
  const ffPts = raceMoneyTerm(race).pts;
  // Competitive-seat incumbency rides on top; the money term's structural gap keeps the plain
  // incumbency, as in the backtest that fitted both.
  const compIncPts = shortType ? competitiveIncumbencyPts(shortType, incumbentParty, preMoney - incumbentPts, incumbentCandidate?.appointed ?? false) : 0;
  const structuralMargin = preMoney + compIncPts + ffPts + qualityPts;

  const polling = racePollingFor(race);
  // The poll average enters the blend shaded by half its office's historical final-poll miss (POLL_MISS_SHRINK).
  const blended = polling.avg ? (1 - polling.weight) * structuralMargin + polling.weight * (polling.avg.diff + polling.shade) : structuralMargin;
  // A projection must name a leader. The exact margin decides it (pages show one decimal, so a
  // near-tie reads "D+0.0" / "R+0.0"); should the blend ever land on exactly 0, the side comes
  // from the model margin, then the poll average, then the seat's pre-money lean.
  const tieBreak = structuralMargin || polling.avg?.diff || preMoney || 1;
  const margin = blended !== 0 ? blended : Math.sign(tieBreak) * 1e-6;
  return { model: structuralMargin, polling, margin };
}

// Lean + environment + incumbency: the forward margin before money, candidates and polls —
// the `base` regressor of the structural money model (see WarMoneyModel).
function preMoneyMargin(race: ProjectedMarginInput, incumbentPts: number): number {
  if (race.raceType === "house") {
    const stateAbbr = statesData.find((s) => s.name === race.state)?.abbr ?? "";
    return calculateDistrictTpl(race.id) + effectiveEnvironment(stateAbbr, "H") + incumbentPts;
  }
  // senate/governor: id may have a numeric suffix (e.g. "DE-2"); strip it to get state abbr
  const stateAbbr = race.id.replace(/-\d+$/, "");
  return calculateStateTpl(stateAbbr, race.state) + effectiveEnvironment(stateAbbr) + incumbentPts;
}

/** The forward model's money term for a 2026 race. */
export interface RaceMoneyTerm {
  pts: number;                     // R-positive points in the projection (0 where a side's receipts are unknown)
  known: boolean;                  // both nominees' receipts on file
  gapPct: number | null;           // (R$ − D$)/(R$ + D$) × 100 as filed (cycle to date)
  structuralGapPct: number | null; // the gap% a generic pair in this situation would have (null: no model for the office)
  residualGapPct: number | null;   // PARTIAL_CYCLE_GAP_SCALE × gapPct − structuralGapPct: what the points are paid on
}

// R-positive points of a money gap under FORECAST_CONSTANTS.MONEY_BASIS (Phase 6 of the
// forecast revamp; the backtest behind it is summarised beside the constants). Shared by
// the forward term and by the full-money expected margins behind the candidate effects.
//   residual: clamp(MONEY_K × (gap% − structural gap%), ±MONEY_CAP)
//   raw:      clamp(FF_K × gap%, ±FF_MAX)   — the backward strip's rule
export function moneyPtsFor(office: string, gapPct: number, structuralGapPct: number | null): number {
  if (F.MONEY_BASIS === "raw") return Math.max(-FF_MAX, Math.min(FF_MAX, FF_K * gapPct));
  const o = office as "H" | "S" | "G";
  const k = F.MONEY_K[o] ?? 0, cap = F.MONEY_CAP[o] ?? 0;
  return Math.max(-cap, Math.min(cap, k * (gapPct - (structuralGapPct ?? 0))));
}

/** The structural money gap% for a race with this incumbency sign and pre-money margin (null: office has no model). */
export function structuralMoneyGap(office: string, incSign: number, preMoneyMargin: number): number | null {
  const m = getWarMoneyModel()[office];
  return m && m.n >= 5 ? Math.max(-100, Math.min(100, m.intercept + m.incSign * incSign + m.base * preMoneyMargin)) : null;
}

// A race with a side's receipts unknown scores 0. Under the residual basis that is a
// statement, not a gap in the data: it assumes the typical money gap for the situation.
export function raceMoneyTerm(race: ProjectedMarginInput): RaceMoneyTerm {
  const shortType = ({ house: "H", senate: "S", governor: "G" } as Record<string, "H" | "S" | "G">)[race.raceType];
  const incumbentCandidate = race.candidates ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null : null;
  const incumbentParty = incumbentCandidate ? alignedParty(incumbentCandidate) : null;
  let structuralGapPct: number | null = null;
  if (shortType) {
    const base = preMoneyMargin(race, computeIncumbentPts(shortType, incumbentParty, incumbentCandidate?.appointed ?? false));
    structuralGapPct = structuralMoneyGap(shortType, incumbentParty === "R" ? 1 : incumbentParty === "D" ? -1 : 0, base);
  }
  const money = raceFundraising2026(race.raceType, race.id);
  if (!money || !shortType || money.dem + money.rep <= 0) return { pts: 0, known: false, gapPct: null, structuralGapPct, residualGapPct: null };
  const gapPct = ((money.rep - money.dem) / (money.rep + money.dem)) * 100;
  // The live cycle's receipts are a mid-September snapshot; past cycles are full-cycle.
  const scaled = F.PARTIAL_CYCLE_GAP_SCALE[shortType] * gapPct;
  return { pts: moneyPtsFor(shortType, scaled, structuralGapPct), known: true, gapPct, structuralGapPct, residualGapPct: scaled - (structuralGapPct ?? 0) };
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
//   σ_E     = sqrt( NATIONAL_SIGMA_STRUCTURAL² + (|s| × sqrt(sd(miss)² + (horizon × sd(drift))²))² )
//   race environment term = β*(state) × E_hat                      (Senate, Governor)
//                         = β*(state) × E_hat × HOUSE_ENV_MULTIPLIER   (House; 1/s = the House-vote scale)
//   σ_E,House = sqrt( NATIONAL_SIGMA_STRUCTURAL² + (HOUSE_ENV_MULTIPLIER × |s| × GB error)² )
// The structural part of σ_E (2026-10-23) is the shared error the forecast carries even with
// the House vote known — see the constant's comment in data/tplModelData.ts.

export const ELECTION_DATE = new Date(Date.UTC(2026, 10, 3));

export interface EnvironmentModel {
  c: number; s: number; pv0: number; // E = c + s × PV; pv0 = the House vote at which E = 0
  meanMiss: number; sdMiss: number;  // PV − final generic ballot (R-positive)
  sdDrift: number;                   // final − mid-September generic ballot, RMS around zero
  years: number[];
}

const envMean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
/** The House vote the environment model is fitted against: official total or uncontested-seats-imputed (ENV_PV_BASIS). */
export function housePvOnBasis(r: { housePv: number | null; housePvImputed: number | null }, basis: "raw" | "imputed" = F.ENV_PV_BASIS): number {
  return basis === "imputed" ? (r.housePvImputed ?? r.housePv ?? 0) : (r.housePv ?? 0);
}
let environmentModelCache: EnvironmentModel | null = null;

export function getEnvironmentModel(): EnvironmentModel {
  if (environmentModelCache) return environmentModelCache;
  const E = getTplFit().E;
  const rows = nationalEnvironmentHistory.filter((r) => E[r.year] != null && r.housePv != null && r.gbFinal != null && r.gbMidSept != null);
  const xs = rows.map((r) => housePvOnBasis(r)), ys = rows.map((r) => E[r.year]);
  const mx = envMean(xs), my = envMean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const s = sxx > 0 ? sxy / sxx : 1;
  const c = my - s * mx;
  const miss = rows.map((r) => housePvOnBasis(r) - r.gbFinal!);
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
  sigmaEHouse: number;    // the same error with the generic-ballot part × HOUSE_ENV_MULTIPLIER (= sigmaE at 1)
  daysToElection: number;
  horizon: number;        // days to election / mid-September horizon, capped at 1.5
}

// Per as-of day: the live forecast reads today's entry, forecastAsOf a past day's.
const nationalEnvironmentCache = new Map<string, NationalEnvironment>();
export function getNationalEnvironment(asOf: Date = forecastNow()): NationalEnvironment {
  const day = asOf.toISOString().slice(0, 10);
  const cached = nationalEnvironmentCache.get(day);
  if (cached) return cached;
  const m = getEnvironmentModel();
  const gb = computeGenericBallotAverage(asOf).diff;
  const pvHat = gb + F.ENV_MISS_SHRINK * m.meanMiss;
  const daysToElection = Math.max(0, (ELECTION_DATE.getTime() - asOf.getTime()) / 86400000);
  const horizon = Math.min(1.5, daysToElection / F.ENV_DAYS_MID_SEPT_TO_ELECTION);
  const sigmaPv = Math.sqrt(m.sdMiss ** 2 + (horizon * m.sdDrift) ** 2);
  const sigmaE = Math.hypot(F.NATIONAL_SIGMA_STRUCTURAL, Math.abs(m.s) * sigmaPv);
  const env = { gb, pvHat, eHat: m.c + m.s * pvHat, sigmaE, sigmaEHouse: Math.hypot(F.NATIONAL_SIGMA_STRUCTURAL, F.HOUSE_ENV_MULTIPLIER * Math.abs(m.s) * sigmaPv), daysToElection, horizon };
  nationalEnvironmentCache.set(day, env);
  return env;
}

// Scale on the environment term by office: 1 for Senate and Governor; HOUSE_ENV_MULTIPLIER for the
// House (1 = the shared E scale; 1/s would be the House-vote swing itself).
export function envScaleFor(office?: "H" | "S" | "G"): number {
  return office === "H" ? F.HOUSE_ENV_MULTIPLIER : 1;
}

// The shared national error an office's races carry: σ_E on the E scale, or the House-vote scale for the House.
export function nationalSigmaFor(office?: "H" | "S" | "G"): number {
  const env = getNationalEnvironment();
  return office === "H" ? env.sigmaEHouse : env.sigmaE;
}

// The environment points a race receives: β*(state) × E_hat × envScaleFor(office).
export function effectiveEnvironment(stateAbbr: string, office?: "H" | "S" | "G"): number {
  return getNationalEnvironment().eHat * envScaleFor(office) * (getTplFit().beta[stateAbbr]?.shrunk ?? 1);
}

// ── Forecast uncertainty (Phase 3 of the forecast revamp) ────────────────────
// error = β*(state) × national shock (σ_E, shared by every race)  +  race noise
// (RACE_SIGMA per office). Probability is the normal tail of that total spread.

// pollWeight = the poll average's share of the margin (0 without polls): the race-level
// noise is the blend of the model's and the poll average's independent errors, while
// the national shock applies to both (polls miss nationally too).
// raceMult widens the race's own error (not the national shock): THREE_WAY_SIGMA_MULT in a three-way race.
export function raceSigma(raceType: "H" | "S" | "G", stateAbbr: string, pollWeight = 0, raceMult = 1): number {
  const beta = getTplFit().beta[stateAbbr]?.shrunk ?? 1;
  const w = pollWeight;
  return Math.sqrt((beta * nationalSigmaFor(raceType)) ** 2 + (raceMult * (1 - w) * F.RACE_SIGMA[raceType]) ** 2 + (raceMult * w * F.POLL_SIGMA[raceType]) ** 2);
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
    // Full-money expected margin on the forward model's money basis (moneyPtsFor); unknown receipts → 0.
    const ffPts = p.withMoney && p.gap != null ? moneyPtsFor(p.office, p.gap, structuralMoneyGap(p.office, p.incSign, p.base)) : 0;
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
// value because the state-level fit cannot tell House incumbency from district
// lean. incumbentAdvantage() is the single table both directions use.
//
// The House 3 is no longer only a prior: forwardBacktest --seat-status (2026-09-21) sweeps it
// through the district-lean strip, the candidate effects and the forward term together —
// pooled House MAE 0 → 4.87 · 2 → 4.59 · 2.5 → 4.58 · 3 → 4.58 · 3.5 → 4.60 · 4 → 4.64 · 5 → 4.81,
// the same optimum in 2022 and 2024. The same run tested the two Phase 7 seat-status terms and
// adopted NEITHER (leave-one-year-out, year fixed effects):
//   open-seat carryover  (pts toward the outgoing holder's party): Senate −0.4 ± 1.2, House
//     −1.1 ± 0.8, Governor −4.2 but −0.7…−6.4 across folds — the sign is a retirement SLUMP,
//     not a carryover, and out of sample it moves MAE S 5.05 → 5.08, G 8.91 → 9.08, H 4.58 → 4.56.
//   freshman effect (first-term incumbents vs the office's incumbency): Senate −0.9 ± 1.0,
//     House −1.0 ± 0.7 (freshman − veteran −0.35 ± 0.73), Governor +4.4 driven by 2018, when
//     Baker / Hogan / Scott had no record on file; out of sample S 5.09, G 8.99, H 4.58 — no gain.
// Dropping the candidate-quality term does not change either finding.

export const FITTED_INCUMBENCY_OFFICES = ["S", "G"] as const;
export const INCUMBENT_ADVANTAGE_FIXED: Record<string, number> = { H: 3 };

export function incumbentAdvantage(): Record<string, number> {
  return getTplFit().incumbency;
}

/** Extra incumbency in a competitive seat (FORECAST_CONSTANTS.COMPETITIVE_INCUMBENCY): R-positive
 *  sign × K × max(0, 1 − |pre-incumbency margin| / width), the pre-incumbency margin being the
 *  seat's TPL + environment. 0 for an open seat, an appointed incumbent, or an office with K 0. */
export function competitiveIncumbencyPts(raceType: "H" | "S" | "G", incumbentParty: "D" | "R" | null, preIncumbencyMargin: number, appointed = false): number {
  const k = F.COMPETITIVE_INCUMBENCY[raceType] ?? 0;
  if (!incumbentParty || appointed || k === 0) return 0;
  const pts = k * Math.max(0, 1 - Math.abs(preIncumbencyMargin) / F.COMPETITIVE_INCUMBENCY_WIDTH);
  return incumbentParty === "R" ? pts : -pts;
}

/** All incumbency points of a 2026 race as the forecast adds them: the office's advantage plus the
 *  competitive-seat extra. What race pages show on the Incumbent row. */
export function raceIncumbencyPts(race: ProjectedMarginInput): number {
  const shortType = ({ house: "H", senate: "S", governor: "G" } as Record<string, "H" | "S" | "G">)[race.raceType];
  if (!shortType) return 0;
  const inc = race.candidates ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null : null;
  const party = inc ? alignedParty(inc) : null;
  const appointed = inc?.appointed ?? false;
  return computeIncumbentPts(shortType, party, appointed) + competitiveIncumbencyPts(shortType, party, preMoneyMargin(race, 0), appointed);
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
  expected: number; // R-positive expected margin: baseline + incumbency + structural money (generic v generic)
  /** The state's (House row: the district's) own vote that year with this race left out (R-positive,
   *  incumbency and money removed from every race, nothing removed for the national environment).
   *  null where nothing else was on the ballot or the district has no figure. */
  generic: number | null;
  /** 0–1: how much of the baseline is `generic`; the rest is `leanBaseline`. */
  genericWeight: number;
  /** House rows: points (R-positive) added to Expected for how the state's other House races ran
   *  against their own districts' baselines that year. 0 on a statewide row. */
  houseOthers: number;
  /** lean + trend (+ shift) + E(year): the modelled baseline, used alone until 2026-11-23 and now
   *  the fallback for a thin ballot. */
  leanBaseline: number;
  moneyGapPct: number | null; // (R$ − D$)/(R$ + D$) × 100 where both receipts are known
  structuralGapPct: number;   // the money gap a generic pair in this situation would have (see WarMoneyModel)
  ffStructuralPts: number;    // R-positive pts of that structural gap in `expected` (FF_K × structural, capped ±FF_MAX)
  residual: number; // actual − expected, signed toward this candidate (the race's net two-candidate effect)
  /** The candidate's RECORD going into the race: their strength in their OTHER races, recency-weighted
   *  and shrunk (0 for a first race), signed toward them. WAR = record + share of the surprise + Incumb.
   *  Not set by the ridge attribution. */
  record?: number;
  effect: number;   // the candidate's standing AS OF the race: the record with this race included (shown as "Effect")
  effectN: number;  // races on file for the candidate (count, this one included)
  effectW: number;  // effective races: Σ recency weights over the other races, plus 1 for this one
  opponentEffect: number;     // the opponent's strength IN THIS RACE (their record plus their share of the surprise), signed toward the OPPONENT (0 if no opponent)
  /** Points the candidate's own incumbency is worth against a NON-incumbent replacement, signed toward
   *  the candidate: the office's incumbency term plus the incumbent share of the structural money
   *  term, i.e. `expected` − the same expectation with no incumbent in the race. 0 for challengers
   *  and open seats. Not in `expected` or `residual` (the ridge basis); added to WAR only. */
  replacementPts: number;
  expectedVsOpponent: number; // R-positive expected margin for a generic NON-incumbent nominee of this party vs this specific opponent
  war: number;      // actual − expectedVsOpponent, signed toward this candidate = record + this candidate's share of the race's surprise + replacementPts (= strength in the race + replacementPts)
  /** < 1 for a House race relocated across a redistricting — how far it had to move, as a
   *  confidence multiplier. Discounts it in the ridge exactly as it is discounted in TPL. */
  boundaryWeight?: number;
  /** House rows: the first election year of the lines the race was run on (0 = before any redraw
   *  on file). Two races of one seat with the same value were run on the same lines. */
  linesFrom?: number;
  /** Ran as the incumbent having won the seat before (not an appointee). */
  electedIncumbent?: boolean;
  /** Where the record starts instead of zero: the candidate's state legislative record, discounted
   *  (WAR_CROSS_K), signed toward them. Absent for a candidate with no scored legislative race. */
  crossStart?: number;
  note: string;
  /** The seat id the past-election and seat pages key on (senate "oh2", governor "oh", house "oh-09",
   *  president: the state id "oh") — so the model pages can link a row to its results without
   *  guessing which Senate class a race belongs to. */
  seatId?: string;
}

// Ridge prior on candidate effects. A race yields one residual r = a_R − a_D + ε; the penalty
// λ·Σa_c² encodes "an unseen candidate is replacement level", which makes the system solvable
// for one-race candidates (their effect is what is left after the opponent's, shrunk by 1/(1+λ))
// and splits singleton-vs-singleton residuals evenly. Effects pool across offices by
// state|party|name. WAR itself is scored against the opponent-specific expectation
// (expected − opponent effect): the candidate keeps their own effect plus the whole
// unexplained leftover ε, so the two sides' WARs do not sum to the residual — each side
// is measured against "a generic nominee facing the opponent I actually faced". The
// replacement is a NON-incumbent (a freely available nominee never holds the seat), so an
// incumbent's WAR also carries what their incumbency is worth (replacementPts); the ridge
// itself keeps solving on the incumbency-stripped residual, which is what identifies the
// opponent's effect and what the forecast reads. λ=1 matches the observed leave-one-out persistence slope (~0.68) of repeat
// candidates' residuals; calibration via the harness is a later refinement.
export const WAR_LAMBDA = 1;
// Heavy tail (WAR table only, 2026-10-04). A squared penalty finds "one +43 candidate and five
// −15 opponents" cheaper than "one +75 candidate", so everyone who faced Phil Scott absorbed part
// of his popularity and booked a WAR of −30 or worse. The WAR solve therefore uses a pseudo-Huber
// penalty, λ·2τ²(√(1 + (a/τ)²) − 1): the same ridge near zero, linear growth beyond τ, strictly
// convex (so the solution is unique and a symmetric one-race pair still splits evenly). An
// extraordinary candidate is no longer cheaper to explain as a run of terrible opponents.
// τ is smaller for a candidate who ran as the incumbent at least once in the window: the tail is
// theirs — of the 12 races with |residual| > 30, 9 favor the incumbent and 1 goes against — and it
// is what breaks the tie in a one-race pair (Baker over Gonzalez). 10-fold held-out error on
// repeat candidates' races: ridge 3.91 → 3.87 (statewide 6.35 → 6.01). The forecast's candidate
// effects (computeCandidateEffects) stay on the plain ridge until forwardBacktest says otherwise.
export const WAR_TAIL = 10;
export const WAR_TAIL_INCUMBENT = 5;
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

// One person filed under two spellings shares one key (SAME_PERSON / SAME_PERSON_IN_STATE in
// lib/candidateSlug.ts), and accents fold to their letter ("Raúl" → "raul", not "ral"), so a 2026
// nominee on a new ballot spelling still finds their track record (final audit 2026-11-03).
const foldName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const SAME_PERSON_FOLDED = new Map<string, string>([
  ...Object.entries(SAME_PERSON).map(([alias, name]) => [foldName(alias), foldName(name)] as [string, string]),
  ...Object.entries(SAME_PERSON_IN_STATE).map(([k, name]) => [`${k.slice(0, 2)}|${foldName(k.slice(3))}`, foldName(name)] as [string, string]),
]);
const warNameKey = (state: string, folded: string) => SAME_PERSON_FOLDED.get(`${state}|${folded}`) ?? SAME_PERSON_FOLDED.get(folded) ?? folded;
// People who ran under more than one party keep one record: the key carries this fixed label
// whatever party a race lists. Safe because an effect is signed toward the candidate, not the
// party (solveCandidateEffects signs by slot). User decision 2026-11-03.
const PARTY_SWITCHERS: Record<string, string> = {
  "FL|david jolly": "D", // FL-13 R 2016 → FL-Gov D 2026
  "SD|brian bengs": "D", // SD-Sen D 2022 → SD-Sen independent 2026
  "NJ|jeff van drew": "R", // NJ-02 D 2018 → R since 2020
};
const warKey = (state: string, party: string, folded: string) => {
  const name = warNameKey(state, folded);
  return `${state}|${PARTY_SWITCHERS[`${state}|${name}`] ?? party}|${name}`;
};
export const warCandidateKey = (state: string, party: string, name: string) => warKey(state, party, foldName(name));

/** Fit recency-weighted ridge candidate effects over race residuals and fill effect/war on each row (mutates rows). */
export interface EffectRace { r: number; year: number; R?: string; D?: string; actual?: number; inc?: "R" | "D" | null; office?: string;
  /** Extra confidence multiplier on top of recency decay — < 1 for a House race relocated
   *  across a redistricting, whose residual is a noisy read on the candidate. */
  w?: number;
  /** Where each side's record starts instead of zero, signed toward that candidate: their record in
   *  the other table (legislative for a federal race, federal for a legislative one), discounted.
   *  See "One WAR, two tables" below. */
  priorR?: number; priorD?: number; }

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
// data/candidateOffices.ts is keyed on the raw spelling (build-candidate-offices.js); re-key it
// through warCandidateKey so every spelling of one person pools their offices.
let _officesByKey: Map<string, CandidateOfficeRecord> | null = null;
function officesFor(key: string): CandidateOfficeRecord | undefined {
  if (!_officesByKey) {
    _officesByKey = new Map();
    for (const [raw, rec] of Object.entries(candidateOffices)) {
      const [st, pa, nm] = raw.split("|");
      const k = warKey(st, pa, nm);
      const prev = _officesByKey.get(k);
      _officesByKey.set(k, prev ? { title: prev.title ?? rec.title, offices: [...prev.offices, ...rec.offices] } : rec);
    }
  }
  return _officesByKey.get(key);
}

export function priorOfficeTier(key: string, year: number): number {
  const rec = officesFor(key);
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
// candidate's race count / recency-weighted count. `tail` (a candidate's τ) swaps the
// squared penalty for the pseudo-Huber one — see WAR_TAIL — solved by reweighting the
// penalty each sweep (λ_c = λ / √(1 + (a_c/τ)²)); without it this is the plain ridge.
export function solveCandidateEffects(
  races: Iterable<EffectRace>,
  Y: number,
  warm?: Map<string, number>,
  prior?: Map<string, number>,
  decay: (office?: string) => number = recencyDecayFor,
  tail?: (candidate: string) => number
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
  for (let it = 0; it < (tail ? 2000 : 200); it++) {
    let maxDelta = 0;
    for (const [c, o] of obs) {
      const prev = a.get(c) ?? 0;
      const target = prior?.get(c) ?? 0;
      const lambda = tail ? WAR_LAMBDA / Math.sqrt(1 + ((prev - target) / tail(c)) ** 2) : WAR_LAMBDA;
      let num = lambda * target;
      let den = lambda;
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

// ── Attribution by record (2026-11-24) ───────────────────────────────────────
// One race yields one number for two candidates: r = Actual − Expected. Until 2026-11-24 the WAR
// table split it with the ridge above and then gave each side the race's whole leftover. Two
// things followed. (1) A first-time candidate's effect was estimated from the very race it was
// then used to score, so each side's score fed the other's: an opponent rated strong raised the
// candidate's WAR, whose pooled strength had made the opponent look strong. (2) A candidate with a
// long record has one pooled effect, so an off year could only be explained as a strong opponent:
// Phil Scott ran 31 ahead of Expected in 2026 against 71–76 in 2020–2024, kept an effect of +54,
// and Amanda Janoo was booked at +15; in the years he beat his own average his opponents were
// booked as weak. The data says the reverse. Where an established candidate (two or more earlier
// races) fell short of their own record against a first-time opponent who later ran again, the
// shortfall predicted nothing about the opponent's next race (slope 0.01, n 94), while the
// established candidate's own deviation carried into their next race at 0.56 (n 390).
//
// So each candidate gets a strength IN THIS RACE, built from two things that never include the
// race's own result on the other side:
//
//   record(c, t)  = Σ w(t′) × strength(c, t′) over c's OTHER races ÷ (Σ w + λ)    shrunk toward 0
//   surprise(t)   = r − (record(R) − record(D))
//   strength(R,t) = record(R) + φ_R × surprise      strength(D,t) = record(D) − φ_D × surprise
//   φ_c           = v_c ÷ (v_R + v_D),   v_c = (1 + W_c)^γ,   W_c = Σ w over c's other races
//
// w(t′) is the recency and boundary weight the ridge used. γ > 0 gives more of a surprise to the
// candidate WITH the record (it is their strength that moved); two newcomers split it evenly; a
// candidate with no opponent on file takes all of it. The strengths are solved together by
// iteration (each record is built from the others' strengths). By construction
// strength(R) − strength(D) = r: the two scores account for what happened, once.
//
// λ and γ are fitted on races held out entirely (scripts/warAttributionTest.ts): each race removed,
// its candidates' other races re-solved without it, their records used to predict it. Error is
// flat for γ between 0.5 and 2 and lowest near λ 0.25–0.5; γ < 0 (the newcomer absorbs the
// surprise, which is what the ridge did) is the worst in every row. The ridge with its heavy tail
// predicts held-out races as well (3.69 against 3.70): the gain here is not accuracy, it is that
// a row no longer scores a race with a number taken from that race, and the two rows add up.
export type WarAttribution = "record" | "ridge";
export const WAR_ATTRIBUTION: WarAttribution = "record";
const warAttributionDefault = (process.env.WAR_ATTRIBUTION as WarAttribution | undefined) ?? WAR_ATTRIBUTION;
export const WAR_RECORD_LAMBDA = 0.5;
export const WAR_SURPRISE_GAMMA = 1;
/** Extra record weight of a candidate running as the ELECTED incumbent (appointed ones excepted). */
export const WAR_INCUMBENT_RECORD = 2;
export interface RecordShare { record: number; weight: number; share: number; strength: number; n: number;
  /** The record with this race included at full weight: the candidate's standing as of the race. */
  rating: number }
export function allocateByRecord(races: EffectRace[], gamma: number, lambda: number = WAR_LAMBDA, decay: (office?: string) => number = recencyDecayFor, incumbentRecord = 0): Map<EffectRace, { R?: RecordShare; D?: RecordShare }> {
  type Slot = { race: EffectRace; side: "R" | "D"; q: number; others: { slot: Slot; w: number }[]; W: number };
  const byCandidate = new Map<string, Slot[]>();
  const slots = new Map<EffectRace, { R?: Slot; D?: Slot }>();
  for (const race of races) {
    const pair: { R?: Slot; D?: Slot } = {};
    for (const side of ["R", "D"] as const) {
      const key = race[side];
      if (!key) continue;
      const slot: Slot = { race, side, q: 0, others: [], W: 0 };
      pair[side] = slot;
      (byCandidate.get(key) ?? byCandidate.set(key, []).get(key)!).push(slot);
    }
    slots.set(race, pair);
  }
  for (const list of byCandidate.values()) for (const a of list) {
    for (const b of list) if (b !== a) { const w = (b.race.w ?? 1) * decay(b.race.office) ** Math.abs(b.race.year - a.race.year); a.others.push({ slot: b, w }); a.W += w; }
  }
  const prior = (s: Slot) => (s.side === "R" ? s.race.priorR : s.race.priorD) ?? 0;
  const record = (s?: Slot) => (s ? (s.others.reduce((sum, o) => sum + o.w * o.slot.q, 0) + lambda * prior(s)) / (s.W + lambda) : 0);
  // An elected incumbent has a record whether or not it falls inside the window (Baker in 2018 has
  // no earlier race on file, and it was not Gonzalez who made that race a 58-point surprise).
  const v = (s?: Slot) => (s ? (1 + s.W + (s.race.inc === s.side ? incumbentRecord : 0)) ** gamma : 0);
  for (const [race, pair] of slots) { if (pair.R) pair.R.q = pair.D ? race.r / 2 : race.r; if (pair.D) pair.D.q = pair.R ? -race.r / 2 : -race.r; }
  for (let it = 0; it < 500; it += 1) {
    let maxDelta = 0;
    for (const [race, pair] of slots) {
      const mR = record(pair.R), mD = record(pair.D), surprise = race.r - (mR - mD), shareR = v(pair.R) / (v(pair.R) + v(pair.D));
      if (pair.R) { const next = mR + shareR * surprise; maxDelta = Math.max(maxDelta, Math.abs(next - pair.R.q)); pair.R.q = next; }
      if (pair.D) { const next = mD - (1 - shareR) * surprise; maxDelta = Math.max(maxDelta, Math.abs(next - pair.D.q)); pair.D.q = next; }
    }
    if (maxDelta < 1e-7) break;
  }
  const out = new Map<EffectRace, { R?: RecordShare; D?: RecordShare }>();
  for (const [race, pair] of slots) {
    const shareR = v(pair.R) / (v(pair.R) + v(pair.D));
    const of = (s: Slot | undefined, share: number): RecordShare | undefined => (s ? { record: record(s), weight: s.W, share, strength: s.q, n: s.others.length + 1, rating: (s.others.reduce((sum, o) => sum + o.w * o.slot.q, 0) + s.q + lambda * prior(s)) / (s.W + 1 + lambda) } : undefined);
    out.set(race, { R: of(pair.R, shareR), D: of(pair.D, 1 - shareR) });
  }
  return out;
}

// ── One WAR, two tables (2026-11-27) ─────────────────────────────────────────
// State legislative candidates are scored by lib/stateLegWar.ts on the same philosophy, and WAR is
// one statistic whatever the office (user decision 2026-11-27): a candidate page adds every scored
// race into one career figure. The RECORDS are joined at a discount. A candidate's record in a race
// is shrunk toward a starting point; for a candidate with races in the other table that starting
// point is no longer zero:
//
//   start(c, t)  = Σ w(t′) × κ × strength(c, t′) over c's races in the OTHER table ÷ (Σ w + λ)
//   record(c, t) = (Σ w × strength in c's other races of THIS table + λ × start) ÷ (Σ w + λ)
//
// κ is how much of a strength shown in one kind of race shows up in the other, set from the
// crossover test (scripts/stateLegWarTest.ts, 282 people with both kinds of race; each side the
// candidate's mean race residual): a legislative record carries into a Senate or governor race at a
// slope of 0.36 (n 47) and into a U.S. House race at 0.06 (n 235). The other table's strengths are
// taken as that table stands on its own (solved with no start), so the two solves do not chase each
// other. A candidate with no race in the other table is untouched. The weight a candidate carries
// when a surprise is divided counts races of the same table only.
export const WAR_CROSS_K: Record<string, number> = { H: 0.05, S: 0.35, G: 0.35, P: 0 };
/** The discounted record a candidate brings from the other table into a race in `year`.
 *  `k` = κ for the pair (the federal race's office decides it, whichever side is being scored). */
export function crossRecordStart(year: number, others: { year: number; q: number; k: number; decay: number }[], lambda: number = WAR_RECORD_LAMBDA): number {
  let num = 0, den = 0;
  for (const o of others) { const w = o.decay ** Math.abs(o.year - year); num += w * o.k * o.q; den += w; }
  return den > 0 ? num / (den + lambda) : 0;
}

/** Fill effect / vs-opponent / WAR on every row by record (see "Attribution by record"). */
function attributeWarByRecord(rows: WarRow[], cross = true): void {
  type Race = EffectRace & { rows: WarRow[] };
  const races = new Map<string, Race>();
  for (const row of rows) {
    const k = `${row.state}|${row.office}|${row.race}|${row.year}`;
    const rc = races.get(k) ?? races.set(k, { r: row.actual - row.expected, year: row.year, office: row.office, w: row.boundaryWeight ?? 1, rows: [] }).get(k)!;
    rc.rows.push(row);
    if (row.party === "R") rc.R = warCandidateKey(row.state, row.party, row.candidate);
    else rc.D = warCandidateKey(row.state, row.party, row.candidate);
    if (row.electedIncumbent) rc.inc = row.party === "R" ? "R" : "D";
    // The candidate's legislative record, discounted, is where their record starts.
    const leg = cross ? legislativeRacesOf(warCandidateKey(row.state, row.party, row.candidate)) : undefined;
    if (leg) {
      const start = crossRecordStart(row.year, leg.map((x) => ({ ...x, k: WAR_CROSS_K[row.office] ?? 0, decay: WAR_RECENCY_DECAY })));
      row.crossStart = start;
      if (row.party === "R") rc.priorR = start; else rc.priorD = start;
    }
  }
  const shares = allocateByRecord([...races.values()], WAR_SURPRISE_GAMMA, WAR_RECORD_LAMBDA, recencyDecayFor, WAR_INCUMBENT_RECORD);
  for (const rc of races.values()) {
    const pair = shares.get(rc)!;
    for (const row of rc.rows) {
      const s = row.party === "R" ? 1 : -1;
      const mine = row.party === "R" ? pair.R! : pair.D!, theirs = row.party === "R" ? pair.D : pair.R;
      row.residual = s * rc.r;
      row.record = mine.record; // strength in their OTHER races, shrunk
      row.effect = mine.rating; // the same with this race in: their standing as of the race
      row.effectN = mine.n;
      row.effectW = mine.weight + 1;
      row.opponentEffect = theirs?.strength ?? 0; // the opponent's strength in THIS race
      row.expectedVsOpponent = row.expected - s * row.replacementPts - s * row.opponentEffect;
      row.war = mine.strength + row.replacementPts; // = s·(actual − expectedVsOpponent)
    }
  }
}

function attributeWar(rows: WarRow[], incumbents: Set<string>): void {
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
    const solved = solveCandidateEffects(races.values(), Y, a, undefined, recencyDecayFor, (c) => (incumbents.has(c) ? WAR_TAIL_INCUMBENT : WAR_TAIL));
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
        // above-replacement R opponent raises it. The replacement is a non-incumbent, so an
        // incumbent's own incumbency (replacementPts) comes out of the expectation too.
        // s·(actual − expectedVsOpponent) = effect + s·ε + replacementPts.
        row.expectedVsOpponent = row.expected - s * row.replacementPts - s * row.opponentEffect;
        row.war = row.effect + s * eps + row.replacementPts; // = s·(actual − expectedVsOpponent)
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

export function fitWarMoneyModel(rows: { gap: number; incSign: number; base: number }[]): WarMoneyModel {
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

// ── Own-year baseline for statewide WAR (2026-11-23) ──────────────────────────
// Until 2026-11-23 a Senate, governor or presidential race was scored against a PREDICTION of
// where its state should have landed: lean + trend + E(year). E is one national number, so a
// state that moved more or less than the nation that year handed the difference to every
// candidate on its ballot (2026: two same-party statewide candidates in one state scored alike
// at r = 0.57; every Texas Democrat +13).
//
// WAR is graded after the election, so the state's movement does not have to be predicted. It is
// read off the rest of the ballot: the state's own blended vote that year, built exactly as
// State TPL builds a year (same rows, incumbency and money strips, office weights, turnout
// weights and outlier factors) with NOTHING removed for the environment, and with the race being
// scored left out so a candidate is never graded against themselves.
//
//   generic(state, year, race) = the state's year score, environment left in, without `race`
//   baseline = w × generic + (1 − w) × (lean + trend + E)
//   w        = min(1, Σ base office weight of the offices left on the ballot ÷ the House weight)
//
// w is 1 in every even year with a House vote. An odd-year governor race with only a legislature
// beside it gets 0.10 / 0.25 = 0.4; one with nothing else (Kentucky) gets 0 and keeps the modelled
// baseline whole.
//
// A seat nobody contested is not evidence of how the state voted THAT year, so here (and only
// here; State TPL is unchanged) a filled row is treated differently:
//   · an uncontested House seat is filled with its presidential margin PLUS the gap the state's
//     contested seats ran from their own presidential margins that year, as the legislature's
//     unopposed seats already are; with no contested seat to measure a gap, it is dropped;
//   · an imputed Senate or governor race, and the legislature's no-gap unopposed pool, are dropped.
// The forward candidate effects are NOT on this baseline; they keep `base`.
//
// HOUSE (same day). A House race is graded the same way against its DISTRICT's own vote that
// year: everything the district's voters cast a ballot for except the House race itself
// (President, Senate, governor and both legislative chambers), summed from precincts on the
// lines the race was run on (lib/districtBallot.ts, scripts/buildDistrictBallot.ts), at the
// year's office weights without the House. Senate and governor margins carry the incumbency and
// money strips of the state's race. The first test (2026-11-20) used President, Senate and
// governor alone and was too noisy; with the legislature in, the baseline holds up, and it carries
// far less of the district itself than the modelled one did (in a seat where neither candidate
// repeats, consecutive scores correlated 0.43 on the modelled baseline and 0.21 on this one).
//
//   w = min(1, Σ office weight of the offices the district has a figure for ÷ the legislature's weight)
//
// so a presidential year is always whole, a midterm district with a legislature figure is whole,
// and one with only a Senate or governor race beside it leans on the modelled baseline.
//
// CHECKS. Older precinct files place some votes approximately (a county's absentee line spread
// over its precincts), so a state total can be right while a district's is not, and the year's
// district of a precinct is itself read off its House votes. Three checks, each against something
// independent of the precinct file:
//   · the presidential vote summed on the district's precincts must be within
//     WAR_DISTRICT_CHECK_PTS of the site's own presidential result for that district on those
//     lines, and its turnout within WAR_DISTRICT_TURNOUT_BAND; a district that fails, or has no
//     presidential result to compare, keeps the modelled baseline entirely;
//   · the House margin summed from precincts must be within WAR_DISTRICT_HOUSE_CHECK_PTS of the
//     certified one;
//   · an office whose precinct total is outside WAR_DISTRICT_OFFICE_BAND of the House total is
//     incomplete there (an absentee board missing from one contest) and is left out.
//
// THE OTHER HOUSE RACES (user decision, 2026-11-23). A district's ballot holds one House race, so
// the House vote itself cannot be part of its own baseline the way a state's is for a Senate race.
// It enters through the state's other House races: how far each of them ran from ITS district's
// baseline that year. That gap is common to the state (in a midterm the district baseline is
// mostly the legislature, and a state's legislative vote can sit many points from its
// congressional vote: Massachusetts and California 2018 to the right of it, West Virginia 2018 to
// the left) and is not any one candidate's doing. So a House race's Expected is moved by
//
//   others = μ(year) + n ÷ (n + WAR_HOUSE_OTHERS_K) × (mean gap of the state's n OTHER House races − μ(year))
//
// where a race's gap is actual − Expected before this term and μ(year) is the mean gap of every
// House race that year. The race itself is never in its own figure; a one-seat state gets μ(year).
export type WarBaseline = "own-year" | "own-year-no-others" | "own-year-statewide" | "lean";
export const WAR_HOUSE_OTHERS_K = 3;
export const WAR_DISTRICT_CHECK_PTS = 2;
export const WAR_DISTRICT_TURNOUT_BAND: [number, number] = [0.85, 1.15];
export const WAR_DISTRICT_HOUSE_CHECK_PTS = 3;
export const WAR_DISTRICT_OFFICE_BAND: [number, number] = [0.8, 1.25];
export const WAR_BASELINE: WarBaseline = "own-year";
// WAR_BASELINE=lean restores the modelled baseline for the harness (scripts/warBaselineTest.ts);
// own-year-statewide is the own-year baseline for statewide races only (House modelled);
// own-year-no-others is everything but the other-House-races term.
const warBaselineDefault = (process.env.WAR_BASELINE as WarBaseline | undefined) ?? WAR_BASELINE;
/** Races are scored through this year, House included since 2026-11-24. 2026 is on the counts as
 *  they stand (the TPL overlay). 2026 precinct results cover eight states (AZ GA HI ID MN NC SC
 *  WA): a 2026 House race elsewhere has no district ballot yet and is scored on the modelled
 *  baseline plus the state's other House races, until its state's precinct file is in.
 *  WAR_LAST_YEAR=2025 with WAR_BASELINE=lean reproduces the table as it was before 2026-11-23. */
export const WAR_STATEWIDE_LAST_YEAR = process.env.WAR_LAST_YEAR != null ? Number(process.env.WAR_LAST_YEAR) : HAS_2026 ? TPL_2026 : 2025;

export interface OwnYearGeneric {
  margin: number | null; // R-positive; null when nothing else was on the ballot
  weight: number;        // w above
  offices: string[];     // office types behind `margin`
  houseFilled: number;   // uncontested House seats filled from the contested seats' gap
  houseDropped: number;  // uncontested House seats dropped (no contested seat that year)
}

/** A district's own vote in a year without its House race. `stateStrip` gives the incumbency +
 *  money strip of the state's Senate ("S") or governor ("G") race that year, or undefined where
 *  the state had no scorable race for that office. */
function districtOwnYearGeneric(ballot: DistrictBallotEntry | null, year: number, houseMargin: number, sitePres: ImputedLean | null, stateStrip: (type: "S" | "G") => number | undefined): OwnYearGeneric {
  const none: OwnYearGeneric = { margin: null, weight: 0, offices: [], houseFilled: 0, houseDropped: 0 };
  if (!ballot || !ballot.H || Math.abs(ballot.H[0] - houseMargin) > WAR_DISTRICT_HOUSE_CHECK_PTS) return none;
  // Are these precincts really this district? The presidential vote on them says.
  const mine = sitePres && sitePres.desc !== "statewide presidential result" ? ballot.pres?.[String(sitePres.year)] : undefined;
  if (!mine || Math.abs(mine[0] - sitePres!.margin) > WAR_DISTRICT_CHECK_PTS) return none;
  if (sitePres!.totalVotes && (mine[1] / sitePres!.totalVotes < WAR_DISTRICT_TURNOUT_BAND[0] || mine[1] / sitePres!.totalVotes > WAR_DISTRICT_TURNOUT_BAND[1])) return none;
  const complete = (o?: [number, number]) => !!o && o[1] / ballot.H![1] >= WAR_DISTRICT_OFFICE_BAND[0] && o[1] / ballot.H![1] <= WAR_DISTRICT_OFFICE_BAND[1];
  const W = raceTypeWeightsFor(year);
  const parts: [string, number][] = [];
  if (complete(ballot.P)) parts.push(["P", ballot.P![0]]);
  for (const t of ["S", "G"] as const) {
    const strip = stateStrip(t);
    if (complete(ballot[t]) && strip != null) parts.push([t, ballot[t]![0] + strip]);
  }
  if (ballot.L != null) parts.push(["L", ballot.L]);
  const weightSum = parts.reduce((sum, [t]) => sum + (W[t] ?? 0), 0);
  if (weightSum <= 0) return none;
  return { margin: parts.reduce((sum, [t, v]) => sum + (W[t] ?? 0) * v, 0) / weightSum, weight: Math.min(1, weightSum / W.L), offices: parts.map(([t]) => t), houseFilled: 0, houseDropped: 0 };
}

function houseMinValidYear(district: string | undefined, year: number): number {
  const districtId = district ? houseData.find((r) => r.name === district)?.id : undefined;
  const earlier = districtId ? (houseDistrictInfo[districtId] ?? []).map((e) => e.year).filter((y) => y <= year) : [];
  return earlier.length > 0 ? Math.max(...earlier) : 0;
}

function houseMaxValidYear(district: string | undefined, year: number): number {
  const districtId = district ? houseData.find((r) => r.name === district)?.id : undefined;
  const later = districtId ? (houseDistrictInfo[districtId] ?? []).map((e) => e.year).filter((y) => y > year) : [];
  return later.length > 0 ? Math.min(...later) : Number.POSITIVE_INFINITY;
}

function stateOwnYearGeneric(stateAbbr: string, stateRaces: ComputedRace[], year: number, exclude: ComputedRace, leanPlusE: number): OwnYearGeneric {
  // A row's margin with incumbency and money removed and the environment left in.
  const own = (r: ComputedRace) => r.adjustedMargin! + (r.incumbencyPts ?? 0) + (r.FF_pts ?? 0);
  const rows = stateRaces.filter((r) => r.year === year && r !== exclude && r.adjustedMargin != null && r.NM != null);
  let gapNum = 0, gapDen = 0;
  for (const r of rows) {
    if (r.raceType !== "H" || r.imputed) continue;
    const pres = nearestPresidentialLean(stateAbbr, r.district, year, r.minValidYear, houseMaxValidYear(r.district, year));
    if (!pres || pres.desc === "statewide presidential result") continue; // no district presidential vote to compare with
    gapNum += r.aggWeight * (own(r) - pres.margin);
    gapDen += r.aggWeight;
  }
  const gap = gapDen > 0 ? gapNum / gapDen : null;
  const kept: ComputedRace[] = [];
  let houseFilled = 0, houseDropped = 0;
  for (const r of rows) {
    if (!r.imputed) kept.push({ ...r, NM: own(r) });
    else if (r.raceType === "H" && gap != null) { kept.push({ ...r, NM: r.adjustedMargin! + gap }); houseFilled += 1; }
    else if (r.raceType === "H") houseDropped += 1;
  }
  // The anchor of the House-year outlier factor moves with the rows: |House − (lean + E)| here is
  // |House NM − lean| in the state model.
  const agg = aggregateYears(kept, leanPlusE).yearAggregations.find((a) => a.year === year);
  const offices = agg?.racesPresent ?? [];
  if (!agg || offices.length === 0) return { margin: null, weight: 0, offices: [], houseFilled, houseDropped };
  const W = raceTypeWeightsFor(year);
  const weight = Math.min(1, offices.reduce((sum, t) => sum + (W[t] ?? 0), 0) / W.H);
  return { margin: agg.WRS, weight, offices, houseFilled, houseDropped };
}

const _warCache = new Map<string, WarRow[]>();
let _warMoneyCache: Record<string, WarMoneyModel> | null = null;
type WarPending = { r: ComputedRace; office: WarRow["office"]; raceLabel: string; state: string;
  /** Pre-money expected margin on the MODELLED baseline (lean + trend + E + incumbency). The forward
   *  candidate effects and the structural money model read this one; so does a House row's WAR. */
  base: number;
  linesFrom?: number;
  /** The same on the OWN-YEAR baseline (WAR table only). */
  ownBase?: number; own?: OwnYearGeneric; ownNote?: string;
  /** R-positive incumbency points inside `base` (0 for open seats and appointed incumbents); base − incPts is the same seat with no incumbent. */
  incPts: number; incSign: number; gap: number | null; withMoney: boolean; boundaryWeight?: number; note: string };
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
  // Incumbency + money strip of each state's regular Senate and governor race, for the district
  // baseline of a House race (the district's Senate margin is that race counted inside its lines).
  const stateStrips = new Map<string, number>();
  const gapOf = (r: ComputedRace) => r.ffDetail && r.ffDetail.dem + r.ffDetail.rep > 0 ? ((r.ffDetail.rep - r.ffDetail.dem) / (r.ffDetail.rep + r.ffDetail.dem)) * 100 : null;
  const incSignOf = (r: ComputedRace) => (r.incumbent === "R" ? 1 : r.incumbent === "D" ? -1 : 0);

  for (const { abbr, name } of statesData) {
    const lean = fit.lean[abbr];
    const beta = 1; // the per-state elasticity was removed on 2026-11-19
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
      if ((r.raceType === "S" || r.raceType === "G") && !r.imputed && r.eligibility === "eligible" && r.rawMargin != null && r.race !== "Senate Special") stateStrips.set(`${abbr}|${r.year}|${r.raceType}`, (r.incumbencyPts ?? 0) + (r.FF_pts ?? 0));
    }
    for (const r of stateRaces) {
      if (r.raceType === "L" || r.raceType === "H" || r.year > WAR_STATEWIDE_LAST_YEAR || r.rawMargin == null) continue;
      const E = fit.E[r.year] ?? 0;
      const office = r.raceType as WarRow["office"];
      // The state's own vote that year without this race, blended toward the modelled baseline
      // where little else was on the ballot (see "Own-year baseline" above).
      const own = stateOwnYearGeneric(abbr, stateRaces, r.year, r, lean + E);
      const ownCore = (leanCore: number) => (own.margin == null ? leanCore : own.weight * own.margin + (1 - own.weight) * leanCore);
      const ownNote = own.margin == null || own.weight === 0 ? `vs state lean in ${r.year} (nothing else on the ballot)`
        : own.weight < 1 ? `vs the state's ${r.year} vote (${Math.round(own.weight * 100)}%) and its lean (${Math.round((1 - own.weight) * 100)}%)`
        : `vs the state's ${r.year} vote`;
      if (!r.imputed && r.eligibility === "eligible") {
        // Presidential rows are NOT trend-anchored: their own margin IS the trend input, so the
        // residual would collapse to the constant down-ballot offset by construction.
        const yearPres = r.raceType === "P" ? null : interpolatedPresNM(presNM, r.year);
        const trend = yearPres != null && presBar != null ? yearPres - presBar : 0;
        const incPts = -(r.incumbencyPts ?? 0);
        const leanCore = lean + trend + beta * E;
        pending.push({ r, office, raceLabel: r.race, state: abbr, base: leanCore + incPts, ownBase: ownCore(leanCore) + incPts, own, ownNote, incPts, incSign: incSignOf(r), gap: gapOf(r), withMoney: true, note: r.raceType === "P" ? "vs state fitted lean" : `vs state lean in ${r.year}` });
      } else if (r.imputed && r.NM != null && (r.eligibility === "no-dem" || r.eligibility === "no-rep")) {
        // Same-party and jungle-fragmented generals carry no signable R-vs-D margin.
        // Imputed baselines carry no money term (the imputation is a presidential lean).
        const incPts = -incumbencyPtsFor(r.raceType, r.incumbent, r.incumbentAppointed);
        const leanCore = r.NM + beta * E;
        pending.push({ r, office, raceLabel: r.race, state: abbr, base: leanCore + incPts, ownBase: ownCore(leanCore) + incPts, own, ownNote: own.margin == null || own.weight === 0 ? "vs imputed presidential baseline" : ownNote, incPts, incSign: incSignOf(r), gap: null, withMoney: false, note: "vs imputed presidential baseline" });
      }
    }
  }
  for (const districtId of Object.keys(districtPresidentialData)) {
    const calc = calculateDistrictModel(districtId);
    const beta = 1;
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
      if (r.raceType !== "H" || r.rawMargin == null || r.year > WAR_STATEWIDE_LAST_YEAR) continue;
      const yearPres = interpolatedPresNM(presNM, r.year);
      const trend = yearPres != null ? yearPres - presBar : 0;
      // `actual` is the margin as recorded on the map the race was RUN on, so the expectation
      // must sit on that turf too (−BS_pts is the shift). Without it Doyle's D+48.7 in the
      // 2016 Pittsburgh PA-14 was scored against today's rural R+27 PA-14.
      const shift = -(r.BS_pts ?? 0);
      const relocated = r.boundaryShift != null && Math.abs(r.boundaryShift) >= 0.5;
      const incPts = -(r.incumbencyPts ?? 0);
      // The district's own vote that year without the House race, on the lines it was run on.
      const leanCore = calc.tpl + trend + shift + beta * (fit.E[r.year] ?? 0);
      const districtNumber = parseInt(r.race.split("-").pop() ?? "", 10);
      const sitePres = nearestPresidentialLean(calc.stateAbbr, r.district, r.year, houseMinValidYear(r.district, r.year), houseMaxValidYear(r.district, r.year));
      const own = districtOwnYearGeneric(Number.isFinite(districtNumber) ? districtBallot("run", r.year, calc.stateAbbr, districtNumber) : null, r.year, r.rawMargin, sitePres, (t) => stateStrips.get(`${calc.stateAbbr}|${r.year}|${t}`));
      const ownBase = (own.margin == null ? leanCore : own.weight * own.margin + (1 - own.weight) * leanCore) + incPts;
      const ownNote = own.margin == null ? undefined
        : own.weight < 1 ? `vs the district's ${r.year} vote (${Math.round(own.weight * 100)}%) and its lean (${Math.round((1 - own.weight) * 100)}%)`
        : `vs the district's ${r.year} vote, on that year's lines`;
      pending.push({ r, office: "H", raceLabel: r.race, state: calc.stateAbbr, linesFrom: houseMinValidYear(r.district, r.year), base: leanCore + incPts, ownBase, own, ownNote, incPts, incSign: incSignOf(r), gap: gapOf(r), withMoney: true, boundaryWeight: r.boundaryWeight ?? 1, note: relocated ? `vs district lean in ${r.year}, on that year's lines` : `vs district lean in ${r.year}` });
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

export function computeWarTable(baseline: WarBaseline = warBaselineDefault, attribution: WarAttribution = warAttributionDefault, /** false: the table on its own, no legislative record entering any row (what the legislative table and the crossover test read). */ cross = true): WarRow[] {
  const cacheKey = `${baseline}|${attribution}|${cross}`;
  const hit = _warCache.get(cacheKey);
  if (hit) return hit;
  const pending = buildWarPending();

  // Structural money model per office, from races with both receipts known.
  const money: Record<string, WarMoneyModel> = {};
  for (const office of ["S", "G", "H"] as const) {
    // Fitted on the modelled baseline and on races through 2025, as before 2026-11-23: the forward
    // money term (structuralMoneyGap) reads this model, and it must not move with WAR's baseline.
    money[office] = fitWarMoneyModel(pending.filter((p) => p.office === office && p.withMoney && p.gap != null && p.r.year <= 2025).map((p) => ({ gap: p.gap!, incSign: p.incSign, base: p.base })));
  }
  money.P = { intercept: 0, incSign: 0, base: 0, n: 0, r2: 0 };
  _warMoneyCache = money;

  const price = (p: WarPending) => {
    const ownYear = p.ownBase != null && (baseline === "own-year" || baseline === "own-year-no-others" || (baseline === "own-year-statewide" && p.office !== "H"));
    const m = money[p.office];
    const preMoney = ownYear ? p.ownBase! : p.base;
    const structuralGapPct = p.withMoney ? m.intercept + m.incSign * p.incSign + m.base * preMoney : 0;
    const ffStructuralPts = p.withMoney ? Math.max(-FF_MAX, Math.min(FF_MAX, FF_K * structuralGapPct)) : 0;
    return { ownYear, preMoney, structuralGapPct, ffStructuralPts, expected: preMoney + ffStructuralPts };
  };
  // The other House races (see above): each race's gap before the term, then the state's others.
  const houseOthers = new Map<WarPending, number>();
  if (baseline === "own-year") {
    const house = pending.filter((p) => p.office === "H").map((p) => ({ p, gap: p.r.rawMargin! - price(p).expected }));
    const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const byYear = new Map<number, number[]>(), byState = new Map<string, { sum: number; n: number }>();
    for (const h of house) {
      (byYear.get(h.p.r.year) ?? byYear.set(h.p.r.year, []).get(h.p.r.year)!).push(h.gap);
      const k = `${h.p.state}|${h.p.r.year}`, e = byState.get(k) ?? byState.set(k, { sum: 0, n: 0 }).get(k)!;
      e.sum += h.gap; e.n += 1;
    }
    for (const h of house) {
      const mu = avg(byYear.get(h.p.r.year)!), e = byState.get(`${h.p.state}|${h.p.r.year}`)!, n = e.n - 1;
      houseOthers.set(h.p, n > 0 ? mu + (n / (n + WAR_HOUSE_OTHERS_K)) * ((e.sum - h.gap) / n - mu) : mu);
    }
  }

  const out: WarRow[] = [];
  const incumbents = new Set<string>(); // ran as the incumbent at least once: the heavier tail (WAR_TAIL_INCUMBENT)
  for (const p of pending) {
    const m = money[p.office];
    const { ownYear, preMoney, structuralGapPct, ffStructuralPts, expected: expectedBefore } = price(p);
    const others = houseOthers.get(p) ?? 0;
    const expected = expectedBefore + others;
    // The replacement is a non-incumbent: the same seat, year and opponent with NO incumbent in
    // the race — incumbency out of the base, and the structural money a generic pair would have
    // re-priced with incSign 0 on that base. The difference is what the incumbent's own
    // incumbency is worth, credited to the incumbent's row only (2026-09-24, user decision:
    // "a replacement-level nominee wouldn't be an incumbent in any practical scenario").
    // Appointed incumbents carry no incumbency in base (share 0) but do get the money part.
    const openBase = preMoney - p.incPts;
    const ffOpenPts = p.withMoney ? Math.max(-FF_MAX, Math.min(FF_MAX, FF_K * (m.intercept + m.base * openBase))) : 0;
    const replacementR = expectedBefore - (openBase + ffOpenPts); // R-positive
    const incumbentSlot = p.r.incumbent === "R" ? "R" : p.r.incumbent === "D" ? "D" : null;
    // residual/effect/war are filled by attributeWar() once every race is collected.
    const seatId = p.office === "H" ? p.raceLabel.replace(/^House /, "").toLowerCase() : p.r.detailHref?.split("/").pop();
    const base = { office: p.office, race: p.raceLabel, state: p.state, year: p.r.year, seatId, actual: p.r.rawMargin!, expected, moneyGapPct: p.gap, structuralGapPct, ffStructuralPts, generic: ownYear ? p.own!.margin : null, genericWeight: ownYear ? p.own!.weight : 0, houseOthers: others, leanBaseline: p.base - p.incPts, residual: 0, effect: 0, effectN: 0, effectW: 0, opponentEffect: 0, replacementPts: 0, expectedVsOpponent: 0, war: 0, boundaryWeight: p.boundaryWeight ?? 1, linesFrom: p.linesFrom, note: ownYear ? p.ownNote ?? p.note : p.note };
    const elected = !p.r.incumbentAppointed;
    if (p.r.demCandidate) out.push({ candidate: p.r.demCandidate, party: p.r.demParty ?? "D", ...base, replacementPts: incumbentSlot === "D" ? -replacementR : 0, electedIncumbent: incumbentSlot === "D" && elected });
    if (p.r.repCandidate) out.push({ candidate: p.r.repCandidate, party: p.r.repParty ?? "R", ...base, replacementPts: incumbentSlot === "R" ? replacementR : 0, electedIncumbent: incumbentSlot === "R" && elected });
    if (incumbentSlot === "D" && p.r.demCandidate) incumbents.add(warCandidateKey(p.state, p.r.demParty ?? "D", p.r.demCandidate));
    if (incumbentSlot === "R" && p.r.repCandidate) incumbents.add(warCandidateKey(p.state, p.r.repParty ?? "R", p.r.repCandidate));
  }

  if (attribution === "record") attributeWarByRecord(out, cross); else attributeWar(out, incumbents);
  out.sort((a, b) => b.war - a.war);
  _warCache.set(cacheKey, out);
  return out;
}

// ── Display helpers ───────────────────────────────────────────────────────────

// Legacy logistic curve, P(D wins) = 1 / (1 + e^(0.13 × margin)), kept only as the
// comparison baseline in scripts/forwardBacktest.ts. The site uses winProbabilityD.
export function marginToProbability(margin: number): number {
  const raw = 1 / (1 + Math.exp(0.13 * margin));
  return Math.max(0.02, Math.min(0.98, raw));
}

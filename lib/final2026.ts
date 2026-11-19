// ── The final 2026 forecast, read from its frozen files ──────────────────────────────────────────
// Every page that shows the 2026 forecast reads it from here: data/forecast-final-2026/frozen/,
// written once from the locked model by scripts/freezeFinal2026.ts. Nothing in this module runs the
// model, so the live model (lib/tplCompute.ts, lib/forecast.ts, lib/stateLegForecast.ts,
// lib/countyProjection.ts, lib/turnoutModel.ts …) can change — a new TPL year, a new forecast —
// without moving a single published 2026 number. `npm run check-final-2026` guards the files.
//
// The functions keep the live modules' names and shapes, so a page switches by changing its import.
// Race records (names, nominees, past results) still come from data/forecastData.ts; only the
// forecast fields are frozen.
//
// Server-only. File paths are spelled out with literals at each read (Vercel file tracing, see
// lib/turnout.ts): never route them through a helper that takes the path.

import "server-only";
import fs from "node:fs";
import { join } from "node:path";
import { senateData, governorData, houseData, type RaceForecast, type RaceType } from "@/data/forecastData";
import type { StateLegDistrict, Chamber } from "@/data/stateLegDistricts";
import type { ForecastFields, ForecastedRace, ChamberSimulation, SeatTotals } from "@/lib/forecast";
import type { ForecastSummary } from "@/lib/forecastTypes";
import type { OutlookData } from "@/components/ForecastOutlook";
import type { ForecastHistory, RaceForecastHistory } from "@/lib/forecastHistory";
import type { ProjectedRaceResult, ImpliedGenericBallot } from "@/lib/countyProjection";
import type { CountyMapEntry } from "@/components/PastElectionCountyMap";
import type { RaceFinanceDetail } from "@/data/fundraisingData";
import type { NationalEnvironment, RacePolling, RaceMoneyTerm } from "@/lib/tplCompute";
import type { ChamberProjection, DistrictProjection } from "@/lib/stateLegForecast";
import type { ChamberPopularVote } from "@/lib/stateLegPopularVote";
import type { GenericBallotPopularVote } from "@/lib/genericBallotPopularVote";
import type { PriorsSlice, ResultsOffice } from "@/lib/resultsTypes";
import type { DistrictProjection as PrecinctDistrictProjection } from "@/lib/precinctDistrict/project";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecastTypes";

export { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE };
export type { ForecastFields, ForecastedRace, ChamberSimulation };

// ── file reads (one literal path each, parsed once per process) ─────────────────────────────────

type RaceCard = {
  tpl: number;
  incumbentPts: number;
  baseIncumbentPts: number;
  fundraising: { dem: number; rep: number } | null;
  fundraisingSource: string | null;
  financeDetail: RaceFinanceDetail | null;
  moneyTerm: RaceMoneyTerm;
  gb: number;
  polling: RacePolling;
  projectedMargin: number;
  quality: ReturnType<typeof import("@/lib/tplCompute").candidateQuality>;
};
type National = {
  environment: NationalEnvironment;
  sigma: Record<"H" | "S" | "G", number>;
  incumbentAdvantage: Record<string, number>;
  stateLegMoney: { K: number; CAP: number };
};
type Turnout = {
  projectAll: (ProjectedRaceSummary & { counties: unknown[] })[];
  national: { houseVotes: number; low: number; high: number; cvap: number; rate: number; basis: { year: number; houseVotes: number; topVotes: number; cvap: number }[] };
  states: string[];
  stateSlices: Record<string, unknown>;
  countySlice: unknown;
  levels: Record<string, unknown>;
};
type ProjectedRaceSummary = Record<string, unknown> & { id: string; state: string; office: string; votes: number };
type StateLegSummary = Record<string, { chamber: Omit<ChamberProjection, "districts"> | null; popularVote: Omit<ChamberPopularVote, "districts"> | null }>;
type StateLegDistricts = {
  chambers: Record<string, { chamber: DistrictProjection[] | null; popularVote: ChamberPopularVote["districts"] | null }>;
  loneDistricts: Record<string, DistrictProjection>;
};

let racesFile: Record<RaceType, Record<string, ForecastFields>> | null = null;
const races = (): NonNullable<typeof racesFile> => (racesFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "races.json"), "utf8")));
let cardsFile: Record<RaceType, Record<string, RaceCard>> | null = null;
const cards = (): NonNullable<typeof cardsFile> => (cardsFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "race-cards.json"), "utf8")));
let chambersFile: Record<RaceType, ChamberSimulation> | null = null;
const chambersSims = (): NonNullable<typeof chambersFile> => (chambersFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "chambers.json"), "utf8")));
let outlookFile: OutlookData | null = null;
const outlook = (): NonNullable<typeof outlookFile> => (outlookFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "outlook.json"), "utf8")));
let historyFile: ForecastHistory | null = null;
const history = (): NonNullable<typeof historyFile> => (historyFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "history.json"), "utf8")));
let nationalFile: National | null = null;
const national = (): NonNullable<typeof nationalFile> => (nationalFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "national.json"), "utf8")));
let projectionsFile: { races: Record<RaceType, Record<string, ProjectedRaceResult | null>>; impliedGenericBallot: ImpliedGenericBallot } | null = null;
const projections = (): NonNullable<typeof projectionsFile> => (projectionsFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "projections.json"), "utf8")));
let turnoutFile: Turnout | null = null;
const turnout = (): NonNullable<typeof turnoutFile> => (turnoutFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "turnout.json"), "utf8")));
let stateLegSummaryFile: StateLegSummary | null = null;
const stateLegSummary = (): NonNullable<typeof stateLegSummaryFile> => (stateLegSummaryFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "state-leg-chambers.json"), "utf8")));
let stateLegDistrictsFile: StateLegDistricts | null = null;
const stateLegDistrictsData = (): NonNullable<typeof stateLegDistrictsFile> => (stateLegDistrictsFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "state-leg-districts.json"), "utf8")));
let genericBallotFile: GenericBallotPopularVote | null = null;
const genericBallot = (): NonNullable<typeof genericBallotFile> => (genericBallotFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "generic-ballot.json"), "utf8")));
let priorsFile: Record<ResultsOffice, PriorsSlice> | null = null;
const priors = (): NonNullable<typeof priorsFile> => (priorsFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "results-priors.json"), "utf8")));
let precinctFile: Record<string, PrecinctDistrictProjection | null> | null = null;
const precinct = (): NonNullable<typeof precinctFile> => (precinctFile ??= JSON.parse(fs.readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "precinct-districts.json"), "utf8")));

// ── races ───────────────────────────────────────────────────────────────────────────────────────

const RACE_DATA: Record<RaceType, RaceForecast[]> = { house: houseData, senate: senateData, governor: governorData };

/** A 2026 race with its final forecast fields. Throws for a race the frozen forecast doesn't have. */
export function forecastRace<T extends RaceForecast>(race: T): T & ForecastFields {
  const f = races()[race.raceType]?.[race.id];
  if (!f) throw new Error(`No frozen 2026 forecast for ${race.raceType} ${race.id}`);
  return { ...race, ...f };
}

const forecastCache: Partial<Record<RaceType, ForecastedRace[]>> = {};
export function forecastsFor(raceType: RaceType): ForecastedRace[] {
  return (forecastCache[raceType] ??= RACE_DATA[raceType].map((r) => forecastRace(r)));
}

export function findForecast(raceType: RaceType, id: string): ForecastedRace | undefined {
  return forecastsFor(raceType).find((r) => r.id === id);
}

/** Same projection as lib/forecast.ts toForecastSummary. */
export function toForecastSummary(r: ForecastedRace): ForecastSummary {
  return {
    id: r.id, name: r.name, state: r.state, raceType: r.raceType,
    electionType: r.electionType, seat: r.seat, seatClass: r.seatClass,
    candidates: r.candidates, seatHolder: r.seatHolder, seatParty: r.seatParty,
    margin: r.margin, sigma: r.sigma, probability: r.probability, interval80: r.interval80, rating: r.rating,
    office: r.office, stateAbbr: r.stateAbbr, contest: r.contest,
    model: r.model, pollMargin: r.pollMargin, pollWeight: r.pollWeight, pollCount: r.pollCount,
  };
}

export function forecastSummariesFor(raceType: RaceType): ForecastSummary[] {
  return forecastsFor(raceType).map(toForecastSummary);
}

/** Same arithmetic as lib/forecast.ts seatTotals. */
export function seatTotals(rs: Pick<ForecastFields, "margin" | "probability">[], holdover: { dem: number; rep: number }): SeatTotals {
  let calledD = 0, expectedD = 0;
  for (const r of rs) {
    if (r.margin <= 0) calledD += 1;
    expectedD += r.probability;
  }
  const n = rs.length;
  return {
    called: { dem: holdover.dem + calledD, rep: holdover.rep + (n - calledD) },
    expected: { dem: holdover.dem + expectedD, rep: holdover.rep + (n - expectedD) },
  };
}

export function getChamberSimulations(): Record<RaceType, ChamberSimulation> {
  return chambersSims();
}

/** The Forecast tab's Outlook (lib/outlookData.ts), as it stood at the lock. */
export function outlookData(): OutlookData {
  return outlook();
}

// ── race pages ──────────────────────────────────────────────────────────────────────────────────

/** What a race page's forecast sections read: the TPL and environment it was built on, incumbency,
 *  money, candidate quality, the poll average, the projected margin. */
export function raceCard(raceType: RaceType, id: string): RaceCard {
  const c = cards()[raceType]?.[id];
  if (!c) throw new Error(`No frozen 2026 race card for ${raceType} ${id}`);
  return c;
}

export function getNationalEnvironment(): NationalEnvironment {
  return national().environment;
}
export function nationalSigmaFor(office: "H" | "S" | "G"): number {
  return national().sigma[office];
}
export function incumbentAdvantage(): Record<string, number> {
  return national().incumbentAdvantage;
}
/** The state-legislature money term's constants as the 2026 projection used them. */
export function stateLegMoneyConstants(): { K: number; CAP: number } {
  return national().stateLegMoney;
}

// ── forecast over time ──────────────────────────────────────────────────────────────────────────

/** Same keys as lib/forecastHistory.ts raceHistoryKey. */
export const raceHistoryKey = {
  house: (r: { name: string }) => `house/${r.name.toLowerCase()}`,
  senate: (r: { id: string }) => `senate/${r.id.toLowerCase().replace(/-2$/, "2")}`,
  governor: (r: { id: string }) => `governor/${r.id.toLowerCase()}`,
} as const satisfies Record<RaceType, (r: { name: string; id: string }) => string>;

export function getForecastHistory(): ForecastHistory {
  return history();
}

export function getRaceForecastHistory(type: RaceType, race: { name: string; id: string }): RaceForecastHistory | null {
  const h = history();
  const series = h.races[raceHistoryKey[type](race)];
  if (!series) return null;
  return { dates: h.days.map((d) => d.date), probD: series.p, margins: series.m };
}

// ── projected votes and turnout ─────────────────────────────────────────────────────────────────

export function projectRaceResults(office: RaceType, raceId: string): ProjectedRaceResult | null {
  return projections().races[office]?.[raceId] ?? null;
}

/** Same as lib/countyProjection.ts projectedCountyMapEntries. */
export function projectedCountyMapEntries(r: ProjectedRaceResult): CountyMapEntry[] {
  return r.counties.map((c) => ({ fips: c.fips, name: c.name, result: { demVotes: c.demVotes, repVotes: c.repVotes, totalVotes: c.votes, demPct: c.demPct, repPct: c.repPct, margin: c.margin } }));
}

export function impliedGenericBallot(): ImpliedGenericBallot {
  return projections().impliedGenericBallot;
}

// Turnout estimate (lib/turnoutModel.ts). Typed by the live module's return types.
type TM = typeof import("@/lib/turnoutModel");
export function projectAll(): ReturnType<TM["projectAll"]> {
  return turnout().projectAll as unknown as ReturnType<TM["projectAll"]>;
}
export function projectionSummary(): ReturnType<TM["projectionSummary"]> {
  return projectAll().map((r) => { const { counties, ...rest } = r; void counties; return rest; });
}
export function projectionNational(): ReturnType<TM["projectionNational"]> {
  return turnout().national;
}
export function projectionStates(): string[] {
  return turnout().states;
}
export function projectionStateSlice(state: string): ReturnType<TM["projectionStateSlice"]> {
  return (turnout().stateSlices[state] ?? { state, races: [] }) as ReturnType<TM["projectionStateSlice"]>;
}
/** One state's level in the turnout model (lib/turnoutModel.ts runModel().levels). */
export function turnoutLevel(state: string): ReturnType<TM["runModel"]>["levels"] extends Map<string, infer L> ? L : never {
  return turnout().levels[state] as ReturnType<TM["runModel"]>["levels"] extends Map<string, infer L> ? L : never;
}
export function projectionCountySlice(): ReturnType<TM["projectionCountySlice"]> {
  return turnout().countySlice as ReturnType<TM["projectionCountySlice"]>;
}

// ── state legislatures ──────────────────────────────────────────────────────────────────────────

const chamberCache = new Map<string, ChamberProjection | null>();
/** A chamber's 2026 projection, with every district's (lib/stateLegForecast.ts projectChamber). */
export function projectChamber(abbr: string, chamber: Chamber): ChamberProjection | null {
  const key = `${abbr}:${chamber}`;
  if (chamberCache.has(key)) return chamberCache.get(key)!;
  const s = stateLegSummary()[key]?.chamber ?? null;
  const out = s ? ({ ...s, districts: stateLegDistrictsData().chambers[key]?.chamber ?? [] } as ChamberProjection) : null;
  chamberCache.set(key, out);
  return out;
}

/** Every chamber on the ballot, in the live module's order (lib/stateLegForecast.ts projectAllChambers). */
export function projectAllChambers(): ChamberProjection[] {
  return Object.keys(stateLegSummary()).flatMap((key) => { const [abbr, chamber] = key.split(":") as [string, Chamber]; const p = projectChamber(abbr, chamber); return p ? [p] : []; });
}

/** One seat's 2026 projection (lib/stateLegForecast.ts projectDistrict with no options). */
export function projectDistrict(abbr: string, chamber: Chamber, district: Pick<StateLegDistrict, "number">): DistrictProjection {
  const key = `${abbr}:${chamber}`;
  const d = stateLegDistrictsData().chambers[key]?.chamber?.find((x) => x.key === district.number)
    ?? stateLegDistrictsData().loneDistricts[`${key}:${district.number}`];
  if (!d) throw new Error(`No frozen 2026 projection for ${key} district ${district.number}`);
  return d;
}

const popularVoteCache = new Map<string, ChamberPopularVote | null>();
/** A chamber's projected popular vote (lib/stateLegPopularVote.ts projectChamberPopularVote, default options). */
export function projectChamberPopularVote(abbr: string, chamber: Chamber): ChamberPopularVote | null {
  const key = `${abbr}:${chamber}`;
  if (popularVoteCache.has(key)) return popularVoteCache.get(key)!;
  const s = stateLegSummary()[key]?.popularVote ?? null;
  const out = s ? ({ ...s, districts: stateLegDistrictsData().chambers[key]?.popularVote ?? [] } as ChamberPopularVote) : null;
  popularVoteCache.set(key, out);
  return out;
}

/** Every chamber's projected popular vote, in order (lib/stateLegPopularVote.ts projectAllChamberPopularVotes). */
export function projectAllChamberPopularVotes(): ChamberPopularVote[] {
  return Object.keys(stateLegSummary()).flatMap((key) => { const [abbr, chamber] = key.split(":") as [string, Chamber]; const p = projectChamberPopularVote(abbr, chamber); return p ? [p] : []; });
}

// ── the rest ────────────────────────────────────────────────────────────────────────────────────

/** The generic-ballot page's data (lib/genericBallotPopularVote.ts), as it stood at the lock. */
export function genericBallotPopularVote(): GenericBallotPopularVote {
  return genericBallot();
}

/** The /results priors (lib/resultsPriors.ts): the election-day forecast, projected votes, TPL and β*
 *  the needle started from. */
export function resultsPriors(office: ResultsOffice): PriorsSlice {
  const p = priors()[office];
  if (!p) throw new Error(`No frozen 2026 priors for ${office}`);
  return p;
}

/** A precinct district page's 2026 outlook (lib/precinctDistrict/project.ts projectDistrict). */
export function precinctDistrictProjection(slug: string): PrecinctDistrictProjection {
  const p = precinct()[slug];
  if (!p) throw new Error(`No frozen 2026 projection for precinct district ${slug}`);
  return p;
}

import "server-only";
import {
  senateData, senateNoElection, senateHoldovers, governorData, governorNoElection, presPastResults, electionYear,
  houseData, housePastResults, houseDistrictInfo,
  type PastResult,
} from "@/data/forecastData";
import { FIPS_TO_STATE } from "@/lib/fips";
import { houseDistrictCountyRows, houseDistrictCountyGaps, type HouseDistrictCountySource, type HouseDistrictCountyStatus } from "@/lib/houseDistrictCounty";
import { countySenateData, type CountyYearResult } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { raceCalendar } from "@/data/raceCalendar";
import { computeWarTable } from "@/lib/tplCompute";
import { historicalRacePolls, historicalPresidentPolls, type HistoricalRacePoll } from "@/lib/racePollsHistory";
import { candidatePhotos } from "@/lib/candidatePhotos";

// One page per past election, nested under its seat: /senate/pa2/2022, /governor/pa/2022,
// /president/pa/2020 (a state's presidential result; its "seat page" is the state page).
// This module resolves a seat URL id + year to everything that page shows. It is the only
// place that knows how seat ids map onto the forecast data's pastResults, so the seat pages,
// candidate pages, state pages and county pages all build their links through
// pastElectionHref() and never guess whether a page exists.

export type PastElectionOffice = "senate" | "governor" | "president" | "house";

export const FIRST_PAST_ELECTION_YEAR = 2016;

type Party = "D" | "R" | "I";

export type PastElectionCandidate = {
  name: string;
  party: Party;
  pct: number;
  votes: number | null;
  incumbent: boolean;
  appointed: boolean;
  photo: string | null;
  /** Signed toward this candidate; null when the WAR table has no row for them. */
  war: number | null;
};

export type PastElectionCounty = {
  fips: string;
  name: string;
  result: CountyYearResult;
  /** Same seat's previous election in this county, when the county data has it. */
  previous: CountyYearResult | null;
  /** House only: the county is shared with another district on this year's map. */
  houseSplit?: boolean;
  /** House only: false when the Census county × district intersection has no piece to paint. */
  hasGeometry?: boolean;
};

export type HouseMapInfo = {
  /** TopoJSON of county × district pieces for this state on this year's map. */
  piecesUrl: string;
  district: number;
  /** Year of the congressional map the pieces were cut from. */
  mapYear: number;
  /** The district was redrawn for this election, so county comparisons cross a boundary change. */
  linesChanged: boolean;
  /** Split counties the precinct file could not split (drawn as "no data"). */
  gaps: { fips: string; name: string }[];
  /** Counties the district shares with another district. */
  splitCounties: number;
  /** Where every county row of this district came from, and whether they reproduce the certified total. */
  source: HouseDistrictCountySource | null;
  status: HouseDistrictCountyStatus | null;
};

export type PastElectionPolling = {
  /** Polls whose field period ended within the window before election day. */
  polls: HistoricalRacePoll[];
  windowDays: number;
  /** Mean of (dem − rep) across the window, D-positive. */
  avgDemMargin: number;
  /** Actual D-margin minus polled D-margin; positive = polls understated Democrats. Null for runoffs. */
  errorTowardDem: number | null;
  totalPolls: number;
};

export type PastElection = {
  office: PastElectionOffice;
  officeLabel: "U.S. Senate" | "Governor" | "President" | "U.S. House";
  seatId: string;
  seatHref: string;
  seatLabel: string;
  stateAbbr: string;
  stateName: string;
  year: number;
  href: string;
  isSpecial: boolean;
  seatClass: number | null;
  /** President only: the state's electoral votes (statewide, excluding ME/NE district votes). */
  electoralVotes: number | null;
  /** President only, ME/NE: the congressional-district electoral votes awarded separately. */
  districtResults: { label: string; margin: number; electoralVotes: number }[];
  /** House only. */
  house: HouseMapInfo | null;
  /** True when the stored figures are the runoff (GA 2020/2022, LA 2016, MS 2018 special…). */
  runoff: boolean;
  /** Date of the decisive round, ISO. */
  decidedOn: string;
  /** "General election, November 8, 2022" / "Runoff, December 6, 2022" */
  dateLabel: string;
  dem: PastElectionCandidate;
  rep: PastElectionCandidate;
  otherVotes: number | null;
  otherPct: number | null;
  totalVotes: number | null;
  /** R-positive, points. */
  margin: number;
  voteMargin: number | null;
  winner: "dem" | "rep";
  uncontested: boolean;
  previous: { year: number; margin: number; totalVotes: number | null; winnerName: string; winnerParty: Party; isSpecial: boolean } | null;
  /** Swing from the previous same-seat election, R-positive (positive = moved toward R). */
  swing: number | null;
  turnoutChangePct: number | null;
  counties: PastElectionCounty[];
  countiesInState: number;
  /** Retrospective TPL/WAR post-analysis. expected/residual are R-positive. */
  model: { expected: number; residual: number } | null;
  polling: PastElectionPolling | null;
  /** Every election of this seat that has a page, oldest first. */
  seatElections: { year: number; href: string; isSpecial: boolean }[];
  sources: string[];
};

// ── Seats ─────────────────────────────────────────────────────────────────────

type Seat = { seatId: string; stateAbbr: string; stateName: string; seat: 1 | 2 | null; results: PastResult[]; district?: number; geoid?: string; hasSeatPage?: boolean };

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function houseSeats(): Seat[] {
  const out: Seat[] = [];
  for (const race of houseData) {
    const [abbr, num] = race.name.split("-");
    out.push({
      seatId: race.name.toLowerCase(), stateAbbr: abbr, stateName: race.state, seat: null,
      results: dedupeResults([race.pastResults]), district: num === "AL" ? 1 : parseInt(num, 10), geoid: race.id, hasSeatPage: true,
    });
  }
  // Districts that no longer exist (IL-18, MI-14…): results only, no seat page.
  const live = new Set(out.map((s) => s.geoid));
  for (const [geoid, results] of Object.entries(housePastResults)) {
    if (live.has(geoid)) continue;
    const st = FIPS_TO_STATE[geoid.slice(0, 2)];
    if (!st) continue;
    const num = parseInt(geoid.slice(2), 10);
    out.push({
      seatId: `${st.abbr.toLowerCase()}-${String(num).padStart(2, "0")}`, stateAbbr: st.abbr, stateName: st.name, seat: null,
      results: dedupeResults([results]), district: num, geoid, hasSeatPage: false,
    });
  }
  return out;
}

// The state pages' stateName is what the seat label uses; forecastData's presidential rows only
// carry the abbreviation, so the name comes from the Senate/Governor entries for that state.
function stateNameOf(abbr: string): string {
  return senateData.find((r) => r.id.replace(/-2$/, "") === abbr)?.name
    ?? senateNoElection.find((e) => e.abbr === abbr)?.state
    ?? senateHoldovers.find((e) => e.abbr === abbr)?.state
    ?? governorData.find((r) => r.id === abbr)?.name
    ?? governorNoElection.find((e) => e.abbr === abbr)?.state
    ?? (abbr === "DC" ? "District of Columbia" : abbr);
}

function presidentSeats(): Seat[] {
  const out: Seat[] = [];
  for (const [abbr, rows] of Object.entries(presPastResults)) {
    if (!/^[A-Z]{2}$/.test(abbr)) continue; // ME-01 style district keys are folded into their state
    const results: PastResult[] = rows
      .filter((r) => r.stateAbbr === abbr)
      .map((r) => ({
        year: r.year, demPct: r.demPct, repPct: r.repPct, margin: r.margin,
        demCandidate: r.demCandidate, repCandidate: r.repCandidate,
        demVotes: r.demVotes, repVotes: r.repVotes, totalVotes: r.totalVotes,
        demIncumbent: r.demIncumbent, repIncumbent: r.repIncumbent,
      }))
      .sort((a, b) => a.year - b.year);
    out.push({ seatId: abbr.toLowerCase(), stateAbbr: abbr, stateName: stateNameOf(abbr), seat: null, results });
  }
  return out;
}

function dedupeResults(lists: (PastResult[] | undefined)[]): PastResult[] {
  const seen = new Set<string>();
  const out: PastResult[] = [];
  for (const list of lists) for (const r of list ?? []) {
    const key = `${r.year}:${isSpecialType(r.electionType)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.sort((a, b) => a.year - b.year);
}

function isSpecialType(t?: string): boolean {
  return (t ?? "").toLowerCase().includes("special");
}

function senateSeats(): Seat[] {
  const byId = new Map<string, Seat>();
  const add = (seatId: string, stateAbbr: string, stateName: string, seat: 1 | 2, results?: PastResult[]) => {
    const cur = byId.get(seatId);
    if (cur) cur.results = dedupeResults([cur.results, results]);
    else byId.set(seatId, { seatId, stateAbbr, stateName, seat, results: dedupeResults([results]) });
  };
  for (const race of senateData) {
    const abbr = race.id.replace(/-2$/, "");
    const seat2 = /-2$/.test(race.id);
    add(seat2 ? `${abbr.toLowerCase()}2` : abbr.toLowerCase(), abbr, race.name, seat2 ? 2 : 1, race.pastResults);
  }
  for (const e of senateNoElection) add(e.abbr.toLowerCase(), e.abbr, e.state, 1, e.pastResults);
  for (const e of senateHoldovers) add(`${e.abbr.toLowerCase()}2`, e.abbr, e.state, 2, e.pastResults);
  return [...byId.values()];
}

function governorSeats(): Seat[] {
  const byId = new Map<string, Seat>();
  const add = (stateAbbr: string, stateName: string, results?: PastResult[]) => {
    const seatId = stateAbbr.toLowerCase();
    const cur = byId.get(seatId);
    if (cur) cur.results = dedupeResults([cur.results, results]);
    else byId.set(seatId, { seatId, stateAbbr, stateName, seat: null, results: dedupeResults([results]) });
  };
  for (const race of governorData) add(race.id, race.name, race.pastResults);
  for (const e of governorNoElection) add(e.abbr, e.state, e.pastResults);
  return [...byId.values()];
}

let seatCache: Partial<Record<PastElectionOffice, Map<string, Seat>>> = {};
function seatsFor(office: PastElectionOffice): Map<string, Seat> {
  const cached = seatCache[office];
  if (cached) return cached;
  const seats = office === "senate" ? senateSeats() : office === "governor" ? governorSeats() : office === "president" ? presidentSeats() : houseSeats();
  const map = new Map(seats.map((s) => [s.seatId, s]));
  seatCache = { ...seatCache, [office]: map };
  return map;
}

function hasPage(r: PastResult): boolean {
  return r.year >= FIRST_PAST_ELECTION_YEAR && r.year < electionYear;
}

/** Every (seat, year) that gets a page. */
export function listPastElections(office: PastElectionOffice): { id: string; year: string }[] {
  const out: { id: string; year: string }[] = [];
  for (const seat of seatsFor(office).values()) {
    for (const r of seat.results) if (hasPage(r)) out.push({ id: seat.seatId, year: String(r.year) });
  }
  return out;
}

/** Lightweight search metadata, using the same seats and eligibility as race pages. */
export function pastElectionSearchEntries(office: PastElectionOffice) {
  return [...seatsFor(office).values()].flatMap((seat) =>
    seat.results.filter(hasPage).map((result) => ({
      id: seat.seatId,
      state: seat.stateName,
      abbr: seat.stateAbbr,
      seat: seat.seat,
      year: result.year,
      special: isSpecialType(result.electionType),
      candidates: [result.demCandidate, result.repCandidate].filter(Boolean).join(" "),
      href: `/${office}/${seat.seatId}/${result.year}`,
    })),
  );
}

/** The page's URL when it exists, else undefined — link sites call this instead of guessing. */
export function pastElectionHref(office: PastElectionOffice, seatId: string, year: number): string | undefined {
  const seat = seatsFor(office).get(seatId.toLowerCase());
  if (!seat) return undefined;
  const r = seat.results.find((x) => x.year === year);
  if (!r || !hasPage(r)) return undefined;
  return `/${office}/${seat.seatId}/${year}`;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** First Tuesday after the first Monday in November. */
function generalElectionDate(year: number): string {
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 = Sunday
  const firstMonday = 1 + ((8 - nov1) % 7);
  const tuesday = firstMonday + 1;
  return `${year}-11-${String(tuesday).padStart(2, "0")}`;
}

// Decisive rounds that were not the November general. Keyed office-STATE-year[-special].
const DECIDED_ON: Record<string, { date: string; label: string }> = {
  "senate-GA-2022": { date: "2022-12-06", label: "Runoff" },
  "senate-GA-2020": { date: "2021-01-05", label: "Runoff" },
  "senate-GA-2020-special": { date: "2021-01-05", label: "Runoff" },
  "senate-LA-2016": { date: "2016-12-10", label: "Runoff" },
  "senate-MS-2018-special": { date: "2018-11-27", label: "Runoff" },
  "governor-LA-2019": { date: "2019-11-16", label: "Runoff" },
  "governor-LA-2023": { date: "2023-10-14", label: "Jungle primary, decided outright" },
  "house-LA-03-2016": { date: "2016-12-10", label: "Runoff" },
  "house-LA-04-2016": { date: "2016-12-10", label: "Runoff" },
  "house-LA-05-2020": { date: "2020-12-05", label: "Runoff" },
};

/** Year of the congressional map in force for a House election year (lib/congressionalDistricts.ts). */
function houseMapYear(year: number): number {
  if (year <= 2017) return 2016;
  if (year <= 2019) return 2018;
  if (year <= 2021) return 2020;
  if (year <= 2023) return 2022;
  return 2024;
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function calendarRunoff(office: PastElectionOffice, stateAbbr: string, year: number, isSpecial: boolean, seatName?: string): boolean {
  const kind = office === "senate" ? "S" : office === "governor" ? "G" : office === "president" ? "P" : "H";
  return raceCalendar.some((r) => r.kind === kind && r.state === stateAbbr && r.year === year
    && (kind !== "H" || r.seat === seatName)
    && (r.raceClass === "Special") === isSpecial && r.runoff);
}

// ── Assembly ──────────────────────────────────────────────────────────────────

function countySource(office: PastElectionOffice): Record<string, { state: string; countyName: string }> {
  return office === "senate" ? countySenateData : office === "governor" ? countyGovernorData : office === "president" ? countyPresidentialData : {};
}

function houseCountyResult(r: { dem: number; gop: number; oth: number; total: number }): CountyYearResult {
  const total = r.total || r.dem + r.gop + r.oth;
  const demPct = total ? parseFloat(((r.dem / total) * 100).toFixed(2)) : 0;
  const repPct = total ? parseFloat(((r.gop / total) * 100).toFixed(2)) : 0;
  return { demVotes: r.dem, repVotes: r.gop, othVotes: r.oth, totalVotes: total, demPct, repPct, margin: parseFloat((repPct - demPct).toFixed(2)) };
}

function countyResult(office: PastElectionOffice, fips: string, year: number, isSpecial: boolean): CountyYearResult | null {
  if (office === "senate") {
    const c = countySenateData[fips];
    if (!c) return null;
    return (isSpecial ? c.specialYears[year] : c.years[year]) ?? null;
  }
  if (office === "governor") return countyGovernorData[fips]?.years[year] ?? null;
  if (office === "president") return countyPresidentialData[fips]?.years[year as 2016 | 2020 | 2024] ?? null;
  return null;
}

function warOffice(office: PastElectionOffice): "S" | "G" | "P" | "H" {
  return office === "senate" ? "S" : office === "governor" ? "G" : office === "president" ? "P" : "H";
}

function warRaceLabel(office: PastElectionOffice, isSpecial: boolean, seatName?: string): string {
  if (office === "house") return `House ${seatName}`;
  return office === "senate" ? (isSpecial ? "Senate Special" : "Senate") : office === "governor" ? "Governor" : "President";
}

let warByKey: Map<string, ReturnType<typeof computeWarTable>> | null = null;
function warRows(office: PastElectionOffice, stateAbbr: string, year: number, isSpecial: boolean, seatName?: string) {
  if (!warByKey) {
    warByKey = new Map();
    for (const row of computeWarTable()) {
      if (row.office !== "S" && row.office !== "G" && row.office !== "P" && row.office !== "H") continue;
      const key = `${row.office}:${row.state}:${row.race}:${row.year}`;
      const list = warByKey.get(key);
      if (list) list.push(row); else warByKey.set(key, [row]);
    }
  }
  return warByKey.get(`${warOffice(office)}:${stateAbbr}:${warRaceLabel(office, isSpecial, seatName)}:${year}`) ?? [];
}

const POLL_WINDOW_DAYS = 21;
const POLL_FALLBACK_WINDOW_DAYS = 60;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

function buildPolling(office: PastElectionOffice, stateAbbr: string, year: number, isSpecial: boolean, electionDay: string, actualMargin: number, runoff: boolean, seatName?: string): PastElectionPolling | null {
  const all = office === "president"
    ? historicalPresidentPolls(stateAbbr, year)
    : historicalRacePolls(warOffice(office) as "S" | "G" | "H", stateAbbr, warRaceLabel(office, isSpecial, seatName), year);
  if (all.length === 0) return null;
  const within = (days: number) => all.filter((p) => {
    const d = daysBetween(p.endDate, electionDay);
    return d >= 0 && d <= days;
  });
  let windowDays = POLL_WINDOW_DAYS;
  let polls = within(windowDays);
  if (polls.length < 3) { windowDays = POLL_FALLBACK_WINDOW_DAYS; polls = within(windowDays); }
  if (polls.length === 0) return null;
  const avgDemMargin = polls.reduce((s, p) => s + (p.dem - p.rep), 0) / polls.length;
  return {
    polls,
    windowDays,
    avgDemMargin,
    // The archive's polls are of the November round; when the stored result is a runoff the two
    // are not the same contest, so no error figure is reported.
    errorTowardDem: runoff ? null : (-actualMargin) - avgDemMargin,
    totalPolls: all.length,
  };
}

export function getPastElection(office: PastElectionOffice, seatIdRaw: string, year: number): PastElection | null {
  const seat = seatsFor(office).get(seatIdRaw.toLowerCase());
  if (!seat) return null;
  const r = seat.results.find((x) => x.year === year);
  if (!r || !hasPage(r)) return null;

  const isSpecial = isSpecialType(r.electionType);
  const seatName = office === "house" ? seat.seatId.toUpperCase() : undefined;
  const runoff = calendarRunoff(office, seat.stateAbbr, year, isSpecial, seatName);
  const override = DECIDED_ON[office === "house" ? `house-${seatName}-${year}` : `${office}-${seat.stateAbbr}-${year}${isSpecial ? "-special" : ""}`];
  const generalDay = generalElectionDate(year);
  const decidedOn = override?.date ?? generalDay;
  const dateLabel = `${override?.label ?? "General election"}, ${formatLongDate(decidedOn)}`;

  const demParty: Party = r.demParty ?? "D";
  const repParty: Party = r.repParty ?? "R";
  const margin = r.margin ?? parseFloat((r.repPct - r.demPct).toFixed(2));
  const winner: "dem" | "rep" = margin < 0 ? "dem" : "rep";
  const uncontested = (!r.demCandidate && r.demPct === 0) || (!r.repCandidate && r.repPct === 0);

  const rows = warRows(office, seat.stateAbbr, year, isSpecial, seatName);
  const warFor = (name: string | undefined) => {
    if (!name) return null;
    const row = rows.find((w) => w.candidate === name);
    return row ? row.war : null;
  };
  const anyRow = rows[0];
  const model = anyRow ? { expected: anyRow.expected, residual: margin - anyRow.expected } : null;

  const totalVotes = r.totalVotes ?? null;
  const demVotes = r.demVotes ?? null;
  const repVotes = r.repVotes ?? null;
  const otherVotes = totalVotes != null && demVotes != null && repVotes != null ? Math.max(0, totalVotes - demVotes - repVotes) : null;
  const otherPct = otherVotes != null && totalVotes ? parseFloat(((otherVotes / totalVotes) * 100).toFixed(2)) : null;

  const prevResult = [...seat.results].filter((x) => x.year < year).sort((a, b) => b.year - a.year)[0] ?? null;
  const previous = prevResult ? (() => {
    const pm = prevResult.margin ?? (prevResult.repPct - prevResult.demPct);
    const pWinnerDem = pm < 0;
    return {
      year: prevResult.year,
      margin: pm,
      totalVotes: prevResult.totalVotes ?? null,
      winnerName: (pWinnerDem ? prevResult.demCandidate : prevResult.repCandidate) ?? (pWinnerDem ? "Democrat" : "Republican"),
      winnerParty: (pWinnerDem ? prevResult.demParty ?? "D" : prevResult.repParty ?? "R") as Party,
      isSpecial: isSpecialType(prevResult.electionType),
    };
  })() : null;

  const source = countySource(office);
  const stateCounties = Object.entries(source).filter(([, c]) => c.state === seat.stateAbbr);
  const counties: PastElectionCounty[] = [];
  let house: HouseMapInfo | null = null;
  if (office === "house") {
    const dnum = seat.district ?? 1;
    const rowsNow = houseDistrictCountyRows(year, seat.stateAbbr, dnum);
    const prevRows = previous ? houseDistrictCountyRows(previous.year, seat.stateAbbr, dnum) : [];
    for (const row of rowsNow) {
      const prevRow = prevRows.find((p) => p.fips === row.fips);
      counties.push({
        fips: row.fips, name: row.name, result: houseCountyResult(row),
        previous: prevRow ? houseCountyResult(prevRow) : null,
        houseSplit: row.split, hasGeometry: row.hasGeometry,
      });
    }
    const mapYear = houseMapYear(year);
    house = {
      piecesUrl: `/house-county-pieces/${mapYear}/${seat.stateAbbr}.json`,
      district: dnum,
      mapYear,
      linesChanged: (seat.geoid ? houseDistrictInfo[seat.geoid] ?? [] : []).some((b) => b.year === year),
      gaps: houseDistrictCountyGaps(year, seat.stateAbbr),
      splitCounties: rowsNow.filter((row) => row.split).length,
      source: rowsNow[0]?.source ?? null,
      status: rowsNow[0]?.status ?? null,
    };
  } else {
    for (const [fips, c] of stateCounties) {
      const result = countyResult(office, fips, year, isSpecial);
      if (!result) continue;
      const prevCounty = previous ? countyResult(office, fips, previous.year, previous.isSpecial) : null;
      counties.push({ fips, name: c.countyName, result, previous: prevCounty });
    }
  }
  counties.sort((a, b) => b.result.totalVotes - a.result.totalVotes);

  const seatElections = seat.results.filter(hasPage).map((x) => ({
    year: x.year,
    href: `/${office}/${seat.seatId}/${x.year}`,
    isSpecial: isSpecialType(x.electionType),
  }));

  const officeLabel = office === "senate" ? "U.S. Senate" : office === "governor" ? "Governor" : office === "president" ? "President" : "U.S. House";
  const atLarge = office === "house" && houseData.filter((h) => h.state === seat.stateName).length === 1 && (seat.district ?? 1) === 1;
  const seatLabel = office === "senate" ? `${seat.stateName} Senate · Seat ${seat.seat}`
    : office === "governor" ? `${seat.stateName} Governor`
    : office === "house" ? (atLarge ? `${seat.stateName} At-Large` : `${seat.stateName}'s ${ordinal(seat.district ?? 1)} District`)
    : seat.stateName;
  // A state's district electoral votes (ME-01, NE-02…) are stored under their own keys.
  const presRows = office === "president"
    ? Object.entries(presPastResults).filter(([k]) => k === seat.stateAbbr || k.startsWith(`${seat.stateAbbr}-`)).flatMap(([, rows]) => rows)
    : [];
  const electoralVotes = office === "president" ? presRows.find((x) => x.stateAbbr === seat.stateAbbr && x.year === year)?.electoralVotes ?? null : null;
  const districtResults = presRows
    .filter((x) => x.stateAbbr !== seat.stateAbbr && x.year === year)
    .sort((a, b) => a.stateAbbr.localeCompare(b.stateAbbr))
    .map((x) => ({ label: x.stateAbbr, margin: x.margin, electoralVotes: x.electoralVotes }));

  const candidate = (side: "dem" | "rep"): PastElectionCandidate => {
    const name = side === "dem" ? r.demCandidate : r.repCandidate;
    const party = side === "dem" ? demParty : repParty;
    const fallback = party === "D" ? "Democratic candidate" : party === "R" ? "Republican candidate" : "Independent candidate";
    return {
      name: name ?? fallback,
      party,
      pct: side === "dem" ? r.demPct : r.repPct,
      votes: side === "dem" ? demVotes : repVotes,
      incumbent: side === "dem" ? !!r.demIncumbent : !!r.repIncumbent,
      appointed: side === "dem" ? !!r.demAppointed : !!r.repAppointed,
      photo: name ? candidatePhotos[name] ?? null : null,
      war: warFor(name),
    };
  };

  const sources = office === "senate"
    ? ["Statewide results: state certified totals via Wikipedia", "Counties: OpenElections and state canvasses"]
    : office === "governor"
    ? ["Statewide results: state certified totals via Wikipedia", "Counties: state canvasses via Wikipedia"]
    : office === "president"
    ? ["Statewide results: state certified totals", "Counties: county presidential returns 2008–2024; Alaska boroughs reconstructed from precinct data"]
    : ["District results: state certified totals via Wikipedia", "Counties: county canvasses; split counties from MIT Election Lab precinct returns"];

  return {
    office,
    officeLabel,
    seatId: seat.seatId,
    seatHref: office === "president" || (office === "house" && seat.hasSeatPage === false) ? `/states/${seat.stateAbbr.toLowerCase()}` : `/${office}/${seat.seatId}`,
    seatLabel,
    stateAbbr: seat.stateAbbr,
    stateName: seat.stateName,
    year,
    href: `/${office}/${seat.seatId}/${year}`,
    isSpecial,
    seatClass: r.seatClass ?? null,
    electoralVotes,
    districtResults,
    house,
    runoff,
    decidedOn,
    dateLabel,
    dem: candidate("dem"),
    rep: candidate("rep"),
    otherVotes,
    otherPct,
    totalVotes,
    margin,
    voteMargin: demVotes != null && repVotes != null ? repVotes - demVotes : null,
    winner,
    uncontested,
    previous,
    swing: previous ? parseFloat((margin - previous.margin).toFixed(2)) : null,
    turnoutChangePct: previous?.totalVotes && totalVotes ? parseFloat((((totalVotes - previous.totalVotes) / previous.totalVotes) * 100).toFixed(1)) : null,
    counties,
    countiesInState: office === "house" ? counties.length : stateCounties.length,
    model,
    polling: buildPolling(office, seat.stateAbbr, year, isSpecial, override?.label === "Jungle primary, decided outright" ? decidedOn : generalDay, margin, runoff, seatName),
    seatElections,
    sources,
  };
}

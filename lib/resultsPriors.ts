import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { governorData, houseData, senateData, presPastResults, type RaceForecast } from "@/data/forecastData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { boundaryVintageForHouseYear, presByBoundaryVintage, PRES_YEARS_FOR_VINTAGE } from "@/data/presByBoundaryVintage";
import { pastElectionHref } from "@/lib/pastElections";
import { statesData } from "@/data/statesData";
import { forecastRace } from "@/lib/forecast";
import { projectRaceResults, shareBasis, type ProjectedCounty } from "@/lib/countyProjection";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { ABBR_TO_FIPS } from "@/lib/fips";
import { calculateDistrictTpl, getTplFit } from "@/lib/tplCompute";
import { countyLoadings } from "@/lib/resultsNightLoadings";
import { parseCsv } from "@/lib/turnout";
import { raceHref } from "@/lib/raceLinks";
import { candidatePhoto } from "@/lib/candidatePhotos";
import { house2024Baselines } from "@/lib/resultsSnapshot";
import type { CountyArea, PastRaceResult, PriorsSlice, RacePrior, ResultsOffice } from "@/lib/resultsTypes";

// The election-night priors: every 2026 race's forecast, nominees, poll-closing time, civicAPI id
// and pre-election county projection, in the client-safe shape the Results page's needle reads.
// Built once at build time into the static slice /api/results/priors/{office}; the forecast it
// carries is whatever the deploy's forecast is, so the election-day deploy is the frozen baseline.

type ClosingRow = { state: string; first_close_et: string; last_close_et: string; note: string };
type CivicRow = { office: string; state: string; district: string; civic_id: string; election_name: string; polls_close_utc: string };

let closingCache: Map<string, ClosingRow> | null = null;
function closing(): Map<string, ClosingRow> {
  return (closingCache ??= new Map(parseCsv(readFileSync(join(process.cwd(), "data-entry", "poll_closing_2026.csv"), "utf8")).map((r) => [r.state, r as ClosingRow])));
}

// A county's NCHS 2023 urban–rural code (data-entry/nchs_urban_rural_2023.csv, CDC), grouped as Pew
// Research does: urban = the central counties of large metros (1), suburban = the rest of the large
// metros and every medium and small metro county (2–4), rural = outside any metro (5–6).
let areaCache: Map<string, CountyArea> | null = null;
function countyArea(fips: string): CountyArea | null {
  areaCache ??= new Map(parseCsv(readFileSync(join(process.cwd(), "data-entry", "nchs_urban_rural_2023.csv"), "utf8")).map((r) => [r.fips, r.code === "1" ? "urban" : r.code === "5" || r.code === "6" ? "rural" : "suburban"]));
  return areaCache.get(fips) ?? null;
}

let civicCache: Map<string, CivicRow> | null = null;
/** `${office}|${state}|${district}` → the civicAPI row; district "" for statewide, "TX-23" / "AK-AL" for House. */
function civic(): Map<string, CivicRow> {
  if (civicCache) return civicCache;
  let rows: CivicRow[] = [];
  try { rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "civicapi_race_ids.csv"), "utf8")) as CivicRow[]; } catch { rows = []; }
  civicCache = new Map(rows.map((r) => [`${r.office}|${r.state}|${r.district}`, r]));
  return civicCache;
}

const STATE_ABBR = new Map(statesData.map((s) => [s.name, s.abbr]));
const STATE_NAME = new Map(statesData.map((s) => [s.abbr, s.name]));
const AT_LARGE = new Set(["AK", "DE", "ND", "SD", "VT", "WY"]);
const RCV_STATES = new Set(["AK", "ME"]);

function civicIdFor(office: ResultsOffice, state: string, race: RaceForecast): number | null {
  const map = civic();
  if (office === "house") {
    const n = Number(race.id.slice(2));
    const key = AT_LARGE.has(state) ? `${state}-AL` : `${state}-${String(n).padStart(2, "0")}`;
    const row = map.get(`house|${state}|${key}`) ?? map.get(`house|${state}|${state}-${n}`);
    return row ? Number(row.civic_id) : null;
  }
  const row = map.get(`${office}|${state}|`);
  return row ? Number(row.civic_id) : null;
}

function districtTpl(id: string): number | null {
  const v = calculateDistrictTpl(id);
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

const OFFICE_NAME = { house: "House", senate: "Senate", governor: "Governor" } as const;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A House race held on a map whose 2024 (or nearest) presidential vote for this district number
 *  differs from the 2026 lines' by 1.5+ pts: a redraw, so its margin isn't this district's. */
function onOldLines(districtKey: string, year: number): boolean {
  const vintage = boundaryVintageForHouseYear(year);
  const now = districtPresidentialData[districtKey];
  if (vintage == null || !now) return false;
  const nowMargin: Record<number, number> = { 2016: now.pres16Margin, 2020: now.pres20Margin, 2024: now.pres24Margin };
  return PRES_YEARS_FOR_VINTAGE[vintage].some((y) => {
    const then = presByBoundaryVintage[vintage]?.[y]?.[districtKey];
    return !then || Math.abs(then.margin - nowMargin[y]) >= 1.5;
  });
}

/** The race page's reference box: the seat's two latest elections and the 2024 presidential vote. */
function pastFor(office: ResultsOffice, race: RaceForecast, state: string, href: string): PastRaceResult[] {
  const seatId = office === "house" ? race.name.toLowerCase() : href.split("/").pop() ?? "";
  const districtKey = office === "house" ? String(Number(race.id)) : "";
  const seat = [...(race.pastResults ?? [])].sort((a, b) => b.year - a.year || (a.electionType === "Special" ? 1 : -1)).slice(0, 2).map((r): PastRaceResult => ({
    year: r.year,
    office: OFFICE_NAME[office],
    dem: { name: r.demCandidate ?? null, party: r.demParty ?? "D" },
    rep: { name: r.repCandidate ?? null, party: r.repParty ?? "R" },
    margin: r1(r.repPct - r.demPct),
    special: r.electionType === "Special",
    oldLines: office === "house" && onOldLines(districtKey, r.year),
    href: pastElectionHref(office, seatId, r.year) ?? null,
  }));
  const pres = presPastResults[state]?.find((r) => r.year === 2024);
  const presMargin = office === "house" ? districtPresidentialData[districtKey]?.pres24Margin : pres ? pres.repPct - pres.demPct : undefined;
  if (presMargin == null) return seat;
  return [...seat, {
    year: 2024, office: "President",
    dem: { name: pres?.demCandidate ?? "Kamala Harris", party: "D" }, rep: { name: pres?.repCandidate ?? "Donald Trump", party: "R" },
    margin: r1(presMargin), special: false, oldLines: false,
    href: office === "house" ? null : pastElectionHref("president", state.toLowerCase(), 2024) ?? null,
  }];
}

let houseSwingCache: ReturnType<typeof house2024Baselines> | null = null;

/** The race page's seat swing baseline. As on /analysis/post-election, a House seat needs a D vs R race in 2026. */
function seatSwingBase(office: ResultsOffice, race: RaceForecast, contested: boolean, past: PastRaceResult[]): RacePrior["seatSwingBase"] {
  if (!contested) return null;
  if (office !== "house") {
    const pres = past.find((r) => r.office === "President");
    return pres ? { margin: pres.margin, estimated: false } : null;
  }
  if (race.candidates?.dem.party !== "D" || race.candidates?.rep.party !== "R") return null;
  const base = (houseSwingCache ??= house2024Baselines()).get(race.name);
  return base ? { margin: Math.round(base.margin * 100) / 100, estimated: base.estimated } : null;
}

// ── The county table's swing baselines ────────────────────────────────────────

const r2 = (v: number) => Math.round(v * 100) / 100;
type Tally = { demVotes: number; repVotes: number; othVotes: number; totalVotes: number };
/** A margin to swing from: both major parties on the ballot here, or there is nothing to compare. A row
 *  whose votes don't add up to its total is a scrape error in the source file, so it is no baseline either. */
const contestedMargin = ({ demVotes, repVotes, othVotes, totalVotes }: Tally) =>
  demVotes > 0 && repVotes > 0 && totalVotes > 0 && Math.abs(demVotes + repVotes + othVotes - totalVotes) <= totalVotes * 0.02 ? r2(((repVotes - demVotes) / totalVotes) * 100) : null;

/** County FIPS → its 2024 House results, one row per district (the race id's form, "0512"). */
let house2024Cache: Map<string, (Tally & { district: string })[]> | null = null;
function house2024(): NonNullable<typeof house2024Cache> {
  if (house2024Cache) return house2024Cache;
  house2024Cache = new Map();
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_district_county_results.csv"), "utf8"))) {
    if (r.year !== "2024" || r.status === "missing" || !ABBR_TO_FIPS[r.state]) continue;
    const pieces = house2024Cache.get(r.county_fips) ?? [];
    pieces.push({ district: ABBR_TO_FIPS[r.state] + r.district.padStart(2, "0"), demVotes: Number(r.dem || 0), repVotes: Number(r.gop || 0), othVotes: Number(r.oth || 0), totalVotes: Number(r.total || 0) });
    house2024Cache.set(r.county_fips, pieces);
  }
  return house2024Cache;
}

/** The same place's 2024 House margin. Where the 2026 shares came from the 2024 pieces the lines held, so
 *  it is the district's own piece. On redrawn lines it is the whole county's House vote, so only for a
 *  county the district now holds entire; a piece of a county split on new lines has no 2024 count. */
function houseBaseline(fips: string, raceId: string, share: number): number | null {
  const pieces = house2024().get(fips);
  if (!pieces) return null;
  if (shareBasis(fips, raceId) === "pieces2024") {
    const own = pieces.find((p) => p.district === raceId);
    return own ? contestedMargin(own) : null;
  }
  if (share < 0.999 || pieces.some((p) => contestedMargin(p) == null)) return null;
  return contestedMargin(pieces.reduce((a, p) => ({ demVotes: a.demVotes + p.demVotes, repVotes: a.repVotes + p.repVotes, othVotes: a.othVotes + p.othVotes, totalVotes: a.totalVotes + p.totalVotes }), { demVotes: 0, repVotes: 0, othVotes: 0, totalVotes: 0 }));
}

/** The 2024 presidential margin in each of a House district's counties. A whole county is its count. No
 *  count exists for a piece of a split county, so a piece is estimated: the county's margin, plus the
 *  piece's 2024 House deviation from its county where there is one, then one shift across the district's
 *  pieces so the district adds up to its actual 2024 presidential margin. A district inside one county
 *  therefore reads exactly. */
function housePres24(raceId: string, counties: ProjectedCounty[]): Map<string, { margin: number; estimated: boolean }> {
  const rows = counties.flatMap((c) => {
    const p = countyPresidentialData[c.fips]?.years[2024];
    if (!p) return [];
    const split = c.share < 0.999;
    return [{ fips: c.fips, split, votes: p.totalVotes * c.share, margin: p.margin + (split ? c.pieceDeviation ?? 0 : 0) }];
  });
  const target = districtPresidentialData[String(Number(raceId))]?.pres24Margin;
  const votes = rows.reduce((a, r) => a + r.votes, 0), splitVotes = rows.reduce((a, r) => a + (r.split ? r.votes : 0), 0);
  const shift = target != null && splitVotes > 0 ? (target * votes - rows.reduce((a, r) => a + r.margin * r.votes, 0)) / splitVotes : 0;
  return new Map(rows.map((r) => [r.fips, { margin: r2(r.split ? Math.max(-100, Math.min(100, r.margin + shift)) : r.margin), estimated: r.split && rows.length > 1 }]));
}

type SenateRow = { state_abbr: string; year: string; class: string; type: string };
let senateRowsCache: SenateRow[] | null = null;
const senateRows = () => (senateRowsCache ??= parseCsv(readFileSync(join(process.cwd(), "data-entry", "senate_past_results.csv"), "utf8")) as SenateRow[]);

/** The state's last Senate election, if it was for the seat other than this race's. The seat is told apart by
 *  its class, found from the seat's own last election; the other seat counts from that same year on. */
function otherSenateElection(state: string, seatYear: number, seatSpecial: boolean): { year: number; special: boolean } | null {
  const rows = senateRows().filter((r) => r.state_abbr === state);
  const own = rows.find((r) => Number(r.year) === seatYear && (r.type === "Special") === seatSpecial);
  const latest = own && rows.filter((r) => r.class !== own.class).sort((a, b) => Number(b.year) - Number(a.year) || (a.type === "Special" ? 1 : -1))[0];
  return latest && Number(latest.year) >= seatYear ? { year: Number(latest.year), special: latest.type === "Special" } : null;
}

/** Each county's swing baselines, and the election the seat's baseline is. A Senate seat's is its own
 *  latest election, special or not, never the state's other seat. */
function swingBaselines(office: ResultsOffice, race: RaceForecast, state: string, counties: ProjectedCounty[]) {
  const last = office === "house" ? null : [...(race.pastResults ?? [])].sort((a, b) => b.year - a.year || (a.electionType === "Special" ? 1 : -1))[0];
  const special = last?.electionType === "Special";
  const pres = office === "house" ? housePres24(race.id, counties) : null;
  const other = office === "senate" && last ? otherSenateElection(state, last.year, special) : null;
  const otherTally = (fips: string): Tally | undefined => {
    if (!other) return undefined;
    const c = countySenateData[fips];
    return other.special ? c?.specialYears[other.year] : c?.years[other.year];
  };
  const seatTally = (fips: string): Tally | undefined => {
    if (!last) return undefined;
    if (office === "governor") return countyGovernorData[fips]?.years[last.year];
    const c = countySenateData[fips];
    return special ? c?.specialYears[last.year] : c?.years[last.year];
  };
  return {
    swingBase: office === "house" ? { year: 2024, special: false } : last ? { year: last.year, special } : null,
    otherSenateBase: other,
    byFips: new Map(counties.map((c) => {
      const tally = seatTally(c.fips), otherRow = otherTally(c.fips);
      const pres24 = pres ? pres.get(c.fips) : { margin: countyPresidentialData[c.fips]?.years[2024]?.margin, estimated: false };
      return [c.fips, {
        pastMargin: office === "house" ? houseBaseline(c.fips, race.id, c.share) : tally ? contestedMargin(tally) : null,
        ...(other ? { otherSenateMargin: otherRow ? contestedMargin(otherRow) : null } : {}),
        pres24: pres24?.margin ?? null,
        ...(pres24?.estimated ? { pres24Est: true } : {}),
      }];
    })),
  };
}

function priorFor(office: ResultsOffice, race: RaceForecast): RacePrior | null {
  const state = office === "house" ? race.name.slice(0, 2) : STATE_ABBR.get(race.state) ?? race.id.slice(0, 2);
  const f = forecastRace(race);
  const cp = projectRaceResults(office, race.id);
  const close = closing().get(state);
  const swing = swingBaselines(office, race, state, cp?.counties ?? []);
  const special = /special/i.test(race.electionType ?? "") || race.id === "OH-2" || race.id === "FL-2";
  const href = raceHref(office, race);
  const past = pastFor(office, race, state, href);
  return {
    office,
    id: race.id,
    civicId: civicIdFor(office, state, race),
    label: office === "house" ? race.name : `${race.name}${special ? " (special)" : ""}`,
    state,
    stateName: STATE_NAME.get(state) ?? race.state,
    href,
    dem: { name: race.candidates?.dem.name ?? "Democrat", party: race.candidates?.dem.party ?? "D", incumbent: !!race.candidates?.dem.incumbent, photo: candidatePhoto(race.candidates?.dem.name, state) },
    rep: { name: race.candidates?.rep.name ?? "Republican", party: race.candidates?.rep.party ?? "R", incumbent: !!race.candidates?.rep.incumbent, photo: candidatePhoto(race.candidates?.rep.name, state) },
    seatParty: race.seatParty ?? null,
    seatHolder: race.seatHolder ?? null,
    special,
    rcv: RCV_STATES.has(state),
    jungle: office === "house" && state === "LA",
    tpl: office === "house" ? districtTpl(race.id) : null,
    beta: Math.round((getTplFit().beta[state]?.shrunk ?? 1) * 1000) / 1000,
    forecast: { margin: f.margin, sigma: f.sigma, probability: f.probability, rating: f.rating, contest: f.contest, interval80: f.interval80 },
    pollsClose: { first: close?.first_close_et ?? "20:00", last: close?.last_close_et ?? close?.first_close_et ?? "20:00", note: close?.note || null },
    votes: cp?.votes ?? 0,
    counties: (cp?.counties ?? []).map((c) => ({ fips: c.fips, name: c.name, share: c.share, votes: c.votes, margin: c.margin, other: Math.round(((100 - c.demPct - c.repPct) || 0) * 100) / 100, tpl: c.tpl, benchmark: c.benchmark, ...countyLoadings(c.fips, c.margin), area: countyArea(c.fips), ...swing.byFips.get(c.fips) })),
    past,
    seatSwingBase: seatSwingBase(office, race, f.contest === "contested", past),
    swingBase: swing.swingBase,
    otherSenateBase: swing.otherSenateBase,
  };
}

const DATA: Record<ResultsOffice, RaceForecast[]> = { senate: senateData, governor: governorData, house: houseData };
const sliceCache = new Map<ResultsOffice, PriorsSlice>();

export function resultsPriors(office: ResultsOffice): PriorsSlice {
  let s = sliceCache.get(office);
  if (!s) {
    s = { office, builtAt: new Date().toISOString(), races: DATA[office].map((r) => priorFor(office, r)).filter((p): p is RacePrior => !!p) };
    sliceCache.set(office, s);
  }
  return s;
}

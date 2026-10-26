import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { governorData, houseData, senateData, type RaceForecast } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { forecastRace } from "@/lib/forecast";
import { projectRaceResults } from "@/lib/countyProjection";
import { parseCsv } from "@/lib/turnout";
import { raceHref } from "@/lib/raceLinks";
import { candidatePhoto } from "@/lib/candidatePhotos";
import type { PriorsSlice, RacePrior, ResultsOffice } from "@/lib/resultsTypes";

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

function priorFor(office: ResultsOffice, race: RaceForecast): RacePrior | null {
  const state = office === "house" ? race.name.slice(0, 2) : STATE_ABBR.get(race.state) ?? race.id.slice(0, 2);
  const f = forecastRace(race);
  const cp = projectRaceResults(office, race.id);
  const close = closing().get(state);
  const special = /special/i.test(race.electionType ?? "") || race.id === "OH-2" || race.id === "FL-2";
  return {
    office,
    id: race.id,
    civicId: civicIdFor(office, state, race),
    label: office === "house" ? race.name : `${race.name}${special ? " (special)" : ""}`,
    state,
    stateName: STATE_NAME.get(state) ?? race.state,
    href: raceHref(office, race),
    dem: { name: race.candidates?.dem.name ?? "Democrat", party: race.candidates?.dem.party ?? "D", incumbent: !!race.candidates?.dem.incumbent, photo: candidatePhoto(race.candidates?.dem.name, state) },
    rep: { name: race.candidates?.rep.name ?? "Republican", party: race.candidates?.rep.party ?? "R", incumbent: !!race.candidates?.rep.incumbent, photo: candidatePhoto(race.candidates?.rep.name, state) },
    seatParty: race.seatParty ?? null,
    seatHolder: race.seatHolder ?? null,
    special,
    rcv: RCV_STATES.has(state),
    jungle: office === "house" && state === "LA",
    forecast: { margin: f.margin, sigma: f.sigma, probability: f.probability, rating: f.rating, contest: f.contest, interval80: f.interval80 },
    pollsClose: { first: close?.first_close_et ?? "20:00", last: close?.last_close_et ?? close?.first_close_et ?? "20:00", note: close?.note || null },
    votes: cp?.votes ?? 0,
    counties: (cp?.counties ?? []).map((c) => ({ fips: c.fips, name: c.name, share: c.share, votes: c.votes, margin: c.margin, other: Math.round(((100 - c.demPct - c.repPct) || 0) * 100) / 100, tpl: c.tpl })),
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

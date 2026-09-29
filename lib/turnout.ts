import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData } from "@/data/countyHouseData";
import { houseDistrictInfo } from "@/data/forecastData";
import { raceCalendar } from "@/data/raceCalendar";
import { FIPS_TO_STATE } from "@/lib/fips";
import { pastElectionHref } from "@/lib/pastElections";
import {
  TURNOUT_YEARS, PRESIDENTIAL_YEARS, yearsForTurnoutLevel,
  type TurnoutOffice, type TurnoutLevel, type TurnoutRace, type TurnoutEntry, type TurnoutSlice,
  type StateSeries, type StateYearRow, type NationalYearRow,
} from "@/lib/turnoutTypes";

// ── The turnout data hub ──────────────────────────────────────────────────────
// Everything /analysis/turnout shows is derived here, on the server, from the certified
// statewide results (data-entry/*_past_results.csv), the statewide races re-cut by House
// district (house_statewide_results.csv), the county datasets (data/county*Data.ts) and the
// citizen voting-age population file scripts/fetch-cvap.py writes (data-entry/cvap.csv). The
// page fetches one static JSON slice per (level, year) — app/api/turnout/[level]/[year] — so
// none of the ~9 MB of county literals reaches the browser.
//
// Conventions (also printed as the page's notes):
//   • The turnout figure for a race is the votes cast in that race — not ballots cast, which no
//     state reports consistently. Blank and spoiled ballots are therefore outside every figure.
//   • Races decided in a runoff are counted at their FIRST ROUND (the November general), and
//     ranked-choice races at their first-choice count — both are the electorate that turned out
//     on election day. data-entry/turnout_first_round.csv holds those figures; the race pages
//     keep the decisive round.
//   • An unopposed House seat is counted as recorded: 0 where the state does not tally votes
//     for unopposed candidates (FL, OK, LA), its actual count where it does. Those seats are
//     flagged so the tables can show them, and lib/turnoutModel.ts imputes them.
//   • CVAP is the ACS 5-year release ending in the election year; see scripts/fetch-cvap.py for
//     the Connecticut and 2025 exceptions.

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** RFC-4180-ish CSV: quoted fields may hold commas ("1,234") and CRLF line ends are tolerated. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); if (row.some((c) => c.length > 0)) rows.push(row); }
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = s.replace(/,/g, "").trim();
  if (t === "" || t === "None" || t === "nan") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const pct = (a: number | null | undefined, b: number | null | undefined, digits: 1 | 2 = 1) =>
  a != null && b != null && b > 0 ? (digits === 1 ? round1((a / b) * 100) : round2((a / b) * 100)) : null;

/** The presidential county file types its years as literals; index it by any year. */
export const presYears = (fips: string): Partial<Record<number, { totalVotes: number }>> => (countyPresidentialData[fips]?.years ?? {}) as Partial<Record<number, { totalVotes: number }>>;

const STATE_FIPS_BY_ABBR: Record<string, string> = Object.fromEntries(Object.entries(FIPS_TO_STATE).map(([f, s]) => [s.abbr, f]));
export const stateNameOf = (abbr: string) => FIPS_TO_STATE[STATE_FIPS_BY_ABBR[abbr]]?.name ?? abbr;

// ── Raw loads ─────────────────────────────────────────────────────────────────

export type StatewideRace = {
  office: TurnoutOffice;
  state: string;
  year: number;
  votes: number | null;
  special: boolean;
  /** Senate seat number in senate_past_results.csv ("1" | "2"). */
  seat?: string;
  firstRound: boolean;
  /** Decided in a later round; `votes` is the first round when a first-round figure is on file. */
  runoff: boolean;
  /** House only: seats on the ballot, and seats where one major party was absent. */
  seats?: number;
  uncontested?: number;
  /** Republican-minus-Democratic margin in points (statewide offices), for the competitiveness checks. */
  margin?: number | null;
};

export type HouseDistrictRace = {
  /** 4-digit state FIPS + district ("0201" for at-large). */
  id: string;
  /** "AK-01" */
  name: string;
  state: string;
  year: number;
  votes: number | null;
  contested: boolean;
  firstRound: boolean;
  runoff: boolean;
};

export type FirstRoundOverride = { votes: number; source: string; note: string };

type Raw = {
  /** `${level}|${geoid}|${year}` → CVAP. District geoids carry both the "XX00" and "XX01" at-large spellings. */
  cvap: Map<string, number>;
  statewide: StatewideRace[];
  houseDistricts: HouseDistrictRace[];
  /** `${districtId}|${year}|${office}` → votes in the statewide race within the district (regular Senate). */
  statewideByDistrict: Map<string, number | null>;
  /** `${districtId}|${year}` → votes in the Senate special within the district. */
  senateSpecialByDistrict: Map<string, number | null>;
  /** `${districtId}|${year}|${office}|${special}` entries scaled from the runoff round to the first-round total. */
  scaledDistrictKeys: Set<string>;
  firstRound: Map<string, FirstRoundOverride>;
};

let rawCache: Raw | null = null;

const frKey = (office: string, state: string, year: number | string, seat: string) => `${office}|${state}|${year}|${seat}`;

function loadFirstRound(): Map<string, FirstRoundOverride> {
  const out = new Map<string, FirstRoundOverride>();
  const path = join(ROOT, "data-entry/turnout_first_round.csv");
  if (!existsSync(path)) return out;
  for (const r of parseCsv(readFileSync(path, "utf8"))) {
    const votes = num(r.first_round_total);
    if (votes == null) continue;
    out.set(frKey(r.office, r.state, r.year, r.seat ?? ""), { votes, source: r.source ?? "", note: r.notes ?? "" });
  }
  return out;
}

function runoffSet(): Set<string> {
  // The race calendar flags every race decided in a runoff; key it the way the CSVs do.
  const out = new Set<string>();
  for (const r of raceCalendar) {
    if (!r.runoff) continue;
    if (r.kind === "S") out.add(frKey("senate", r.state, r.year, r.seatSlot.replace("seat", "")));
    else if (r.kind === "G") out.add(frKey("governor", r.state, r.year, ""));
    else if (r.kind === "H") out.add(frKey("house", r.state, r.year, r.seatSlot));
  }
  return out;
}

export function turnoutRaw(): Raw {
  if (rawCache) return rawCache;
  const firstRound = loadFirstRound();
  const runoffs = runoffSet();

  const cvap = new Map<string, number>();
  for (const r of parseCsv(read("data-entry/cvap.csv"))) {
    const v = num(r.cvap);
    if (v == null) continue;
    cvap.set(`${r.level}|${r.geoid}|${r.year}`, v);
    if (r.level === "district" && r.geoid.endsWith("00")) cvap.set(`district|${r.geoid.slice(0, 2)}01|${r.year}`, v);
  }

  const statewide: StatewideRace[] = [];
  for (const r of parseCsv(read("data-entry/president_past_results.csv"))) {
    if (!/^[A-Z]{2}$/.test(r.state_abbr)) continue; // ME-01 style rows stay inside their state
    statewide.push({ office: "president", state: r.state_abbr, year: Number(r.year), votes: num(r.total_votes), special: false, firstRound: false, runoff: false, margin: num(r.margin) });
  }
  for (const r of parseCsv(read("data-entry/senate_past_results.csv"))) {
    const year = Number(r.year);
    const key = frKey("senate", r.state_abbr, year, r.seat);
    const fr = firstRound.get(key);
    statewide.push({ office: "senate", state: r.state_abbr, year, votes: fr ? fr.votes : num(r.total_votes), special: r.type === "Special", seat: r.seat, firstRound: !!fr, runoff: runoffs.has(key), margin: num(r.margin) });
  }
  for (const r of parseCsv(read("data-entry/governor_past_results.csv"))) {
    const year = Number(r.year);
    const key = frKey("governor", r.state_abbr, year, "");
    const fr = firstRound.get(key);
    statewide.push({ office: "governor", state: r.state_abbr, year, votes: fr ? fr.votes : num(r.total_votes), special: r.type === "Special", firstRound: !!fr, runoff: runoffs.has(key), margin: num(r.margin) });
  }

  const houseDistricts: HouseDistrictRace[] = [];
  for (const r of parseCsv(read("data-entry/house_past_results.csv"))) {
    const year = Number(r.year);
    const key = frKey("house", r.state_abbr, year, r.district_name);
    const fr = firstRound.get(key);
    const dem = num(r.dem_votes) ?? 0, rep = num(r.rep_votes) ?? 0;
    houseDistricts.push({
      id: r.district_id.padStart(4, "0"), name: r.district_name, state: r.state_abbr, year,
      votes: fr ? fr.votes : num(r.total_votes), contested: dem > 0 && rep > 0, firstRound: !!fr, runoff: runoffs.has(key),
    });
  }
  // House by state: the sum of its districts as recorded (an unopposed seat with no tally adds 0).
  const byState = new Map<string, HouseDistrictRace[]>();
  for (const d of houseDistricts) {
    const k = `${d.state}|${d.year}`;
    if (!byState.has(k)) byState.set(k, []);
    byState.get(k)!.push(d);
  }
  for (const [k, ds] of byState) {
    const [state, y] = k.split("|");
    statewide.push({
      office: "house", state, year: Number(y), votes: ds.reduce((s, d) => s + (d.votes ?? 0), 0), special: false,
      firstRound: ds.some((d) => d.firstRound), runoff: ds.some((d) => d.runoff),
      seats: ds.length, uncontested: ds.filter((d) => !d.contested).length,
    });
  }

  // Statewide races cut by House district. For a race decided in a runoff the file holds the
  // runoff round by district (sometimes only under a "(Runoff)" label), so those rows are scaled to
  // the first-round statewide total: the first round's distribution across districts is taken to
  // match the runoff's. Flagged `firstRound` on the district entries.
  const statewideByDistrict = new Map<string, number | null>();
  const senateSpecialByDistrict = new Map<string, number | null>();
  const scaledDistrictKeys = new Set<string>();
  type DRow = { id: string; year: number; state: string; office: TurnoutOffice; special: boolean; runoffRow: boolean; votes: number | null };
  const drows: DRow[] = [];
  for (const r of parseCsv(read("data-entry/house_statewide_results.csv"))) {
    const office: TurnoutOffice | null = r.race.startsWith("President") ? "president" : r.race.startsWith("Senate") ? "senate" : r.race.startsWith("Governor") ? "governor" : null;
    if (!office) continue;
    drows.push({ id: r.district_id.padStart(4, "0"), year: Number(r.year), state: r.state_abbr, office, special: r.race.includes("Special"), runoffRow: r.race.includes("Runoff"), votes: num(r.total_votes) });
  }
  const groups = new Map<string, DRow[]>();
  for (const d of drows) {
    const k = `${d.state}|${d.year}|${d.office}|${d.special ? 1 : 0}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  for (const [k, rows] of groups) {
    const [state, year, office, special] = k.split("|");
    const plain = rows.filter((d) => !d.runoffRow), runoffRows = rows.filter((d) => d.runoffRow);
    const hasTotals = (xs: DRow[]) => xs.some((d) => d.votes != null && d.votes > 0);
    const use = hasTotals(plain) ? plain : hasTotals(runoffRows) ? runoffRows : plain;
    // Scale to the first-round statewide total when one is on file for this race.
    const sw = statewide.find((x) => x.state === state && x.year === Number(year) && x.office === office && x.special === (special === "1") && x.firstRound && x.runoff);
    const sum = use.reduce((a, d) => a + (d.votes ?? 0), 0);
    const scale = sw && sw.votes && sum > 0 && Math.abs(sw.votes / sum - 1) > 0.02 ? sw.votes / sum : 1;
    for (const d of use) {
      const votes = d.votes == null ? null : scale === 1 ? d.votes : Math.round(d.votes * scale);
      const target = d.special ? senateSpecialByDistrict : statewideByDistrict;
      target.set(d.special ? `${d.id}|${d.year}` : `${d.id}|${d.year}|${d.office}`, votes);
      if (scale !== 1) scaledDistrictKeys.add(`${d.id}|${d.year}|${d.office}|${d.special ? 1 : 0}`);
    }
  }
  for (const [k, v] of senateSpecialByDistrict) {
    const [id, year] = k.split("|");
    if (!statewideByDistrict.has(`${id}|${year}|senate`)) {
      statewideByDistrict.set(`${id}|${year}|senate`, v); senateSpecialByDistrict.delete(k);
      if (scaledDistrictKeys.has(`${id}|${year}|senate|1`)) scaledDistrictKeys.add(`${id}|${year}|senate|0`);
    }
  }

  rawCache = { cvap, statewide, houseDistricts, statewideByDistrict, senateSpecialByDistrict, scaledDistrictKeys, firstRound };
  return rawCache;
}

/** US Elections Project (UF Election Lab) voting-eligible population, VAP and total ballots counted. */
let vepCache: Map<string, { vep: number; vap: number | null; ballots: number | null }> | null = null;
export function vepOf(state: string, year: number): { vep: number; vap: number | null; ballots: number | null } | null {
  if (!vepCache) {
    vepCache = new Map();
    for (const r of parseCsv(read("data-entry/vep_by_state.csv"))) {
      const vep = num(r.vep);
      if (vep != null) vepCache.set(`${r.state}|${r.year}`, { vep, vap: num(r.vap), ballots: num(r.total_ballots) });
    }
  }
  return vepCache.get(`${state}|${year}`) ?? null;
}

export const cvapOf = (level: TurnoutLevel, geoid: string, year: number): number | null => turnoutRaw().cvap.get(`${level}|${geoid}|${year}`) ?? null;

/** Statewide race totals for one state-year, regular Senate race first (special separately). */
export function statewideRaces(state: string, year: number): { races: Partial<Record<TurnoutOffice, StatewideRace>>; senateSpecial?: StatewideRace } {
  const races: Partial<Record<TurnoutOffice, StatewideRace>> = {};
  let senateSpecial: StatewideRace | undefined;
  for (const r of turnoutRaw().statewide) {
    if (r.state !== state || r.year !== year) continue;
    if (r.office === "senate") {
      if (r.special) senateSpecial = r; else races.senate = r;
    } else races[r.office] = r;
  }
  if (!races.senate && senateSpecial) { races.senate = senateSpecial; senateSpecial = undefined; }
  return { races, senateSpecial };
}

/** The presidential election a year's electorate is compared against: the same year, or the
 * most recent one before it (2016 has none on file). */
export function priorPresidentialYear(year: number): number | null {
  const prior = PRESIDENTIAL_YEARS.filter((y) => y <= year).pop() ?? null;
  return prior != null && prior < year ? prior : (year % 4 === 0 ? year - 4 : prior);
}
const hasPresData = (y: number | null): y is number => y != null && PRESIDENTIAL_YEARS.includes(y);

/** Did this state's House lines change between two elections? (houseDistrictInfo lists every redraw.) */
export function redrawnBetween(stateAbbr: string, fromYear: number, toYear: number): boolean {
  const fips = STATE_FIPS_BY_ABBR[stateAbbr];
  for (const [id, entries] of Object.entries(houseDistrictInfo)) {
    if (!id.startsWith(fips)) continue;
    if (entries.some((e) => e.year > fromYear && e.year <= toYear)) return true;
  }
  return false;
}

// ── Entry assembly ────────────────────────────────────────────────────────────

type RaceInput = { office: TurnoutOffice; votes: number | null; firstRound?: boolean; special?: boolean; uncontested?: boolean | number; seats?: number; priorRate?: number | null };

function assemble(name: string, state: string, cvap: number | null, inputs: RaceInput[], senateSpecialInput: RaceInput | null, priorPresVotes: number | null, moreInfoHref?: string | null): TurnoutEntry {
  const all = senateSpecialInput ? [...inputs, senateSpecialInput] : inputs;
  let top: TurnoutEntry["top"] = null;
  for (const r of all) if (r.votes != null && r.votes > 0 && (!top || r.votes > top.votes)) top = { office: r.office, votes: r.votes };
  const toRace = (r: RaceInput): TurnoutRace => {
    const rate = pct(r.votes, cvap);
    const out: TurnoutRace = { votes: r.votes, rate, ofTop: top ? pct(r.votes, top.votes) : null, change: rate != null && r.priorRate != null ? round1(rate - r.priorRate) : null };
    if (r.firstRound) out.firstRound = true;
    if (r.special) out.special = true;
    if (r.uncontested) out.uncontested = r.uncontested;
    if (r.seats != null) out.seats = r.seats;
    return out;
  };
  const races: Partial<Record<TurnoutOffice, TurnoutRace>> = {};
  for (const r of inputs) races[r.office] = toRace(r);
  const entry: TurnoutEntry = { name, state, cvap, top, ofPriorPresidential: top ? pct(top.votes, priorPresVotes) : null, races };
  if (senateSpecialInput) entry.senateSpecial = toRace(senateSpecialInput);
  if (moreInfoHref !== undefined) entry.moreInfoHref = moreInfoHref;
  return entry;
}

// ── State level ───────────────────────────────────────────────────────────────

const stateEntryCache = new Map<string, TurnoutEntry>();

export function stateEntry(abbr: string, year: number): TurnoutEntry {
  const key = `${abbr}|${year}`;
  const hit = stateEntryCache.get(key);
  if (hit) return hit;
  const fips = STATE_FIPS_BY_ABBR[abbr];
  const cvap = cvapOf("state", fips, year);
  const { races, senateSpecial } = statewideRaces(abbr, year);
  const priorOf = (office: TurnoutOffice): number | null => {
    if (year - 4 < TURNOUT_YEARS[0]) return null;
    const p = statewideRaces(abbr, year - 4);
    const pr = p.races[office];
    return pct(pr?.votes ?? null, cvapOf("state", fips, year - 4));
  };
  const toInput = (r: StatewideRace): RaceInput => ({ office: r.office, votes: r.votes, firstRound: r.firstRound, special: r.special, uncontested: r.uncontested, seats: r.seats, priorRate: priorOf(r.office) });
  const inputs = (Object.values(races) as StatewideRace[]).map(toInput);
  const priorPres = priorPresidentialYear(year);
  const priorPresVotes = hasPresData(priorPres) ? statewideRaces(abbr, priorPres).races.president?.votes ?? null : null;
  const href = races.president ? pastElectionHref("president", abbr, year) : races.governor ? pastElectionHref("governor", abbr, year) : races.senate ? pastElectionHref("senate", abbr, year) : undefined;
  const entry = assemble(stateNameOf(abbr), abbr, cvap, inputs, senateSpecial ? toInput(senateSpecial) : null, priorPresVotes, href ?? null);
  stateEntryCache.set(key, entry);
  return entry;
}

export const STATE_ABBRS: string[] = Object.values(FIPS_TO_STATE).map((s) => s.abbr).sort();

export function stateSeries(): StateSeries[] {
  return STATE_ABBRS.map((abbr) => ({
    abbr, name: stateNameOf(abbr),
    years: TURNOUT_YEARS.map((year): StateYearRow => {
      const e = stateEntry(abbr, year);
      const vep = vepOf(abbr, year);
      const row: StateYearRow = { year, cvap: e.cvap, vep: vep?.vep ?? null, ballots: vep?.ballots ?? null, races: e.races, top: e.top, ofPriorPresidential: e.ofPriorPresidential };
      if (e.senateSpecial) row.senateSpecial = e.senateSpecial;
      return row;
    }),
  }));
}

export function nationalRows(): NationalYearRow[] {
  return TURNOUT_YEARS.map((year) => {
    let cvap = 0;
    const votes: Partial<Record<TurnoutOffice, number>> = {};
    const states: Partial<Record<TurnoutOffice, number>> = {};
    for (const abbr of STATE_ABBRS) {
      const e = stateEntry(abbr, year);
      cvap += e.cvap ?? 0;
      for (const [office, r] of Object.entries(e.races) as [TurnoutOffice, TurnoutRace][]) {
        if (r.votes == null) continue;
        votes[office] = (votes[office] ?? 0) + r.votes;
        states[office] = (states[office] ?? 0) + 1;
      }
      if (e.senateSpecial?.votes != null) votes.senate = (votes.senate ?? 0) + e.senateSpecial.votes;
    }
    const rate: Partial<Record<TurnoutOffice, number>> = {};
    for (const [office, v] of Object.entries(votes) as [TurnoutOffice, number][]) {
      // A race held in only some states is rated against those states' CVAP.
      const denom = STATE_ABBRS.reduce((s, a) => { const e = stateEntry(a, year); return e.races[office]?.votes != null ? s + (e.cvap ?? 0) : s; }, 0);
      rate[office] = round1((v / denom) * 100);
    }
    return { year, cvap, votes, rate, states };
  });
}

function nationalBlock(year: number): TurnoutSlice["national"] {
  const row = nationalRows().find((r) => r.year === year)!;
  return { cvap: row.cvap, votes: row.votes, rate: row.rate };
}

// ── District level ────────────────────────────────────────────────────────────

export function districtEntries(year: number): Record<string, TurnoutEntry> {
  const raw = turnoutRaw();
  const out: Record<string, TurnoutEntry> = {};
  const districts = raw.houseDistricts.filter((d) => d.year === year);
  const byId = new Map(raw.houseDistricts.map((d) => [`${d.id}|${d.year}`, d]));
  for (const d of districts) {
    const cvap = cvapOf("district", d.id, year);
    const inputs: RaceInput[] = [];
    // Only when the lines are the same: a district code's turnout four years earlier is a different
    // district after a redraw.
    let priorRate: number | null = null;
    if (year - 4 >= TURNOUT_YEARS[0] && !redrawnBetween(d.state, year - 4, year)) {
      const p = byId.get(`${d.id}|${year - 4}`);
      priorRate = pct(p?.votes ?? null, cvapOf("district", d.id, year - 4));
    }
    inputs.push({ office: "house", votes: d.votes, firstRound: d.firstRound, uncontested: !d.contested, priorRate });
    for (const office of ["president", "senate", "governor"] as TurnoutOffice[]) {
      const k = `${d.id}|${year}|${office}`;
      if (raw.statewideByDistrict.has(k)) inputs.push({ office, votes: raw.statewideByDistrict.get(k) ?? null, firstRound: raw.scaledDistrictKeys.has(`${k}|0`) || undefined });
    }
    const spKey = `${d.id}|${year}`;
    const senateSpecial: RaceInput | null = raw.senateSpecialByDistrict.has(spKey) ? { office: "senate", votes: raw.senateSpecialByDistrict.get(spKey) ?? null, special: true, firstRound: raw.scaledDistrictKeys.has(`${d.id}|${year}|senate|1`) || undefined } : null;
    const priorPres = priorPresidentialYear(year);
    const priorPresVotes = hasPresData(priorPres) && !redrawnBetween(d.state, priorPres, year) ? raw.statewideByDistrict.get(`${d.id}|${priorPres}|president`) ?? null : null;
    const entry = assemble(d.name, d.state, cvap, inputs, senateSpecial, priorPresVotes, pastElectionHref("house", d.name, year) ?? null);
    out[d.id] = entry;
    if (d.id.endsWith("01") && !districts.some((o) => o.id === d.id.slice(0, 2) + "02")) out[d.id.slice(0, 2) + "00"] = entry; // at-large alias for TIGER geoids
  }
  return out;
}

// ── County level ──────────────────────────────────────────────────────────────

/** County files hold the decisive round of a runoff race; the statewide figure is the first round.
 *  Scale the counties so they sum to it (the first round's distribution is taken to match the runoff's). */
const runoffScaleCache = new Map<string, number>();
export function countyRunoffScale(state: string, year: number, office: "senate" | "governor", special: boolean): number {
  const key = `${state}|${year}|${office}|${special ? 1 : 0}`;
  const hit = runoffScaleCache.get(key);
  if (hit != null) return hit;
  let scale = 1;
  const { races, senateSpecial } = statewideRaces(state, year);
  const sw = office === "governor" ? races.governor : special ? senateSpecial ?? (races.senate?.special ? races.senate : undefined) : races.senate;
  if (sw && sw.runoff && sw.firstRound && sw.votes) {
    let sum = 0;
    const src = office === "governor" ? countyGovernorData : countySenateData;
    for (const [fips, c] of Object.entries(src)) {
      if (c.state !== state || !isCountyFips(fips)) continue;
      const v = office === "governor" ? (c as { years: Partial<Record<number, { totalVotes: number }>> }).years[year]?.totalVotes : special ? (c as { specialYears?: Partial<Record<number, { totalVotes: number }>> }).specialYears?.[year]?.totalVotes : (c as { years: Partial<Record<number, { totalVotes: number }>> }).years[year]?.totalVotes;
      sum += v ?? 0;
    }
    if (sum > 0 && Math.abs(sw.votes / sum - 1) > 0.02) scale = sw.votes / sum;
  }
  runoffScaleCache.set(key, scale);
  return scale;
}


const areaLabel = (abbr: string) => (abbr === "LA" ? "Parish" : abbr === "AK" ? "Borough" : "County");
const isCountyFips = (fips: string) => /^\d{5}$/.test(fips) && !!FIPS_TO_STATE[fips.slice(0, 2)];

export function countyEntries(year: number): Record<string, TurnoutEntry> {
  const raw = turnoutRaw();
  const contested = new Map<string, boolean>();
  for (const d of raw.houseDistricts) contested.set(`${d.id}|${d.year}`, d.contested);
  const out: Record<string, TurnoutEntry> = {};
  const fipsSet = new Set<string>([...Object.keys(countyPresidentialData), ...Object.keys(countySenateData), ...Object.keys(countyGovernorData), ...Object.keys(countyHouseData)].filter(isCountyFips));
  for (const fips of fipsSet) {
    const stateFips = fips.slice(0, 2);
    const abbr = FIPS_TO_STATE[stateFips].abbr;
    const meta = countyPresidentialData[fips] ?? countySenateData[fips] ?? countyGovernorData[fips] ?? countyHouseData[fips];
    const cvap = cvapOf("county", fips, year);
    const inputs: RaceInput[] = [];
    const priorRateOf = (votes: number | null | undefined) => (votes == null ? null : pct(votes, cvapOf("county", fips, year - 4)));
    const pres = presYears(fips)[year];
    if (pres) inputs.push({ office: "president", votes: pres.totalVotes, priorRate: priorRateOf(presYears(fips)[year - 4]?.totalVotes) });
    const sen = countySenateData[fips]?.years[year];
    const senSp = countySenateData[fips]?.specialYears?.[year];
    let senateSpecial: RaceInput | null = null;
    const sScale = countyRunoffScale(abbr, year, "senate", false), spScale = countyRunoffScale(abbr, year, "senate", true), gScale = countyRunoffScale(abbr, year, "governor", false);
    if (sen) inputs.push({ office: "senate", votes: Math.round(sen.totalVotes * sScale), firstRound: sScale !== 1 || undefined, priorRate: priorRateOf(countySenateData[fips]?.years[year - 4]?.totalVotes ?? countySenateData[fips]?.specialYears?.[year - 4]?.totalVotes) });
    if (senSp) {
      if (sen) senateSpecial = { office: "senate", votes: Math.round(senSp.totalVotes * spScale), special: true, firstRound: spScale !== 1 || undefined };
      else inputs.push({ office: "senate", votes: Math.round(senSp.totalVotes * spScale), special: true, firstRound: spScale !== 1 || undefined, priorRate: priorRateOf(countySenateData[fips]?.years[year - 4]?.totalVotes) });
    }
    const gov = countyGovernorData[fips]?.years[year];
    if (gov) inputs.push({ office: "governor", votes: Math.round(gov.totalVotes * gScale), firstRound: gScale !== 1 || undefined, priorRate: priorRateOf(countyGovernorData[fips]?.years[year - 4]?.totalVotes) });
    const house = countyHouseData[fips]?.years[year];
    if (house) {
      const unc = (house.districts ?? []).filter((n) => contested.get(`${stateFips}${String(n).padStart(2, "0")}|${year}`) === false).length;
      inputs.push({ office: "house", votes: house.totalVotes, uncontested: unc, priorRate: priorRateOf(countyHouseData[fips]?.years[year - 4]?.totalVotes) });
    }
    if (inputs.length === 0) continue;
    const priorPres = priorPresidentialYear(year);
    const priorPresVotes = hasPresData(priorPres) ? presYears(fips)[priorPres]?.totalVotes ?? null : null;
    out[fips] = assemble(`${meta.countyName} ${areaLabel(abbr)}`, abbr, cvap, inputs, senateSpecial, priorPresVotes, `/historical/${fips}`);
  }
  return out;
}

// ── Slices ────────────────────────────────────────────────────────────────────

export function buildTurnoutSlice(level: TurnoutLevel, year: number): TurnoutSlice {
  const entries = level === "state"
    ? Object.fromEntries(STATE_ABBRS.map((abbr) => [STATE_FIPS_BY_ABBR[abbr], stateEntry(abbr, year)]))
    : level === "district" ? districtEntries(year) : countyEntries(year);
  return { level, year, entries, national: nationalBlock(year) };
}

export function allTurnoutSliceParams(): { level: TurnoutLevel; year: string }[] {
  const out: { level: TurnoutLevel; year: string }[] = [];
  for (const level of ["state", "district", "county"] as TurnoutLevel[]) for (const y of yearsForTurnoutLevel(level)) out.push({ level, year: String(y) });
  return out;
}

/** The first-round figures in use, for the page's notes. */
export function firstRoundNotes(): { office: TurnoutOffice; state: string; year: number; seat: string; votes: number; source: string; note: string }[] {
  return [...turnoutRaw().firstRound.entries()].map(([k, v]) => {
    const [office, state, year, seat] = k.split("|");
    return { office: office as TurnoutOffice, state, year: Number(year), seat, votes: v.votes, source: v.source, note: v.note };
  }).sort((a, b) => a.year - b.year || a.state.localeCompare(b.state));
}

import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { popVoteData, presIncParty } from "@/data/popVoteData";
import { getCongressionalDistrictsGeoUrl } from "@/lib/congressionalDistricts";
import { ELECTION_YEAR } from "@/lib/electionYear";
import { forecastNow } from "@/lib/forecastClock";
import { buildMapSlice } from "@/lib/mapSlices";
import { yearsForLevel } from "@/lib/mapSliceTypes";
import { buildModelSummary } from "@/lib/modelSlices";
import { pastRaceTableRows, type PastElectionOffice } from "@/lib/pastElections";
import { readPastPostElection } from "@/lib/pastPostElection";
import { STATES_10M_URL } from "@/lib/projectedMaps";
import { raceHref } from "@/lib/raceLinks";
import { partyVotes } from "@/lib/resultsNeedle";
import { houseNationalPopularVote, houseStatePopularVote, readResultsSnapshot } from "@/lib/resultsSnapshot";
import { readStateLegSnapshot } from "@/lib/stateLegResultsSnapshot";
import { computeTrumpApprovalAverage } from "@/lib/trumpApprovalAverage";
import { parseCsv } from "@/lib/turnout";
import type { LegChamberResult, PostElectionRow } from "@/lib/postElectionTypes";
import type { Tally, YearEnvironment, YearEnvironmentOffice, YearFlip, YearMapUnit, YearOfficeSummary, YearPageData, YearParty, YearStates, YearUnitClass, YearVote } from "@/lib/yearPageTypes";

// The Years page (/years, /years/[year]): one election year as a whole. Every figure is read from
// data the site already shows elsewhere, so the page agrees with them:
//   - races, winners and flips: the past-election pages' table rows (lib/pastElections.ts
//     pastRaceTableRows, whose flip rule is lib/seatFlips.ts), or for the newest year the saved
//     results snapshot (lib/resultsSnapshot.ts);
//   - the national environment: the TPL hub's National Environment rows (lib/modelSlices.ts);
//   - popular votes as cast and presidential approval: data/popVoteData.ts;
//   - legislatures: data-entry/state_leg.csv through lib/pastPostElection.ts, or the saved
//     state-legislative results for the newest year.
// Seat counts: a chamber's seats after the election less the net of the flips on its map give the
// seats before, so the bar and the map always agree. The House compares with the previous
// election's result instead: after a redraw its districts have no one previous holder.

type RaceOffice = "president" | "senate" | "house" | "governor";

type Race = {
  office: RaceOffice;
  state: string;
  stateName: string;
  label: string;
  /** House: the district's GEOID in the data's convention (at-large = "01"). */
  geoid?: string;
  special: boolean;
  /** Null for a race not yet called, or one whose winner was never seated. */
  winner: YearParty | null;
  winnerName: string | null;
  flipped: boolean;
  margin: number | null;
  href: string | null;
  uncontested: boolean;
  vacant?: boolean;
};

const num = (v: string | undefined) => Number((v ?? "").replace(/,/g, "")) || 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const PARTY_NAME: Record<YearParty, string> = { D: "Democrats", R: "Republicans", I: "Independents" };
const fmtMargin = (m: number | null) => (m == null ? "" : m === 0 ? "Even" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const asParty = (p: string | null | undefined): YearParty => (p === "D" || p === "R" ? p : "I");
/** Independents have won only from the Democratic slot (King, Sanders, Walker) and sit with it in a tally, as lib/seatFlips.ts counts them. */
const side = (p: YearParty): "dem" | "rep" => (p === "R" ? "rep" : "dem");

/** House winners whose election was never certified: the seat stayed vacant (NC-09, 2018). */
const NOT_SEATED = new Set(["3709:2018"]);

// ── Lookups ──────────────────────────────────────────────────────────────────

let snapshotCache: ReturnType<typeof readResultsSnapshot> | null = null;
const snapshot = () => (snapshotCache ??= readResultsSnapshot());

let lookupCache: { names: Record<string, string>; fips: Record<string, string> } | null = null;
/** State names and FIPS codes by abbreviation, from the newest year's House rows (every state has one). */
function stateLookup() {
  if (lookupCache) return lookupCache;
  const names: Record<string, string> = { DC: "District of Columbia" }, fips: Record<string, string> = {};
  for (const r of snapshot().rows) {
    names[r.prior.state] = r.prior.stateName;
    if (r.prior.office === "house") fips[r.prior.state] = r.prior.id.slice(0, 2);
  }
  lookupCache = { names, fips };
  return lookupCache;
}

// ── Races ────────────────────────────────────────────────────────────────────

function pastRaces(office: RaceOffice, year: number): Race[] {
  const { fips } = stateLookup();
  return pastRaceTableRows(office as PastElectionOffice, year).map((r): Race => {
    const winnerSide = r.margin !== 0 ? (r.margin > 0 ? r.rep : r.dem) : r.rep.name && !r.dem.name ? r.rep : r.dem;
    const geoid = office === "house" && r.district != null ? `${fips[r.stateAbbr] ?? ""}${String(r.district).padStart(2, "0")}` : undefined;
    const vacant = !!geoid && NOT_SEATED.has(`${geoid}:${year}`);
    return {
      office, state: r.stateAbbr, stateName: r.stateName, label: r.label, geoid, special: r.special,
      winner: vacant ? null : asParty(winnerSide.party), winnerName: winnerSide.name, flipped: !vacant && r.flipped,
      margin: r.uncontested ? null : r.margin, href: r.href, uncontested: r.uncontested, vacant,
    };
  });
}

function snapshotRaces(office: RaceOffice): Race[] {
  return snapshot().rows.filter((r) => r.prior.office === office).map(({ prior, proj, live }): Race => {
    const winner = proj.locked && proj.winner ? asParty(proj.winner) : null;
    const winnerSide = winner == null ? null : prior.dem.party === prior.rep.party ? ((proj.currentMargin ?? 0) > 0 ? prior.rep : prior.dem) : prior.rep.party === winner ? prior.rep : prior.dem;
    return {
      office, state: prior.state, stateName: prior.stateName, label: office === "house" ? prior.label : prior.stateName, geoid: office === "house" ? prior.id : undefined, special: prior.special,
      winner, winnerName: winnerSide?.name ?? null, flipped: !!winner && !!prior.seatParty && winner !== prior.seatParty,
      margin: live && live.total > 0 ? proj.currentMargin : null, href: raceHref(office as Exclude<RaceOffice, "president">, { name: prior.label, id: prior.id }),
      uncontested: prior.forecast.contest.startsWith("uncontested"),
    };
  });
}

const racesFor = (office: RaceOffice, year: number): Race[] => (year === ELECTION_YEAR ? (office === "president" ? [] : snapshotRaces(office)) : pastRaces(office, year));

function tally(races: Race[]): Tally & { open: number } {
  const t = { dem: 0, rep: 0, oth: 0, open: 0 };
  for (const r of races) { if (r.winner) t[side(r.winner)]++; else t.open++; }
  return t;
}

/** Seats an independent held going in, "office:state:year": a flip there took nothing from the other party. */
const INDEPENDENT_HELD = new Set(["governor:AK:2018"]);

/** Each party's seats gained less seats lost among the flips on the map. */
function flipDelta(races: Race[], year: number): Tally {
  const d = { dem: 0, rep: 0, oth: 0 };
  for (const r of races) {
    if (!r.flipped || !r.winner) continue;
    const to = side(r.winner);
    d[to]++;
    d[INDEPENDENT_HELD.has(`${r.office}:${r.state}:${year}`) ? "oth" : to === "dem" ? "rep" : "dem"]--;
  }
  return d;
}

const flipsOf = (races: Race[]): YearFlip[] => races.filter((r) => r.flipped && r.winner)
  .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }))
  .map((r) => ({ label: `${r.label}${r.special ? " special" : ""}`, to: r.winner, name: r.winnerName, href: r.href }));

function raceLine(r: Race, withLabel: boolean, caucus: boolean): YearMapUnit["lines"][number] {
  const who = r.winner ? `${r.winnerName ?? PARTY_NAME[r.winner]} (${r.winner})` : r.vacant ? "Result not certified" : undefined;
  const head = r.vacant ? "Vacant" : !r.winner ? "Not called" : r.uncontested || r.margin == null ? "Unopposed" : fmtMargin(r.margin);
  return { label: r.special ? "Special election" : withLabel ? "Regular election" : undefined, head, sub: who, party: r.winner && caucus ? (side(r.winner) === "dem" ? "D" : "R") : r.winner, note: r.flipped ? "Flip" : undefined };
}

/** One map shape per state (statewide offices) or district (House), from the races in it. With
 *  `caucus`, an independent takes the colour of the party they sit with (the Senate's King and Sanders). */
function raceUnits(races: Race[], caucus = false): Record<string, YearMapUnit> {
  const shade = (w: YearParty | null): YearUnitClass => (w == null ? "open" : caucus ? (side(w) === "dem" ? "D" : "R") : w);
  const groups = new Map<string, Race[]>();
  for (const r of races) {
    const key = r.geoid ?? r.stateName;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const units: Record<string, YearMapUnit> = {};
  for (const [key, list] of groups) {
    const winners = new Set(list.map((r) => shade(r.winner)));
    const cls: YearUnitClass = winners.size > 1 ? "split" : shade(list[0].winner);
    units[key] = { title: list[0].geoid ? list[0].label : list[0].stateName, cls, flipped: list.some((r) => r.flipped), lines: list.map((r) => raceLine(r, list.length > 1, caucus)), href: (list.find((r) => !r.special) ?? list[0]).href };
    // The boundary files use the Census "00" at-large GEOID; the data uses "01".
    if (list[0].geoid?.endsWith("01")) units[`${list[0].geoid.slice(0, 2)}00`] = units[key];
  }
  return units;
}

// ── Popular votes and the environment ────────────────────────────────────────

/** An office's national vote as cast, R-positive: the Historical Results map's national total for
 *  the office and year (lib/mapSlices.ts, every race on file, the Senate's specials included, a
 *  same-party final counted for its party), so the two pages agree; the snapshot's counted votes
 *  for the newest year. data/popVoteData.ts is not used here: its hand-entered Senate totals count
 *  California's 2022 seat twice. */
function rawVote(office: RaceOffice, year: number): YearEnvironmentOffice["rawVotes"] {
  if (year === ELECTION_YEAR) {
    let dem = 0, rep = 0, total = 0;
    for (const { prior, live } of snapshot().rows) {
      if (prior.office !== office || !live || live.total <= 0) continue;
      const v = partyVotes(prior, live);
      dem += v.dem; rep += v.rep; total += live.total;
    }
    return total > 0 ? { dem, rep, total } : null;
  }
  if (!yearsForLevel(office, "state").includes(year)) return null;
  const a = buildMapSlice("state", office, year).aggregate;
  return a.totalVotes > 0 ? { dem: a.demVotes, rep: a.repVotes, total: a.totalVotes } : null;
}

/** Every legislative chamber's votes in the year, summed: state_leg.csv, or the saved 2026 results. */
function legislatureRawVote(year: number): YearEnvironmentOffice["rawVotes"] {
  let dem = 0, rep = 0, total = 0;
  if (year === ELECTION_YEAR) {
    for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_state_leg.csv"), "utf8"))) {
      if (r.race_type !== "General") continue;
      dem += num(r.dem_votes); rep += num(r.rep_votes); total += num(r.total_votes);
    }
  } else {
    for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "state_leg.csv"), "utf8"))) {
      if (num(r.year) !== year) continue;
      dem += num(r.dem_votes); rep += num(r.rep_votes); total += num(r.total_votes);
    }
  }
  return total > 0 ? { dem, rep, total } : null;
}

const marginOf = (v: YearEnvironmentOffice["rawVotes"]) => (v ? ((v.rep - v.dem) / v.total) * 100 : null);

const ENV_OFFICES: { key: YearEnvironmentOffice["key"]; label: string; office: RaceOffice | null }[] = [
  { key: "P", label: "President", office: "president" }, { key: "H", label: "House", office: "house" }, { key: "S", label: "Senate", office: "senate" },
  { key: "G", label: "Governor", office: "governor" }, { key: "L", label: "Legislatures", office: null },
];

function environment(year: number): YearEnvironment {
  const national = buildModelSummary().national.find((y) => y.year === year) ?? null;
  const offices = ENV_OFFICES.flatMap(({ key, label, office }): YearEnvironmentOffice[] => {
    const rawVotes = office ? rawVote(office, year) : legislatureRawVote(year);
    const cell = national?.cells[key] ?? null;
    if (!rawVotes && !cell) return [];
    return [{ key, label, raw: marginOf(rawVotes), rawVotes, adjusted: cell?.nm ?? null, share: national?.shares[key] ?? null, states: cell?.states ?? null }];
  });
  let president: YearEnvironment["president"] = null;
  if (year === ELECTION_YEAR) {
    // The site's own average on the day the forecast locked, election morning.
    const a = computeTrumpApprovalAverage(forecastNow());
    president = { name: "Trump", party: "R", approve: a.approve, disapprove: a.disapprove };
  } else {
    const row = popVoteData.find((r) => r.year === year);
    if (row) president = { name: row.presInc, party: presIncParty(row.presInc) === "rep" ? "R" : "D", approve: row.presApp, disapprove: row.presDisapp };
  }
  return { blended: national?.margin ?? null, env: national?.env ?? null, offices, president };
}

const voteOf = (env: YearEnvironment, key: YearEnvironmentOffice["key"]): YearVote => {
  const o = env.offices.find((x) => x.key === key);
  return { raw: o?.raw ?? null, adjusted: o?.adjusted ?? null };
};

// ── Seat counts ──────────────────────────────────────────────────────────────

/** Senate seats after each election, independents with the Democrats they caucus with. 2014 is the last election before the data. */
const SENATE_AFTER_2014: Tally = { dem: 46, rep: 54, oth: 0 };
const HOUSE_AFTER_2014: Tally = { dem: 188, rep: 247, oth: 0 };
const ELECTORAL_VOTES_2012: Tally = { dem: 332, rep: 206, oth: 0 };

/** Governorships after each election, from data/popVoteData.ts, with Alaska's independent Bill
 *  Walker (2014–2018) as the one other. Its 2016 row is the count after Jim Justice of West
 *  Virginia, elected a Democrat that year, changed parties in 2017; the election itself left 16. */
function governorsAfter(year: number): Tally | null {
  if (year === 2016) return { dem: 16, rep: 33, oth: 1 };
  const row = popVoteData.find((r) => r.year === year && r.type === "Governor");
  return row ? { dem: row.seatsD, rep: row.seatsR, oth: 50 - row.seatsD - row.seatsR } : null;
}

function senateAfter(year: number): Tally | null {
  if (year === 2014) return SENATE_AFTER_2014;
  const row = popVoteData.find((r) => r.year === year && r.type === "Senate");
  return row ? { dem: row.seatsD, rep: row.seatsR, oth: 0 } : null;
}

/** The chamber before and after: `after` from the record with `before` backed out of the map's
 *  flips, or for the newest year the last election's seats carried forward by them. */
function beforeAfter(year: number, races: Race[], afterOf: (y: number) => Tally | null, lastYear: number): { before: Tally; after: Tally } | null {
  const d = flipDelta(races, year);
  const known = afterOf(year);
  if (known) return { before: { dem: known.dem - d.dem, rep: known.rep - d.rep, oth: known.oth - d.oth }, after: known };
  const last = afterOf(lastYear);
  return last ? { before: last, after: { dem: last.dem + d.dem, rep: last.rep + d.rep, oth: last.oth + d.oth } } : null;
}

const gainText = (net: number, one: string, many = `${one}s`) => (net === 0 ? null : `${net > 0 ? "Democrats" : "Republicans"} gained ${plural(Math.abs(net), one, many)}`);

/** "Democrats gained 41 seats and won the House, 235–199." */
function chamberHeadline(name: string, before: Tally | null, after: Tally, tieBreak: "D" | "R" | null, open: number): string {
  const control = (t: Tally) => (t.dem > t.rep ? "D" : t.rep > t.dem ? "R" : tieBreak);
  const now = control(after), was = before ? control(before) : null;
  const net = before ? after.dem - before.dem : 0;
  const score = `${Math.max(after.dem, after.rep)}–${Math.min(after.dem, after.rep)}`;
  const gain = before ? gainText(net, "seat") ?? "No net change in seats" : null;
  const tail = open > 0 ? `, with ${plural(open, "seat")} not yet called` : "";
  if (!now) return `${gain ? `${gain}; the` : "The"} ${name} was tied ${score}${tail}.`;
  const verb = was == null ? "won" : was === now ? "kept" : "won";
  const tied = after.dem === after.rep ? ` on the vice president's tie-breaking vote` : "";
  const holder = PARTY_NAME[now];
  if (!gain) return `${holder} ${verb} the ${name}, ${score}${tied}${tail}.`;
  const gainer = net > 0 ? "D" : net < 0 ? "R" : null;
  return gainer === now
    ? `${gain} and ${verb} the ${name}, ${score}${tied}${tail}.`
    : `${gain}; ${holder} ${verb} the ${name}, ${score}${tied}${tail}.`;
}

// ── Offices ──────────────────────────────────────────────────────────────────

const RACE_LEGEND: YearOfficeSummary["map"]["legend"] = [{ cls: "D", label: "Democratic" }, { cls: "R", label: "Republican" }];

function legendFor(units: Record<string, YearMapUnit>, splitLabel: string, openLabel: string): YearOfficeSummary["map"]["legend"] {
  const seen = new Set(Object.values(units).map((u) => u.cls));
  return [...RACE_LEGEND, ...(seen.has("I") ? [{ cls: "I" as const, label: "Independent" }] : []), ...(seen.has("split") ? [{ cls: "split" as const, label: splitLabel }] : []), ...(seen.has("open") ? [{ cls: "open" as const, label: openLabel }] : [])];
}

/** The Historical Results map opened on the office and year: its districts for the House, its states for the rest. */
const historicalHref = (year: number, office: RaceOffice) => `/historical?office=${office}&year=${year}&view=${office === "house" ? "district" : "state"}`;

const moreFor = (year: number, office: Exclude<RaceOffice, "president">, label: string) => (year === ELECTION_YEAR ? { href: `/${office}`, label: `${label} page` } : { href: historicalHref(year, office), label: "Historical results map" });

function president(year: number, env: YearEnvironment): YearOfficeSummary | null {
  const races = racesFor("president", year);
  if (!races.length) return null;
  // Electoral votes by row: a state's, and Maine's and Nebraska's districts on rows of their own.
  const rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "president_past_results.csv"), "utf8"));
  const evOf = (y: number): { ev: Tally; byState: Map<string, { dem: number; rep: number }> } | null => {
    const ev = { dem: 0, rep: 0, oth: 0 }, byState = new Map<string, { dem: number; rep: number }>();
    for (const r of rows) {
      if (num(r.year) !== y) continue;
      const won = num(r.margin) > 0 ? "rep" : "dem";
      ev[won] += num(r.electoral_votes);
      const st = r.state_abbr.slice(0, 2), s = byState.get(st) ?? { dem: 0, rep: 0 };
      s[won] += num(r.electoral_votes);
      byState.set(st, s);
    }
    return ev.dem + ev.rep > 0 ? { ev, byState } : null;
  };
  const now = evOf(year);
  if (!now) return null;
  const before = year === 2016 ? ELECTORAL_VOTES_2012 : evOf(year - 4)?.ev ?? null;
  const any = rows.find((r) => num(r.year) === year)!;
  const demWon = now.ev.dem > now.ev.rep;
  const winner = demWon ? any.dem_candidate : any.rep_candidate, loser = demWon ? any.rep_candidate : any.dem_candidate;
  const units = raceUnits(races);
  for (const r of races) {
    const ev = now.byState.get(r.state);
    const u = units[r.stateName];
    if (!ev || !u) continue;
    const split = ev.dem > 0 && ev.rep > 0;
    u.foot = split ? `Electoral votes: ${ev.dem} Democratic, ${ev.rep} Republican` : plural(ev.dem + ev.rep, "electoral vote");
  }
  const flips = flipsOf(races);
  return {
    key: "president", title: "President", meta: "538 electoral votes · 270 to win",
    headline: `${winner} defeated ${loser}, ${Math.max(now.ev.dem, now.ev.rep)}–${Math.min(now.ev.dem, now.ev.rep)} in electoral votes${flips.length ? `, and ${plural(flips.length, "state")} voted the other way from ${year - 4}` : ""}.`,
    unit: "electoral votes", beforeLabel: String(year - 4), before, after: now.ev, open: 0, total: 538, majority: 270,
    map: { level: "state", geoUrl: STATES_10M_URL, units, legend: legendFor(units, "", ""), unfilledLabel: null },
    flips, flipsLabel: `States that flipped from ${year - 4}`, vote: voteOf(env, "P"),
    notes: [
      "Electoral votes are as won in each state and district. Maine and Nebraska award two to the statewide winner and one to the winner of each House district.",
      ...(year === 2016 ? ["Seven electors voted for someone else in 2016, so the votes cast were 304–227."] : []),
    ],
    more: { href: historicalHref(year, "president"), label: "Historical results map" },
  };
}

function senate(year: number, env: YearEnvironment): YearOfficeSummary | null {
  const races = racesFor("senate", year);
  if (!races.length) return null;
  const seats = beforeAfter(year, races, senateAfter, year - 2);
  if (!seats) return null;
  const t = tally(races);
  // A state's shape is its regular race (its special where that was the only one); every special
  // also gets a box of its own in the map's corner (user, 2026-11-28).
  const specialRaces = races.filter((r) => r.special);
  const specials = specialRaces.length;
  const regularStates = new Set(races.filter((r) => !r.special).map((r) => r.state));
  const units = raceUnits(races.filter((r) => !r.special || !regularStates.has(r.state)), true);
  const insets = specialRaces.sort((a, b) => a.state.localeCompare(b.state)).map((r) => {
    const unit = Object.values(raceUnits([r], true))[0];
    return { key: `special:${r.state}`, abbr: r.state, unit: { ...unit, title: `${r.stateName} special` } };
  });
  // A tied Senate goes to the vice president's party: the winner of the latest presidential election.
  const presYear = year - (year % 4);
  const lastPres = popVoteData.find((r) => r.year === presYear && r.type === "President");
  const tieBreak = lastPres ? (lastPres.seatsD > lastPres.seatsR ? "D" : "R") : null;
  return {
    key: "senate", title: "Senate", meta: `${plural(races.length, "seat")} up${specials ? `, ${plural(specials, "special")} among them` : ""}`,
    headline: chamberHeadline("Senate", seats.before, seats.after, tieBreak, t.open),
    unit: "seats", beforeLabel: "Before", before: seats.before, after: seats.after, open: 0, total: 100, majority: 51,
    map: { level: "state", geoUrl: STATES_10M_URL, units, insets, legend: legendFor(units, "One seat each", "Not called"), unfilledLabel: `No ${year} race` },
    flips: flipsOf(races), flipsLabel: "Seats that changed party", vote: voteOf(env, "S"),
    notes: ["Bernie Sanders and Angus King, independents who caucus with Democrats, are counted and shaded as Democrats. The map shades only the seats on the ballot."],
    more: moreFor(year, "senate", "Senate"),
  };
}

function house(year: number, env: YearEnvironment): YearOfficeSummary | null {
  const races = racesFor("house", year);
  if (!races.length) return null;
  const t = tally(races);
  const after = { dem: t.dem, rep: t.rep, oth: 0 };
  const last = year - 2 < 2016 ? HOUSE_AFTER_2014 : (() => { const b = tally(pastRaces("house", year - 2)); return { dem: b.dem, rep: b.rep, oth: 0 }; })();
  const units = raceUnits(races);
  const vacant = races.filter((r) => r.vacant);
  // The newest map's light display file, as the forecast and chamber maps draw it.
  const geoUrl = year === ELECTION_YEAR ? "/congressional-districts-2026-lite.json" : getCongressionalDistrictsGeoUrl(year);
  const open = t.open - vacant.length;
  return {
    key: "house", title: "House", meta: "435 seats · 218 for a majority",
    headline: chamberHeadline("House", last, after, null, open),
    unit: "seats", beforeLabel: String(year - 2), before: last, after, open: t.open, total: 435, majority: 218,
    map: { level: "district", geoUrl, units, legend: legendFor(units, "", vacant.length ? "Vacant" : "Not called"), unfilledLabel: null },
    flips: flipsOf(races), flipsLabel: "Seats that changed party", vote: voteOf(env, "H"),
    notes: [
      `Seats are compared with the ${year - 2} election's result. A seat changed party when its incumbent lost to the other party or, with no incumbent running, the same-numbered district last elected the other party, so after a redraw the flips need not add up to the net change.`,
      ...vacant.map((r) => `${r.label}'s result was never certified and the seat stayed vacant until a 2019 special election.`),
    ],
    more: moreFor(year, "house", "House"),
  };
}

function governor(year: number, env: YearEnvironment): YearOfficeSummary | null {
  const races = racesFor("governor", year);
  if (!races.length) return null;
  const seats = beforeAfter(year, races, governorsAfter, year - 1);
  if (!seats) return null;
  const dDem = seats.after.dem - seats.before.dem, dRep = seats.after.rep - seats.before.rep;
  const units = raceUnits(races);
  const flips = flipsOf(races);
  const gain = gainText(dDem > 0 ? dDem : dRep > 0 ? -dRep : 0, "governorship") ?? (flips.length ? "No net change in governorships" : "No governorship changed party");
  return {
    key: "governor", title: "Governor", meta: `${plural(races.length, "governorship")} up`,
    headline: `${gain}, leaving ${seats.after.dem} Democratic and ${seats.after.rep} Republican governors.`,
    unit: "governorships", beforeLabel: "Before", before: seats.before, after: seats.after, open: 0, total: 50, majority: null,
    map: { level: "state", geoUrl: STATES_10M_URL, units, legend: legendFor(units, "", "Not called"), unfilledLabel: `No ${year} race` },
    flips, flipsLabel: "Governorships that changed party", vote: voteOf(env, "G"),
    notes: seats.before.oth > 0 ? ["The one other governor is Alaska's Bill Walker, an independent elected in 2014."] : [],
    more: moreFor(year, "governor", "Governor"),
  };
}

/** Chambers a coalition or the other party ran after an election, whatever the seats say: Alaska's
 *  bipartisan coalitions (null), and New York's Senate, which Republicans ran after 2016 with a
 *  Democrat's vote. Keyed by the even year; the odd year after it reads the same entry. */
const CONTROL_AFTER: Record<number, Record<string, "D" | "R" | null>> = {
  2016: { "AK-house": null, "NY-senate": "R" },
  2018: { "AK-house": null },
  2020: { "AK-house": null },
  2022: { "AK-house": null, "AK-senate": null },
  2024: { "AK-house": null, "AK-senate": null },
};

function legislature(year: number, env: YearEnvironment, byState: Record<string, LegChamberResult[]>): YearOfficeSummary | null {
  const { names } = stateLookup();
  const counting = year === ELECTION_YEAR;
  const overrides = CONTROL_AFTER[year - (year % 2)] ?? {};
  const controlAfter = (st: string, c: LegChamberResult): "D" | "R" | null => {
    const k = `${st}-${c.chamber}`;
    // A chamber with no election this year keeps whoever ran it; one that voted is read from its seats.
    if (k in overrides && (c.noElection || year % 2 === 0)) return overrides[k];
    // While the count is open a chamber is a party's only with a majority of every seat.
    if (counting && !c.noElection) return c.seats.dem > c.total / 2 ? "D" : c.seats.rep > c.total / 2 ? "R" : null;
    return c.seats.dem > c.seats.rep ? "D" : c.seats.rep > c.seats.dem ? "R" : null;
  };
  const chambersAfter = { dem: 0, rep: 0, oth: 0 }, chambersBefore = { dem: 0, rep: 0, oth: 0 };
  const seatsAfter = { dem: 0, rep: 0, oth: 0 }, net = { dem: 0, rep: 0, oth: 0 };
  const bucket = (c: "D" | "R" | null) => (c === "D" ? "dem" : c === "R" ? "rep" : "oth");
  const flips: YearFlip[] = [];
  const units: Record<string, YearMapUnit> = {};
  let up = 0, seatsUp = 0, compared = 0;
  for (const [st, chambers] of Object.entries(byState)) {
    const name = names[st] ?? st;
    const voted = chambers.filter((c) => !c.noElection);
    const lines: YearMapUnit["lines"] = [];
    let changed = false;
    for (const c of chambers) {
      const after = controlAfter(st, c);
      const hasPrior = !c.noElection && !c.noPrior;
      const before = hasPrior ? c.priorControl : after;
      chambersAfter[bucket(after)]++;
      chambersBefore[bucket(before)]++;
      seatsAfter.dem += c.seats.dem; seatsAfter.rep += c.seats.rep; seatsAfter.oth += c.seats.oth;
      if (c.noElection) continue;
      up++; seatsUp += c.up;
      const chamberName = chambers.length === 1 ? "Legislature" : c.chamber === "senate" ? "Senate" : "House";
      if (hasPrior) { compared++; net.dem += c.net.dem; net.rep += c.net.rep; net.oth += c.net.oth; }
      const flipped = hasPrior && after !== before;
      if (flipped) { changed = true; flips.push({ label: `${name} ${chamberName}`, to: after, name: null, href: `/states/${st.toLowerCase()}/legislature/${chambers.length === 1 ? "senate" : c.chamber}` }); }
      const gain = Math.max(c.net.dem, c.net.rep);
      const change = !hasPrior ? undefined : c.net.dem === c.net.rep || gain <= 0 ? "No net change" : `${c.net.dem > c.net.rep ? "Democrats" : "Republicans"} gained ${plural(gain, "seat")}`;
      lines.push({ label: chamberName, head: `${c.seats.dem} D – ${c.seats.rep} R${c.seats.oth ? ` – ${c.seats.oth} I` : ""}`, sub: change, party: after, note: flipped ? "Flip" : undefined });
    }
    if (!voted.length) continue;
    const controls = new Set(chambers.map((c) => controlAfter(st, c)));
    const only = controls.size === 1 ? [...controls][0] : null;
    // The state's legislature page, which opens on its House (a unicameral legislature lives under "senate").
    units[name] = { title: name, cls: only ?? "split", flipped: changed, lines, href: `/states/${st.toLowerCase()}/legislature/${chambers.length === 1 ? "senate" : "house"}` };
  }
  if (!up) return null;
  // 2016: almost no chamber has an earlier election on file, so there is no change to report.
  const hasPrior = compared > 0 && compared >= up / 2;
  const seatsBefore = { dem: seatsAfter.dem - net.dem, rep: seatsAfter.rep - net.rep, oth: seatsAfter.oth - net.oth };
  const gainer = net.dem > net.rep ? "D" : net.rep > net.dem ? "R" : null;
  const gained = gainer === "D" ? net.dem : net.rep;
  const seatsText = !hasPrior ? `${plural(up, "chamber")} voted` : gainer && gained > 0 ? `${PARTY_NAME[gainer]} gained a net ${plural(gained, "seat")} across ${plural(compared, "chamber")}` : `No net change in seats across ${plural(compared, "chamber")}`;
  const flipText = !hasPrior ? "" : flips.length ? `, and ${plural(flips.length, "chamber")} changed hands` : ", and no chamber changed hands";
  return {
    key: "legislature", title: "State Legislatures", meta: `${plural(up, "chamber")} up · ${plural(seatsUp, "seat")}`,
    headline: `${seatsText}${flipText}.`,
    unit: "chambers", beforeLabel: "Before", before: hasPrior ? chambersBefore : null, after: chambersAfter, open: 0, total: chambersAfter.dem + chambersAfter.rep + chambersAfter.oth, majority: null,
    second: hasPrior ? { unit: "seats", before: seatsBefore, after: seatsAfter } : undefined,
    map: { level: "state", geoUrl: STATES_10M_URL, units, legend: [{ cls: "D", label: "Democratic legislature" }, { cls: "R", label: "Republican legislature" }, ...(Object.values(units).some((u) => u.cls === "split") ? [{ cls: "split" as const, label: "Divided, tied or coalition" }] : [])], unfilledLabel: `No ${year} election` },
    flips: flips.sort((a, b) => a.label.localeCompare(b.label)), flipsLabel: "Chambers that changed hands", vote: voteOf(env, "L"),
    notes: [
      "Chambers counts all 99, each by the party with more seats after its latest election; a tied chamber or one run by a bipartisan coalition is neither party's. Seats are every chamber's seats, and the change is each voting chamber against its previous election.",
      ...(compared < up ? [`${plural(up - compared, "chamber")} with no earlier election on file ${up - compared === 1 ? "shows" : "show"} no change.`] : []),
      ...(counting ? ["Seats still uncalled are in neither party's count."] : []),
    ],
    more: { href: "/legislatures", label: "Legislatures page" },
  };
}

// ── State boxes ──────────────────────────────────────────────────────────────

/** The year's races and legislatures for the state boxes, as the Overview reads them. A past year's
 *  flips follow the maps above (lib/seatFlips.ts), which also covers seats whose previous election
 *  predates the files. */
function statesFor(year: number): YearStates {
  const { names } = stateLookup();
  if (year === ELECTION_YEAR) {
    return { rows: snapshot().rows, legislature: readStateLegSnapshot().byState, housePvPrev: houseStatePopularVote(year - 2), nationalPvPrev: houseNationalPopularVote(year - 2), stateNames: names };
  }
  const past = readPastPostElection(year);
  const flipped = new Map<string, boolean>();
  for (const office of ["president", "senate", "house", "governor"] as RaceOffice[]) for (const r of pastRaceTableRows(office, year)) flipped.set(r.href, r.flipped);
  const rows = past.rows.map((r): PostElectionRow => {
    const f = r.past?.href ? flipped.get(r.past.href) : undefined;
    const won = r.proj.winner;
    if (f == null || (won !== "D" && won !== "R")) return r;
    return { ...r, prior: { ...r.prior, seatParty: f ? (won === "D" ? "R" : "D") : won } };
  });
  return { rows, legislature: past.legislature, housePvPrev: past.housePvPrev, nationalPvPrev: past.nationalPvPrev, stateNames: names };
}

const cache = new Map<number, YearPageData>();

export function buildYearPage(year: number): YearPageData {
  const hit = cache.get(year);
  if (hit) return hit;
  const env = environment(year);
  const states = statesFor(year);
  const offices = [president(year, env), senate(year, env), house(year, env), governor(year, env), legislature(year, env, states.legislature)].filter((o): o is YearOfficeSummary => o != null);
  const data: YearPageData = { year, asOf: year === ELECTION_YEAR ? snapshot().asOf : null, environment: env, offices, states };
  cache.set(year, data);
  return data;
}

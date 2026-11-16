import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "@/lib/turnout";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber, type StateLegDistrict } from "@/data/stateLegDistricts";
import { stateLegCandidates2026 } from "@/data/stateLegCandidates2026";
import type { StateLegChamberResults, StateLegDistrictResult } from "@/data/stateLegResults";
import { chamberMarginYear } from "@/lib/stateLegChamberMargin";
import { personKey, type AtlasChamberResults2026, type AtlasRace2026, type AtlasResult2026, type AtlasResultCandidate2026, type PartySeats } from "@/lib/stateLegAtlas";

// ── 2026 state-legislative results for the legislature pages ──────────────────
// The counted 2026 general election per district and per chamber, read from the saved results
// files (data-entry/results-2026/, written by the hand-run `npm run results-2026`) and keyed to the
// site's districts. Nothing here touches a live feed: a page shows what the files hold.
//
// The count stays OUT of data/stateLegResults.ts: the locked 2026 projection reads that file, and
// these counts are still moving. The legislature pages read this module instead (the chamber
// header directly, the explorer and district pages through the atlas slices).
//
// Calls and "about x% counted" come from the AP snapshot beside the results (results_2026_state_leg.csv):
// a race the official feed does not call takes AP's call, and the counted share is AP's expected-vote
// estimate scaled to the count on file. A race nobody has called shows its leaders and no winner mark.

export const RESULTS_YEAR = 2026;

const DIR = ["data-entry", "results-2026"] as const;
const num = (v: string | undefined) => Number(v) || 0;
const NOT_A_PERSON = /write.?in|scatter|blank|void|under.?vote|over.?vote|none of/i;
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const zero = (): PartySeats => ({ D: 0, R: 0, I: 0 });
const seatParty = (p: string): keyof PartySeats => (p === "D" || p === "R" ? p : "I");

/** The AP snapshot's seat label as the results files key it (scripts/results_2026/common.py nyt_seat). */
function apSeat(label: string): string {
  const m = /^(?:District|Position)\s+(\d+)([A-Z]?)(?:\s*-\s*Position\s+(\d+))?$/.exec(label.trim());
  if (m) return String(parseInt(m[1], 10)) + m[2] + (m[3] ? `-P${m[3]}` : "");
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const LABELS: Record<string, string | undefined> = {
  IND: "Independent", LIB: "Libertarian", L: "Libertarian", GRE: "Green", G: "Green", NP: "Nonpartisan", PRG: "Progressive",
  UNR: "Unaffiliated", OTH: undefined, "": undefined, "Other Party": undefined,
};
/** The source's party label for a candidate outside the two major parties, tidied for display. */
function otherLabel(raw: string): string | undefined {
  if (raw in LABELS) return LABELS[raw];
  const prefers = /^\((?:Prefers|States) (.*?)(?: Party)?\)$/.exec(raw);
  if (prefers) return /no party preference/i.test(prefers[1]) ? "No party preference" : prefers[1];
  return raw.replace(/ Party$/, "");
}

const ORDINALS: Record<string, string> = { first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th", sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th" };
/** Letters and digits only, with a spelled-out ordinal as its numeral ("First Essex" = "1st Essex", Massachusetts). */
const alnum = (s: string) => s.toLowerCase().replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, (w) => ORDINALS[w]).replace(/[^a-z0-9]/g, "");

/** A results-file seat → the site's district key and, for a post race, its post. */
function seatResolver(roster: StateLegDistrict[]): (seat: string) => { key: string; post: string | null } | null {
  const index = new Map<string, string>();
  const put = (form: string, key: string) => { if (form && !index.has(form)) index.set(form, key); };
  for (const d of roster) {
    put(alnum(d.number), d.number);
    put(alnum(d.number.replace(/\band\b|&/gi, "")), d.number);
    // "Belknap 1" for BE1 (New Hampshire), "Addison Senatorial District" → addison.
    const label = d.label.replace(/\b(State|House|Senate|Senatorial|Legislative|Subdistrict|District)\b|\(.*?\)/gi, "");
    put(alnum(label), d.number);
    put(alnum(label.replace(/\band\b|&/gi, "")), d.number);
  }
  return (seat) => {
    const forms = [alnum(seat), alnum(seat).replace("district", ""), alnum(seat).replace("and", "")];
    for (const f of forms) { const key = index.get(f); if (key) return { key, post: null }; }
    // Idaho's seat A/B and Washington's position 1/2: separate races inside one district.
    const post = /^(\d+)([A-Z])$/.exec(seat) ?? /^(\d+)-P(\d+)$/.exec(seat);
    if (post && index.has(post[1])) return { key: index.get(post[1])!, post: post[2] };
    return null;
  };
}

type ApRow = { status: string; winners: string[]; pctExpected: number | null; total: number };

type Loaded = {
  byChamber: Map<string, Map<string, AtlasResult2026>>;
  blocks: Map<string, StateLegChamberResults>;
  unmatched: string[];
  asOf: string;
};

let cache: Loaded | null = null;

function load(): Loaded {
  if (cache) return cache;
  const read = (...p: string[]) => parseCsv(readFileSync(join(process.cwd(), ...p), "utf8"));
  const races = parseCsv(readFileSync(join(process.cwd(), ...DIR, "races.csv"), "utf8")).filter((r) => r.office === "state_house" || r.office === "state_senate");
  const candRows = new Map<string, Record<string, string>[]>();
  for (const c of parseCsv(readFileSync(join(process.cwd(), ...DIR, "candidates.csv"), "utf8"))) {
    if (c.office !== "state_house" && c.office !== "state_senate") continue;
    if (!candRows.has(c.race_id)) candRows.set(c.race_id, []);
    candRows.get(c.race_id)!.push(c);
  }
  const ap = new Map<string, ApRow>();
  for (const a of read("data-entry", "results_2026_state_leg.csv")) {
    if (a.race_type.includes("Primary")) continue;
    const id = `${a.state}-${a.chamber === "house" ? "H" : "S"}-${apSeat(a.seat)}${a.race_type.includes("Special") ? "-SP" : ""}`;
    ap.set(id, {
      status: a.status,
      winners: a.winners ? a.winners.split("; ").map((w) => w.replace(/\s*\([^)]*\)$/, "")) : [],
      pctExpected: a.pct_expected === "" ? null : Number(a.pct_expected),
      total: num(a.total_votes),
    });
  }
  // AP and the sources disagree on which of a seat's races is the special (CO SD-17, VA HD-20).
  const apFor = (id: string) => ap.get(id) ?? ap.get(id.endsWith("-SP") ? id.slice(0, -3) : `${id}-SP`);

  const resolvers = new Map<string, ReturnType<typeof seatResolver>>();
  const grouped = new Map<string, Map<string, AtlasRace2026[]>>();
  const unmatched: string[] = [];
  let asOf = "";

  for (const r of races) {
    // Nebraska's one chamber files as a senate here, as on the site.
    const chamber: Chamber = r.office === "state_house" ? "house" : "senate";
    const ck = `${r.state}|${chamber}`;
    const roster = stateLegDistricts[r.state]?.[chamber] ?? [];
    if (!resolvers.has(ck)) resolvers.set(ck, seatResolver(roster));
    const where = resolvers.get(ck)!(r.seat);
    if (!where) { unmatched.push(r.race_id); continue; }
    if (r.fetched_at > asOf) asOf = r.fetched_at;

    const total = num(r.total_votes);
    const seats = Math.max(1, num(r.vote_for));
    const field = stateLegCandidates2026[r.state]?.[chamber]?.[where.key]?.candidates ?? [];
    const sitting = roster.find((d) => d.number === where.key)?.incumbents ?? [];
    const rows = candRows.get(r.race_id) ?? [];
    let others = 0;
    const named: (AtlasResultCandidate2026 & { flagged: boolean })[] = [];
    for (const c of rows) {
      const votes = num(c.votes);
      if (c.party_simple === "W" || NOT_A_PERSON.test(c.candidate)) { others += votes; continue; }
      const name = tidy(c.candidate);
      const listed = field.find((f) => personKey(f.name) === personKey(name));
      // Nebraska's ballot is nonpartisan: each candidate counts for their known affiliation (the 2026 field's).
      const simple = r.state === "NE" && listed ? listed.party : c.party_simple === "D" || c.party_simple === "R" ? c.party_simple : "O";
      const label = simple === "O" ? (r.state === "NE" ? listed?.partyLabel ?? "Nonpartisan" : otherLabel(c.party)) : undefined;
      named.push({
        name, party: simple, ...(label ? { partyLabel: label } : {}),
        votes: total > 0 ? votes : null, pct: total > 0 ? (votes / total) * 100 : null,
        ...(c.incumbent === "1" || listed?.incumbent || sitting.some((s) => personKey(s.name) === personKey(name)) ? { incumbent: true } : {}),
        flagged: c.called_winner === "1",
      });
    }
    // A seat settled without a general (Florida, Oklahoma, Hawaii): no candidate rows, only the name.
    if (named.length === 0 && r.called_winner) {
      for (const part of r.called_winner.split("; ")) {
        const m = /^(.*?)\s*\(([^)]*)\)$/.exec(part.trim());
        const name = tidy(m ? m[1] : part), p = m ? m[2] : r.called_party;
        named.push({ name, party: p === "D" || p === "R" ? p : "O", votes: null, pct: null, flagged: true, ...(sitting.some((s) => personKey(s.name) === personKey(name)) ? { incumbent: true } : {}) });
      }
    }
    named.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));

    // The call: the feed's, else AP's when every AP winner is found among the candidates. A race
    // for several seats can be called for some of them; it is called once all are.
    const apRow = apFor(r.race_id);
    if (!named.some((c) => c.flagged) && apRow?.status === "called" && apRow.winners.length) {
      const hits = apRow.winners.map((w) => named.find((c) => !c.flagged && personKey(c.name) === personKey(w)) ?? named.find((c) => !c.flagged && personKey(c.name).split(" ").pop() === personKey(w).split(" ").pop()));
      if (hits.every(Boolean)) for (const h of hits) h!.flagged = true;
    }
    const won = named.filter((c) => c.flagged);
    const called = won.length > 0 && won.length >= Math.min(seats, named.length);
    // Who holds the seats: the called winners, then whoever leads for any seat still open; an
    // uncounted race with no more candidates than seats goes to them.
    const open = named.filter((c) => !c.flagged);
    const leaders = [...won, ...(total > 0 || named.length <= seats ? open : [])].slice(0, seats);
    const winners = zero();
    for (const c of leaders) winners[seatParty(c.party)] += 1;

    const feedPct = r.pct_reporting_feed === "" ? null : Number(r.pct_reporting_feed);
    const counted = total <= 0 ? null
      : apRow?.pctExpected ? Math.min(1, (apRow.pctExpected / 100) * (apRow.total > 0 ? total / apRow.total : 1))
      : feedPct && feedPct > 0 ? Math.min(1, feedPct / 100)
      : null;

    const race: AtlasRace2026 = {
      post: where.post, special: r.special === "1", seats, total, called,
      counted: counted == null ? null : +counted.toFixed(3),
      unofficial: r.source_kind === "ap", source: r.source,
      candidates: named.map(({ flagged, pct, ...c }) => ({ ...c, pct: pct == null ? null : +pct.toFixed(2), ...(flagged ? { winner: true } : {}) })),
      others, winners,
    };
    if (!grouped.has(ck)) grouped.set(ck, new Map());
    const g = grouped.get(ck)!;
    if (!g.has(where.key)) g.set(where.key, []);
    g.get(where.key)!.push(race);
  }

  const byChamber = new Map<string, Map<string, AtlasResult2026>>();
  const blocks = new Map<string, StateLegChamberResults>();
  for (const [ck, g] of grouped) {
    const [abbr, chamber] = ck.split("|") as [string, Chamber];
    const roster = stateLegDistricts[abbr]?.[chamber] ?? [];
    const out = new Map<string, AtlasResult2026>();
    const districts: Record<string, StateLegDistrictResult> = {};
    for (const [key, list] of g) {
      // A special run beside the district's regular race is its own post (West Virginia).
      if (list.length > 1) for (const x of list) if (x.special && x.post == null) x.post = "Special";
      list.sort((a, b) => Number(a.special) - Number(b.special) || (a.post ?? "").localeCompare(b.post ?? ""));
      const d = roster.find((x) => x.number === key);
      const incs = d?.incumbents ?? [];
      const cap = d?.seats ?? Math.max(incs.length, 1);
      let dem = 0, rep = 0, total = 0, seats = 0;
      const winners = zero();
      for (const x of list) {
        // A special for the rest of a term whose seat is also on the regular ballot (Arkansas HD-8,
        // Texas HD-93) fills no further seat: it is shown, and left out of the district's tally.
        if (x.special && seats + x.seats > cap) continue;
        total += x.total; seats += x.seats;
        for (const c of x.candidates) { if (c.party === "D") dem += c.votes ?? 0; else if (c.party === "R") rep += c.votes ?? 0; }
        for (const p of ["D", "R", "I"] as const) winners[p] += x.winners[p];
      }
      const upNow = incs.filter((i) => (i.nextElection ?? d?.nextElection) === RESULTS_YEAR);
      const members = upNow.length === seats ? upNow : incs.length === seats ? incs : null;
      // The roster files fusion-ticket members (New York, Connecticut, Vermont) under "O": those
      // take the major party their own 2026 listing carries, as on the /legislatures board.
      const fieldParty = new Map<string, string>();
      for (const x of stateLegCandidates2026[abbr]?.[chamber]?.[key]?.candidates ?? []) if (x.party === "D" || x.party === "R") fieldParty.set(personKey(x.name), x.party);
      const held = members ? members.reduce((acc, i) => { acc[seatParty(i.party === "D" || i.party === "R" ? i.party : fieldParty.get(personKey(i.name)) ?? i.party)] += 1; return acc; }, zero()) : null;
      const gains = zero();
      if (held) for (const p of ["D", "R", "I"] as const) gains[p] = Math.max(0, winners[p] - held[p]);
      const one = (s: PartySeats) => (["D", "R", "I"] as const).filter((p) => s[p] > 0);
      const flip = held && one(held).length === 1 && one(winners).length === 1 && one(held)[0] !== one(winners)[0] && winners[one(winners)[0]] === seats
        ? { from: one(held)[0], to: one(winners)[0] } : null;
      out.set(key, {
        races: list, dem, rep, oth: Math.max(0, total - dem - rep), total,
        margin: total > 0 ? +(((rep - dem) / total) * 100).toFixed(2) : null,
        seats, winners, called: list.every((x) => x.called), held, gains, flip, asOf: "",
      });
      districts[key] = total > 0
        ? { demVotes: dem, repVotes: rep, othVotes: Math.max(0, total - dem - rep), totalVotes: total }
        : { demVotes: null, repVotes: null, othVotes: null, totalVotes: null, noCount: true };
    }
    byChamber.set(ck, out);
    blocks.set(ck, { source: "data-entry/results-2026", districts });
  }
  for (const m of byChamber.values()) for (const d of m.values()) d.asOf = asOf;
  cache = { byChamber, blocks, unmatched, asOf };
  return cache;
}

/** Every district of the chamber that held a 2026 race, by the site's district key. */
export function districtResults2026(abbr: string, chamber: Chamber): Map<string, AtlasResult2026> {
  if (UNICAMERAL_STATES.has(abbr) && chamber === "house") return new Map();
  return load().byChamber.get(`${abbr}|${chamber}`) ?? new Map();
}

/** Results-file races that matched no district on the site (the build script reports them). */
export function unmatchedRaces2026(): string[] {
  return load().unmatched;
}

/**
 * The chamber after the count: the winners (or, uncalled, the leaders) of the seats on the ballot
 * plus the members whose seats were not up, the seats that changed hands, and the chamber's vote
 * margin raw and adjusted. Null where the chamber held no regular election (a special alone does
 * not make a chamber result).
 */
export function chamberResults2026(abbr: string, chamber: Chamber): AtlasChamberResults2026 | null {
  const results = districtResults2026(abbr, chamber);
  const all = [...results.values()];
  const races = all.flatMap((d) => d.races);
  if (!races.some((r) => !r.special)) return null;
  const roster = stateLegDistricts[abbr]?.[chamber] ?? [];

  const seats = { dem: 0, rep: 0, oth: 0, none: 0 };
  const add = (p: string, n = 1) => { if (p === "D") seats.dem += n; else if (p === "R") seats.rep += n; else seats.oth += n; };
  for (const d of roster) {
    const res = results.get(d.number);
    const incs = d.incumbents ?? [];
    const total = d.seats ?? Math.max(incs.length, res?.seats ?? 0, 1);
    const up = Math.min(res?.seats ?? 0, total);
    if (res) {
      add("D", res.winners.D); add("R", res.winners.R); add("I", res.winners.I);
      seats.none += Math.max(0, up - res.winners.D - res.winners.R - res.winners.I);
    }
    // Members not on the ballot keep their seats: the ones not up this year where the roster says
    // which (West Virginia's staggered pairs), else the district's first sitting members.
    const notUp = incs.filter((i) => (i.nextElection ?? d.nextElection) !== RESULTS_YEAR);
    const keep = up === 0 ? incs : notUp.length === total - up ? notUp : incs.slice(0, Math.max(0, total - up));
    for (const i of keep) add(i.party);
  }

  const flips = zero();
  let dem = 0, rep = 0, votes = 0;
  for (const d of all) {
    for (const p of ["D", "R", "I"] as const) flips[p] += d.gains[p];
    dem += d.dem; rep += d.rep; votes += d.total;
  }
  const block = load().blocks.get(`${abbr}|${chamber}`)!;
  const detail = chamberMarginYear(abbr, String(RESULTS_YEAR), { [chamber]: block })?.chambers[0] ?? null;
  const w = detail ? detail.contested.weight + detail.imputed.weight : 0;
  const adjusted = detail && w > 0 ? ((detail.contested.margin ?? 0) * detail.contested.weight + (detail.imputed.margin ?? 0) * detail.imputed.weight) / w : null;

  return {
    year: RESULTS_YEAR,
    races: races.length,
    seatsUp: all.reduce((s, d) => s + d.seats, 0),
    uncalled: races.filter((r) => !r.called).length,
    unofficial: races.filter((r) => r.unofficial).length,
    specialsOnly: false,
    seats,
    flips,
    raw: { dem, rep, oth: Math.max(0, votes - dem - rep), votes, margin: votes > 0 ? ((rep - dem) / votes) * 100 : null },
    adjusted,
    imputed: detail?.imputed.districts ?? 0,
    asOf: load().asOf,
  };
}

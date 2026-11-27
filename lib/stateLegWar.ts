import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegPresByEra } from "@/data/stateLegPresByEra";
import { statesData } from "@/data/statesData";
import { allocateByRecord, calculateStateModel, computeWarTable, crossRecordStart, getTplFit, raceTypeWeightsFor, recencyDecayFor, warCandidateKey, WAR_CROSS_K, type EffectRace } from "@/lib/tplCompute";
import { personKey, STATE_LEG_FORECAST_CONSTANTS as LC } from "@/lib/stateLegForecast";
import { stateLegCandidates2026 } from "@/data/stateLegCandidates2026";
import { findStateLegCandidate, getAllStateLegCandidatePages, getStateLegCandidatePage, isRealCandidateName, stateLegCandidateSlug, type StateLegCandidatePage, type StateLegRace } from "@/lib/stateLegCandidateIndex";
import { indexByNormalizedKey, lookupByDistrictCode, normalizeDistrictKey } from "@/lib/stateLegDistrictKey";
import { resolveSiteSeats } from "@/lib/stateLegDistrictRows";
import { chamberBallots, type SeatBallot } from "@/lib/stateLegBallot";
import { districtResults2026, RESULTS_YEAR } from "@/lib/stateLegResults2026";
import { stateLegMoney } from "@/lib/stateLegMoney";
import { shortDistrictName } from "@/lib/stateLegAtlas";

/**
 * Legislative WAR: Wins Above Replacement for state House and Senate candidates, on the philosophy of
 * the federal table (lib/tplCompute.ts, "WAR" and "Own-year baseline"): a candidate is graded against
 * what a generic nominee of their party would have got in the same seat, the same year, against the
 * same opponent.
 *
 *   baseline  = w × the seat's own vote that year WITHOUT this race + (1 − w) × the modelled baseline
 *   Expected  = baseline + the chamber's other races + incumbency          (generic vs generic)
 *   Vs Opp    = Expected − the opponent's strength − the candidate's own incumbency
 *   WAR       = Actual − Vs Opp, signed toward the candidate
 *
 * THE SEAT'S OWN VOTE. Everything the seat's voters cast a ballot for that year except the race
 * itself: President, the regular Senate race, governor, the U.S. House and the OTHER chamber of the
 * legislature, summed from precincts on the lines the race was RUN on (lib/stateLegBallot.ts,
 * scripts/buildStateLegBallot.ts), at the year's office weights with the other chamber on the
 * legislature's weight. Senate and governor margins carry the incumbency and money strips of the
 * state's race; the House and other-chamber figures are filled where uncontested (presidential
 * margin + that office's contested gap in the state).
 *
 *   w = min(1, Σ office weight of the offices the seat has a figure for ÷ the U.S. House's weight)
 *
 * so a presidential year and a midterm with a House figure are whole, and an odd-year seat with
 * only a governor's race or the other chamber beside it leans on the modelled baseline.
 *
 * THE MODELLED BASELINE. The presidential margin on the lines the race was run on (nearest
 * presidential year, data/stateLegPresByEra.ts) moved from that year's national environment to the
 * race's own (getTplFit().E). Used for the 1 − w share, and alone where the seat has no usable
 * precinct figure.
 *
 * CHECKS, each against something outside the precinct file (the House table's, lib/tplCompute.ts):
 *   · the seat's own race summed from precincts must be within CHECK_SEAT_PTS of the certified
 *     result (a seat whose precincts were labelled wrongly fails here);
 *   · the presidential vote summed on those precincts must be within CHECK_PRES_PTS of the site's
 *     presidential result for the seat on that map, where the site has one;
 *   · an office whose precinct total is under OFFICE_MIN_SHARE of the largest statewide office's
 *     is incomplete there and left out.
 * A seat that fails the first two keeps the modelled baseline alone.
 *
 * THE CHAMBER'S OTHER RACES. A seat's ballot holds one race for its chamber, so the chamber's own
 * vote enters through the state's other seats: how far each ran from ITS baseline that year, which
 * is common to the chamber (a legislative vote can sit points from the top of the ticket) and no one
 * candidate's doing:
 *
 *   others = μ(year) + n ÷ (n + OTHERS_K) × (mean gap of the chamber's n OTHER scored races − μ(year))
 *
 * INCUMBENCY is the legislative forecast's fitted constant for every chamber. MONEY is not in
 * Expected: the legislative money model defines its term on the gap BEYOND what the seat's incumbent
 * and lean predict, so the structural part already sits in incumbency and the baseline, and money
 * raised beyond one's situation counts as the candidate's, as in the federal table.
 *
 * WHO IS SCORED. A general election for one seat with exactly one Democrat and one Republican, each
 * with at least MIN_SIDE_SHARE of the two-party vote. Not scored in this pass: multi-member
 * districts and posted seats (user decision 2026-11-27), same-party finals, races with no count.
 *
 * ONE PERSON, ONE RECORD. Credit for a race is split by each candidate's record in their OTHER
 * legislative races (allocateByRecord, the federal rule and constants). WAR is one statistic across
 * offices (user decision 2026-11-27): a person's federal and statewide record enters their legislative
 * record at a discount, and the reverse (lib/tplCompute.ts, "One WAR, two tables"; crossLinks below).
 * A candidate page groups races by name within a state, so two people with one name can share a page.
 * A record is therefore narrower than a page: see peopleOf below for how a page's races are split
 * into people (two seats in one election; a Democratic and a Republican record far apart).
 */
export const LEG_WAR = {
  INCUMBENCY_PTS: LC.INCUMBENCY_PTS,
  OTHERS_K: 3,
  CHECK_SEAT_PTS: 3,
  CHECK_PRES_PTS: 2,
  OFFICE_MIN_SHARE: 0.8,
  MIN_SIDE_SHARE: 0.05,
  RECORD_LAMBDA: 0.5,
  SURPRISE_GAMMA: 1,
  INCUMBENT_RECORD: 2,
  RECENCY_DECAY: 0.8,
  SAME_NAME_MAX_HOPS: 4,
} as const;

export type LegWarBasis = "own-year" | "blend" | "modelled";

export interface LegWarRow {
  person: string;          // record key: page slug, or slug#n for a second person under the same name
  slug: string;            // candidate page
  candidate: string;       // name as filed in this race
  party: "D" | "R";
  office: "L";
  state: string;
  chamber: Chamber;
  district: string;        // the site's result key for the seat that year
  race: string;            // "PA HD 151"
  year: number;
  actual: number;          // R-positive, points of all votes
  expected: number;
  /** The seat's own vote that year without this race; null where no precinct figure passed the checks. */
  generic: number | null;
  genericWeight: number;
  offices: string[];
  /** The modelled baseline (presidential margin on the race's lines, moved to the race's year). */
  modelled: number | null;
  others: number;
  incSign: number;
  basis: LegWarBasis;
  note: string;
  moneyGapPct: number | null;
  residual: number;        // actual − expected, signed toward the candidate
  record: number;
  effect: number;
  effectN: number;
  effectW: number;
  opponentEffect: number;
  replacementPts: number;  // signed toward the candidate
  expectedVsOpponent: number;
  war: number;
  /** Where the record starts instead of zero: the person's federal and statewide record, discounted. */
  crossStart?: number;
  opponent: { name: string; slug: string; party: "D" | "R"; war: number } | null;
}

// ── People ────────────────────────────────────────────────────────────────────

let _links: Map<string, Map<string, Set<string>>> | null = null;
function seatLinks(abbr: string): Map<string, Set<string>> {
  if (!_links) {
    // Literal path so Vercel's file tracing picks it up.
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data-entry", "state-leg-seat-links.json"), "utf8")) as Record<string, string[]>;
    _links = new Map();
    for (const [st, pairs] of Object.entries(raw)) {
      const adj = new Map<string, Set<string>>();
      const add = (x: string, y: string) => { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x)!.add(y); };
      for (const p of pairs) { const [x, y] = p.split("~"); add(x, y); add(y, x); }
      _links.set(st, adj);
    }
  }
  return _links.get(abbr) ?? new Map();
}

const eraSeat = (r: Pick<StateLegRace, "chamber" | "era" | "district">) => `${r.chamber}|${r.era}|${normalizeDistrictKey(r.district)}`;
const seatOf = (chamber: string, district: string) => `${chamber}:${normalizeDistrictKey(district)}`;

/** Overlap steps between two era seats (1 = their territory overlaps), FAR beyond the search depth, null where either has no polygon on file. */
const FAR = 99;
function hops(links: Map<string, Set<string>>, a: string, b: string, max = LEG_WAR.SAME_NAME_MAX_HOPS): number | null {
  if (!links.has(a) || !links.has(b)) return null;
  let frontier = [a];
  const seen = new Set([a]);
  for (let d = 1; d <= max; d += 1) {
    const next: string[] = [];
    for (const x of frontier) for (const y of links.get(x) ?? []) { if (y === b) return d; if (!seen.has(y)) { seen.add(y); next.push(y); } }
    frontier = next;
  }
  return FAR;
}

/**
 * A page's races split into people: seat (chamber:district) → record key. A page is one name in one
 * state. The evidence that it holds two people:
 *   · two different seats in one general election: always two people;
 *   · a Democratic record and a Republican record in seats more than SAME_NAME_MAX_HOPS overlap
 *     steps apart (a switch of party inside one seat or its neighbourhood is one person).
 * Distance alone does not split: members follow a redraw into renumbered seats, move, and run for
 * the other chamber (Mark Finchem's two Arizona seats are eleven steps apart). Where a page is known
 * to hold two people (a same-year pair), a seat joins a person only where party agrees.
 * Seats are joined nearest first, never across one of those two blocks.
 */
function peopleOf(page: StateLegCandidatePage): Map<string, string> {
  type Node = { seat: string; eras: Set<string>; years: Set<number>; parties: Set<string>; latest: number };
  const nodes = new Map<string, Node>();
  for (const r of page.races) {
    const seat = seatOf(r.chamber, r.district);
    const n = nodes.get(seat) ?? nodes.set(seat, { seat, eras: new Set(), years: new Set(), parties: new Set(), latest: 0 }).get(seat)!;
    n.eras.add(eraSeat(r));
    if (!r.special) n.years.add(r.year);
    if (r.party === "D" || r.party === "R") n.parties.add(r.party);
    n.latest = Math.max(n.latest, r.year);
  }
  const out = new Map<string, string>();
  const list = [...nodes.values()];
  if (list.length <= 1) { for (const n of list) out.set(n.seat, page.slug); return out; }
  const sharesYear = (a: Set<number>, b: Set<number>) => [...a].some((y) => b.has(y));
  const knownTwo = list.some((a, i) => list.slice(i + 1).some((b) => sharesYear(a.years, b.years)));
  const opposed = (a: Set<string>, b: Set<string>) => a.size > 0 && b.size > 0 && ![...a].some((x) => b.has(x));
  const links = seatLinks(page.abbr);
  const distance = (a: Node, b: Node) => {
    let best: number | null = null;
    for (const x of a.eras) for (const y of b.eras) { const d = hops(links, x, y); if (d != null && (best == null || d < best)) best = d; }
    return best;
  };
  const groupOf = new Map(list.map((n) => [n.seat, { seats: [n.seat], years: new Set(n.years), parties: new Set(n.parties), latest: n.latest }]));
  const edges: { a: Node; b: Node; d: number | null }[] = [];
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) edges.push({ a: list[i], b: list[j], d: distance(list[i], list[j]) });
  // Nearest first; a pair with no polygon to measure sits between "overlapping" and "far".
  const rank = (e: { a: Node; b: Node; d: number | null }) => (e.d ?? LEG_WAR.SAME_NAME_MAX_HOPS) + (opposed(e.a.parties, e.b.parties) ? 1000 : 0);
  for (const e of edges.sort((x, y) => rank(x) - rank(y))) {
    const ga = groupOf.get(e.a.seat)!, gb = groupOf.get(e.b.seat)!;
    if (ga === gb || sharesYear(ga.years, gb.years)) continue;
    if (opposed(ga.parties, gb.parties) && (knownTwo || e.d === FAR)) continue;
    for (const s of gb.seats) { ga.seats.push(s); groupOf.set(s, ga); }
    for (const y of gb.years) ga.years.add(y);
    for (const x of gb.parties) ga.parties.add(x);
    ga.latest = Math.max(ga.latest, gb.latest);
  }
  // The person with the latest race keeps the page's own key.
  const groups = [...new Set(groupOf.values())].sort((a, b) => b.latest - a.latest || a.seats[0].localeCompare(b.seats[0]));
  groups.forEach((g, i) => { for (const s of g.seats) out.set(s, i === 0 ? page.slug : `${page.slug}#${i + 1}`); });
  return out;
}

let _people: Map<string, Map<string, string>> | null = null;
function people(): Map<string, Map<string, string>> {
  if (!_people) { _people = new Map(); for (const p of getAllStateLegCandidatePages()) _people.set(p.slug, peopleOf(p)); }
  return _people;
}
/** Pages whose races belong to more than one person, with each person's seats (for the audit script). */
export function sharedNamePages(): { slug: string; name: string; abbr: string; people: { key: string; seats: string[] }[] }[] {
  const out: ReturnType<typeof sharedNamePages> = [];
  for (const p of getAllStateLegCandidatePages()) {
    const m = people().get(p.slug)!;
    const keys = [...new Set(m.values())];
    if (keys.length > 1) out.push({ slug: p.slug, name: p.name, abbr: p.abbr, people: keys.map((key) => ({ key, seats: [...m].filter(([, k]) => k === key).map(([n]) => n) })) });
  }
  return out;
}

function eraOf(abbr: string, chamber: Chamber, year: number): string {
  const v = stateLegHistoricalMaps[abbr]?.[chamber]?.[String(year)];
  return v == null ? "current" : String(v);
}
/**
 * The record key of a name on a seat's ballot, and their page. A 2026 count can spell a name differently
 * from the filed field the pages are built on ("Phil Rice" / "Philip Rice"): it is matched to the field
 * by person key first. A name with no page at all (a seat the current roster does not carry) still gets a
 * record, of that seat alone, so the race is scored and the opponent's row exists.
 */
function personFor(abbr: string, chamber: Chamber, year: number, district: string, name: string): { person: string; slug: string } {
  let page = getStateLegCandidatePage(stateLegCandidateSlug(name, abbr));
  if (!page && year === RESULTS_YEAR) {
    const filed = stateLegCandidates2026[abbr]?.[chamber]?.[district]?.candidates.find((c) => personKey(c.name) === personKey(name));
    if (filed) page = getStateLegCandidatePage(stateLegCandidateSlug(filed.name, abbr));
  }
  if (!page) return { person: `${stateLegCandidateSlug(name, abbr)}@${seatOf(chamber, district)}`, slug: "" };
  return { person: people().get(page.slug)?.get(seatOf(chamber, district)) ?? `${page.slug}@${seatOf(chamber, district)}`, slug: page.slug };
}

// ── Races ─────────────────────────────────────────────────────────────────────

/** Tally lines some sources file as candidates (Indiana 2024 "Invalid Votes", Massachusetts "All Others" under a party). */
const NOT_A_NAME = /^(invalid votes|all others)$/i;
type Cand = { name: string; party: string; votes: number | null; incumbent?: boolean; post?: string };
type SeatRace = { abbr: string; chamber: Chamber; year: number; key: string; dem: number; rep: number; total: number; candidates: Cand[] };

function seatRaces(abbr: string, chamber: Chamber): SeatRace[] {
  const out: SeatRace[] = [];
  const multi = new Set((stateLegDistricts[abbr]?.[chamber] ?? []).filter((d) => (d.seats ?? 1) > 1).map((d) => normalizeDistrictKey(d.number)));
  for (const [yearKey, blocks] of Object.entries(stateLegResults[abbr] ?? {})) {
    const year = Number(yearKey);
    if (year === RESULTS_YEAR) continue;
    for (const [key, r] of Object.entries(blocks[chamber]?.districts ?? {})) {
      if (r.noCount || !r.demVotes || !r.repVotes || !r.totalVotes || !r.candidates?.length) continue;
      if (eraOf(abbr, chamber, year) === "current" && multi.has(normalizeDistrictKey(key))) continue;
      out.push({ abbr, chamber, year, key, dem: r.demVotes, rep: r.repVotes, total: r.totalVotes, candidates: r.candidates });
    }
  }
  for (const [key, res] of districtResults2026(abbr, chamber)) {
    if (res.races.length !== 1 || res.seats !== 1 || multi.has(normalizeDistrictKey(key))) continue;
    const race = res.races[0];
    if (race.special || race.post || race.seats !== 1 || !race.called || !res.dem || !res.rep || !res.total) continue;
    out.push({ abbr, chamber, year: RESULTS_YEAR, key, dem: res.dem, rep: res.rep, total: res.total, candidates: race.candidates });
  }
  return out;
}

const NEAREST_PRES = (year: number) => ["2016", "2020", "2024"].sort((a, b) => Math.abs(Number(a) - year) - Math.abs(Number(b) - year) || Number(b) - Number(a));
const presIndex = new Map<string, Record<string, { [py: string]: unknown }>>();
/** The site's presidential result (margin, total) on the seat's lines that year, nearest presidential year first. */
function sitePres(abbr: string, chamber: Chamber, key: string, year: number): { year: number; margin: number; total: number } | null {
  const era = year === RESULTS_YEAR ? "current" : eraOf(abbr, chamber, year);
  const ck = `${abbr}|${chamber}|${era}`;
  if (!presIndex.has(ck)) presIndex.set(ck, indexByNormalizedKey((stateLegPresByEra[abbr]?.[chamber]?.[era] ?? {}) as Record<string, { [py: string]: unknown }>));
  const d = lookupByDistrictCode(presIndex.get(ck)!, abbr, chamber, key) as Record<string, { margin: number; totalVotes: number } | undefined> | undefined;
  if (!d) return null;
  for (const py of NEAREST_PRES(year)) if (d[py]) return { year: Number(py), margin: d[py]!.margin, total: d[py]!.totalVotes };
  return null;
}

type Pending = {
  race: SeatRace; D: { name: string; person: string; slug: string; incumbent: boolean }; R: { name: string; person: string; slug: string; incumbent: boolean };
  actual: number; generic: number | null; weight: number; offices: string[]; modelled: number | null; incSign: number; pre: number; basis: LegWarBasis; note: string;
};

let _pending: Pending[] | null = null;
/** Every scored race with its baseline and pre-others Expected. */
function buildPending(): Pending[] {
  if (_pending) return _pending;
  const fit = getTplFit();
  const E = (y: number) => fit.E[y] ?? 0;
  const pending: Pending[] = [];

  for (const { abbr, name } of statesData) {
    if (!stateLegDistricts[abbr]) continue;
    // Incumbency + money strip of the state's regular Senate and governor race, by year.
    const strips = new Map<string, number>();
    for (const r of calculateStateModel(abbr, name).races) {
      if ((r.raceType === "S" || r.raceType === "G") && !r.imputed && r.eligibility === "eligible" && r.rawMargin != null && r.race !== "Senate Special") strips.set(`${r.year}|${r.raceType}`, (r.incumbencyPts ?? 0) + (r.FF_pts ?? 0));
    }
    for (const chamber of ["house", "senate"] as Chamber[]) {
      if (UNICAMERAL_STATES.has(abbr) && chamber === "house") continue;
      const races = seatRaces(abbr, chamber);
      const byYear = new Map<number, SeatRace[]>();
      for (const r of races) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r]);
      for (const [year, list] of byYear) {
        // Precinct seat codes → the site's seat keys, for this chamber and year.
        const ballots = chamberBallots(year, abbr, chamber) ?? {};
        const codes = new Map<string, { d: number; r: number }>();
        for (const [code, b] of Object.entries(ballots)) if (b.L) codes.set(code, { d: b.L[2], r: b.L[3] });
        const sites: Record<string, { demVotes: number; repVotes: number }> = {};
        for (const r of list) sites[r.key] = { demVotes: r.dem, repVotes: r.rep };
        const ballotOf = new Map<string, SeatBallot | null>();
        for (const [code, key] of resolveSiteSeats(abbr, chamber, codes, sites)) ballotOf.set(key, ballotOf.has(key) ? null : ballots[code]); // two codes on one seat: posts, not scored from precincts
        const W = raceTypeWeightsFor(year);

        for (const race of list) {
          if (Math.min(race.dem, race.rep) / (race.dem + race.rep) < LEG_WAR.MIN_SIDE_SHARE) continue;
          if (race.candidates.some((c) => NOT_A_NAME.test(c.name ?? ""))) continue; // a tally line filed as a candidate: the row's party sums cannot be trusted
          const real = race.candidates.filter((c) => isRealCandidateName(c.name) && !c.post && (c.party === "D" || c.party === "R") && (c.votes ?? 0) > 0);
          if (real.length !== race.candidates.filter((c) => isRealCandidateName(c.name) && (c.party === "D" || c.party === "R") && (c.votes ?? 0) > 0).length) continue; // posted seat
          const side = (party: "D" | "R") => {
            const who = new Map<string, { name: string; person: string; slug: string; incumbent: boolean; votes: number }>();
            for (const c of real.filter((x) => x.party === party)) {
              const p = personFor(abbr, chamber, year, race.key, c.name);
              const e = who.get(p.person);
              if (e) { e.votes += c.votes ?? 0; e.incumbent ||= !!c.incumbent; } else who.set(p.person, { name: c.name, ...p, incumbent: !!c.incumbent, votes: c.votes ?? 0 });
            }
            return who.size === 1 ? [...who.values()][0] : null; // none, or a slate: not a one-on-one race
          };
          const D = side("D"), R = side("R");
          if (!D || !R) continue;
          const actual = ((race.rep - race.dem) / race.total) * 100;
          const incSign = R.incumbent && !D.incumbent ? 1 : D.incumbent && !R.incumbent ? -1 : 0;

          const pres = sitePres(abbr, chamber, race.key, year);
          const ballot = ballotOf.get(race.key) ?? null;
          const ownPres = ballot?.pres ? NEAREST_PRES(year).map((py) => (ballot.pres![py] ? { year: Number(py), margin: ballot.pres![py][0] } : null)).find((x) => x != null) ?? null : null;
          const modelSrc = pres ?? ownPres;
          const modelled = modelSrc ? modelSrc.margin - E(modelSrc.year) + E(year) : null;

          let generic: number | null = null, weight = 0, offices: string[] = [], note = "";
          if (!ballot?.L) note = "no precinct figure for the seat";
          else if (Math.abs(ballot.L[0] - actual) > LEG_WAR.CHECK_SEAT_PTS) note = "precinct sum of the seat's own race is off the certified result";
          else if (pres && (!ballot.pres?.[String(pres.year)] || Math.abs(ballot.pres[String(pres.year)][0] - pres.margin) > LEG_WAR.CHECK_PRES_PTS)) note = "presidential vote on the seat's precincts is off the site's figure for the seat";
          else {
            const top = Math.max(ballot.P?.[1] ?? 0, ballot.S?.[1] ?? 0, ballot.G?.[1] ?? 0);
            const complete = (o?: [number, number]) => !!o && o[1] >= LEG_WAR.OFFICE_MIN_SHARE * top;
            const parts: [string, number, number][] = []; // label, weight, margin
            if (year % 4 === 0 && complete(ballot.P)) parts.push(["P", W.P ?? 0, ballot.P![0]]);
            for (const t of ["S", "G"] as const) { const strip = strips.get(`${year}|${t}`); if (complete(ballot[t]) && strip != null) parts.push([t, W[t] ?? 0, ballot[t]![0] + strip]); }
            if (ballot.H) parts.push(["H", W.H ?? 0, ballot.H[0]]);
            if (ballot.O) parts.push(["O", W.L ?? 0, ballot.O[0]]);
            const sum = parts.reduce((s, p) => s + p[1], 0);
            if (sum > 0) { generic = parts.reduce((s, p) => s + p[1] * p[2], 0) / sum; weight = Math.min(1, sum / (W.H || 1)); offices = parts.map((p) => p[0]); }
            else note = "nothing else on the seat's ballot that year";
          }
          let base: number, basis: LegWarBasis;
          if (generic != null && (weight >= 1 || modelled == null)) { base = generic; basis = "own-year"; weight = 1; }
          else if (generic != null) { base = weight * generic + (1 - weight) * modelled!; basis = "blend"; }
          else if (modelled != null) { base = modelled; basis = "modelled"; weight = 0; }
          else continue;
          pending.push({ race, D, R, actual, generic, weight, offices, modelled, incSign, pre: base + LEG_WAR.INCUMBENCY_PTS * incSign, basis, note });
        }
      }
    }
  }

  _pending = pending;
  return pending;
}

/** Expected, credit by record and the rows, with each side's record starting at `start` (0 where absent). */
function solve(pending: Pending[], start?: (p: Pending, side: "R" | "D") => number | undefined): LegWarRow[] {
  // The chamber's other races.
  const yearGaps = new Map<number, number[]>();
  const groups = new Map<string, Pending[]>();
  for (const p of pending) {
    yearGaps.set(p.race.year, [...(yearGaps.get(p.race.year) ?? []), p.actual - p.pre]);
    const k = `${p.race.abbr}|${p.race.chamber}|${p.race.year}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const mu = new Map([...yearGaps].map(([y, g]) => [y, g.reduce((a, b) => a + b, 0) / g.length]));
  const others = new Map<Pending, number>();
  for (const list of groups.values()) {
    const total = list.reduce((s, p) => s + (p.actual - p.pre), 0);
    for (const p of list) {
      const n = list.length - 1, m = mu.get(p.race.year) ?? 0;
      others.set(p, n > 0 ? m + (n / (n + LEG_WAR.OTHERS_K)) * ((total - (p.actual - p.pre)) / n - m) : m);
    }
  }

  // Credit by record.
  const effectRaces = new Map<Pending, EffectRace>();
  for (const p of pending) {
    const expected = p.pre + others.get(p)!;
    effectRaces.set(p, { r: p.actual - expected, year: p.race.year, office: "L", R: p.R.person, D: p.D.person, inc: p.incSign > 0 ? "R" : p.incSign < 0 ? "D" : null, priorR: start?.(p, "R"), priorD: start?.(p, "D") });
  }
  const shares = allocateByRecord([...effectRaces.values()], LEG_WAR.SURPRISE_GAMMA, LEG_WAR.RECORD_LAMBDA, () => LEG_WAR.RECENCY_DECAY, LEG_WAR.INCUMBENT_RECORD);

  const rows: LegWarRow[] = [];
  for (const p of pending) {
    const er = effectRaces.get(p)!, pair = shares.get(er)!;
    const expected = p.pre + others.get(p)!;
    const money = stateLegMoney(p.race.abbr, p.race.chamber, p.race.key, p.race.year)?.gapPct ?? null;
    const race = `${p.race.abbr} ${shortDistrictName(p.race.chamber, p.race.key)}`;
    const mk = (party: "D" | "R"): LegWarRow => {
      const s = party === "R" ? 1 : -1;
      const me = party === "R" ? p.R : p.D;
      const mine = party === "R" ? pair.R! : pair.D!, theirs = party === "R" ? pair.D! : pair.R!;
      const replacementPts = me.incumbent && p.incSign === s ? LEG_WAR.INCUMBENCY_PTS : 0;
      return {
        person: me.person, slug: me.slug, candidate: me.name, party, office: "L", state: p.race.abbr, chamber: p.race.chamber, district: p.race.key, race, year: p.race.year,
        actual: p.actual, expected, generic: p.generic, genericWeight: p.weight, offices: p.offices, modelled: p.modelled, others: others.get(p)!, incSign: p.incSign,
        basis: p.basis, note: p.note, moneyGapPct: money, residual: s * er.r, record: mine.record, effect: mine.rating, effectN: mine.n, effectW: mine.weight + 1,
        opponentEffect: theirs.strength, replacementPts, expectedVsOpponent: expected - s * replacementPts - s * theirs.strength, war: mine.strength + replacementPts, opponent: null,
        ...(start?.(p, party) != null ? { crossStart: start(p, party) } : {}),
      };
    };
    const d = mk("D"), r = mk("R");
    d.opponent = { name: r.candidate, slug: r.slug, party: "R", war: r.war };
    r.opponent = { name: d.candidate, slug: d.slug, party: "D", war: d.war };
    rows.push(d, r);
  }
  return rows;
}

// ── One WAR, two tables ───────────────────────────────────────────────────────
// lib/tplCompute.ts, "One WAR, two tables": a candidate's record in one table starts from their
// record in the other, discounted by WAR_CROSS_K (the federal race's office picks κ). Each table
// reads the other as it stands on its own.

/** Same name, same state, same party, and known to be two people (the name join cannot tell). */
const CROSS_DIFFERENT_PEOPLE = new Set<string>([
  "bill-schuette-mi", // the 2018 nominee for governor and his son, a state representative since 2022
]);

type FedRow = ReturnType<typeof computeWarTable>[number];
let _cross: { fedOf: Map<string, FedRow[]>; personOf: Map<string, string> } | null = null;
/** People with rows in both tables: legislative record key → their federal rows, and federal key → record key.
 *  Matched as the candidate pages join the two records: by name within the state, same party; where a
 *  page holds two people, the one with the page's latest legislative race. */
function crossLinks() {
  if (_cross) return _cross;
  const own = solve(buildPending());
  const bySlug = new Map<string, LegWarRow[]>();
  for (const r of own) if (r.slug) bySlug.set(r.slug, [...(bySlug.get(r.slug) ?? []), r]);
  const fedByKey = new Map<string, FedRow[]>();
  for (const r of computeWarTable(undefined, undefined, false)) {
    if (r.office === "P") continue;
    const k = warCandidateKey(r.state, r.party, r.candidate);
    fedByKey.set(k, [...(fedByKey.get(k) ?? []), r]);
  }
  const fedOf = new Map<string, FedRow[]>(), personOf = new Map<string, string>();
  for (const [key, list] of fedByKey) {
    const { state, party, candidate } = list[0];
    const page = findStateLegCandidate(candidate, statesData.find((x) => x.abbr === state)?.name ?? state);
    if (!page || CROSS_DIFFERENT_PEOPLE.has(page.slug)) continue;
    const mine = (bySlug.get(page.slug) ?? []).filter((r) => r.party === party);
    if (mine.length === 0) continue;
    const person = [...mine].sort((a, b) => b.year - a.year)[0].person;
    if (fedOf.has(person)) continue;
    fedOf.set(person, list);
    personOf.set(key, person);
  }
  _cross = { fedOf, personOf };
  return _cross;
}

/** Federal candidate key → that person's legislative races (year, strength without the incumbency credit),
 *  from the legislative table on its own. What scripts/buildWarCross.ts writes for the federal table. */
export function legislativeStrengthsByFederalKey(): Record<string, { year: number; q: number }[]> {
  const own = solve(buildPending());
  const byPerson = new Map<string, LegWarRow[]>();
  for (const r of own) byPerson.set(r.person, [...(byPerson.get(r.person) ?? []), r]);
  const out: Record<string, { year: number; q: number }[]> = {};
  for (const [key, person] of crossLinks().personOf) out[key] = (byPerson.get(person) ?? []).map((r) => ({ year: r.year, q: Math.round((r.war - r.replacementPts) * 100) / 100 })).sort((a, b) => a.year - b.year);
  return out;
}

const _tables = new Map<boolean, LegWarRow[]>();
/** The legislative table. `cross` false: on its own, no federal record entering any row. */
export function computeLegWarTable(cross = true): LegWarRow[] {
  const hit = _tables.get(cross);
  if (hit) return hit;
  const pending = buildPending();
  let rows: LegWarRow[];
  if (!cross) rows = solve(pending);
  else {
    const { fedOf } = crossLinks();
    rows = solve(pending, (p, side) => {
      const fedRows = fedOf.get(side === "R" ? p.R.person : p.D.person);
      if (!fedRows) return undefined;
      return crossRecordStart(p.race.year, fedRows.map((r) => ({ year: r.year, q: r.war - r.replacementPts, k: WAR_CROSS_K[r.office] ?? 0, decay: recencyDecayFor(r.office) })), LEG_WAR.RECORD_LAMBDA);
    });
  }
  _tables.set(cross, rows);
  return rows;
}

let _byRace: Map<string, LegWarRow> | null = null;
const resultKeyIndex = new Map<string, Record<string, string>>();
/** The WAR row of a race on a candidate page, or null where the race is not scored. */
export function legWarForRace(page: StateLegCandidatePage, race: StateLegRace): LegWarRow | null {
  if (!_byRace) { _byRace = new Map(); for (const r of computeLegWarTable()) _byRace.set(`${r.state}|${r.chamber}|${r.year}|${r.district}|${r.slug}`, r); }
  let key = race.district;
  if (race.year !== RESULTS_YEAR) {
    const ck = `${race.abbr}|${race.chamber}|${race.year}`;
    if (!resultKeyIndex.has(ck)) {
      const keys: Record<string, string> = {};
      for (const k of Object.keys(stateLegResults[race.abbr]?.[String(race.year)]?.[race.chamber]?.districts ?? {})) keys[k] = k;
      resultKeyIndex.set(ck, indexByNormalizedKey(keys));
    }
    key = lookupByDistrictCode(resultKeyIndex.get(ck)!, race.abbr, race.chamber, race.district) ?? race.district;
  }
  return _byRace.get(`${race.abbr}|${race.chamber}|${race.year}|${key}|${page.slug}`) ?? null;
}

import "server-only";

import { electionYear } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber, type StateLegDistrict } from "@/data/stateLegDistricts";
import { stateLegCandidates2026 } from "@/data/stateLegCandidates2026";
import { stateLegOutgoing2026 } from "@/data/stateLegOutgoing2026";
import { candidateSlug } from "./candidateSlug";
import { districtHash, resultMargin, shortDistrictName } from "./stateLegAtlas";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_LEG_DISPLAY_NAME, STATE_LEG_IDENTITY_MERGE, STATE_LEG_IDENTITY_SPLIT } from "@/data/stateLegCandidateIdentityOverrides";
import { indexByNormalizedKey, lookupByDistrictCode, normalizeDistrictKey } from "./stateLegDistrictKey";
import { nameConflict, parseName, type ParsedName } from "./stateLegCandidateIdentity";

/**
 * One page per person who stood in a state legislative general election 2016–2026 (or sits in a
 * chamber today), built from the atlas's candidate lists the way lib/candidateIndex.ts builds the
 * federal pages. Served at /candidates/[slug] alongside them: a state legislator who later ran for
 * Congress gets ONE page with both records (the two indexes are joined on name and state by the
 * page).
 *
 * Identity. People are keyed within a state: the same name in two states is two people, the same
 * name in one state is one person. Names are spelled differently across the sources (Klarner's
 * "Adam C. Miller" is MEDSL's "Adam Miller"), so within a state two spellings that share first and
 * last name AND stood in the same chamber and district are merged, and every spelling's slug
 * resolves to the merged page. A slug is the name plus the state: /candidates/bill-roemer-oh.
 *
 * Nothing here is computed at build time beyond the index itself; the 2026 projection for a
 * current race is added by the page, from lib/stateLegForecast.ts.
 */

export type StateLegParty = "D" | "R" | "O";

export type StateLegRace = {
  year: number;
  abbr: string;
  stateId: string;
  stateName: string;
  chamber: Chamber;
  chamberLabel: string;
  district: string;
  /** "HD 31", "SD 5", "BE1", "Addison-1" */
  districtShort: string;
  districtLabel: string;
  /** "current" or the superseded vintage the race was run on, and its label ("2016–2020 map"). */
  era: string;
  eraLabel: string;
  href: string;
  party: StateLegParty;
  partyLabel?: string;
  votes: number | null;
  /** Share of every vote cast in the district (deflated in a multi-member district). */
  share: number | null;
  demVotes: number | null;
  repVotes: number | null;
  totalVotes: number | null;
  /** Two-party R-positive margin of the district's result. */
  margin: number | null;
  noCount: boolean;
  uncontested: boolean;
  incumbent: boolean;
  /** True/false where the source or the derivation marked winners; null where nobody is marked. */
  winner: boolean | null;
  post?: string;
  seats?: number;
  /** Everyone else on the ballot, votes descending. */
  others: { name: string; party: StateLegParty; partyLabel?: string; votes: number | null; winner: boolean | null; incumbent: boolean; slug: string; writeIn?: boolean }[];
  /** The 2026 general: no result yet. */
  isCurrent: boolean;
  writeIn?: boolean;
  canceledGeneral?: boolean;
};

export type StateLegCandidatePage = {
  name: string;
  slug: string;
  /** Most recent party. */
  party: StateLegParty;
  abbr: string;
  stateId: string;
  stateName: string;
  /** "State Representative · Ohio HD 31", where the person sits in a chamber today. */
  position?: string;
  positionHref?: string;
  positionChamber?: Chamber;
  positionDistrict?: string;
  /** Not seeking re-election to the seat in 2026, and why (Wikipedia's retirement lists). */
  outgoing2026?: { chamber: Chamber; district: string; districtShort: string; category: string; reason: string; href: string };
  /** Newest first. */
  races: StateLegRace[];
  wins: number;
  losses: number;
  /** Every spelling the sources used for this person. */
  spellings: string[];
};

const NON_CANDIDATE = /write.?in|scatter|blank|void|under.?vote|over.?vote|none of|^no candidate|^uncommitted|^total$/i;

export function isRealCandidateName(name: string | undefined): name is string {
  return !!name && name.trim().length >= 3 && !NON_CANDIDATE.test(name.trim());
}

/** The slug a state legislative candidate's page lives at: the name plus the state. */
export function stateLegCandidateSlug(name: string, abbr: string): string {
  return `${candidateSlug(name)}-${abbr.toLowerCase()}`;
}

function chamberLabel(abbr: string, chamber: Chamber): string {
  return UNICAMERAL_STATES.has(abbr) ? "Legislature" : chamber === "house" ? "State House" : "State Senate";
}

function positionTitle(abbr: string, chamber: Chamber): string {
  if (UNICAMERAL_STATES.has(abbr)) return "State Senator";
  return chamber === "house" ? "State Representative" : "State Senator";
}

type Person = {
  abbr: string;
  spellings: Map<string, number>; // spelling → count
  races: StateLegRace[];
  seats: Set<string>; // `${chamber}:${district}`
  eraSeats: Set<string>; // `${chamber}|${era}|${normalized district}`: the territory, for seat links
  years: Set<number>; // years on a general-election ballot
  parties: Set<string>;
  position?: { chamber: Chamber; district: string; label: string };
  outgoing?: { chamber: Chamber; district: string; category: string; reason: string };
};

const STATE_BY_ABBR = new Map(statesData.map((s) => [s.abbr, s]));

function eraLabelFor(abbr: string, chamber: Chamber, year: number): { era: string; label: string } {
  const map = stateLegHistoricalMaps[abbr]?.[chamber] ?? {};
  const vintage = map[String(year)];
  if (vintage == null) return { era: "current", label: "current map" };
  const years = Object.entries(map).filter(([, v]) => v === vintage).map(([y]) => Number(y)).sort();
  const label = years.length <= 1 ? `${years[0] ?? vintage} map` : `${years[0]}–${years[years.length - 1]} map`;
  return { era: String(vintage), label };
}

/** "OH:adam-c-miller" → "adam-c-miller-oh" */
function keyToSlug(key: string): string {
  return `${key.slice(3)}-${key.slice(0, 2).toLowerCase()}`;
}

// ── Spellings → people ────────────────────────────────────────────────────────
// The rules live in lib/stateLegCandidateIdentity.ts. Pairs are taken strongest first (hand
// merges, then a shared seat, then overlapping territory), and two groups join only when every
// spelling in one is compatible with every spelling in the other, so a chain like "John A. Smith"
// ~ "John Smith" ~ "John B. Smith" can never fuse the two ends.

export type IdentityOutcome = "merged:override" | "merged:seat" | "merged:territory" | "merged:nearby" | "review" | "blocked";
export type IdentityDecision = {
  abbr: string; a: string; b: string; outcome: IdentityOutcome; reason: string;
  aSeats: string[]; bSeats: string[]; aYears: number[]; bYears: number[]; aParties: string[]; bParties: string[];
};

type SeatLinks = Record<string, string[]>;
let _seatLinks: Map<string, Map<string, Set<string>>> | null = null;
/** State → era seat → the era seats whose territory overlaps it. */
function seatLinks(abbr: string): Map<string, Set<string>> {
  if (!_seatLinks) {
    // Literal path so Vercel's file tracing picks it up (see the Vercel file tracing note).
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data-entry", "state-leg-seat-links.json"), "utf8")) as SeatLinks;
    _seatLinks = new Map();
    for (const [st, pairs] of Object.entries(raw)) {
      const adj = new Map<string, Set<string>>();
      const add = (x: string, y: string) => { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x)!.add(y); };
      for (const p of pairs) { const [x, y] = p.split("~"); add(x, y); add(y, x); }
      _seatLinks.set(st, adj);
    }
  }
  return _seatLinks.get(abbr) ?? new Map();
}

const rulingKey = (abbr: string, a: string, b: string) => `${abbr}|${[a, b].sort().join("|")}`;
const SPLIT_RULINGS = new Set(STATE_LEG_IDENTITY_SPLIT.map(([abbr, a, b]) => rulingKey(abbr, a, b)));

const DISPLAY_NAMES = new Set(STATE_LEG_DISPLAY_NAME.map(([abbr, sp]) => `${abbr}|${sp}`));

let _identityAudit: IdentityDecision[] = [];

function mergeSpellings(people: Map<string, Person>): Map<string, string> {
  const parsed = new Map<string, ParsedName[]>();
  const bySurname = new Map<string, string[]>();
  for (const [key, p] of people) {
    const names = [...p.spellings.keys()].map(parseName).filter((n): n is ParsedName => n != null);
    if (names.length === 0) continue;
    parsed.set(key, names);
    const g = `${p.abbr}:${names[0].last}`;
    bySurname.set(g, [...(bySurname.get(g) ?? []), key]);
  }

  const spellingsOf = (k: string) => [...people.get(k)!.spellings.keys()];
  const ruled = (set: Set<string>, a: string, b: string) => {
    const abbr = people.get(a)!.abbr;
    return spellingsOf(a).some((x) => spellingsOf(b).some((y) => set.has(rulingKey(abbr, x, y))));
  };
  const sharesSeat = (a: string, b: string) => { const pb = people.get(b)!.seats; return [...people.get(a)!.seats].some((s) => pb.has(s)); };
  /** A reason the two can never be one person, or null. On a shared seat a middle-name difference
   *  is a typo or a maiden name far more often than a second person, so only the suffix and the
   *  ballot-year checks apply there. */
  const block = (a: string, b: string): string | null => {
    if (ruled(SPLIT_RULINGS, a, b)) return "split ruling";
    const shared = sharesSeat(a, b);
    for (const x of parsed.get(a)!) for (const y of parsed.get(b)!) {
      const c = nameConflict(x, y);
      if (c && !(shared && c === "middle name")) return c;
    }
    // Two seats in one year is two people. The same seat in one year is one person on two ballot
    // lines (New York's fusion lines: "Grace Lee" and "Grace Lee (WOR)").
    const pa = people.get(a)!, pb = people.get(b)!;
    for (const ra of pa.races) for (const rb of pb.races) {
      if (ra.year === rb.year && (ra.chamber !== rb.chamber || ra.district !== rb.district)) return "two seats in one year";
    }
    return null;
  };
  // "I" and "O" are both "not a major party" across sources.
  const partiesOf = (k: string) => new Set([...people.get(k)!.parties].map((x) => (x === "I" ? "O" : x)));
  const sharesParty = (a: string, b: string) => { const pb = partiesOf(b); return [...partiesOf(a)].some((x) => pb.has(x)); };
  // A run as an independent or on a minor line is not a different person: candidates leave a
  // party after losing a nomination, and New York prints fusion lines as separate rows. Only a
  // Democrat-vs-Republican record, with nothing else in common, counts against a merge.
  const partiesCompatible = (a: string, b: string) => sharesParty(a, b) || partiesOf(a).has("O") || partiesOf(b).has("O");

  type Edge = { a: string; b: string; tier: 0 | 1 | 2 | 3 };
  const edges: Edge[] = [];
  const audit: IdentityDecision[] = [];
  const describe = (a: string, b: string, outcome: IdentityOutcome, reason: string): IdentityDecision => {
    const pa = people.get(a)!, pb = people.get(b)!;
    return {
      abbr: pa.abbr, a: spellingsOf(a).join(" / "), b: spellingsOf(b).join(" / "), outcome, reason,
      aSeats: [...pa.eraSeats], bSeats: [...pb.eraSeats], aYears: [...pa.years].sort(), bYears: [...pb.years].sort(),
      aParties: [...pa.parties], bParties: [...pb.parties],
    };
  };
  // Hand merges first, wherever the two spellings sit - a ruling can join two surnames
  // ("Kristina Daleyroegner" and "Kristina Roegner"), which the surname groups below never compare.
  const keyOfSpelling = new Map<string, string>();
  for (const [key, p] of people) for (const sp of p.spellings.keys()) keyOfSpelling.set(`${p.abbr}|${sp}`, key);
  for (const [abbr, x, y] of STATE_LEG_IDENTITY_MERGE) {
    const a = keyOfSpelling.get(`${abbr}|${x}`), b = keyOfSpelling.get(`${abbr}|${y}`);
    if (!a || !b) throw new Error(`stateLegCandidateIdentityOverrides: no ${abbr} candidate spelled "${!a ? x : y}"`);
    if (a !== b) edges.push({ a, b, tier: 0 });
  }

  for (const keys of bySurname.values()) {
    if (keys.length < 2) continue;
    const links = seatLinks(people.get(keys[0])!.abbr);
    for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) {
      const a = keys[i], b = keys[j], pa = people.get(a)!, pb = people.get(b)!;
      const why = block(a, b);
      // Only pairs whose first names agree are worth listing; "John Smith" vs "Mary Smith" is noise.
      if (why) {
        // A shared seat merged unconditionally before these rules; flag the ones they now split.
        const shared = sharesSeat(a, b);
        if (why !== "first name" && why !== "surname") audit.push(describe(a, b, "blocked", shared ? `${why}; shares a seat` : why));
        continue;
      }
      if (sharesSeat(a, b)) { edges.push({ a, b, tier: 1 }); continue; }
      // Overlapping seats: a chamber switch, or a district a redraw renumbered.
      const near = (s: string) => links.get(s) ?? new Set<string>();
      const linked = [...pa.eraSeats].some((s) => [...pb.eraSeats].some((t) => near(s).has(t)));
      if (linked && partiesCompatible(a, b)) { edges.push({ a, b, tier: 2 }); continue; }
      // Two hops - both seats overlap one shared district: an incumbent a redraw put next door.
      // Looser geography, so it takes a party in common.
      const aRing = new Set([...pa.eraSeats].flatMap((s) => [...near(s)]));
      const nearby = [...pb.eraSeats].some((t) => [...near(t)].some((x) => aRing.has(x)));
      if (nearby && sharesParty(a, b)) { edges.push({ a, b, tier: 3 }); continue; }
      audit.push(describe(a, b, "review", linked ? "overlapping seats, D vs R" : nearby ? "neighbouring seats, no party in common" : "no seat link"));
    }
  }

  // Union-find over people, joining whole groups only when every cross pair is compatible.
  const parent = new Map<string, string>();
  const members = new Map<string, string[]>();
  const find = (k: string): string => { let r = k; while ((parent.get(r) ?? r) !== r) r = parent.get(r)!; return r; };
  const groupOf = (k: string) => members.get(find(k)) ?? [k];
  const TIER: IdentityOutcome[] = ["merged:override", "merged:seat", "merged:territory", "merged:nearby"];
  const REASON = ["ruling", "shared seat", "overlapping seats", "seats overlapping one shared district, same party"];
  for (const e of edges.sort((x, y) => x.tier - y.tier)) {
    const ra = find(e.a), rb = find(e.b);
    if (ra === rb) { audit.push(describe(e.a, e.b, TIER[e.tier], "already joined")); continue; }
    const ga = groupOf(e.a), gb = groupOf(e.b);
    if (e.tier > 0) {
      const conflict = ga.flatMap((x) => gb.map((y) => block(x, y))).find((r) => r != null);
      if (conflict) { audit.push(describe(e.a, e.b, "blocked", `${conflict} (via another spelling)`)); continue; }
    }
    parent.set(rb, ra);
    members.set(ra, [...ga, ...gb]);
    members.delete(rb);
    audit.push(describe(e.a, e.b, TIER[e.tier], REASON[e.tier]));
  }

  // Fold each group into its root: the sitting member's spelling, else the most-used one.
  const canonicalOf = new Map<string, string>();
  for (const group of members.values()) {
    const weight = (k: string) => [...people.get(k)!.spellings.values()].reduce((a, b) => a + b, 0) + (people.get(k)!.position ? 100 : 0);
    const root = [...group].sort((a, b) => weight(b) - weight(a))[0];
    const rp = people.get(root)!;
    for (const k of group) {
      if (k === root) continue;
      const p = people.get(k)!;
      for (const [s, n] of p.spellings) rp.spellings.set(s, (rp.spellings.get(s) ?? 0) + n);
      rp.races.push(...p.races);
      for (const s of p.seats) rp.seats.add(s);
      for (const s of p.eraSeats) rp.eraSeats.add(s);
      for (const y of p.years) rp.years.add(y);
      for (const x of p.parties) rp.parties.add(x);
      if (!rp.position && p.position) rp.position = p.position;
      if (!rp.outgoing && p.outgoing) rp.outgoing = p.outgoing;
      people.delete(k);
      canonicalOf.set(k, root);
    }
  }
  _identityAudit = audit;
  return canonicalOf;
}

function buildIndex() {
  const people = new Map<string, Person>(); // `${abbr}:${slug}` → person
  const bySlug = new Map<string, string>();  // every slug (any spelling) → canonical person key

  const getPerson = (abbr: string, name: string): Person => {
    const key = `${abbr}:${candidateSlug(name)}`;
    let p = people.get(key);
    if (!p) { p = { abbr, spellings: new Map(), races: [], seats: new Set(), eraSeats: new Set(), years: new Set(), parties: new Set() }; people.set(key, p); }
    p.spellings.set(name, (p.spellings.get(name) ?? 0) + 1);
    return p;
  };

  for (const state of statesData) {
    const abbr = state.abbr;
    const chambers = stateLegDistricts[abbr];
    if (!chambers) continue;
    const years = stateLegResults[abbr] ?? {};
    for (const chamber of ["house", "senate"] as Chamber[]) {
      const roster = chambers[chamber];
      if (!roster || (UNICAMERAL_STATES.has(abbr) && chamber === "house")) continue;
      const rosterByKey = new Map(roster.map((d) => [d.number, d]));
      const chLabel = chamberLabel(abbr, chamber);
      const raceBase = (d: StateLegDistrict | undefined, key: string) => ({
        abbr, stateId: state.id, stateName: state.name, chamber, chamberLabel: chLabel,
        district: key, districtShort: shortDistrictName(chamber, key), districtLabel: d?.label ?? `District ${key}`,
        href: `/states/${state.id}/legislature/${chamber}${districtHash(chamber, key)}`,
      });

      // Past generals.
      for (const [yearKey, blocks] of Object.entries(years)) {
        const block = blocks[chamber];
        if (!block) continue;
        const year = Number(yearKey);
        const { era, label: eraLabel } = eraLabelFor(abbr, chamber, year);
        const index = indexByNormalizedKey(block.districts);
        for (const d of roster) {
          const r = lookupByDistrictCode(index, abbr, chamber, d.number);
          if (!r?.candidates?.length) continue;
          const anyWinner = r.candidates.some((c) => c.winner);
          const real = r.candidates.filter((c) => isRealCandidateName(c.name));
          const margin = resultMargin(r);
          for (const c of real) {
            const person = getPerson(abbr, c.name);
            person.seats.add(`${chamber}:${d.number}`);
            person.eraSeats.add(`${chamber}|${era}|${normalizeDistrictKey(d.number)}`);
            person.years.add(year);
            if (c.party) person.parties.add(c.party);
            person.races.push({
              ...raceBase(d, d.number), year, era, eraLabel,
              party: c.party, votes: c.votes, share: c.votes != null && r.totalVotes ? (c.votes / r.totalVotes) * 100 : null,
              demVotes: r.demVotes, repVotes: r.repVotes, totalVotes: r.totalVotes, margin,
              noCount: !!r.noCount, uncontested: !!r.uncontested, incumbent: !!c.incumbent,
              winner: anyWinner ? !!c.winner : null, post: c.post, seats: d.seats,
              others: real.filter((o) => o !== c).map((o) => ({ name: o.name, party: o.party, votes: o.votes, winner: anyWinner ? !!o.winner : null, incumbent: !!o.incumbent, slug: stateLegCandidateSlug(o.name, abbr) })),
              isCurrent: false,
            });
          }
        }
      }

      // The 2026 field.
      const field = stateLegCandidates2026[abbr]?.[chamber];
      if (field) {
        for (const [key, entry] of Object.entries(field)) {
          const d = rosterByKey.get(key);
          const real = entry.candidates.filter((c) => isRealCandidateName(c.name));
          for (const c of real) {
            const person = getPerson(abbr, c.name);
            person.seats.add(`${chamber}:${key}`);
            person.eraSeats.add(`${chamber}|current|${normalizeDistrictKey(key)}`);
            person.years.add(electionYear);
            if (c.party) person.parties.add(c.party);
            person.races.push({
              ...raceBase(d, key), year: electionYear, era: "current", eraLabel: "current map",
              party: c.party, partyLabel: c.partyLabel, votes: null, share: null, demVotes: null, repVotes: null, totalVotes: null, margin: null,
              noCount: false, uncontested: false, incumbent: !!c.incumbent, winner: null, post: c.post, seats: entry.seats ?? d?.seats,
              others: real.filter((o) => o !== c).map((o) => ({ name: o.name, party: o.party, partyLabel: o.partyLabel, votes: null, winner: null, incumbent: !!o.incumbent, slug: stateLegCandidateSlug(o.name, abbr), writeIn: o.writeIn })),
              isCurrent: true, writeIn: c.writeIn, canceledGeneral: c.canceledGeneral,
            });
          }
        }
      }

      // Members not seeking re-election in 2026.
      for (const [key, entries] of Object.entries(stateLegOutgoing2026[abbr]?.[chamber] ?? {})) {
        for (const o of entries) {
          if (!isRealCandidateName(o.name)) continue;
          const person = getPerson(abbr, o.name);
          person.seats.add(`${chamber}:${key}`);
          person.eraSeats.add(`${chamber}|current|${normalizeDistrictKey(key)}`);
          if (o.party) person.parties.add(o.party);
          person.outgoing = { chamber, district: key, category: o.category, reason: o.reason };
        }
      }

      // Sitting members.
      for (const d of roster) {
        for (const inc of d.incumbents ?? []) {
          if (!isRealCandidateName(inc.name)) continue;
          const person = getPerson(abbr, inc.name);
          person.seats.add(`${chamber}:${d.number}`);
          person.eraSeats.add(`${chamber}|current|${normalizeDistrictKey(d.number)}`);
          if (inc.party) person.parties.add(inc.party);
          person.position = { chamber, district: d.number, label: `${positionTitle(abbr, chamber)} · ${state.name} ${shortDistrictName(chamber, d.number)}` };
        }
      }
    }
  }

  const canonicalOf = mergeSpellings(people);

  const pages = new Map<string, StateLegCandidatePage>();
  for (const [key, p] of people) {
    const state = STATE_BY_ABBR.get(p.abbr)!;
    const spellings = [...p.spellings.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    // The displayed name: the sitting member's roster spelling, else the most-used one.
    const rosterName = p.position ? spellings.find((s) => stateLegDistricts[p.abbr]?.[p.position!.chamber]?.some((d) => d.number === p.position!.district && (d.incumbents ?? []).some((i) => i.name === s))) : undefined;
    // A hand-chosen display name beats the roster's, which beats the most-used spelling.
    const name = spellings.find((sp) => DISPLAY_NAMES.has(`${p.abbr}|${sp}`)) ?? rosterName ?? spellings[0];
    const slug = keyToSlug(key);
    const races = p.races.sort((a, b) => b.year - a.year || a.chamber.localeCompare(b.chamber) || a.district.localeCompare(b.district));
    const past = races.filter((r) => !r.isCurrent);
    const party = races[0]?.party ?? "O";
    pages.set(slug, {
      name, slug, party, abbr: p.abbr, stateId: state.id, stateName: state.name,
      position: p.position?.label, positionHref: p.position ? `/states/${state.id}/legislature/${p.position.chamber}${districtHash(p.position.chamber, p.position.district)}` : undefined,
      positionChamber: p.position?.chamber, positionDistrict: p.position?.district,
      outgoing2026: p.outgoing ? { ...p.outgoing, districtShort: shortDistrictName(p.outgoing.chamber, p.outgoing.district), href: `/states/${state.id}/legislature/${p.outgoing.chamber}${districtHash(p.outgoing.chamber, p.outgoing.district)}` } : undefined,
      races, wins: past.filter((r) => r.winner === true).length, losses: past.filter((r) => r.winner === false).length, spellings,
    });
    bySlug.set(slug, slug);
    for (const s of spellings) {
      bySlug.set(stateLegCandidateSlug(s, p.abbr), slug);
      // The accent-free form too: candidateSlug turns "Guzmán" into "guzm-n", which no one types.
      const plain = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      if (plain !== s && !bySlug.has(stateLegCandidateSlug(plain, p.abbr))) bySlug.set(stateLegCandidateSlug(plain, p.abbr), slug);
    }
  }
  for (const [alias, root] of canonicalOf) bySlug.set(keyToSlug(alias), keyToSlug(root));

  return { pages, bySlug };
}

const index = buildIndex();

/** The page a slug resolves to: its own, or the merged spelling it belongs to. Null if unknown. */
/** Every name-pair decision the index made, for scripts/audit-state-leg-candidate-identity.ts. */
export function getStateLegIdentityAudit(): IdentityDecision[] {
  return _identityAudit;
}

export function getStateLegCandidatePage(slug: string): StateLegCandidatePage | null {
  const canonical = index.bySlug.get(slug);
  return canonical ? index.pages.get(canonical) ?? null : null;
}

/** The state legislative record of a federal candidate, matched on name and state. */
export function findStateLegCandidate(name: string, stateName: string): StateLegCandidatePage | null {
  const state = statesData.find((s) => s.name === stateName);
  if (!state) return null;
  return getStateLegCandidatePage(stateLegCandidateSlug(name, state.abbr));
}

export function getAllStateLegCandidateSlugs(): string[] {
  return [...index.pages.keys()];
}

export function getAllStateLegCandidatePages(): StateLegCandidatePage[] {
  return [...index.pages.values()];
}

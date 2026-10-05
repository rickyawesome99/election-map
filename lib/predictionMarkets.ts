// Prediction-market accuracy (/analysis/markets): joins every election-eve market price in
// data/predictionMarkets.ts to the race it priced (data/raceCalendar.ts) and scores it.
//
// Conventions
//  - A market's call is the side priced higher on election eve; the price is read as a probability.
//  - Probabilities are two-way: dem / (dem + rep), so the two sides sum to 1 even where the venue's
//    contracts did not (PredictIt's routinely summed to 1.03–1.10).
//  - Sides are the calendar's ballot slots, not strict party labels: an independent the calendar
//    files in the Democratic slot (Sanders, King, Osborn) is the "D" side here.
//  - Races decided in a runoff are scored on the runoff winner, which is what the contracts paid on.
//  - "Will X be re-elected?" markets become a price on X's slot; markets on someone who was not on
//    the general-election ballot (retired, lost a primary) are dropped.

import { raceCalendar, type CalendarRace } from "@/data/raceCalendar";
import { marketQuotes, type MarketQuote, type MarketSource } from "@/data/predictionMarkets";
import { pastElectionHref, type PastElectionOffice } from "@/lib/pastElections";
import { raceHref } from "@/lib/raceCalendarQuery";
import { calibration, nameOf, partyOf, fmtWinMargin, type MarketDot, type MarketRaceRow, type Side } from "@/lib/predictionMarketDisplay";

export { calibration };

export type { Side };

export type ScoredMarket = {
  id: string;
  raceId: string;
  year: number;
  kind: CalendarRace["kind"];
  state: string;
  /** "Pennsylvania", "GA-07", "Georgia (special)", "Nebraska CD-2". */
  place: string;
  source: MarketSource;
  /** Election-eve probability of the Democratic-slot candidate, 0–1. */
  pDem: number;
  /** Null when the market sat at exactly 50/50. */
  favorite: Side | null;
  favProb: number;
  winner: Side;
  correct: boolean | null;
  demName: string;
  repName: string;
  demParty: CalendarRace["demParty"];
  repParty: CalendarRace["repParty"];
  /** Republican minus Democratic, points. */
  margin: number;
  runoff: boolean;
  asOf: string;
  volume: number | null;
  url: string;
  href: string | null;
};

const OFFICE: Record<CalendarRace["kind"], PastElectionOffice> = { P: "president", S: "senate", G: "governor", H: "house" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii)\b\.?/g, "").replace(/[^a-z ]/g, " ").trim().split(/\s+/);
const lastName = (s: string) => norm(s).at(-1) ?? "";
/** "Steve" and "Stephen" are the same first name; three letters is enough to tell candidates apart. */
const sameFirst = (a: string, b: string) => norm(a)[0]?.slice(0, 3) === norm(b)[0]?.slice(0, 3);

/** Which slot `subject` holds in `race`: surname must match, and the first name too unless only one slot shares the surname. */
function slotOf(subject: string, race: CalendarRace): Side | null {
  const last = lastName(subject);
  const hits = (["D", "R"] as const).filter((side) => lastName(side === "D" ? race.demName : race.repName) === last);
  if (hits.length === 1) return hits[0];
  return hits.find((side) => sameFirst(subject, side === "D" ? race.demName : race.repName)) ?? null;
}

const byYearKind = new Map<string, CalendarRace[]>();
for (const race of raceCalendar) {
  const key = `${race.year}-${race.kind}`;
  byYearKind.set(key, [...(byYearKind.get(key) ?? []), race]);
}

function findRace(q: MarketQuote): { race: CalendarRace; subjectSide: Side | null } | null {
  const pool = (byYearKind.get(`${q.year}-${q.kind}`) ?? []).filter((r) => !q.state || r.state === q.state);
  if (q.framing === "candidate") {
    const hits = pool.filter((r) => (!q.seat || r.seatSlot === q.seat) && slotOf(q.subject, r))
      // a title with no state has only the name to go on, so the first name has to match too
      .filter((r) => q.state || sameFirst(q.subject, slotOf(q.subject, r) === "D" ? r.demName : r.repName));
    return hits.length === 1 ? { race: hits[0], subjectSide: slotOf(q.subject, hits[0]) } : null;
  }
  const race = pool.find((r) =>
    q.kind === "S" ? r.raceClass === (q.seat === "special" ? "Special" : "Regular")
    : q.kind === "G" ? true
    : r.seatSlot === q.seat);
  return race ? { race, subjectSide: null } : null;
}

function placeOf(race: CalendarRace): string {
  if (race.kind === "H") return race.seat;
  if (race.kind === "P" && race.seatSlot !== "statewide") return `${race.stateName} CD-${race.seatSlot.slice(2)}`;
  return race.raceClass === "Special" ? `${race.stateName} (special)` : race.stateName;
}

function hrefOf(race: CalendarRace): string | null {
  const base = raceHref(race);
  if (!base || race.raceClass === "Special") return base;
  return pastElectionHref(OFFICE[race.kind], base.split("/").at(-1)!, race.year) ?? base;
}

function score(): { scored: ScoredMarket[]; dropped: MarketQuote[] } {
  const scored = new Map<string, ScoredMarket>();
  const framing = new Map<string, MarketQuote["framing"]>();
  const dropped: MarketQuote[] = [];
  for (const q of marketQuotes) {
    const found = findRace(q);
    const pDem = q.framing === "party"
      ? (q.dem != null && q.rep != null && q.dem + q.rep > 0 ? q.dem / (q.dem + q.rep) : null)
      : q.yes == null || !found?.subjectSide ? null : found.subjectSide === "D" ? q.yes : 1 - q.yes;
    if (!found || pDem == null) { dropped.push(q); continue; }
    const { race } = found;
    const favorite: Side | null = pDem > 0.5 ? "D" : pDem < 0.5 ? "R" : null;
    // A race the rounded margin calls even (IA-02 in 2020, six votes) is settled by the vote count.
    const winner: Side = (race.margin || (race.voteMargin ?? 0)) < 0 ? "D" : "R";
    const id = `${q.source}-${race.id}`;
    // Where a venue ran both a party market and a re-election market on one race, keep the party market.
    if (scored.has(id) && !(framing.get(id) === "candidate" && q.framing === "party")) continue;
    framing.set(id, q.framing);
    scored.set(id, {
      id, raceId: race.id, year: race.year, kind: race.kind, state: race.state, place: placeOf(race), source: q.source,
      pDem, favorite, favProb: Math.max(pDem, 1 - pDem), winner, correct: favorite == null ? null : favorite === winner,
      demName: race.demName, repName: race.repName, demParty: race.demParty, repParty: race.repParty,
      margin: race.margin, runoff: race.runoff, asOf: q.asOf, volume: q.volume, url: q.url, href: hrefOf(race),
    });
  }
  return { scored: [...scored.values()], dropped };
}

const result = score();
/** Every scored market, one per (venue, race). */
export const scoredMarkets: ScoredMarket[] = result.scored;
/** Quotes that priced no race in the calendar (a retired or primaried incumbent, mostly). */
export const droppedQuotes: MarketQuote[] = result.dropped;

// ── Aggregates ────────────────────────────────────────────────────────────────

export type Tally = {
  n: number;
  right: number;
  /** Mean squared error of pDem against the outcome; 0.25 is what a coin flip scores. */
  brier: number;
  /** Mean (pDem − outcome) in points: positive = the Democratic side was overpriced. */
  demBias: number;
  /** Among markets with a favorite under 90%. */
  contestedN: number;
  contestedRight: number;
};

export function tally(rows: ScoredMarket[]): Tally {
  const called = rows.filter((r) => r.correct != null);
  const contested = called.filter((r) => r.favProb < 0.9);
  const out = (r: ScoredMarket) => (r.winner === "D" ? 1 : 0);
  return {
    n: called.length,
    right: called.filter((r) => r.correct).length,
    brier: rows.length ? rows.reduce((s, r) => s + (r.pDem - out(r)) ** 2, 0) / rows.length : 0,
    demBias: rows.length ? (rows.reduce((s, r) => s + (r.pDem - out(r)), 0) / rows.length) * 100 : 0,
    contestedN: contested.length,
    contestedRight: contested.filter((r) => r.correct).length,
  };
}

/** One entry per race, carrying every venue that priced it. */
export type RaceMarkets = { raceId: string; year: number; kind: CalendarRace["kind"]; markets: ScoredMarket[] };

export function byRace(rows: ScoredMarket[]): RaceMarkets[] {
  const map = new Map<string, RaceMarkets>();
  for (const r of rows) {
    const entry = map.get(r.raceId) ?? { raceId: r.raceId, year: r.year, kind: r.kind, markets: [] };
    entry.markets.push(r);
    map.set(r.raceId, entry);
  }
  return [...map.values()];
}

/** The race-by-race rows the page's table renders: every venue's call beside the result. */
export function marketRaceRows(rows: ScoredMarket[]): MarketRaceRow[] {
  return byRace(rows).map(({ markets }) => {
    const m = markets[0];
    return {
      raceId: m.raceId, year: m.year, kind: m.kind, place: m.place, href: m.href, winner: m.winner, margin: m.margin, runoff: m.runoff,
      demName: m.demName, repName: m.repName, demParty: m.demParty, repParty: m.repParty,
      markets: markets.map((x) => ({ source: x.source, pDem: x.pDem, favorite: x.favorite, favProb: x.favProb, correct: x.correct, url: x.url })),
    };
  });
}

/** Every market with a favorite, flattened for the confidence charts. */
export function marketDots(rows: ScoredMarket[]): MarketDot[] {
  return marketRaceRows(rows).flatMap((race) =>
    race.markets.filter((m) => m.favorite != null).map((m) => ({
      id: `${m.source}-${race.raceId}`, year: race.year, kind: race.kind, place: race.place, source: m.source,
      favProb: m.favProb, favParty: partyOf(race, m.favorite!), favName: nameOf(race, m.favorite!),
      winName: nameOf(race, race.winner), winMargin: fmtWinMargin(race), correct: m.correct === true, href: race.href,
    })));
}

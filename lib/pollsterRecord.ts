import "server-only";
import pollsterPollsJson from "@/data/pollsterPolls.json";
import { POLLSTER_RATING_META as META, pollsterRatings, type PollsterRating } from "@/data/pollsterRatings";
import { racePolls } from "@/data/racePolls";
import { genericBallotPolls } from "@/data/genericBallotPolls";
import { electionYear, governorData, houseData, senateData } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { racePollKey } from "@/lib/racePollAverage";
import { pastElectionHref, pastElectionSearchEntries, type PastElectionOffice } from "@/lib/pastElections";
import { pollsterIdOf } from "@/lib/pollsterRatings";
import { liveHouseEffects, racePollLabel } from "@/lib/tplCompute";

// ── One pollster's full record, for /analysis/pollsters/[slug] ───────────────
// Past polls come from data/pollsterPolls.json (scripts/build-pollster-ratings.py: every
// general-election poll in the final 60 days, 2008–2024, scored against the result); this
// cycle's polls from the race and generic-ballot poll files, matched by rating id.

/** [year, type, location, race code, date, days out, sample, partisan, methodology,
 *  poll margin, result margin, error, oriented, excess vs field, house (vs others in race)] */
type PollTuple = [number, string, string, string, string, number, number | null, "D" | "R" | null, string | null, number, number, number, 0 | 1, number | null, number | null];
const POLLS = pollsterPollsJson as unknown as Record<string, PollTuple[]>;

export type PollsterPollRow = {
  cycle: number;
  year: number;
  office: "President" | "Senate" | "Governor" | "House" | "Generic ballot";
  race: string;          // "Pennsylvania" (statewide; the office is separate), "GA-12", "ME-02", "National"
  stage: string | null;  // "Special", "Runoff", "Special runoff"
  href: string | null;
  date: string;          // field midpoint (past) / end date (this cycle)
  daysOut: number | null;
  sample: number | null;
  population: string | null;
  partisan: "D" | "R" | null;
  methodology: string | null;
  poll: number;          // R-positive margin (top-two order when !oriented)
  result: number | null;
  error: number | null;  // poll − result, R-positive
  oriented: boolean;     // false = same-party contest; margin is first vs second, not R − D
  graded: boolean;       // inside the ratings' final-21-day window
  excess: number | null; // |error| − a typical poll of the race (negative = beat the field)
  calledWinner: boolean | null;
};

const OFFICE: Record<string, PollsterPollRow["office"]> = { P: "President", S: "Senate", G: "Governor", H: "House", GB: "Generic ballot" };
const PASTOFFICE: Record<string, PastElectionOffice> = { P: "president", S: "senate", G: "governor", H: "house" };
const STAGE: Record<string, string> = { GS: "Special", R: "Runoff", SR: "Special runoff" };
const SPLIT_PRES: Record<string, string> = { M1: "ME-01", M2: "ME-02", N1: "NE-01", N2: "NE-02", N3: "NE-03" };
const cycleOf = (year: number) => year + (year % 2);
const STATE_NAME = new Map([...statesData.map((s) => [s.abbr, s.name] as const), ["DC", "District of Columbia"]]);
/** Statewide races are labelled by the state's full name ("Maine Senate"), districts by code. */
const stateName = (abbr: string) => STATE_NAME.get(abbr) ?? abbr;

/** "AK-1" / "AK-01" → "AK-01". */
const district = (loc: string) => loc.replace(/^([A-Z]{2})-(\d+)$/, (_, st, n) => `${st}-${String(n).padStart(2, "0")}`);

let senateHrefs: Map<string, string> | null = null;
function pastHref(type: string, loc: string, code: string, year: number): string | null {
  const office = PASTOFFICE[type];
  if (!office || loc === "US" || SPLIT_PRES[loc]) return null;
  if (type === "H") return pastElectionHref("house", district(loc).toLowerCase(), year) ?? null;
  if (type === "S") {
    // the two seats share a state; the search entries carry the special flag that tells them apart
    senateHrefs ??= new Map(pastElectionSearchEntries("senate").map((e) => [`${e.abbr}:${e.year}:${e.special}`, e.href]));
    return senateHrefs.get(`${loc}:${year}:${code === "Sen-GS" || code === "Sen-SR"}`) ?? null;
  }
  return pastElectionHref(office, loc.toLowerCase(), year) ?? null;
}

function pastRows(id: string): PollsterPollRow[] {
  return (POLLS[id] ?? []).map(([year, type, loc, code, date, days, sample, partisan, methodology, poll, result, error, oriented, excess]) => {
    const raceCode = code.split("-")[1] ?? "G";
    const race = type === "GB" || loc === "US" ? "National" : type === "H" ? district(loc) : SPLIT_PRES[loc] ?? stateName(loc);
    return {
      cycle: cycleOf(year), year, office: OFFICE[type], race, stage: STAGE[raceCode] ?? null, href: pastHref(type, loc, code, year),
      date, daysOut: days, sample, population: null, partisan, methodology, poll, result, error, oriented: oriented === 1,
      graded: excess != null || days <= 21, excess,
      calledWinner: poll === 0 ? null : Math.sign(poll) === Math.sign(result),
    };
  });
}

// data/racePolls.ts key → the 2026 race page it counts toward. Built from the forecast's own race
// lists with the same key the forecast pairs polls with races by (tplCompute racePollingFor), so a
// poll links to the seat that is actually up: a state's two Senate seats have fixed ids (ME's 2026
// race is "ME-2" → /senate/me2), so the URL cannot be guessed from "Senate" vs "Senate Special".
let raceHrefs: Map<string, string> | null = null;
function raceHrefFor(key: string): string | null {
  if (!raceHrefs) {
    raceHrefs = new Map();
    for (const race of senateData) raceHrefs.set(racePollKey("S", race.id.replace(/-\d+$/, ""), racePollLabel(race)), `/senate/${race.id.toLowerCase().replace(/-2$/, "2")}`);
    for (const race of governorData) raceHrefs.set(racePollKey("G", race.id, racePollLabel(race)), `/governor/${race.id.toLowerCase()}`);
    for (const race of houseData) {
      const abbr = statesData.find((s) => s.name === race.state)?.abbr;
      if (abbr) raceHrefs.set(racePollKey("H", abbr, racePollLabel(race)), `/house/${race.name.toLowerCase()}`);
    }
  }
  return raceHrefs.get(key) ?? null;
}

/** Office, label and page link for a data/racePolls.ts key ("S:OH:Senate Special", "H:WI:House WI-03"). */
function racePollRace(key: string): Pick<PollsterPollRow, "office" | "race" | "stage" | "href"> {
  const [o, st, label] = key.split(":");
  const house = label.startsWith("House ") ? label.slice(6) : null;
  return { office: OFFICE[o], race: house ?? stateName(st), stage: label === "Senate Special" ? "Special" : null, href: raceHrefFor(key) };
}

/** This cycle's race and generic-ballot polls by the pollster. */
function currentRows(id: string): PollsterPollRow[] {
  const out: PollsterPollRow[] = [];
  const base = { cycle: electionYear, year: electionYear, daysOut: null, methodology: null, result: null, error: null, oriented: true, graded: false, excess: null, calledWinner: null };
  for (const [key, polls] of Object.entries(racePolls)) {
    for (const p of polls) {
      if (pollsterIdOf(p.pollster) !== id) continue;
      out.push({ ...base, ...racePollRace(key), date: p.endDate, sample: p.sample, population: p.population, partisan: p.partisan, poll: p.diff });
    }
  }
  for (const p of genericBallotPolls) {
    if (pollsterIdOf(p.pollster) !== id) continue;
    out.push({ ...base, office: "Generic ballot", race: "National", stage: null, href: null, date: p.endDate, sample: p.sample, population: p.population, partisan: null, poll: p.diff });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Latest polls of this cycle's races, for the Polls tab on /analysis/pollsters ──

export type RecentRacePoll = Pick<PollsterPollRow, "office" | "race" | "stage" | "href" | "sample" | "population" | "partisan"> & {
  startDate: string; endDate: string; pollster: string; slug: string | null; grade: string | null; dem: number; rep: number; diff: number;
};

/** The `n` most recently completed race polls (Senate, governor, House; not the generic ballot). */
export function recentRacePolls(n: number): RecentRacePoll[] {
  const byId = new Map(pollsterRatings.map((r) => [r.id, r]));
  return Object.entries(racePolls)
    .flatMap(([key, polls]) => polls.map((p) => ({ key, p })))
    .sort((a, b) => b.p.endDate.localeCompare(a.p.endDate) || b.p.startDate.localeCompare(a.p.startDate) || a.key.localeCompare(b.key))
    .slice(0, n)
    .map(({ key, p }) => {
      const r = byId.get(pollsterIdOf(p.pollster));
      return {
        ...racePollRace(key), startDate: p.startDate, endDate: p.endDate, pollster: p.pollster.replace(/\*\*/g, "").trim(), slug: r?.slug ?? null, grade: r?.grade ?? null,
        sample: p.sample, population: p.population, partisan: p.partisan, dem: p.dem, rep: p.rep, diff: p.diff,
      };
    });
}

// ── How the grade is put together ────────────────────────────────────────────
// Recomputes the score in scripts/build-pollster-ratings.py rate() from the pollster's own
// graded polls, so the page can show each step:
//   w = decay^(asOf − 1 − year) / √(its graded polls in that race);  score = Σ w·excess / (Σ w + scoreK)

export type GradeYearStep = { year: number; polls: number; recency: number; weight: number; excess: number; contribution: number };
export type GradeBreakdown = {
  years: GradeYearStep[];
  weight: number;        // Σ w
  contribution: number;  // Σ w·excess
  score: number;
  /** The most recent graded poll, as a worked example of step 1. */
  example: { label: string; date: string; absError: number; benchmark: number; excess: number } | null;
};

function gradeBreakdown(id: string): GradeBreakdown | null {
  const graded = (POLLS[id] ?? []).filter((t) => t[13] != null);
  if (!graded.length) return null;
  const raceKey = (t: PollTuple) => `${t[0]}|${t[1]}|${t[2]}|${t[3]}`;
  const dup = new Map<string, number>();
  for (const t of graded) dup.set(raceKey(t), (dup.get(raceKey(t)) ?? 0) + 1);
  const byYear = new Map<number, GradeYearStep>();
  for (const t of graded) {
    const recency = META.decay ** (META.asOf - 1 - t[0]);
    const w = recency / Math.sqrt(dup.get(raceKey(t))!);
    const c = byYear.get(t[0]) ?? { year: t[0], polls: 0, recency, weight: 0, excess: 0, contribution: 0 };
    c.polls += 1; c.weight += w; c.contribution += w * t[13]!;
    byYear.set(c.year, c);
  }
  const years = [...byYear.values()].map((c) => ({ ...c, excess: c.contribution / c.weight })).sort((a, b) => b.year - a.year);
  const weight = years.reduce((s, c) => s + c.weight, 0), contribution = years.reduce((s, c) => s + c.contribution, 0);
  const latest = graded.reduce((a, b) => (b[4] > a[4] ? b : a));
  const [year, type, loc, code, date, , , , , , , error, , excess] = latest;
  const race = type === "GB" ? "generic ballot" : loc === "US" ? "presidential popular vote" : type === "H" ? district(loc) : `${SPLIT_PRES[loc] ?? stateName(loc)} ${OFFICE[type]}`;
  return {
    years, weight, contribution, score: contribution / (weight + META.scoreK),
    example: { label: `${year} ${race}${STAGE[code.split("-")[1]] ? ` ${STAGE[code.split("-")[1]].toLowerCase()}` : ""}`, date, absError: Math.abs(error), benchmark: Math.abs(error) - excess!, excess: excess!},
  };
}

export type PollsterRecord = {
  rating: PollsterRating;
  polls: PollsterPollRow[];
  /** This cycle's lean vs the other pollsters, one entry per sponsor flag (public / (D) / (R)). */
  grade: GradeBreakdown | null;
  houseEffects: { partisan: "D" | "R" | null; effect: number; polls: number; races: number }[];
};

const bySlug = new Map(pollsterRatings.map((r) => [r.slug, r]));
export const pollsterSlugs = () => pollsterRatings.map((r) => r.slug);

export function getPollsterRecord(slug: string): PollsterRecord | null {
  const rating = bySlug.get(slug);
  if (!rating) return null;
  return {
    rating,
    polls: [...currentRows(rating.id), ...pastRows(rating.id)],
    grade: gradeBreakdown(rating.id),
    houseEffects: liveHouseEffects().table.filter((h) => pollsterIdOf(h.pollster) === rating.id).map(({ partisan, effect, polls, races }) => ({ partisan, effect, polls, races })),
  };
}

import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { statesData } from "@/data/statesData";
import { POLLSTER_RATING_META } from "@/data/pollsterRatings";
import { gradedRaceHref } from "@/lib/pollsterRecord";
import { splitCsvLine } from "@/lib/racePollsHistory";

// /analysis/polling-misses: how far the final polls of every statewide race since 2016 landed
// from the result, one number per race. Built from data-entry/pollster_graded_polls.csv (the
// 538 archive the pollster grades use), read with fs on the server like lib/racePollsHistory.ts.
//
// Race rule (the user's): for each presidential, Senate or governor race, take each pollster's
// LAST poll of it, keep it only if it was fielded in October or later, average those final
// polls into one predicted margin, and compare it with the result. Margins are R-positive like
// the rest of the repo, so miss = result − poll average: positive = Republicans beat their
// polls, negative = Democrats did. Every pollster counts once and equally; partisan polls are
// included (shown in the count, not weighted). The same-party contests the archive flags as
// unoriented (CA-style top-two) are skipped, as are the national popular vote, DC and the
// Maine/Nebraska district votes — the map is the 50 states.

export type PollingMissOffice = "President" | "Senate" | "Governor";
export type PollingMissStage = "Special" | "Runoff" | "Special runoff" | null;

export type PollingMissRace = {
  /** `${year}_${code}_${abbr}` from the archive, e.g. "2020_Sen-SR_GA". */
  key: string;
  abbr: string;
  state: string;
  year: number;
  office: PollingMissOffice;
  stage: PollingMissStage;
  /** Average of every pollster's final October-or-later poll, R-positive. */
  pollAvg: number;
  /** Certified margin, R-positive. */
  result: number;
  /** result − pollAvg: positive = Republicans outran their polls, negative = Democrats did. */
  miss: number;
  /** Pollsters whose final poll counted (one each). */
  polls: number;
  /** Of those, released by a party or campaign. */
  partisan: number;
  /** Final poll end dates: the earliest and the latest that counted. */
  firstDate: string;
  lastDate: string;
  href: string | null;
};

export type PollingMissSet = {
  races: PollingMissRace[];
  /** Years with at least one race, ascending. */
  years: number[];
  /** Recency decay per year, shared with the pollster grades (a race counts half as much every four years). */
  decay: number;
  /** The year recency is measured from. */
  asOf: number;
  /** Polls across all races that were set aside because the pollster's last poll of the race ended before October. */
  droppedPollsters: number;
};

const OFFICE: Record<string, PollingMissOffice> = { P: "President", S: "Senate", G: "Governor" };
const STAGE: Record<string, PollingMissStage> = { G: null, GS: "Special", R: "Runoff", SR: "Special runoff" };
const FIRST_YEAR = 2016;
const STATE_NAME = new Map(statesData.map((s) => [s.abbr, s.name] as const));

let cache: PollingMissSet | null = null;

export function pollingMisses(): PollingMissSet {
  if (cache) return cache;
  const text = readFileSync(join(process.cwd(), "data-entry", "pollster_graded_polls.csv"), "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const iYear = col("year"), iType = col("type"), iLoc = col("location"), iRace = col("race"), iId = col("pollster_id"),
    iPartisan = col("partisan"), iDate = col("date"), iPoll = col("poll_margin"), iActual = col("actual_margin"), iOriented = col("oriented");

  type Final = { date: string; poll: number; partisan: boolean };
  type Acc = { year: number; type: string; loc: string; code: string; actual: number; finals: Map<string, Final> };
  const byRace = new Map<string, Acc>();
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const year = parseInt(c[iYear], 10);
    const type = c[iType];
    const loc = c[iLoc];
    if (year < FIRST_YEAR || !OFFICE[type] || c[iOriented] !== "1" || !STATE_NAME.has(loc)) continue;
    const poll = parseFloat(c[iPoll]);
    const actual = parseFloat(c[iActual]);
    if (!Number.isFinite(poll) || !Number.isFinite(actual)) continue;
    const key = c[iRace];
    let acc = byRace.get(key);
    if (!acc) {
      acc = { year, type, loc, code: key.split("_")[1] ?? "", actual, finals: new Map() };
      byRace.set(key, acc);
    }
    // keep each pollster's latest poll of the race (ties on date: the later row in the file)
    const id = c[iId] || c[col("pollster")];
    const prev = acc.finals.get(id);
    if (!prev || c[iDate] >= prev.date) acc.finals.set(id, { date: c[iDate], poll, partisan: c[iPartisan] === "D" || c[iPartisan] === "R" });
  }

  const races: PollingMissRace[] = [];
  let droppedPollsters = 0;
  for (const [key, acc] of byRace) {
    const cutoff = `${acc.year}-10-01`;
    const finals = [...acc.finals.values()].filter((f) => f.date >= cutoff);
    droppedPollsters += acc.finals.size - finals.length;
    if (finals.length === 0) continue;
    const pollAvg = finals.reduce((s, f) => s + f.poll, 0) / finals.length;
    const dates = finals.map((f) => f.date).sort();
    const stage = acc.code.split("-")[1] ?? "G";
    races.push({
      key, abbr: acc.loc, state: STATE_NAME.get(acc.loc) ?? acc.loc, year: acc.year, office: OFFICE[acc.type], stage: STAGE[stage] ?? null,
      pollAvg: round2(pollAvg), result: round2(acc.actual), miss: round2(acc.actual - pollAvg),
      polls: finals.length, partisan: finals.filter((f) => f.partisan).length,
      firstDate: dates[0], lastDate: dates[dates.length - 1],
      href: gradedRaceHref(acc.type, acc.loc, acc.code, acc.year),
    });
  }
  races.sort((a, b) => a.state.localeCompare(b.state) || b.year - a.year || OFFICE_ORDER[a.office] - OFFICE_ORDER[b.office] || (a.stage ?? "").localeCompare(b.stage ?? ""));
  const years = [...new Set(races.map((r) => r.year))].sort((a, b) => a - b);
  cache = { races, years, decay: POLLSTER_RATING_META.decay, asOf: POLLSTER_RATING_META.asOf, droppedPollsters };
  return cache;
}

const OFFICE_ORDER: Record<PollingMissOffice, number> = { President: 0, Senate: 1, Governor: 2 };
const round2 = (v: number) => Math.round(v * 100) / 100;

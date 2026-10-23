import "server-only";
import fs from "node:fs";
import { join } from "node:path";
import type { RaceType } from "@/data/forecastData";

/**
 * The forecast rerun once per day from the start of the cycle (scripts/buildForecastHistory.ts,
 * run before every build and dev start). Today's model on the polls each day could see — how the
 * forecast moved with the data, not a record of what the site published that day.
 */
export interface ForecastHistory {
  generatedAt: string;
  days: {
    date: string;
    /** Generic-ballot average, R-positive. */
    gb: number;
    chambers: Record<RaceType, { meanDem: number; lo80: number; hi80: number; pDemControl: number | null }>;
  }[];
  /** Race URL slug (house/oh-09, senate/me2, governor/ga) → margin (R-positive) and P(D) per day, aligned with `days`. */
  races: Record<string, { m: number[]; p: number[] }>;
}

/** The key a race's series is stored under: its page URL without the leading slash. The build
 *  script (scripts/buildForecastHistory.ts) writes with it and the race pages read with it. */
export const raceHistoryKey = {
  house: (r: { name: string }) => `house/${r.name.toLowerCase()}`,
  senate: (r: { id: string }) => `senate/${r.id.toLowerCase().replace(/-2$/, "2")}`,
  governor: (r: { id: string }) => `governor/${r.id.toLowerCase()}`,
} as const satisfies Record<RaceType, (r: { name: string; id: string }) => string>;

export interface RaceForecastHistory {
  dates: string[];
  /** P(Democratic win) per day. */
  probD: number[];
  /** Projected margin per day, R-positive. */
  margins: number[];
}

/** One race's series, aligned by day; null when the history was not generated or the race is
 *  not in it. The last day is today, whose point equals the live forecast. */
export function getRaceForecastHistory(type: RaceType, race: { name: string; id: string }): RaceForecastHistory | null {
  const history = getForecastHistory();
  const series = history?.races[raceHistoryKey[type](race)];
  if (!history || !series) return null;
  return { dates: history.days.map((d) => d.date), probD: series.p, margins: series.m };
}

const FILE = join(process.cwd(), "data", "generated", "forecast-history.json");
let cache: { mtimeMs: number; history: ForecastHistory } | null = null;

/** null when the generated file is missing (a build that skipped the prebuild step). Re-read when
 *  the file changes, so a running dev server picks up a regenerated series. */
export function getForecastHistory(): ForecastHistory | null {
  try {
    const { mtimeMs } = fs.statSync(FILE);
    if (cache?.mtimeMs !== mtimeMs) cache = { mtimeMs, history: JSON.parse(fs.readFileSync(FILE, "utf8")) as ForecastHistory };
    return cache.history;
  } catch {
    return null;
  }
}

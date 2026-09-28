import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RacePoll } from "@/data/racePolls";

// Polls of PAST races (2018–2024), read straight from data-entry/race_polls_history.csv —
// the 538-archive extract that scripts/forwardBacktest.ts also consumes. It is read with fs
// on the server (like lib/pviHistory.ts) rather than emitted to a TS module, so none of its
// 6,700 rows reach the browser. There are no 2016 polls in the archive.
//
// Key: `${office}:${state}:${race}:${year}` with race = "Senate" | "Senate Special" |
// "Governor" | "House XX-NN" — the same labels data/racePolls.ts uses for 2026.

export type HistoricalRacePoll = RacePoll & { year: number };

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

let cache: Map<string, HistoricalRacePoll[]> | null = null;

function load(): Map<string, HistoricalRacePoll[]> {
  if (cache) return cache;
  const text = readFileSync(join(process.cwd(), "data-entry", "race_polls_history.csv"), "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const iYear = col("year"), iOffice = col("office"), iState = col("state"), iRace = col("race"),
    iPollster = col("pollster"), iPartisan = col("partisan"), iStart = col("start"), iEnd = col("end"),
    iSample = col("sample"), iPop = col("population"), iDem = col("dem"), iRep = col("rep");
  const map = new Map<string, HistoricalRacePoll[]>();
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const dem = parseFloat(c[iDem]), rep = parseFloat(c[iRep]);
    if (!Number.isFinite(dem) || !Number.isFinite(rep)) continue;
    const year = parseInt(c[iYear], 10);
    const key = `${c[iOffice]}:${c[iState]}:${c[iRace]}:${year}`;
    const sample = parseInt(c[iSample], 10);
    const partisan = c[iPartisan] === "D" || c[iPartisan] === "R" ? c[iPartisan] : null;
    const poll: HistoricalRacePoll = {
      year,
      pollster: c[iPollster],
      partisan,
      startDate: c[iStart],
      endDate: c[iEnd],
      sample: Number.isFinite(sample) ? sample : null,
      population: c[iPop] || null,
      dem,
      rep,
      diff: parseFloat((rep - dem).toFixed(1)),
    };
    const list = map.get(key);
    if (list) list.push(poll); else map.set(key, [poll]);
  }
  for (const list of map.values()) list.sort((a, b) => a.endDate.localeCompare(b.endDate));
  cache = map;
  return map;
}

export function historicalRacePolls(office: "S" | "G" | "H", stateAbbr: string, raceLabel: string, year: number): HistoricalRacePoll[] {
  return load().get(`${office}:${stateAbbr}:${raceLabel}:${year}`) ?? [];
}

// ── Presidential polls by state ─────────────────────────────────────────────────
// The race archive above has no presidential rows; state presidential polls come from
// data-entry/pollster_graded_polls.csv (2016–2024, the file the pollster grades are built
// from). It stores one R-positive margin per poll rather than the two shares, so dem/rep
// here are 50 ∓ margin/2 — only their difference is ever displayed.

let presCache: Map<string, HistoricalRacePoll[]> | null = null;

function loadPresident(): Map<string, HistoricalRacePoll[]> {
  if (presCache) return presCache;
  const text = readFileSync(join(process.cwd(), "data-entry", "pollster_graded_polls.csv"), "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const iYear = col("year"), iType = col("type"), iLoc = col("location"), iPollster = col("pollster"),
    iPartisan = col("partisan"), iDate = col("date"), iDays = col("days"), iSample = col("sample"), iMargin = col("poll_margin");
  const map = new Map<string, HistoricalRacePoll[]>();
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    if (c[iType] !== "P") continue;
    const margin = parseFloat(c[iMargin]);
    if (!Number.isFinite(margin)) continue;
    const year = parseInt(c[iYear], 10);
    const state = c[iLoc];
    if (!/^[A-Z]{2}$/.test(state) || state === "US") continue;
    const sample = parseInt(c[iSample], 10);
    const days = parseInt(c[iDays], 10);
    const end = c[iDate];
    // `date` is the field-period end; the start is not stored, so it is approximated from `days`.
    const start = Number.isFinite(days) ? new Date(Date.parse(end) - Math.max(0, days - 1) * 86_400_000).toISOString().slice(0, 10) : end;
    const partisan = c[iPartisan] === "D" || c[iPartisan] === "R" ? c[iPartisan] : null;
    const poll: HistoricalRacePoll = {
      year,
      pollster: c[iPollster],
      partisan,
      startDate: start,
      endDate: end,
      sample: Number.isFinite(sample) ? sample : null,
      population: null,
      dem: 50 - margin / 2,
      rep: 50 + margin / 2,
      diff: margin,
    };
    const key = `${state}:${year}`;
    const list = map.get(key);
    if (list) list.push(poll); else map.set(key, [poll]);
  }
  for (const list of map.values()) list.sort((a, b) => a.endDate.localeCompare(b.endDate));
  presCache = map;
  return map;
}

export function historicalPresidentPolls(stateAbbr: string, year: number): HistoricalRacePoll[] {
  return loadPresident().get(`${stateAbbr}:${year}`) ?? [];
}

// Daily forecast snapshot — the record the site will be graded on after November 3, and the
// series a forecast-over-time chart reads. The forecast depends on the date it is run (poll aging,
// the generic-ballot average) as well as on the data, so a day that is not saved cannot be rebuilt
// later from the repo.
//
// Run:  npm run snapshot        (also the last step of `npm run refresh`)
//
// Writes data/forecast-history/YYYY-MM-DD.json: the chamber toplines, the national environment, the
// inputs' freshness, and every race's margin (R-positive, like the rest of the model), Democratic win
// probability and rating. One race per line, so a day-to-day `git diff` reads as a list of moves.
// Today's file is rewritten on every run, so it holds the day's latest data; earlier days are never
// touched — they are the record.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { senateForecasts, governorForecasts, houseForecasts, getChamberSimulations, type ForecastedRace } from "@/lib/forecast";
import { getNationalEnvironment } from "@/lib/tplCompute";
import { racePollsMeta } from "@/data/racePolls";
import { genericBallotPolls } from "@/data/genericBallotPolls";

const DIR = path.join(process.cwd(), "data", "forecast-history");

// The local calendar date: a snapshot taken at 11 pm belongs to that day, not to tomorrow's UTC date.
const now = new Date();
const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
const file = path.join(DIR, `${day}.json`);

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

let commit: string | null = null;
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
  if (execFileSync("git", ["status", "--porcelain", "--", "data", "data-entry", "lib"]).toString().trim()) commit += "+dirty";
} catch { /* not a git checkout */ }

const sims = getChamberSimulations();
const env = getNationalEnvironment(now);

const chambers = Object.fromEntries(Object.entries(sims).map(([type, s]) => [type, {
  meanDem: r1(s.meanDem),
  lo80: s.lo80,
  hi80: s.hi80,
  pDemControl: s.pDemControl == null ? null : r3(s.pDemControl),
}]));

// Key = the race's URL slug (/house/oh-09, /senate/ga, /governor/oh), stable across days.
const races: Record<string, { m: number; p: number; r: string; poll: number | null; n: number }> = {};
const add = (type: string, list: ForecastedRace[], slug: (r: ForecastedRace) => string) => {
  for (const r of list) {
    races[`${type}/${slug(r)}`] = { m: r1(r.margin), p: r3(r.probability), r: r.rating, poll: r.pollMargin == null ? null : r1(r.pollMargin), n: r.pollCount };
  }
};
add("senate", senateForecasts, (r) => r.id.toLowerCase().replace(/-2$/, "2"));
add("governor", governorForecasts, (r) => r.id.toLowerCase());
add("house", houseForecasts, (r) => r.name.toLowerCase());

const snapshot = {
  date: day,
  savedAt: now.toISOString(),
  commit,
  environment: { genericBallot: r1(env.gb), eHat: r1(env.eHat), sigmaE: r1(env.sigmaE), daysToElection: Math.round(env.daysToElection) },
  inputs: {
    racePollsThrough: racePollsMeta.newestPollEnd,
    racePolls: racePollsMeta.polls,
    genericBallotThrough: genericBallotPolls.reduce((d, p) => (p.endDate > d ? p.endDate : d), ""),
  },
  chambers,
  races,
};

// Pretty at the top, one line per race below.
const head = JSON.stringify({ ...snapshot, races: undefined }, null, 2).replace(/\n}$/, "");
const body = Object.entries(races).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(file, `${head},\n  "races": {\n${body}\n  }\n}\n`);

const fmt = (m: number) => (Math.abs(m) < 0.05 ? "EVEN" : `${m < 0 ? "D" : "R"}+${Math.abs(m).toFixed(1)}`);
console.log(`Saved ${path.relative(process.cwd(), file)} — ${Object.keys(races).length} races, commit ${commit ?? "?"}`);
for (const [type, c] of Object.entries(chambers)) {
  console.log(`  ${type.padEnd(9)} D ${c.meanDem} (${c.lo80}–${c.hi80})${c.pDemControl == null ? "" : `  P(D control) ${(100 * c.pDemControl).toFixed(0)}%`}`);
}
console.log(`  generic ballot ${fmt(snapshot.environment.genericBallot)}, race polls through ${snapshot.inputs.racePollsThrough}, GB polls through ${snapshot.inputs.genericBallotThrough}`);

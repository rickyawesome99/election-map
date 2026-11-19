// The final 2026 forecast, archived in full: every race's forecast and projected result, down to the
// county, as published at the lock (FORECAST_FINAL_AT, lib/forecastClock.ts). The daily snapshot in
// data/forecast-history/2026-11-03.json keeps only each race's margin, probability and rating; this
// keeps everything the race pages' projection sections show, so those sections can switch to the
// actual results and the projection stays on record, readable without rerunning the model.
//
// Run:  npm run archive-final            (writes data/forecast-final-2026/)
//       npm run archive-final -- --check (rebuilds and compares with the files on disk)
//
// Files (margins R-positive, like the rest of the model):
//   manifest.json        lock time, commit, environment, chambers, file list
//   races.json           one race per line: forecast, candidates, projected votes, turnout
//   counties-<office>.json  race id → projected county rows (House: county pieces)
//   methodology/         the rendered text of the federal models' methodology tabs, saved by
//                        `--methodology` from the dev server (internal-<tab>.txt, public-<tab>.txt)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { forecastsFor, getChamberSimulations, type ForecastedRace } from "@/lib/forecast";
import { projectRaceResults, type ProjectedCounty } from "@/lib/countyProjection";
import { getNationalEnvironment } from "@/lib/tplCompute";
import { racePollsMeta } from "@/data/racePolls";
import { genericBallotPolls } from "@/data/genericBallotPolls";
import { FORECAST_FINAL_AT, forecastNow } from "@/lib/forecastClock";

if (!FORECAST_FINAL_AT) throw new Error("FORECAST_FINAL_AT is null: the forecast is not locked, so there is no final forecast to archive");
const LOCKED_AT: Date = FORECAST_FINAL_AT;

const DIR = path.join(process.cwd(), "data", "forecast-final-2026");
const OFFICES = ["senate", "governor", "house"] as const;
type OfficeName = (typeof OFFICES)[number];

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// Same keys as the daily snapshot: the race's URL slug (/house/oh-09, /senate/ga, /governor/oh).
const slugOf = (office: OfficeName, r: ForecastedRace) =>
  office === "senate" ? r.id.toLowerCase().replace(/-2$/, "2") : office === "governor" ? r.id.toLowerCase() : r.name.toLowerCase();

// Every model the race forecasts and their projected votes rest on.
const METHODOLOGY_TABS = ["forecast", "state-tpl", "district-tpl", "county-tpl", "war", "turnout"];

async function saveMethodology() {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  fs.mkdirSync(path.join(DIR, "methodology"), { recursive: true });
  for (const tab of METHODOLOGY_TABS) {
    for (const [kind, route] of [["internal", `/analysis/internal-methodology/${tab}`], ["public", `/methodology/${tab}`]]) {
      await page.goto(base + route, { waitUntil: "networkidle", timeout: 180_000 });
      const text = await page.locator("main").innerText();
      const header = `${base}${route}\nSaved ${new Date().toISOString().slice(0, 10)} from the dev server; the final 2026 forecast (lock ${LOCKED_AT.toISOString()}).\n\n`;
      fs.writeFileSync(path.join(DIR, "methodology", `${kind}-${tab}.txt`), header + text.replace(/\n{3,}/g, "\n\n").trim() + "\n");
      console.log(`methodology/${kind}-${tab}.txt  ${text.length.toLocaleString()} chars`);
    }
  }
  await browser.close();
}
// The 2026 forecast is frozen (data/forecast-final-2026/frozen/, lib/final2026.ts) and this archive is
// part of the record (lib/raceResults2026.ts reads it). Once the live model changes, rewriting it would
// replace the published numbers with the new model's, so writing needs an explicit --rewrite.
if (!process.argv.includes("--check") && !process.argv.includes("--methodology") && !process.argv.includes("--rewrite")) {
  throw new Error("The 2026 archive is a frozen record: refusing to rewrite it. Use --check to compare, or --rewrite if you really mean to regenerate it from the CURRENT model.");
}
if (process.argv.includes("--methodology")) saveMethodology().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
else main();

function main() {
const now = forecastNow();
const env = getNationalEnvironment(now);
const sims = getChamberSimulations();

const races: Record<string, unknown> = {};
const counties: Record<OfficeName, Record<string, ProjectedCounty[]>> = { senate: {}, governor: {}, house: {} };
let missingProjection = 0;

for (const office of OFFICES) {
  for (const r of forecastsFor(office)) {
    const p = projectRaceResults(office, r.id);
    if (!p) missingProjection++;
    races[`${office}/${slugOf(office, r)}`] = {
      office,
      id: r.id,
      name: r.name,
      state: r.state,
      ...(r.electionType ? { electionType: r.electionType } : {}),
      contest: r.contest,
      threeWay: r.threeWay,
      seatParty: r.seatParty ?? null,
      seatHolder: r.seatHolder ?? null,
      dem: r.candidates ? { name: r.candidates.dem.name, party: r.candidates.dem.party } : null,
      rep: r.candidates ? { name: r.candidates.rep.name, party: r.candidates.rep.party } : null,
      forecast: {
        // Unrounded, so rounding it to one decimal gives the published figure (r2 first would turn -9.349 into -9.4).
        margin: r.margin,
        interval80: [r2(r.interval80[0]), r2(r.interval80[1])],
        sigma: r2(r.sigma),
        pDem: r3(r.probability),
        rating: r.rating,
        model: r2(r.model),
        pollMargin: r.pollMargin == null ? null : r2(r.pollMargin),
        pollWeight: r3(r.pollWeight),
        pollCount: r.pollCount,
        pollShade: r2(r.pollShade),
      },
      projected: p
        ? {
            label: p.label,
            votes: p.votes,
            demVotes: p.demVotes,
            repVotes: p.repVotes,
            othVotes: p.othVotes,
            shares: p.shares,
            shift: r2(p.shift),
            turnout: p.turnout,
            counties: p.counties.length,
          }
        : null,
    };
    if (p) counties[office][r.id] = p.counties;
  }
}

const manifest = {
  title: "Final 2026 forecast and projected results",
  lockedAt: LOCKED_AT.toISOString(),
  commit: (() => {
    try { return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim(); } catch { return null; }
  })(),
  note: "Margins are R-positive (negative = Democratic lead). pDem = Democratic win probability. Projected votes are the county projection (lib/countyProjection.ts) summed; the margin is the forecast's, the total the turnout estimate's (lib/turnoutModel.ts). Topline numbers match data/forecast-history/2026-11-03.json.",
  corrections: ["2026-11-11: House projected votes rebuilt after a weighting error in the county House factor (lib/turnoutModel.ts) was fixed. It had cut 139 counties in 10 states to about 40% or 60% of their House vote; 68 districts moved by more than 1%. Forecast margins, ratings, probabilities and all Senate and governor figures are as locked."],
  environment: { genericBallot: r1(env.gb), eHat: r1(env.eHat), sigmaE: r1(env.sigmaE) },
  inputs: { racePollsThrough: racePollsMeta.newestPollEnd, racePolls: racePollsMeta.polls, genericBallotThrough: genericBallotPolls.reduce((d, p) => (p.endDate > d ? p.endDate : d), "") },
  chambers: Object.fromEntries(Object.entries(sims).map(([k, s]) => [k, { meanDem: r1(s.meanDem), lo80: s.lo80, hi80: s.hi80, pDemControl: s.pDemControl == null ? null : r3(s.pDemControl) }])),
  counts: {
    races: Object.keys(races).length,
    ...Object.fromEntries(OFFICES.map((o) => [o, Object.keys(counties[o]).length])),
    countyRows: OFFICES.reduce((a, o) => a + Object.values(counties[o]).reduce((b, c) => b + c.length, 0), 0),
  },
  files: ["races.json", ...OFFICES.map((o) => `counties-${o}.json`), ...METHODOLOGY_TABS.flatMap((t) => [`methodology/internal-${t}.txt`, `methodology/public-${t}.txt`])],
};

// One entry per line, so a diff reads as a list of races.
const perLine = (obj: Record<string, unknown>) => `{\n${Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n}\n`;
const files: Record<string, string> = {
  "races.json": perLine(races),
  ...Object.fromEntries(OFFICES.map((o) => [`counties-${o}.json`, perLine(counties[o])])),
};
// The commit changes on every commit, so --check leaves it out of the comparison.
const manifestText = (m: typeof manifest) => `${JSON.stringify(m, null, 2)}\n`;

// The first line where two texts part, for a --check failure message. On GitHub Actions each failure is
// also written as an ::error annotation, which the public checks API shows without the job log.
const firstDiff = (a: string, b: string) => {
  const x = a.split("\n"), y = b.split("\n");
  const n = x.findIndex((l, k) => l !== y[k]);
  const at = n === -1 ? Math.min(x.length, y.length) : n;
  const l1 = x[at] ?? "<end>", l2 = y[at] ?? "<end>";
  let c = 0;
  while (c < l1.length && l1[c] === l2[c]) c++;
  const from = Math.max(0, c - 120);
  return `line ${at + 1}, char ${c + 1}: on disk …${l1.slice(from, c + 60)}… / rebuilt …${l2.slice(from, c + 60)}…`;
};
// Numbers equal to 1e-9 relative: the archive keeps some figures unrounded (races.json margins), and
// their last digits differ between Apple silicon and the x64 CI runner (-14.666156355721021 here,
// ...025 there). Nothing published reads past the first few decimals, so that noise is not a change.
const sameValue = (a: unknown, b: unknown): boolean => {
  if (typeof a === "number" && typeof b === "number") return a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, k) => sameValue(x, b[k]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k, n) => k === kb[n] && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
};
const annotate = (lines: string[]) => { if (process.env.GITHUB_ACTIONS) for (const l of lines) console.log(`::error::${l.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`); };

if (process.argv.includes("--check")) {
  const diffs: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    const f = path.join(DIR, name);
    if (!fs.existsSync(f)) { diffs.push(`${name}: missing`); continue; }
    { const disk = fs.readFileSync(f, "utf8"); if (disk !== text && !sameValue(JSON.parse(disk), JSON.parse(text))) diffs.push(`${name}: differs at ${firstDiff(disk, text)}`); }
  }
  const savedManifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
  if (!sameValue({ ...savedManifest, commit: null }, JSON.parse(JSON.stringify({ ...manifest, commit: null })))) diffs.push(`manifest.json: differs at ${firstDiff(JSON.stringify({ ...savedManifest, commit: null }, null, 1), JSON.stringify({ ...manifest, commit: null }, null, 1))}`);
  if (diffs.length) {
    console.error(`Final-forecast archive differs from the model:\n  ${diffs.join("\n  ")}`);
    annotate(diffs.map((d) => `Final-forecast archive: ${d}`));
    process.exit(1);
  }
  console.log(`Final-forecast archive OK: ${manifest.counts.races} races, ${manifest.counts.countyRows} county rows match data/forecast-final-2026/`);
  process.exit(0);
}

fs.mkdirSync(DIR, { recursive: true });
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(DIR, name), text);
fs.writeFileSync(path.join(DIR, "manifest.json"), manifestText(manifest));
console.log(`Wrote data/forecast-final-2026/ — ${manifest.counts.races} races, ${manifest.counts.countyRows} county rows${missingProjection ? `, ${missingProjection} race(s) without a projection` : ""}`);
for (const [k, c] of Object.entries(manifest.chambers)) console.log(`  ${k.padEnd(9)} D ${c.meanDem} (${c.lo80}–${c.hi80})${c.pDemControl == null ? "" : `  P(D control) ${(100 * c.pDemControl).toFixed(1)}%`}`);
}

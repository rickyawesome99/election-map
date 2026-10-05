// Forecast over time — the model rerun once per day from the start of the cycle to today.
//
// Runs on its own before every `next build` and `next dev` (npm's prebuild / predev hooks), so the
// series is always computed from the data and model being deployed; nothing to remember to run.
//   npx tsx --conditions=react-server scripts/buildForecastHistory.ts      (by hand, e.g. after a refresh)
//
// Each day is forecastAsOf(day) (lib/forecast.ts): TODAY's model and data, with every poll that
// finished after that day left out and the clock (poll aging, the generic-ballot average, the
// horizon) set to it. So it shows how the forecast moves with the polls, not what the site said on
// that day: a later model change, a corrected map or a candidate fixed after the fact applies to
// every day; nominees are the eventual ones even before their primary; fundraising is the latest
// filing; and a poll counts from its field end date even if it was published days later.
//
// Writes data/generated/forecast-history.json (gitignored; read by lib/forecastHistory.ts).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { forecastAsOf } from "@/lib/forecast";
import { genericBallotPolls } from "@/data/genericBallotPolls";
import type { ForecastHistory } from "@/lib/forecastHistory";

const OUT = path.join(process.cwd(), "data", "generated", "forecast-history.json");
// The series opens once the generic-ballot average rests on this many pollsters (the same rule as
// genericBallotSeries); before that the environment term has nothing to stand on.
const MIN_POLLSTERS = 5;
const SIMS = 5000;

const sorted = [...genericBallotPolls].sort((a, b) => a.endDate.localeCompare(b.endDate));
const seen = new Set<string>();
let start = "";
for (const p of sorted) { seen.add(p.pollster); if (seen.size >= MIN_POLLSTERS) { start = p.endDate; break; } }
if (!start) throw new Error("Not enough generic-ballot pollsters to start the series");

const now = new Date();
const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
const days: string[] = [];
for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));

// The days are split across worker processes (each refits the model once, ~4 s, then ~0.2 s a day).
// A worker is this script with --part i/n, printing its share of the series as JSON on stdout.
const part = process.argv.find((a) => a.startsWith("--part="))?.slice(7);
const WORKERS = Math.max(1, Math.min(4, os.cpus().length - 1));

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const slug = { house: (r: { name: string }) => `house/${r.name.toLowerCase()}`, senate: (r: { id: string }) => `senate/${r.id.toLowerCase().replace(/-2$/, "2")}`, governor: (r: { id: string }) => `governor/${r.id.toLowerCase()}` };

type Part = { days: ForecastHistory["days"]; races: ForecastHistory["races"] };

function computeDays(mine: string[]): Part {
  const out: Part = { days: [], races: {} };
  for (const day of mine) {
  // Today runs at the current moment, so its point equals the live forecast; earlier days at noon UTC.
  const f = forecastAsOf(day === today ? now : new Date(`${day}T12:00:00Z`), SIMS);
  out.days.push({
    date: day,
    gb: r1(f.environment.gb),
    chambers: Object.fromEntries((["house", "senate", "governor"] as const).map((type) => {
      const s = f.chambers[type];
      return [type, { meanDem: r1(s.meanDem), lo80: s.lo80, hi80: s.hi80, pDemControl: s.pDemControl == null ? null : r3(s.pDemControl) }];
    })) as ForecastHistory["days"][number]["chambers"],
  });
  for (const type of ["house", "senate", "governor"] as const) {
    for (const r of f.races[type]) {
      const series = (out.races[slug[type](r)] ??= { m: [], p: [] });
      series.m.push(r1(r.margin));
      series.p.push(r3(r.probability));
    }
  }
  }
  return out;
}

function runWorker(i: number): Promise<Part> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1], `--part=${i}/${WORKERS}`], { stdio: ["ignore", "pipe", "inherit"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(JSON.parse(Buffer.concat(chunks).toString())) : reject(new Error(`worker ${i} exited ${code}`))));
  });
}

async function main() {
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: WORKERS }, (_, i) => runWorker(i)));
  const history: ForecastHistory = { generatedAt: now.toISOString(), days: [], races: {} };
  // Interleave the workers' days back into date order.
  days.forEach((_, k) => {
    const w = parts[k % WORKERS], j = Math.floor(k / WORKERS);
    history.days.push(w.days[j]);
    for (const [key, series] of Object.entries(w.races)) {
      const target = (history.races[key] ??= { m: [], p: [] });
      target.m.push(series.m[j]);
      target.p.push(series.p[j]);
    }
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // Written aside and renamed into place, so a running dev server never reads a half-written file.
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(history));
  fs.renameSync(`${OUT}.tmp`, OUT);
  const last = history.days[history.days.length - 1].chambers;
  console.log(`Forecast history: ${days.length} days (${start} → ${today}) in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
  console.log(`  today: House P(D) ${(100 * last.house.pDemControl!).toFixed(0)}%, Senate P(D) ${(100 * last.senate.pDemControl!).toFixed(0)}%`);
}

if (part) {
  // Worker: every n-th day from offset i, so each worker gets a spread of early and late days.
  // Exits only once the pipe has taken the whole write (stdout to a pipe is asynchronous).
  const [i, n] = part.split("/").map(Number);
  process.stdout.write(JSON.stringify(computeDays(days.filter((_, k) => k % n === i))), () => process.exit(0));
} else {
  main().catch((err) => { console.error(err); process.exit(1); });
}

// The final 2026 state-legislature projection, archived: every chamber and every seat up in 2026 as
// the /legislatures board, the chamber pages and the atlas showed it at the lock, with the
// constants it ran on. A ballpark model (see the methodology), kept so the pages can switch to
// actual results and the projection stays on record. Companion of scripts/archiveFinalForecast.ts.
//
// Run:  npm run archive-state-leg            (writes data/state-leg-forecast-final-2026/)
//       npm run archive-state-leg -- --check (rebuilds and compares with the files on disk)
//
// Files (margins R-positive, like the rest of the model):
//   manifest.json   lock time, environment, constants, national tallies, file list
//   chambers.json   one chamber per line: seats, holdovers, expected seats, 80% range, control odds, popular vote
//   districts.json  "ST/chamber/key" → each seat up in 2026: field, lean, terms, margin, odds, projected votes
//   buildup.json    "ST/chamber/key" → the rows behind each lean (year, kind, raw, NM, weight …)
//   methodology/    the rendered text of the state-leg methodology tabs, saved by `--methodology`
//                   from the dev server (internal.txt, public.txt)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { projectAllChambers, STATE_LEG_FORECAST_CONSTANTS } from "@/lib/stateLegForecast";
import { projectAllChamberPopularVotes, STATE_LEG_POPVOTE_CONSTANTS } from "@/lib/stateLegPopularVote";
import { getNationalEnvironment } from "@/lib/tplCompute";
import { stateLegCandidates2026Fetched } from "@/data/stateLegCandidates2026";
import { stateLegCompositionAsOf } from "@/data/stateLegComposition";
import { FORECAST_FINAL_AT, forecastNow } from "@/lib/forecastClock";

if (!FORECAST_FINAL_AT) throw new Error("FORECAST_FINAL_AT is null: the forecast is not locked, so there is no final projection to archive");
const LOCKED_AT: Date = FORECAST_FINAL_AT;

const DIR = path.join(process.cwd(), "data", "state-leg-forecast-final-2026");
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const n2 = (x: number | null) => (x == null ? null : r2(x));
const n3 = (x: number | null) => (x == null ? null : r3(x));

// ── methodology text (needs the dev server on :3000) ─────────────────────────
async function saveMethodology() {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const pages = { "internal.txt": "/analysis/internal-methodology/state-leg", "public.txt": "/methodology/state-leg" };
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  fs.mkdirSync(path.join(DIR, "methodology"), { recursive: true });
  for (const [name, route] of Object.entries(pages)) {
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 180_000 });
    const text = await page.locator("main").innerText();
    const header = `${base}${route}\nSaved ${new Date().toISOString().slice(0, 10)} from the dev server; the final 2026 state-legislature projection (lock ${LOCKED_AT.toISOString()}).\n\n`;
    fs.writeFileSync(path.join(DIR, "methodology", name), header + text.replace(/\n{3,}/g, "\n\n").trim() + "\n");
    console.log(`methodology/${name}  ${text.length.toLocaleString()} chars`);
  }
  await browser.close();
}
if (process.argv.includes("--methodology")) saveMethodology().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
else main();

function main() {

const env = getNationalEnvironment(forecastNow());
const chambers = projectAllChambers();
const popVotes = new Map(projectAllChamberPopularVotes().map((p) => [`${p.abbr}/${p.chamber}`, p]));

const pool = (p: { dem: number; rep: number; oth: number; votes: number; margin: number | null; districts: number }) =>
  ({ votes: p.votes, dem: p.dem, rep: p.rep, oth: p.oth, margin: n2(p.margin), districts: p.districts });

const chamberOut: Record<string, unknown> = {};
const districtOut: Record<string, unknown> = {};
const buildupOut: Record<string, unknown> = {};

for (const c of chambers) {
  const ck = `${c.abbr}/${c.chamber}`;
  const pv = popVotes.get(ck);
  const pvByKey = new Map((pv?.districts ?? []).map((d) => [d.key, d]));
  chamberOut[ck] = {
    totalSeats: c.totalSeats,
    seatsUp: c.seatsUp,
    holdover: c.holdover,
    decided: c.decided,
    favored: c.favored,
    expected: { dem: r1(c.expectedDem), rep: r1(c.expectedRep), oth: r1(c.expectedOth) },
    lo80: c.lo80,
    hi80: c.hi80,
    majority: c.majority,
    supermajority: c.supermajority,
    pDemControl: n3(c.pDemControl),
    pRepControl: n3(c.pRepControl),
    pDemSuper: n3(c.pDemSuper),
    pRepSuper: n3(c.pRepSuper),
    outcomes: c.outcomes ? Object.fromEntries(Object.entries(c.outcomes).map(([k, v]) => [k, r3(v)])) : null,
    unprojected: c.unprojected,
    popularVote: pv
      ? { level: pv.level, chamberFactor: r3(pv.chamberFactor), printsUnopposed: pv.printsUnopposed, raw: { ...pool(pv.raw), uncounted: pv.raw.uncounted }, adjusted: { ...pool(pv.adjusted), imputed: pv.adjusted.imputed, skipped: pv.adjusted.skipped }, low: pv.low, high: pv.high }
      : null,
  };
  for (const d of c.districts) {
    if (d.contest === "not-up") continue;
    const key = `${ck}/${d.key}`;
    const v = pvByKey.get(d.key);
    districtOut[key] = {
      label: d.label,
      contest: d.contest,
      seats: d.seats,
      guaranteed: d.guaranteed,
      contestedSeats: d.contestedSeats,
      field: d.candidates2026?.candidates.map((x) => ({ name: x.name, party: x.party, ...(x.partyLabel ? { partyLabel: x.partyLabel } : {}), ...(x.incumbent ? { incumbent: true } : {}), ...(x.writeIn ? { writeIn: true } : {}), ...(x.post ? { post: x.post } : {}), ...(x.special ? { special: true } : {}), ...(x.canceledGeneral ? { canceledGeneral: true } : {}) })) ?? null,
      ...(d.candidates2026?.special ? { special: d.candidates2026.special } : {}),
      lean: n2(d.lean),
      beta: r3(d.beta),
      envPts: r2(d.envPts),
      incSign: r2(d.incSign),
      incPts: r2(d.incPts),
      moneyPts: d.money ? r2(d.money.pts) : null,
      // Unrounded, so rounding it gives the published figure.
      margin: d.margin,
      sigma: r2(d.sigma),
      pD: n3(d.pD),
      pI: n3(d.pI),
      rating: d.rating,
      indep: d.indep ? { name: d.indep.name, partyLabel: d.indep.partyLabel, slot: d.indep.slot, opponent: d.indep.opponent, basis: d.indep.basis, endorsedBy: d.indep.endorsedBy, personal: r2(d.indep.personal), advantage: r2(d.indep.advantage), seats: d.indep.seats } : null,
      votes: v ? { votes: v.votes, dem: v.dem, rep: v.rep, oth: v.oth, margin: n2(v.margin), counted: v.counted, adjusted: v.adjusted, imputed: v.imputed } : null,
    };
    // [year, kind, era, raw, relocated, coverage, presDelta, incPts, envPts, moneyPts, gapPts, NM, huber, weight]
    buildupOut[key] = d.rows.map((r) => [r.year, r.kind, r.era, r2(r.raw), r.relocated ? 1 : 0, r3(r.coverage), r2(r.presDelta), r2(r.incPts), r2(r.envPts), r2(r.moneyPts), r2(r.gapPts), r2(r.NM), r3(r.huber), r3(r.weight)]);
  }
}

const withOdds = chambers.filter((c) => c.pDemControl != null);
const manifest = {
  title: "Final 2026 state-legislature projection",
  lockedAt: LOCKED_AT.toISOString(),
  commit: (() => {
    try { return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim(); } catch { return null; }
  })(),
  note: "A ballpark model: a district lean from presidential and past legislative results on today's lines, plus the national environment, incumbency and a small money term, simulated per chamber. Margins R-positive (negative = Democratic lead). pD / pI = Democratic / independent win probability. Seats not up in 2026 are holdovers and are counted in each chamber's holdover tally, not listed in districts.json. buildup.json rows: [year, kind, era, raw, relocated, coverage, presDelta, incPts, envPts, moneyPts, gapPts, NM, huber, weight].",
  environment: { eHat: r2(env.eHat), sigmaE: r2(env.sigmaE), genericBallot: r1(env.gb) },
  inputs: { candidatesFetched: stateLegCandidates2026Fetched, compositionAsOf: stateLegCompositionAsOf },
  constants: { forecast: STATE_LEG_FORECAST_CONSTANTS, popularVote: STATE_LEG_POPVOTE_CONSTANTS },
  national: {
    chambers: chambers.length,
    withControlOdds: withOdds.length,
    favoredDem: withOdds.filter((c) => c.pDemControl! > 0.5).length,
    favoredRep: withOdds.filter((c) => (c.pRepControl ?? 0) > 0.5).length,
    expectedDemControlled: r1(withOdds.reduce((a, c) => a + c.pDemControl!, 0)),
    seatsUp: chambers.reduce((a, c) => a + c.seatsUp, 0),
    expectedSeats: {
      dem: r1(chambers.reduce((a, c) => a + c.expectedDem, 0)),
      rep: r1(chambers.reduce((a, c) => a + c.expectedRep, 0)),
      oth: r1(chambers.reduce((a, c) => a + c.expectedOth, 0)),
    },
  },
  counts: { chambers: Object.keys(chamberOut).length, districts: Object.keys(districtOut).length },
  files: ["chambers.json", "districts.json", "buildup.json", "methodology/internal.txt", "methodology/public.txt"],
};

const perLine = (obj: Record<string, unknown>) => `{\n${Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n}\n`;
const files: Record<string, string> = { "chambers.json": perLine(chamberOut), "districts.json": perLine(districtOut), "buildup.json": perLine(buildupOut) };

if (process.argv.includes("--check")) {
  const diffs: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    const f = path.join(DIR, name);
    if (!fs.existsSync(f)) diffs.push(`${name}: missing`);
    else if (fs.readFileSync(f, "utf8") !== text) diffs.push(`${name}: differs`);
  }
  const saved = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
  if (JSON.stringify({ ...saved, commit: null }) !== JSON.stringify({ ...manifest, commit: null })) diffs.push("manifest.json: differs");
  if (diffs.length) {
    console.error(`State-leg archive differs from the model:\n  ${diffs.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`State-leg archive OK: ${manifest.counts.chambers} chambers, ${manifest.counts.districts} districts match data/state-leg-forecast-final-2026/`);
  process.exit(0);
}

fs.mkdirSync(DIR, { recursive: true });
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(DIR, name), text);
fs.writeFileSync(path.join(DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote data/state-leg-forecast-final-2026/ — ${manifest.counts.chambers} chambers, ${manifest.counts.districts} districts`);
console.log(`  ${manifest.national.withControlOdds} chambers with control odds: D favored ${manifest.national.favoredDem}, R favored ${manifest.national.favoredRep}; expected D-controlled ${manifest.national.expectedDemControlled}`);
console.log(`  seats up ${manifest.national.seatsUp}: expected D ${manifest.national.expectedSeats.dem} / R ${manifest.national.expectedSeats.rep} / other ${manifest.national.expectedSeats.oth}`);
}

// State legislative chamber popular-vote backtest.
//
// Run:  npx tsx --conditions=react-server scripts/stateLegPopularVoteBacktest.ts
//       npx tsx --conditions=react-server scripts/stateLegPopularVoteBacktest.ts --emit   (write data/stateLegPopularVoteValidation.ts)
//
// Three questions, each on chambers whose target-year election ran on today's lines (so district
// keys line up with the projection):
//   1. UNOPPOSED_TURNOUT  votes cast per seat in a printed unopposed race against a contested one,
//      measured in every chamber-year 2018–2024 with both kinds.
//   2. The turnout model  2022 predicted from 2018 alone — the level from the turnout estimate's own
//      backtest configuration (one basis midterm, 2020 presidential split) and each seat's factor
//      from its 2018 race relocated onto the 2022 lines. Scored on contested 2022 districts: votes
//      (MAPE, bias), the district's share of its chamber's contested vote with the level taken as
//      known, and the chamber's contested total. The shrink grid picks DROPOFF_SHRINK_VOTES.
//      The same with the level set to the actual top-of-ticket vote isolates the factor model, and
//      2024 from the live basis weights (2022 .6 / 2018 .4) with the actual presidential vote as the
//      level checks a second year on more chambers.
//   3. The chamber margin  the predicted raw popular-vote margin (projection margins on the year's
//      actual ballot, the turnout model's votes) against the certified raw aggregate, MAE and bias,
//      and the same for the total votes cast.

import fs from "node:fs";
import path from "node:path";
import { backtestLevels, projectChamberPopularVote, yearFactors, STATE_LEG_POPVOTE_CONSTANTS as C, type ChamberPopularVote } from "@/lib/stateLegPopularVote";
import { stateLevelVotes, type StateLevel } from "@/lib/turnoutModel";
import { statewideRaces } from "@/lib/turnout";
import { getTplFit } from "@/lib/tplCompute";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { indexByNormalizedKey, isUnassignedResultKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mape = (xs: number[]) => mean(xs.map(Math.abs));
const fmt = (x: number, d = 1) => (x >= 0 ? "+" : "") + x.toFixed(d);
const chambersOf = (abbr: string): Chamber[] => (UNICAMERAL_STATES.has(abbr) ? [] : ["house", "senate"]);

// ── 1. unopposed turnout ─────────────────────────────────────────────────────
const ratios: { abbr: string; chamber: Chamber; year: number; n: number; ratio: number }[] = [];
for (const abbr of Object.keys(stateLegDistricts).sort()) {
  for (const chamber of chambersOf(abbr)) {
    for (const year of stateLegCalendar[abbr]?.[chamber]?.electionYears ?? []) {
      if (year < 2018 || !stateLegResults[abbr]?.[String(year)]?.[chamber]) continue;
      const f = yearFactors(abbr, chamber, year, () => 1);
      if (f.unopposed.size < 5 || f.own.size < 5) continue;
      const own = median([...f.own.values()]), un = median([...f.unopposed.values()]);
      if (own > 0) ratios.push({ abbr, chamber, year, n: f.unopposed.size, ratio: un / own });
    }
  }
}
const unopposed = { chamberYears: ratios.length, races: ratios.reduce((s, r) => s + r.n, 0), median: +median(ratios.map((r) => r.ratio)).toFixed(3), mean: +mean(ratios.map((r) => r.ratio)).toFixed(3) };
console.log(`UNOPPOSED_TURNOUT: ${ratios.length} chamber-years with 5+ printed unopposed and 5+ contested races (${unopposed.races} unopposed races): median ratio ${unopposed.median}, mean ${unopposed.mean} (live ${C.UNOPPOSED_TURNOUT})`);
console.log("   lowest: " + [...ratios].sort((a, b) => a.ratio - b.ratio).slice(0, 5).map((r) => `${r.abbr} ${r.chamber} ${r.year} ${r.ratio.toFixed(2)} (${r.n})`).join(" · "));
console.log("   highest: " + [...ratios].sort((a, b) => b.ratio - a.ratio).slice(0, 5).map((r) => `${r.abbr} ${r.chamber} ${r.year} ${r.ratio.toFixed(2)} (${r.n})`).join(" · "));

// ── 2 & 3. holdout ───────────────────────────────────────────────────────────
function actualLevels(year: number): Map<string, StateLevel> {
  const out = new Map<string, StateLevel>();
  for (const abbr of Object.keys(stateLegDistricts)) {
    const v = year % 4 === 0 ? statewideRaces(abbr, year).races.president?.votes : stateLevelVotes(abbr, year)?.votes;
    if (v) out.set(abbr, { state: abbr, cvap: null, rate: null, rateBy: {}, ticketFactor: 1, competitiveness: {}, votes: v, low: v, high: v, officeFactor: {}, houseDropoff: null });
  }
  return out;
}

interface Score { label: string; year: number; basis: string; level: string; shrink: number; chambers: number; districts: number; voteMape: number; voteBias: number; shareMape: number; chamberMape: number; chamberBias: number; marginN: number; marginMae: number; marginBias: number; totalMape: number; totalBias: number }

function holdout(label: string, year: number, basisWeights: Record<number, number>, levels: Map<string, StateLevel>, levelLabel: string, shrink: number): Score {
  const E = getTplFit().E[year] ?? 0;
  const dErr: number[] = [], sErr: number[] = [], cErr: number[] = [], mErr: number[] = [], tErr: number[] = [];
  let chambers = 0;
  for (const abbr of Object.keys(stateLegDistricts).sort()) {
    for (const chamber of chambersOf(abbr)) {
      const block = stateLegResults[abbr]?.[String(year)]?.[chamber];
      if (!block || stateLegHistoricalMaps[abbr]?.[chamber]?.[String(year)] != null) continue;
      const p = projectChamberPopularVote(abbr, chamber, { targetYear: year, levels, basisWeights, shrinkVotes: shrink, backtest: { E } });
      if (!p) continue;
      const index = indexByNormalizedKey(block.districts);
      // Contested districts: predicted vs actual votes, and shares of the chamber's contested vote.
      const rows: { pred: number; actual: number }[] = [];
      for (const d of p.districts) {
        if (d.contest !== "contested") continue;
        const r = lookupByDistrictCode(index, abbr, chamber, d.key);
        if (!r || !r.totalVotes || d.votes <= 0) continue;
        rows.push({ pred: d.votes, actual: r.totalVotes });
      }
      if (rows.length < 3) continue;
      chambers += 1;
      const predTot = rows.reduce((s, r) => s + r.pred, 0), actTot = rows.reduce((s, r) => s + r.actual, 0);
      for (const r of rows) { dErr.push(r.pred / r.actual - 1); sErr.push((r.pred / predTot) / (r.actual / actTot) - 1); }
      cErr.push(predTot / actTot - 1);
      // Raw chamber margin and total votes against the certified aggregate.
      let aD = 0, aR = 0, aT = 0;
      for (const [k, r] of Object.entries(block.districts)) { if (isUnassignedResultKey(k) || r.noCount) continue; aD += r.demVotes ?? 0; aR += r.repVotes ?? 0; aT += r.totalVotes ?? 0; }
      if (aT > 0 && p.raw.margin != null && p.raw.votes > 0) { mErr.push(p.raw.margin - ((aR - aD) / aT) * 100); tErr.push(p.raw.votes / aT - 1); }
    }
  }
  return { label, year, basis: Object.entries(basisWeights).map(([y, w]) => `${y}×${w}`).join(" "), level: levelLabel, shrink, chambers, districts: dErr.length, voteMape: +(mape(dErr) * 100).toFixed(2), voteBias: +(mean(dErr) * 100).toFixed(2), shareMape: +(mape(sErr) * 100).toFixed(2), chamberMape: +(mape(cErr) * 100).toFixed(2), chamberBias: +(mean(cErr) * 100).toFixed(2), marginN: mErr.length, marginMae: +mape(mErr).toFixed(2), marginBias: +mean(mErr).toFixed(2), totalMape: +(mape(tErr) * 100).toFixed(2), totalBias: +(mean(tErr) * 100).toFixed(2) };
}

const print = (s: Score) => console.log(`${s.label.padEnd(34)} K=${String(s.shrink).padStart(10)}  chambers ${s.chambers}  districts ${s.districts}  votes MAPE ${s.voteMape}% bias ${fmt(s.voteBias)}%  share MAPE ${s.shareMape}%  chamber MAPE ${s.chamberMape}% bias ${fmt(s.chamberBias)}%  | margin (n=${s.marginN}) MAE ${s.marginMae} bias ${fmt(s.marginBias)}  total MAPE ${s.totalMape}% bias ${fmt(s.totalBias)}%`);

const levels22 = backtestLevels(2022, 2018);
const actual22 = actualLevels(2022), actual24 = actualLevels(2024);
const grid = [0, 2000, 5000, 10000, 20000, 50000, 1e9];
console.log("\nShrink grid — 2022 from 2018 (turnout estimate's level):");
const gridRows: Score[] = [];
for (const K of grid) { const s = holdout("2022 ← 2018, model level", 2022, { 2018: 1 }, levels22, "model", K); gridRows.push(s); print(s); }
console.log("\nShrink grid — 2022 from 2018 (actual level, factor model alone):");
for (const K of grid) { const s = holdout("2022 ← 2018, actual level", 2022, { 2018: 1 }, actual22, "actual", K); gridRows.push(s); print(s); }
console.log("\nBasis years — 2022 with the 2020 presidential-year race added (actual level):");
for (const w of [{ 2018: 1 }, { 2018: 0.5, 2020: 0.5 }, { 2020: 1 }] as Record<number, number>[]) { const s = holdout(`2022 ← ${Object.keys(w).join("+")}, actual level`, 2022, w, actual22, "actual", C.DROPOFF_SHRINK_VOTES); gridRows.push(s); print(s); }
console.log("\n2024 from the live basis weights (actual presidential level):");
const s24 = holdout("2024 ← 2022/2018, actual level", 2024, C.BASIS_WEIGHTS, actual24, "actual", C.DROPOFF_SHRINK_VOTES); print(s24);
const live22 = holdout("2022 ← 2018, model level (live K)", 2022, { 2018: 1 }, levels22, "model", C.DROPOFF_SHRINK_VOTES);
console.log(`\nLive constants: DROPOFF_SHRINK_VOTES ${C.DROPOFF_SHRINK_VOTES} · UNOPPOSED_TURNOUT ${C.UNOPPOSED_TURNOUT} · BASIS_WEIGHTS ${JSON.stringify(C.BASIS_WEIGHTS)} · OTHER_SHRINK_RACES ${C.OTHER_SHRINK_RACES}`);

// Worst chambers on the margin, live configuration.
{
  const E = getTplFit().E[2022] ?? 0;
  const worst: { abbr: string; chamber: Chamber; pred: number; actual: number; votes: number; actualVotes: number }[] = [];
  for (const abbr of Object.keys(stateLegDistricts).sort()) for (const chamber of chambersOf(abbr)) {
    const block = stateLegResults[abbr]?.["2022"]?.[chamber];
    if (!block || stateLegHistoricalMaps[abbr]?.[chamber]?.["2022"] != null) continue;
    const p = projectChamberPopularVote(abbr, chamber, { targetYear: 2022, levels: levels22, basisWeights: { 2018: 1 }, backtest: { E } }) as ChamberPopularVote | null;
    if (!p || p.raw.margin == null) continue;
    let aD = 0, aR = 0, aT = 0;
    for (const [k, r] of Object.entries(block.districts)) { if (isUnassignedResultKey(k) || r.noCount) continue; aD += r.demVotes ?? 0; aR += r.repVotes ?? 0; aT += r.totalVotes ?? 0; }
    if (aT > 0) worst.push({ abbr, chamber, pred: p.raw.margin, actual: ((aR - aD) / aT) * 100, votes: p.raw.votes, actualVotes: aT });
  }
  worst.sort((a, b) => Math.abs(b.pred - b.actual) - Math.abs(a.pred - a.actual));
  console.log("\nWorst 2022 chamber margins (pred vs actual, votes pred/actual):");
  for (const w of worst.slice(0, 8)) console.log(`   ${w.abbr} ${w.chamber}: ${fmt(w.pred)} vs ${fmt(w.actual)} · ${(w.votes / 1e6).toFixed(2)}M / ${(w.actualVotes / 1e6).toFixed(2)}M`);
}

if (process.argv.includes("--emit")) {
  const file = path.join(process.cwd(), "data", "stateLegPopularVoteValidation.ts");
  fs.writeFileSync(file, `// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegPopularVoteBacktest.ts --emit\` — do not edit by hand.\n// Holdout of the state legislative chamber popular vote: 2022 district votes from 2018 (and 2024 from the live basis\n// weights), the raw chamber margin against the certified aggregate, and the unopposed-race turnout measurement.\nexport const STATE_LEG_POPVOTE_VALIDATION = ${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), unopposed, grid: gridRows, year2024: s24, live: live22 }, null, 2)} as const;\n`);
  console.log(`wrote ${file}`);
}

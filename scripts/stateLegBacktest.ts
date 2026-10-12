// State legislative district projection backtest.
//
// Run:  npx tsx --conditions=react-server scripts/stateLegBacktest.ts
//       npx tsx --conditions=react-server scripts/stateLegBacktest.ts --emit   (write data/stateLegValidation.ts)
//
// Protocol: for each held-out year Y (2022, 2024), every chamber whose Y election was held on the
// CURRENT map (so district keys line up) and whose districts have a contested result in Y. Each
// district's lean is built from rows with year < Y only (presidential years included), projected
// into Y with the fitted E(Y) and the actual incumbent sign of that race, with INCUMBENCY_PTS set
// to 0 so the incumbency term can be fitted from the residuals. Scores: MAE, bias and the residual
// spread (σ) of projected vs actual contested margins; incumbency fitted by least squares of the
// residual on the incumbent sign. The σ reported is the total race-level spread beyond E(Y) (the
// national shock is inside E(Y) here); it is split into the chamber-level shock τ (STATE_SHOCK in
// lib/stateLegForecast.ts, shared by every seat of a chamber) and the seat noise after it (SIGMA).

import fs from "node:fs";
import path from "node:path";
import { projectDistrict, STATE_LEG_FORECAST_CONSTANTS as C } from "@/lib/stateLegForecast";
import { getTplFit } from "@/lib/tplCompute";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { indexByNormalizedKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

interface Row { abbr: string; chamber: Chamber; key: string; year: number; actual: number; projected: number; incSign: number; lean: number; nRows: number }

function run(year: number): Row[] {
  const fit = getTplFit();
  const E = fit.E[year] ?? 0;
  const rows: Row[] = [];
  for (const abbr of Object.keys(stateLegDistricts).sort()) {
    for (const chamber of ["house", "senate"] as Chamber[]) {
      if (UNICAMERAL_STATES.has(abbr) && chamber === "house") continue;
      const roster = stateLegDistricts[abbr]?.[chamber] ?? [];
      const block = stateLegResults[abbr]?.[String(year)]?.[chamber];
      if (!block || roster.length === 0) continue;
      if (stateLegHistoricalMaps[abbr]?.[chamber]?.[String(year)] != null) continue; // not on today's lines
      const index = indexByNormalizedKey(block.districts);
      for (const d of roster) {
        const r = lookupByDistrictCode(index, abbr, chamber, d.number);
        if (!r || r.noCount || !r.totalVotes || !r.demVotes || !r.repVotes || r.demVotes <= 0 || r.repVotes <= 0) continue;
        const actual = ((r.repVotes - r.demVotes) / r.totalVotes) * 100;
        const inc = (r.candidates ?? []).filter((c) => c.incumbent);
        const parties = new Set(inc.map((c) => c.party));
        const incSign = parties.size === 1 ? ([...parties][0] === "R" ? 1 : [...parties][0] === "D" ? -1 : 0) : 0;
        const p = projectDistrict(abbr, chamber, d, { maxYear: year - 1, targetYear: year, targetE: E, targetIncSign: incSign, incumbencyPts: 0 });
        if (p.lean == null || p.margin == null) continue;
        rows.push({ abbr, chamber, key: d.number, year, actual, projected: p.margin, incSign, lean: p.lean, nRows: p.rows.length });
      }
    }
  }
  return rows;
}

function score(rows: Row[]) {
  const res = rows.map((r) => r.actual - r.projected);
  const bias = mean(res);
  const mae = mean(res.map((x) => Math.abs(x - bias)));
  // incumbency: least squares of the residual on the incumbent sign (±1), bias removed
  const inc = rows.filter((r) => r.incSign !== 0);
  const num = inc.reduce((s, r) => s + (r.actual - r.projected - bias) * r.incSign, 0);
  const den = inc.reduce((s, r) => s + r.incSign * r.incSign, 0);
  const incPts = den > 0 ? num / den : 0;
  const resAfter = rows.map((r) => r.actual - r.projected - bias - incPts * r.incSign);
  const robust = 1.4826 * median(resAfter.map((x) => Math.abs(x - median(resAfter))));
  const sigma = sd(resAfter);
  // Chamber-level shock: how much of the residual is shared by every seat of a chamber. Method of
  // moments on chamber-mean residuals (chambers with 10+ seats): the variance of the means less
  // what independent seat noise alone would put there, σ_w² × mean(1/n_c), solved once for the
  // split σ² = τ² + σ_w².
  const byChamber = new Map<string, number[]>();
  rows.forEach((r, i) => byChamber.set(`${r.abbr}:${r.chamber}`, [...(byChamber.get(`${r.abbr}:${r.chamber}`) ?? []), resAfter[i]]));
  const chambers = [...byChamber.values()].filter((xs) => xs.length >= 10);
  const means = chambers.map(mean);
  const grand = mean(means);
  const varMeans = mean(means.map((m) => (m - grand) ** 2));
  const meanInvN = mean(chambers.map((xs) => 1 / xs.length));
  let tau2 = Math.max(0, varMeans - sigma ** 2 * meanInvN);
  tau2 = Math.max(0, varMeans - (sigma ** 2 - tau2) * meanInvN);
  const stateShock = Math.sqrt(tau2);
  const sigmaWithin = Math.sqrt(Math.max(0, sigma ** 2 - tau2));
  return { n: rows.length, bias, mae, incPts, incN: inc.length, sigma, sigmaRobust: robust, maeAfter: mean(resAfter.map(Math.abs)), stateShock, sigmaWithin, chambers: chambers.length };
}

const years = [2022, 2024];
const emitted: Record<string, unknown>[] = [];
console.log("State legislative district projection — holdout by year (lean from years < Y, E(Y) fitted, incumbency fitted from residuals)\n");
for (const y of years) {
  const rows = run(y);
  const s = score(rows);
  console.log(`${y}: n=${s.n} contested districts on today's lines · bias ${s.bias >= 0 ? "+" : ""}${s.bias.toFixed(2)} · MAE ${s.mae.toFixed(2)} → ${s.maeAfter.toFixed(2)} after incumbency · incumbency ${s.incPts.toFixed(2)} pts (n=${s.incN}) · σ ${s.sigma.toFixed(2)} (robust ${s.sigmaRobust.toFixed(2)}) · chamber shock τ ${s.stateShock.toFixed(2)} over ${s.chambers} chambers, seat noise after it ${s.sigmaWithin.toFixed(2)}`);
  const byState = new Map<string, Row[]>();
  for (const r of rows) byState.set(r.abbr, [...(byState.get(r.abbr) ?? []), r]);
  const worst = [...byState.entries()].map(([abbr, rs]) => ({ abbr, n: rs.length, mae: mean(rs.map((r) => Math.abs(r.actual - r.projected - s.bias - s.incPts * r.incSign))) })).sort((a, b) => b.mae - a.mae);
  console.log("   worst states: " + worst.slice(0, 6).map((w) => `${w.abbr} ${w.mae.toFixed(1)} (${w.n})`).join(" · ") + "   best: " + worst.slice(-3).map((w) => `${w.abbr} ${w.mae.toFixed(1)}`).join(" · "));
  const relocatedShare = rows.filter((r) => r.nRows > 3).length / rows.length;
  void relocatedShare;
  emitted.push({ year: y, n: s.n, bias: +s.bias.toFixed(2), mae: +s.mae.toFixed(2), maeAfterIncumbency: +s.maeAfter.toFixed(2), incumbencyPts: +s.incPts.toFixed(2), incumbentRaces: s.incN, sigma: +s.sigma.toFixed(2), sigmaRobust: +s.sigmaRobust.toFixed(2), stateShock: +s.stateShock.toFixed(2), sigmaWithin: +s.sigmaWithin.toFixed(2), chambers: s.chambers });
}
console.log(`\nLive constants: INCUMBENCY_PTS ${C.INCUMBENCY_PTS} · SIGMA ${C.SIGMA} · STATE_SHOCK ${C.STATE_SHOCK} · TYPE_WEIGHTS P ${C.TYPE_WEIGHTS.P} / L ${C.TYPE_WEIGHTS.L} · MIN_COVERAGE ${C.MIN_COVERAGE}`);

if (process.argv.includes("--emit")) {
  const file = path.join(process.cwd(), "data", "stateLegValidation.ts");
  fs.writeFileSync(file, `// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegBacktest.ts --emit\` — do not edit by hand.\n// Holdout of the state legislative district projection: each district's lean from years before Y, projected into Y\n// with the fitted environment and the race's actual incumbent; scored on contested districts on today's lines.\nexport const STATE_LEG_VALIDATION = ${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), rows: emitted }, null, 2)} as const;\n`);
  console.log(`wrote ${file}`);
}

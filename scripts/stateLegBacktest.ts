// State legislative district projection backtest.
//
// Run:  npx tsx --conditions=react-server scripts/stateLegBacktest.ts
//       npx tsx --conditions=react-server scripts/stateLegBacktest.ts --emit   (write data/stateLegValidation.ts)
//       npx tsx --conditions=react-server scripts/stateLegBacktest.ts --env --emit   (environment-scale sweep, 2018–2024, bias kept)
//       npx tsx --conditions=react-server scripts/stateLegBacktest.ts --leg-shock    (national legislative shock: chamber-mean calibration, 2018–2024)
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
import { projectDistrict, STATE_LEG_FORECAST_CONSTANTS as C, type ProjectOptions } from "@/lib/stateLegForecast";
import { getTplFit, getEnvironmentModel, winProbabilityD } from "@/lib/tplCompute";
import { nationalEnvironmentHistory } from "@/data/nationalEnvironmentHistory";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { indexByNormalizedKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

interface Row { abbr: string; chamber: Chamber; key: string; year: number; actual: number; projected: number; incSign: number; lean: number; nRows: number; moneyPts: number | null }

function run(year: number, typeWeights?: Record<"P" | "L", number>, recentSeatBoost?: number, money?: { k: number; cap: number; strip?: boolean }, env?: Pick<ProjectOptions, "envScale" | "envScaleRows" | "targetE">): Row[] {
  const fit = getTplFit();
  const E = env?.targetE ?? fit.E[year] ?? 0;
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
        const p = projectDistrict(abbr, chamber, d, { maxYear: year - 1, targetYear: year, targetE: E, targetIncSign: incSign, incumbencyPts: 0, typeWeights, recentSeatBoost, moneyK: money?.k, moneyCap: money?.cap, moneyStrip: money?.strip, envScale: env?.envScale, envScaleRows: env?.envScaleRows });
        if (p.lean == null || p.margin == null) continue;
        rows.push({ abbr, chamber, key: d.number, year, actual, projected: p.margin, incSign, lean: p.lean, nRows: p.rows.length, moneyPts: p.money?.pts ?? null });
      }
    }
  }
  return rows;
}

// A year run on a superseded map (2018, 2020): the "actual" is that year's seat result relocated onto
// today's lines through the population crosswalk (the projection's own L row for the year, which carries
// the presidential delta between the old and new polygons), the projection built from rows before it.
function runRelocated(year: number, env: Pick<ProjectOptions, "envScale" | "envScaleRows" | "targetE">): Row[] {
  const rows: Row[] = [];
  for (const abbr of Object.keys(stateLegDistricts).sort()) {
    for (const chamber of ["house", "senate"] as Chamber[]) {
      if (UNICAMERAL_STATES.has(abbr) && chamber === "house") continue;
      if (!stateLegResults[abbr]?.[String(year)]?.[chamber]) continue;
      for (const d of stateLegDistricts[abbr]?.[chamber] ?? []) {
        const row = projectDistrict(abbr, chamber, d, { maxYear: year, moneyK: 0 }).rows.find((r) => r.kind === "L" && r.year === year);
        if (!row || row.raw == null || row.coverage < 0.9) continue;
        const p = projectDistrict(abbr, chamber, d, { maxYear: year - 1, targetYear: year, targetE: env.targetE, targetIncSign: row.incSign, incumbencyPts: 0, moneyK: 0, envScale: env.envScale, envScaleRows: env.envScaleRows });
        if (p.lean == null || p.margin == null) continue;
        rows.push({ abbr, chamber, key: d.number, year, actual: row.raw, projected: p.margin, incSign: row.incSign, lean: p.lean, nRows: p.rows.length, moneyPts: null });
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
  // With the bias left in: a uniform environment miss counts against the projection here.
  const maeRaw = mean(rows.map((r) => Math.abs(r.actual - r.projected - incPts * r.incSign)));
  const biasAfterInc = mean(rows.map((r) => r.actual - r.projected - incPts * r.incSign));
  return { n: rows.length, bias, biasAfterInc, maeRaw, mae, incPts, incN: inc.length, sigma, sigmaRobust: robust, maeAfter: mean(resAfter.map(Math.abs)), stateShock, sigmaWithin, chambers: chambers.length };
}

const years = [2022, 2024];
const emitted: Record<string, unknown>[] = [];

// --leg-shock: a national legislative shock, the part of a year's seat-level miss shared by every
// chamber (the backtest's mean bias given the fitted E). The chamber shock τ is measured with that
// bias removed, so the live variance budget leaves it out. Scored on each held-out chamber's mean
// residual (live incumbency, bias left in): predictive N(0, τ² + s² + SIGMA²/n) against s = 0, with s
// the RMS of the OTHER years' biases (leave one year out), by log score and 80%/50% coverage; and on
// each contested seat's P(D) by log loss and Brier.
if (process.argv.includes("--leg-shock")) {
  const fit = getTplFit();
  const all = [2018, 2020, ...years];
  const byYear = new Map<number, Row[]>();
  for (const y of all) byYear.set(y, y < 2022 ? runRelocated(y, { targetE: fit.E[y] }) : run(y, undefined, undefined, undefined, { targetE: fit.E[y] }));
  const resOf = (r: Row) => r.actual - r.projected - C.INCUMBENCY_PTS * r.incSign;
  const bias = new Map(all.map((y) => [y, mean(byYear.get(y)!.map(resOf))]));
  console.log("Yearly seat-level bias given the fitted E (live incumbency): " + all.map((y) => `${y} ${bias.get(y)! >= 0 ? "+" : ""}${bias.get(y)!.toFixed(2)}`).join(" · "));
  console.log(`RMS around 0, all years: ${Math.sqrt(mean(all.map((y) => bias.get(y)! ** 2))).toFixed(2)}\n`);
  const out: Record<string, unknown>[] = [];
  const variants = [{ name: "s = 0 (live)", s: () => 0 }, { name: "s = LOO RMS", s: (y: number) => Math.sqrt(mean(all.filter((x) => x !== y).map((x) => bias.get(x)! ** 2))) }];
  for (const v of variants) {
    let ls = 0, n = 0, c80 = 0, c50 = 0, seatLL = 0, seatBrier = 0, seatN = 0;
    const perYear: string[] = [];
    for (const y of all) {
      const s = v.s(y);
      const byCh = new Map<string, number[]>();
      for (const r of byYear.get(y)!) byCh.set(`${r.abbr}:${r.chamber}`, [...(byCh.get(`${r.abbr}:${r.chamber}`) ?? []), resOf(r)]);
      let yls = 0, yn = 0;
      for (const xs of byCh.values()) {
        if (xs.length < 10) continue;
        const m = mean(xs), sd2 = C.STATE_SHOCK ** 2 + s ** 2 + C.SIGMA ** 2 / xs.length, sdc = Math.sqrt(sd2);
        const lp = -0.5 * Math.log(2 * Math.PI * sd2) - (m * m) / (2 * sd2);
        ls += lp; yls += lp; n += 1; yn += 1;
        if (Math.abs(m) <= 1.2816 * sdc) c80 += 1;
        if (Math.abs(m) <= 0.6745 * sdc) c50 += 1;
      }
      const sigSeat = Math.sqrt(C.SIGMA ** 2 + C.STATE_SHOCK ** 2 + s ** 2);
      for (const r of byYear.get(y)!) {
        const pD = winProbabilityD(r.projected + C.INCUMBENCY_PTS * r.incSign, sigSeat), dWon = r.actual < 0 ? 1 : 0;
        const p = Math.min(1 - 1e-6, Math.max(1e-6, pD));
        seatLL -= dWon ? Math.log(p) : Math.log(1 - p); seatBrier += (pD - dWon) ** 2; seatN += 1;
      }
      perYear.push(`${y} s ${s.toFixed(2)} log ${(yls / yn).toFixed(3)}`);
    }
    console.log(`${v.name.padEnd(14)} chambers ${n} · mean log score ${(ls / n).toFixed(4)} · 80% cover ${(100 * c80 / n).toFixed(1)}% · 50% cover ${(100 * c50 / n).toFixed(1)}% · seats ${seatN} log loss ${(seatLL / seatN).toFixed(4)} Brier ${(seatBrier / seatN).toFixed(4)}`);
    console.log(`               ${perYear.join(" · ")}`);
    out.push({ variant: v.name, chambers: n, logScore: +(ls / n).toFixed(4), cover80: +(100 * c80 / n).toFixed(1), cover50: +(100 * c50 / n).toFixed(1), seats: seatN, seatLogLoss: +(seatLL / seatN).toFixed(4), seatBrier: +(seatBrier / seatN).toFixed(4) });
  }
  process.exit(0);
}

// --env: the environment term scaled by λ (β*·E × λ), scored WITHOUT removing the mean bias, since a
// uniform environment miss is what is being tested. Rows: λ on the forward term only, on the forward
// term and the past seat rows' strip (legislative seats respond λ× to E), and on every row. Two target
// environments: E(Y) as fitted from that year's statewide results, and E as the live chain would have
// read it from the final generic ballot (c + s × (GB_final + ENV_MISS_SHRINK × mean miss)).
if (process.argv.includes("--env")) {
  const m = getEnvironmentModel(), fit = getTplFit();
  const polledE = (y: number) => { const gb = nationalEnvironmentHistory.find((r) => r.year === y)?.gbFinal; return gb == null ? null : m.c + m.s * (gb + F.ENV_MISS_SHRINK * m.meanMiss); };
  const lambdas = [0.8, 1, 1.2, 1.4, 1.6, 2];
  const out: Record<string, unknown>[] = [];
  for (const target of ["fitted", "polled"] as const) {
    for (const rowsMode of ["none", "L", "all"] as const) {
      for (const y of [2018, 2020, ...years]) {
        const targetE = target === "fitted" ? fit.E[y] : polledE(y)!;
        const line: string[] = [];
        for (const lambda of lambdas) {
          const env = { envScale: lambda, envScaleRows: rowsMode, targetE };
          const s = score(y < 2022 ? runRelocated(y, env) : run(y, undefined, undefined, undefined, env));
          line.push(`λ${lambda}: ${s.maeRaw.toFixed(3)} (${s.biasAfterInc >= 0 ? "+" : ""}${s.biasAfterInc.toFixed(2)})`);
          out.push({ target, rows: rowsMode, year: y, targetE: +targetE.toFixed(2), lambda, n: s.n, maeRaw: +s.maeRaw.toFixed(3), bias: +s.biasAfterInc.toFixed(2), maeAfterBias: +s.maeAfter.toFixed(3) });
        }
        console.log(`${target} E ${targetE.toFixed(2)} · scale ${rowsMode.padEnd(4)} · ${y}:  ${line.join("  ")}`);
      }
    }
  }
  if (process.argv.includes("--emit")) {
    const file = path.join(process.cwd(), "data", "stateLegEnvScaleSweep.ts");
    fs.writeFileSync(file, `// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegBacktest.ts --env --emit\` — do not edit by hand.\n// The state legislative environment term scaled by λ on the 2022/2024 holdout, scored with the bias left in.\nexport const STATE_LEG_ENV_SCALE_SWEEP = ${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), rows: out }, null, 2)} as const;\n`);
    console.log(`wrote ${file}`);
  }
  process.exit(0);
}

// --money: the money term (lib/stateLegMoneyModel.ts residual basis) swept over MONEY_K × MONEY_CAP on the
// same holdout, the strip on past seat rows and the forward term both at the swept values (k 0 = no money
// anywhere). The target year's receipts are its full-cycle totals (scale 1). Scored after fitted
// incumbency on every contested seat and on the seats whose race has both sides' money on file.
if (process.argv.includes("--money")) {
  const ks = [0, 0.02, 0.03, 0.04, 0.06, 0.08, 0.12];
  const caps = [1, 1.5, 2, 3, 4, 6];
  const out: Record<string, unknown>[] = [];
  for (const y of years) {
    const base = run(y, undefined, undefined, { k: 0, cap: 0 });
    const withMoney = new Set(run(y, undefined, undefined, { k: 0.04, cap: 3 }).filter((r) => r.moneyPts != null).map((r) => `${r.abbr}:${r.chamber}:${r.key}`));
    const sub = (rs: Row[]) => rs.filter((r) => withMoney.has(`${r.abbr}:${r.chamber}:${r.key}`));
    const s0 = score(base), m0 = score(sub(base));
    console.log(`${y}: n=${s0.n}, ${m0.n} with both sides' money · no money: MAE(inc) ${s0.maeAfter.toFixed(3)} · on money seats ${m0.maeAfter.toFixed(3)} · σ ${s0.sigma.toFixed(2)} τ ${s0.stateShock.toFixed(2)}`);
    out.push({ year: y, k: 0, cap: 0, n: s0.n, nMoney: m0.n, maeAfterIncumbency: +s0.maeAfter.toFixed(3), maeMoneySeats: +m0.maeAfter.toFixed(3), incumbencyPts: +s0.incPts.toFixed(2), sigma: +s0.sigma.toFixed(2), sigmaRobust: +s0.sigmaRobust.toFixed(2), stateShock: +s0.stateShock.toFixed(2), sigmaWithin: +s0.sigmaWithin.toFixed(2) });
    for (const cap of caps) {
      const line: string[] = [];
      for (const k of ks.slice(1)) {
        const rs = run(y, undefined, undefined, { k, cap });
        const s = score(rs), m = score(sub(rs));
        line.push(`k${k}: ${s.maeAfter.toFixed(3)}/${m.maeAfter.toFixed(3)}`);
        out.push({ year: y, k, cap, n: s.n, nMoney: m.n, maeAfterIncumbency: +s.maeAfter.toFixed(3), maeMoneySeats: +m.maeAfter.toFixed(3), incumbencyPts: +s.incPts.toFixed(2), sigma: +s.sigma.toFixed(2), sigmaRobust: +s.sigmaRobust.toFixed(2), stateShock: +s.stateShock.toFixed(2), sigmaWithin: +s.sigmaWithin.toFixed(2) });
      }
      console.log(`   cap ${cap}:  ${line.join("  ")}`);
    }
  }
  if (process.argv.includes("--emit")) {
    const file = path.join(process.cwd(), "data", "stateLegMoneySweep.ts");
    fs.writeFileSync(file, `// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegBacktest.ts --money --emit\` — do not edit by hand.\n// The state legislative money term swept over MONEY_K × MONEY_CAP on the 2022/2024 holdout (k 0 = no money term).\nexport const STATE_LEG_MONEY_SWEEP = ${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), rows: out }, null, 2)} as const;\n`);
    console.log(`wrote ${file}`);
  }
  process.exit(0);
}

// --sweep: TYPE_WEIGHTS as the share of the lean the seat's own races get (P + L renormalised),
// scored on the same holdout. Seats whose lean has no seat row at all score the same under every
// weight, so the table also reports the districts with at least one seat row.
// --sweep: two grids on the same holdout, both scored after fitted incumbency. (a) TYPE_WEIGHTS as
// the share of the lean the seat's own races get (L / (P + L)), with no recency boost; seats whose
// lean has no seat row score the same under every weight, so the table also reports the districts
// with one. (b) RECENT_SEAT_BOOST: the most recent seat row's type weight × k, at the live
// TYPE_WEIGHTS and at an L share of 0.4 (State Navigate's emphasis on the last legislative result).
if (process.argv.includes("--sweep")) {
  console.log("Recent-seat-row boost sweep — MAE after fitted incumbency\n");
  const recency: Record<string, unknown>[] = [];
  for (const L of [0.25, 0.4]) {
    for (const y of years) {
      const line: string[] = [];
      for (const k of [1, 1.5, 2, 3, 5]) {
        const s = score(run(y, { P: 1 - L, L }, k));
        line.push(`×${k}: ${s.maeAfter.toFixed(2)} (σr ${s.sigmaRobust.toFixed(2)}, bias ${s.bias >= 0 ? "+" : ""}${s.bias.toFixed(2)})`);
        recency.push({ year: y, lShare: L, boost: k, maeAfterIncumbency: +s.maeAfter.toFixed(2), bias: +s.bias.toFixed(2), incumbencyPts: +s.incPts.toFixed(2), sigmaRobust: +s.sigmaRobust.toFixed(2) });
      }
      console.log(`L share ${L} · ${y}:  ${line.join("  ")}`);
    }
  }
  console.log("\nTYPE_WEIGHTS sweep — share of the lean on the seat's own races (L / (P + L)), no recency boost; MAE and σ after fitted incumbency\n");
  const shares = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const sweep: Record<string, unknown>[] = [];
  for (const y of years) {
    console.log(`${y}:  L share   n     bias    MAE  MAE(inc)  inc pts    σ   robust σ    τ   | seats with a seat row: n  MAE(inc)`);
    for (const L of shares) {
      const rows = run(y, { P: 1 - L, L }, 1);
      const s = score(rows);
      const withL = rows.filter((r) => r.nRows > 3);
      const sw = score(withL);
      console.log(`      ${L.toFixed(2)}   ${s.n}  ${(s.bias >= 0 ? "+" : "") + s.bias.toFixed(2)}  ${s.mae.toFixed(2)}   ${s.maeAfter.toFixed(2)}    ${s.incPts.toFixed(2)}   ${s.sigma.toFixed(2)}   ${s.sigmaRobust.toFixed(2)}    ${s.stateShock.toFixed(2)}  |  ${sw.n}  ${sw.maeAfter.toFixed(2)}`);
      sweep.push({ year: y, lShare: L, n: s.n, bias: +s.bias.toFixed(2), maeAfterIncumbency: +s.maeAfter.toFixed(2), incumbencyPts: +s.incPts.toFixed(2), sigma: +s.sigma.toFixed(2), sigmaRobust: +s.sigmaRobust.toFixed(2), withSeatRows: sw.n, withSeatRowsMae: +sw.maeAfter.toFixed(2) });
    }
  }
  if (process.argv.includes("--emit")) {
    const file = path.join(process.cwd(), "data", "stateLegTypeWeightSweep.ts");
    fs.writeFileSync(file, `// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegBacktest.ts --sweep --emit\` — do not edit by hand.\n// Weight sweeps on the state legislative holdout: the share of the lean on the seat's own races, and the most recent seat row's boost.\nexport const STATE_LEG_TYPE_WEIGHT_SWEEP = ${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), typeWeights: sweep, recency }, null, 2)} as const;\n`);
    console.log(`wrote ${file}`);
  }
  process.exit(0);
}
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

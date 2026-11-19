// Conditional test of TPL on 2026 (2026-11-19) — read-only; changes nothing and writes only to --out.
//
// Run:  npx tsx --conditions=react-server scripts/tplConditional2026.ts [--out file.json]
//
// TPL is a baseline, not a forecast. Its one predictive claim is conditional: with the year's
// environment and each race's candidate terms supplied, lean + those terms should land on the
// result. Here every 2026 Senate, Governor and House race between a Democrat and a Republican is
// decomposed with the locked model's own terms,
//
//   result = lean + environment + incumbency + money + candidate record + remainder
//
// where lean is State TPL (Senate, Governor) or District TPL (House) built from elections through
// 2025; incumbency, money and the candidate record are the forward model's terms as they stood at
// the lock; and the environment is supplied exactly — one number per office, the median of what is
// left — so the national polling miss plays no part. No race polls are used.
// 2026 results: data-entry/results_2026_seats.csv as fetched (counts not final).

import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/turnout";
import { houseData, senateData, governorData } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { presPastResults } from "@/data/forecastData";
import { alignedParty } from "@/data/raceEligibility";
import { calculateStateTpl, calculateDistrictTpl, computeIncumbentPts, competitiveIncumbencyPts, raceMoneyTerm, candidateQuality, getTplFit, type ProjectedMarginInput } from "@/lib/tplCompute";

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;
const num = (v: string | undefined) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const median = (x: number[]) => { const s = [...x].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (x: number) => +x.toFixed(2);

const seats = parseCsv(fs.readFileSync(path.join(process.cwd(), "data-entry/results_2026_seats.csv"), "utf8"));
const fit = getTplFit();
const presState = (abbr: string, y: number) => { const e = (presPastResults[abbr] ?? []).find((p) => p.year === y); return e ? e.repPct - e.demPct : null; };

interface Row { office: "S" | "G" | "H"; label: string; abbr: string; result: number; lean: number; p24: number | null; p20: number | null; inc: number; comp: number; money: number; moneyKnown: boolean; quality: number; beta: number; incumbent: string; }
const rows: Row[] = [];
const sets: ["S" | "G" | "H", string, ProjectedMarginInput[]][] = [["S", "senate", senateData as unknown as ProjectedMarginInput[]], ["G", "governor", governorData as unknown as ProjectedMarginInput[]], ["H", "house", houseData as unknown as ProjectedMarginInput[]]];
for (const [office, name, races] of sets) for (const race of races) {
  const abbr = office === "H" ? statesData.find((s) => s.name === race.state)?.abbr ?? "" : race.id.replace(/-\d+$/, "");
  const res = seats.find((s) => s.office === name && (office === "H" ? s.race_id === race.id : s.state === abbr));
  if (!res) continue;
  const eligible = res.contest === "contested" && res.dem_party === "D" && res.rep_party === "R" && num(res.dem_votes) > 0 && num(res.rep_votes) > 0;
  if (!eligible) continue;
  const incC = race.candidates ? [race.candidates.dem, race.candidates.rep].find((c) => c.incumbent) ?? null : null;
  const incParty = incC ? alignedParty(incC) : null;
  const inc = computeIncumbentPts(office, incParty, incC?.appointed ?? false);
  const d = office === "H" ? districtPresidentialData[String(parseInt(race.id, 10))] : null;
  const lean = office === "H" ? calculateDistrictTpl(race.id) : calculateStateTpl(abbr, race.state);
  const beta = fit.beta[abbr]?.shrunk ?? 1;
  const m = raceMoneyTerm(race);
  rows.push({ office, label: res.label, abbr, result: Number(res.margin), lean, p24: d ? d.pres24Margin : presState(abbr, 2024), p20: d ? d.pres20Margin : presState(abbr, 2020),
    inc, comp: competitiveIncumbencyPts(office, incParty, lean, incC?.appointed ?? false), money: m.pts, moneyKnown: m.known, quality: candidateQuality(race).pts, beta, incumbent: incParty ?? "Open" });
}

type Pred = (r: Row) => number | null;
function score(rs: Row[], pred: Pred, scaled = false) {
  const ok = rs.filter((r) => pred(r) != null);
  const rem0 = ok.map((r) => r.result - pred(r)!);
  let env: number, rem: number[];
  if (!scaled) { env = median(rem0); rem = rem0.map((x) => x - env); }
  else { // environment × β*: the single E that best fits, then any leftover level removed
    env = rem0.reduce((s, x, i) => s + ok[i].beta * x, 0) / ok.reduce((s, r) => s + r.beta * r.beta, 0);
    const t = rem0.map((x, i) => x - ok[i].beta * env); const m = median(t); rem = t.map((x) => x - m);
  }
  const abs = rem.map(Math.abs);
  return { n: ok.length, env, mae: mean(abs), med: median(abs), rmse: Math.sqrt(mean(rem.map((x) => x * x))), within5: abs.filter((x) => x <= 5).length / abs.length, rem, ok };
}
const ladder: [string, Pred][] = [
  ["Lean alone", (r) => r.lean],
  ["+ incumbency", (r) => r.lean + r.inc],
  ["+ incumbency + money", (r) => r.lean + r.inc + r.money],
  ["+ incumbency + candidate record", (r) => r.lean + r.inc + r.quality],
  ["Full: lean + incumbency + money + candidate record", (r) => r.lean + r.inc + r.money + r.quality],
  ["Full + competitive-seat incumbency (as locked)", (r) => r.lean + r.inc + r.comp + r.money + r.quality],
  ["Full, 2024 presidential margin in place of TPL", (r) => (r.p24 == null ? null : r.p24 + r.inc + r.money + r.quality)],
  ["Full, 0.75 × 2024 + 0.25 × 2020 president in place of TPL", (r) => (r.p24 == null || r.p20 == null ? null : 0.75 * r.p24 + 0.25 * r.p20 + r.inc + r.money + r.quality)],
  ["2024 presidential margin alone", (r) => r.p24],
];
const out: Record<string, unknown> = { generatedAt: new Date().toISOString() };
const names = { S: "Senate", G: "Governor", H: "House" } as const;
const ladderOut: Record<string, unknown>[] = [];
for (const office of ["S", "G", "H"] as const) {
  const rs = rows.filter((r) => r.office === office);
  console.log(`\n══ ${names[office]} — ${rs.length} races · candidate record non-zero in ${rs.filter((r) => r.quality !== 0).length} · receipts known in ${rs.filter((r) => r.moneyKnown).length} · incumbents ${rs.filter((r) => r.incumbent !== "Open").length}`);
  for (const [label, p] of ladder) {
    const s = score(rs, p);
    console.log(`  ${label.padEnd(58)} n=${String(s.n).padStart(3)} env ${s.env.toFixed(1).padStart(6)}  MAE ${s.mae.toFixed(2)}  median ${s.med.toFixed(2)}  RMSE ${s.rmse.toFixed(2)}  within 5: ${(s.within5 * 100).toFixed(0)}%`);
    ladderOut.push({ office: names[office], label, n: s.n, env: r2(s.env), mae: r2(s.mae), median: r2(s.med), rmse: r2(s.rmse), within5: Math.round(s.within5 * 100) });
  }
  const sb = score(rs, ladder[4][1], true);
  console.log(`  ${"Full, environment × β*".padEnd(58)} n=${String(sb.n).padStart(3)} E   ${sb.env.toFixed(1).padStart(6)}  MAE ${sb.mae.toFixed(2)}`);
  ladderOut.push({ office: names[office], label: "Full, environment × β*", n: sb.n, env: r2(sb.env), mae: r2(sb.mae) });
}
out.ladder = ladderOut;

// Structure of the remainder under the full equation
console.log("\n══ What is left over (full equation, one environment per office) ══");
const diag: Record<string, unknown>[] = [];
const ols = (x: number[], y: number[]) => { const mx = mean(x), my = mean(y); const c = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0); const vx = x.reduce((s, v) => s + (v - mx) ** 2, 0); const vy = y.reduce((s, v) => s + (v - my) ** 2, 0); return { slope: c / vx, r: c / Math.sqrt(vx * vy) }; };
const misses: Record<string, unknown>[] = [];
for (const office of ["S", "G", "H"] as const) {
  const s = score(rows.filter((r) => r.office === office), ladder[4][1]);
  const onLean = ols(s.ok.map((r) => r.lean), s.rem);
  const onBeta = ols(s.ok.map((r) => r.beta), s.rem);
  const by = (f: (r: Row) => boolean) => { const v = s.rem.filter((_, i) => f(s.ok[i])); return v.length ? { n: v.length, mean: r2(mean(v)), mae: r2(mean(v.map(Math.abs))) } : null; };
  const g = { office: names[office], n: s.n, env: r2(s.env), slopeOnLean: +onLean.slope.toFixed(3), rOnLean: r2(onLean.r), rOnBeta: r2(onBeta.r),
    redder10: by((r) => r.lean >= 10), middle: by((r) => Math.abs(r.lean) < 10), bluer10: by((r) => r.lean <= -10),
    rInc: by((r) => r.incumbent === "R"), dInc: by((r) => r.incumbent === "D"), open: by((r) => r.incumbent === "Open") };
  console.log(`  ${names[office]}: remainder on lean slope ${g.slopeOnLean} (r ${g.rOnLean}) · on β* r ${g.rOnBeta}`);
  console.log(`     lean ≥ R+10 ${JSON.stringify(g.redder10)} · within 10 ${JSON.stringify(g.middle)} · ≤ D+10 ${JSON.stringify(g.bluer10)}`);
  console.log(`     R incumbent ${JSON.stringify(g.rInc)} · D incumbent ${JSON.stringify(g.dInc)} · open ${JSON.stringify(g.open)}`);
  diag.push(g);
  const ranked = s.ok.map((r, i) => ({ r, rem: s.rem[i] })).sort((a, b) => Math.abs(b.rem) - Math.abs(a.rem)).slice(0, office === "H" ? 12 : 8);
  for (const { r, rem } of ranked) misses.push({ office: names[office], label: r.label, result: r2(r.result), lean: r2(r.lean), inc: r2(r.inc), money: r2(r.money), quality: r2(r.quality), env: r2(s.env), remainder: r2(rem) });
  console.log(`     largest: ${ranked.map(({ r, rem }) => `${r.label} ${rem >= 0 ? "+" : ""}${rem.toFixed(1)}`).join(" · ")}`);
  if (office === "H") {
    // how much of the House remainder is shared within a state
    const byState: Record<string, number[]> = {};
    s.ok.forEach((r, i) => (byState[r.abbr] ??= []).push(s.rem[i]));
    const big = Object.entries(byState).filter(([, v]) => v.length >= 4);
    const within = big.flatMap(([, v]) => { const m = mean(v); return v.map((x) => x - m); });
    const total = big.flatMap(([, v]) => v);
    const share = 1 - mean(within.map((x) => x * x)) / mean(total.map((x) => x * x));
    console.log(`     shared within a state (states with 4+ seats): ${(share * 100).toFixed(0)}% of the variance; state means ${big.map(([a, v]) => `${a} ${mean(v).toFixed(1)}`).sort().join(" ")}`);
    (g as Record<string, unknown>).stateShare = Math.round(share * 100);
    (g as Record<string, unknown>).stateMeans = big.map(([a, v]) => ({ abbr: a, n: v.length, mean: r2(mean(v)) })).sort((a, b) => a.mean - b.mean);
  }
}
out.diag = diag; out.misses = misses; out.rows = rows.map((r) => ({ ...r, result: r2(r.result), lean: r2(r.lean) }));
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(`\nwrote ${OUT}`); }

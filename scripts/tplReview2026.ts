// TPL review harness (2026-11-19) — read-only. Changes no model constant and writes nothing into
// the repo; it scores the State / District TPL that was locked before the 2026 election against the
// 2026 results on file, and re-runs the leakage-free window fit over more holdout rounds.
//
// Run:  npx tsx --conditions=react-server scripts/tplReview2026.ts [--ext] [--out file.json]
//
//   --ext   add a "lite" 2012/2014 panel (President 2012, Senate 2012/2014, Governor 2014/2015,
//           House 2012/2014; no State Legislature rows, no fundraising) so the rounds can start at
//           2016. Without it the rounds are 2020, 2022, 2024 and 2026.
//
// Sections
//   A  State TPL as locked vs 2026 Senate / Governor / House / State Legislature, against baselines
//   B  District TPL as locked vs 2026 House (the first district-level out-of-sample test), with
//      sweeps of the House type weight, the decay and BS_WEIGHT_K
//   C  Multi-round holdout: every even year Y predicted from a fit on years ≤ Y−1, for the live
//      constants and one-at-a-time variants
//   D  The fit with 2026 added: E(y), how far each state's lean moves, how stable β is
//   E  Does β* predict which states swung more in 2026?
//   F  Does the presidential trend continue or revert?
//   G  Slope of each office's neutral margin on the state's lean ("polarization" by office)
//
// 2026 inputs: data-entry/results_2026_seats.csv (as fetched; counts were not final) and the
// state-legislative results behind lib/stateLegResults2026.ts.

import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/turnout";
import { calculateDistrictModel, calculateStateModel, getTplFit } from "@/lib/tplCompute";
import { TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { fundraisingData } from "@/data/fundraisingData";
import { chamberResults2026 } from "@/lib/stateLegResults2026";
import { panel, fitWindow, stateTpl, LIVE, incPts, ffPts, mean, median, type Theta, type PanelRow, type Fit } from "./tplWindowFit";

// scripts/tplWindowFit.ts defines LIVE.lambda as YEAR_WEIGHTS[2025] / YEAR_WEIGHTS[2024] = 1 / 0.75 = 1.333:
// the ratio is upside down, so the tool's "live" constants weight OLDER years more. The model itself
// (lib/tplCompute.ts) uses YEAR_WEIGHTS directly and is unaffected. Corrected here, in this process
// only; the inverted value is kept as a variant in section C so its cost is on the page.
const LAMBDA_AS_SHIPPED = LIVE.lambda;
LIVE.lambda = G.YEAR_WEIGHTS[2024] / G.YEAR_WEIGHTS[2025];

const EXT = process.argv.includes("--ext");
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const num = (v: string | undefined) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (x: number | null | undefined) => (x == null || !isFinite(x) ? null : +x.toFixed(2));
const ABBRS = statesData.map((s) => s.abbr);
const out: Record<string, unknown> = { ext: EXT, generatedAt: new Date().toISOString() };

// ── stats ────────────────────────────────────────────────────────────────────
type Maybe = number | null | undefined;
interface Ev { n: number; shift: number; mae: number; rmse: number; r: number; slope: number; }
function evaluate(pred: Maybe[], tgt: Maybe[]): Ev | null {
  const pairs: [number, number][] = [];
  pred.forEach((p, i) => { const t = tgt[i]; if (p != null && t != null && isFinite(p) && isFinite(t)) pairs.push([p, t]); });
  if (pairs.length < 8) return null;
  const res = pairs.map(([p, t]) => t - p);
  const shift = median(res);
  const mae = mean(res.map((x) => Math.abs(x - shift)));
  const rmse = Math.sqrt(mean(res.map((x) => (x - shift) ** 2)));
  const xs = pairs.map(([p]) => p), ys = pairs.map(([, t]) => t);
  const mx = mean(xs), my = mean(ys);
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const vx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const vy = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  return { n: pairs.length, shift, mae, rmse, r: vx && vy ? cov / Math.sqrt(vx * vy) : 0, slope: vx ? cov / vx : 0 };
}
const fmtEv = (e: Ev | null) => (e ? `n=${String(e.n).padStart(3)} MAE=${e.mae.toFixed(2)} r=${e.r.toFixed(3)} slope=${e.slope.toFixed(2)} shift=${e.shift >= 0 ? "+" : ""}${e.shift.toFixed(1)}` : "—");
const evOut = (e: Ev | null) => (e ? { n: e.n, mae: r2(e.mae), rmse: r2(e.rmse), r: +e.r.toFixed(3), slope: r2(e.slope), shift: r2(e.shift) } : null);
function ols(x: number[], y: number[]): { slope: number; intercept: number; r: number; n: number } {
  const mx = mean(x), my = mean(y);
  const cov = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0);
  const vx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
  const vy = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const slope = vx ? cov / vx : 0;
  return { slope, intercept: my - slope * mx, r: vx && vy ? cov / Math.sqrt(vx * vy) : 0, n: x.length };
}

// ── 2026 results ─────────────────────────────────────────────────────────────
interface Seat26 { office: string; abbr: string; label: string; districtId?: string; margin: number; total: number; eligible: boolean; incumbent: string; appointed: boolean; counted: number; }
const seats26: Seat26[] = parseCsv(read("data-entry/results_2026_seats.csv")).map((r) => ({
  office: r.office,
  abbr: r.state,
  label: r.label,
  districtId: r.office === "house" ? String(parseInt(r.race_id, 10)) : undefined,
  margin: Number(r.margin),
  total: num(r.total_votes),
  eligible: r.contest === "contested" && r.dem_party === "D" && r.rep_party === "R" && num(r.total_votes) > 0 && num(r.dem_votes) > 0 && num(r.rep_votes) > 0,
  incumbent: r.rep_incumbent === "1" ? "R" : r.dem_incumbent === "1" ? "D" : "Open",
  // The two appointed senators on the 2026 ballot (Moody FL, Husted OH) — the model credits them no incumbency.
  appointed: r.office === "senate" && /special/i.test(r.label),
  counted: Number(r.counted_share),
}));
const fit0 = getTplFit(); // the locked fit: information through 2025
const INC: Record<string, number> = { H: fit0.incumbency.H ?? 3, S: fit0.incumbency.S, G: fit0.incumbency.G };

function ffGap(key: string): number | null {
  const e = (fundraisingData as Record<string, { dem: number | null; rep: number | null }>)[key];
  if (!e || e.dem == null || e.rep == null || e.dem + e.rep <= 0) return null;
  return ((e.rep - e.dem) / (e.rep + e.dem)) * 100;
}

// 2026 rows in the window-fit panel's shape (they only enter a fit when maxYear ≥ 2026).
const rows26: PanelRow[] = [];
const houseSwing = median(seats26.filter((s) => s.office === "house" && s.eligible && districtPresidentialData[s.districtId!]).map((s) => s.margin - districtPresidentialData[s.districtId!].pres24Margin));
for (const s of seats26) {
  const type = s.office === "senate" ? "S" : s.office === "governor" ? "G" : "H";
  if (type !== "H") {
    if (!s.eligible) continue;
    const special = /special/i.test(s.label);
    rows26.push({ abbr: s.abbr, type, race: type === "S" ? (special ? "Senate Special" : "Senate") : "Governor", year: 2026, value: s.margin, imputed: false, eligibility: "eligible", srcYear: null,
      incumbent: s.incumbent, incumbentAppointed: s.appointed, ffGapPct: ffGap(type === "S" ? `S:${s.abbr}:2026:${special ? "Special" : "Regular"}` : `G:${s.abbr}:2026`), turnoutWeight: 1 });
  } else {
    const d = districtPresidentialData[s.districtId!];
    if (!d) continue;
    rows26.push(s.eligible
      ? { abbr: s.abbr, type, race: `House ${s.label}`, district: s.label, year: 2026, value: s.margin, imputed: false, eligibility: "eligible", srcYear: null, incumbent: s.incumbent, incumbentAppointed: false, ffGapPct: ffGap(`H:${s.label}:2026`), turnoutWeight: s.total }
      : { abbr: s.abbr, type, race: `House ${s.label}`, district: s.label, year: 2026, value: d.pres24Margin, imputed: true, eligibility: "no-contest", srcYear: 2024, incumbent: "Open", incumbentAppointed: false, ffGapPct: null, turnoutWeight: d.pres24Total });
  }
}
for (const abbr of ABBRS) { // House turnout weights relative to the state mean, as the model does
  const hs = rows26.filter((r) => r.abbr === abbr && r.type === "H");
  const m = hs.length ? mean(hs.map((r) => r.turnoutWeight)) : 1;
  for (const r of hs) r.turnoutWeight = m > 0 ? r.turnoutWeight / m : 1;
}
const leg26: Record<string, number> = {};
for (const abbr of ABBRS) {
  let numr = 0, den = 0;
  for (const chamber of ["house", "senate"] as const) {
    let c: ReturnType<typeof chamberResults2026> = null;
    try { c = chamberResults2026(abbr, chamber); } catch { c = null; }
    if (!c || c.adjusted == null || !(c.raw.votes > 0)) continue;
    numr += c.adjusted * c.raw.votes; den += c.raw.votes;
  }
  if (den > 0) {
    leg26[abbr] = numr / den;
    rows26.push({ abbr, type: "L", race: "State Legislature", year: 2026, value: leg26[abbr], imputed: false, eligibility: "eligible", srcYear: null, incumbent: "-", incumbentAppointed: false, ffGapPct: null, turnoutWeight: 1 });
  }
}
panel.push(...rows26);

// ── optional 2012/2014 "lite" extension ──────────────────────────────────────
if (EXT) {
  const TAG = /\((I|D|R|L|G|C|N|U|W)[^)]*\)/;
  const aligned = /Bernie Sanders|Angus King/;
  const stand = (name: string) => !name || (TAG.test(name) && !aligned.test(name));
  const ext: PanelRow[] = [];
  // President 2012 by state: county file (percent of the full total); Alaska from its at-large district.
  const byState: Record<string, { d: number; r: number; t: number }> = {};
  for (const c of parseCsv(read("data/county_presidential_results_2008_2024.csv"))) {
    const t = num(c.total_2012); if (!(t > 0)) continue;
    const s = (byState[c.state] ??= { d: 0, r: 0, t: 0 }); s.d += num(c.dem_2012); s.r += num(c.gop_2012); s.t += t;
  }
  const cd12 = parseCsv(read("data-entry/pres_by_cd_downballot/pres_by_cd_2012_lines.csv")).filter((r) => r.map === "2012" && r.pres_year === "2012");
  const cdPres: Record<string, { margin: number; votes: number }> = {};
  for (const r of cd12) cdPres[r.district] = { margin: Number(r.margin), votes: num(r.dem_votes) + num(r.rep_votes) };
  for (const abbr of ABBRS) {
    const s = byState[abbr];
    const value = s ? ((s.r - s.d) / s.t) * 100 : abbr === "AK" ? cdPres["AK-01"]?.margin ?? null : null;
    if (value != null) ext.push({ abbr, type: "P", race: "President", year: 2012, value, imputed: false, eligibility: "eligible", srcYear: null, incumbent: "-", incumbentAppointed: false, ffGapPct: null, turnoutWeight: 1 });
  }
  const incOf = (v: string) => (v === "R" || v === "D" ? v : "Open");
  for (const r of parseCsv(read("data-entry/senate_past_results.csv"))) {
    const year = Number(r.year); if (year !== 2012 && year !== 2014) continue;
    if (stand(r.dem_candidate) || stand(r.rep_candidate) || !(num(r.dem_pct) > 2) || !(num(r.rep_pct) > 2)) continue;
    ext.push({ abbr: r.state_abbr, type: "S", race: /special/i.test(r.type) ? "Senate Special" : "Senate", year, value: Number(r.margin), imputed: false, eligibility: "eligible", srcYear: null, incumbent: incOf(r.incumbent), incumbentAppointed: false, ffGapPct: null, turnoutWeight: 1 });
  }
  for (const r of parseCsv(read("data-entry/governor_past_results.csv"))) {
    const year = Number(r.year); if (year !== 2014 && year !== 2015) continue;
    if (stand(r.dem_candidate) || stand(r.rep_candidate) || !(num(r.dem_pct) > 2) || !(num(r.rep_pct) > 2)) continue;
    ext.push({ abbr: r.state_abbr, type: "G", race: "Governor", year, value: Number(r.margin), imputed: false, eligibility: "eligible", srcYear: null, incumbent: incOf(r.incumbent), incumbentAppointed: false, ffGapPct: null, turnoutWeight: 1 });
  }
  const hrows: PanelRow[] = [];
  for (const r of parseCsv(read("data-entry/house_past_results_pre2016/house_past_results_2012_2014.csv"))) {
    const year = Number(r.year);
    const ok = !r.note && !stand(r.dem_candidate) && !stand(r.rep_candidate) && num(r.dem_pct) > 2 && num(r.rep_pct) > 2;
    const p = cdPres[r.district_name];
    if (ok) hrows.push({ abbr: r.state_abbr, type: "H", race: `House ${r.district_name}`, district: r.district_name, year, value: Number(r.margin), imputed: false, eligibility: "eligible", srcYear: null, incumbent: incOf(r.incumbent), incumbentAppointed: false, ffGapPct: null, turnoutWeight: num(r.total_votes) });
    else if (p) hrows.push({ abbr: r.state_abbr, type: "H", race: `House ${r.district_name}`, district: r.district_name, year, value: p.margin, imputed: true, eligibility: "no-contest", srcYear: 2012, incumbent: "Open", incumbentAppointed: false, ffGapPct: null, turnoutWeight: p.votes });
  }
  for (const year of [2012, 2014]) for (const abbr of ABBRS) {
    const hs = hrows.filter((r) => r.abbr === abbr && r.year === year);
    const m = hs.length ? mean(hs.map((r) => r.turnoutWeight)) : 1;
    for (const r of hs) r.turnoutWeight = m > 0 ? r.turnoutWeight / m : 1;
  }
  ext.push(...hrows);
  panel.push(...ext);
  const cnt: Record<string, number> = {};
  for (const r of ext) cnt[`${r.year}${r.type}${r.imputed ? "i" : ""}`] = (cnt[`${r.year}${r.type}${r.imputed ? "i" : ""}`] ?? 0) + 1;
  console.log("extension rows:", JSON.stringify(cnt));
  out.extRows = cnt;
}

// ── targets: one number per state, office and year ───────────────────────────
// President / Senate / Governor: the eligible race(s). House and State Legislature: the turnout-
// weighted mean, with an imputed (uncontested) seat moved from its source year's environment to the
// target year's so the mean is one year's quantity. `stripped` removes incumbency at fixed values.
const fitAll = fitWindow(LIVE, 2026);
function target(abbr: string, type: string, year: number, stripped: boolean): number | null {
  const rows = panel.filter((r) => r.abbr === abbr && r.type === type && r.year === year && r.value != null);
  if (type === "P" || type === "S" || type === "G") {
    const el = rows.filter((r) => !r.imputed);
    return el.length ? mean(el.map((r) => r.value! + (stripped ? incPts(INC, r.type, r.incumbent, r.incumbentAppointed) : 0))) : null;
  }
  let numr = 0, den = 0, contested = 0;
  for (const r of rows) {
    const v = r.imputed ? r.value! - ((fitAll.E[r.srcYear ?? year] ?? 0) - (fitAll.E[year] ?? 0)) : r.value! + (stripped ? incPts(INC, r.type, r.incumbent, r.incumbentAppointed) : 0);
    if (!r.imputed) contested += 1;
    numr += r.turnoutWeight * v; den += r.turnoutWeight;
  }
  return den > 0 && contested > 0 ? numr / den : null;
}
const presOf = (abbr: string, year: number) => panel.find((r) => r.abbr === abbr && r.type === "P" && r.year === year)?.value ?? null;

// ── A: State TPL as locked vs 2026 ───────────────────────────────────────────
console.log("\n══ A · State TPL as locked (information through 2025) vs 2026 ══");
const stateTplLive: Record<string, number> = {};
for (const { abbr, name } of statesData) stateTplLive[abbr] = calculateStateModel(abbr, name).tpl;
const pvi = (abbr: string) => { const a = presOf(abbr, 2024), b = presOf(abbr, 2020); return a != null && b != null ? 0.75 * a + 0.25 * b : null; };
const pres3 = (abbr: string) => { const v = [2016, 2020, 2024].map((y) => presOf(abbr, y)); return v.every((x) => x != null) ? mean(v as number[]) : null; };
const statePredictors: [string, (a: string) => Maybe][] = [
  ["State TPL (locked)", (a) => stateTplLive[a]],
  ["Fitted lean (no recency)", (a) => fit0.lean[a]],
  ["2024 president alone", (a) => presOf(a, 2024)],
  ["0.75 × 2024 + 0.25 × 2020 president", pvi],
  ["Mean of 2016/2020/2024 president", pres3],
];
const A: Record<string, unknown>[] = [];
for (const [type, label] of [["S", "Senate"], ["G", "Governor"], ["H", "House (state mean)"], ["L", "State Legislature"]] as const) {
  for (const stripped of [false, true]) {
    if (type === "L" && stripped) continue;
    console.log(`\n2026 ${label}${stripped ? " — incumbency removed" : " — as counted"}`);
    for (const [pl, pf] of statePredictors) {
      const e = evaluate(ABBRS.map(pf), ABBRS.map((a) => target(a, type, 2026, stripped)));
      console.log(`  ${pl.padEnd(38)} ${fmtEv(e)}`);
      A.push({ office: label, stripped, predictor: pl, ...evOut(e) });
    }
  }
}
out.A = A;
out.states = ABBRS.map((a) => ({ abbr: a, tpl: r2(stateTplLive[a]), lean: r2(fit0.lean[a]), beta: r2(fit0.beta[a]?.shrunk), betaRaw: r2(fit0.beta[a]?.raw), p16: r2(presOf(a, 2016)), p20: r2(presOf(a, 2020)), p24: r2(presOf(a, 2024)),
  s26: r2(target(a, "S", 2026, true)), g26: r2(target(a, "G", 2026, true)), h26: r2(target(a, "H", 2026, true)), l26: r2(target(a, "L", 2026, false)) }));

// ── B: District TPL as locked vs 2026 House ──────────────────────────────────
console.log("\n══ B · District TPL as locked vs 2026 House, district by district ══");
interface DRow { id: string; code: string; abbr: string; tpl: number; pOnly: number; p16: number; p20: number; p24: number; houseRows: number; redrawn: boolean; raw: number | null; strip: number | null; inc: string; }
function districtRows(): DRow[] {
  const rows: DRow[] = [];
  for (const [id, d] of Object.entries(districtPresidentialData)) {
    const s = seats26.find((x) => x.office === "house" && x.districtId === id);
    if (!s) continue;
    const m = calculateDistrictModel(id);
    const ps = m.races.filter((r) => r.raceType === "P" && r.NM != null);
    const wsum = ps.reduce((a, r) => a + (G.YEAR_WEIGHTS[r.year] ?? 0), 0);
    rows.push({ id, code: d.code, abbr: d.state, tpl: m.tpl, pOnly: ps.reduce((a, r) => a + (G.YEAR_WEIGHTS[r.year] ?? 0) * r.NM!, 0) / wsum,
      p16: d.pres16Margin, p20: d.pres20Margin, p24: d.pres24Margin, houseRows: m.races.filter((r) => r.raceType === "H").length, redrawn: m.eraStart >= 2026,
      raw: s.eligible ? s.margin : null, strip: s.eligible ? s.margin + incPts(INC, "H", s.incumbent) : null, inc: s.incumbent });
  }
  return rows;
}
const D0 = districtRows();
const dPreds: [string, (r: DRow) => number][] = [
  ["District TPL (locked)", (r) => r.tpl],
  ["Presidential rows only (same weights)", (r) => r.pOnly],
  ["2024 president alone (2026 lines)", (r) => r.p24],
  ["0.75 × 2024 + 0.25 × 2020 president", (r) => 0.75 * r.p24 + 0.25 * r.p20],
];
const subsets: [string, (r: DRow) => boolean][] = [
  ["all contested", () => true],
  ["lines unchanged for 2026", (r) => !r.redrawn],
  ["redrawn for 2026", (r) => r.redrawn],
  ["|TPL| < 15", (r) => Math.abs(r.tpl) < 15],
  ["incumbent running", (r) => r.inc !== "Open"],
  ["open seat", (r) => r.inc === "Open"],
];
const B: Record<string, unknown>[] = [];
for (const stripped of [false, true]) for (const [sl, sf] of subsets) {
  const rows = D0.filter(sf);
  console.log(`\n${sl} — ${stripped ? "incumbency removed" : "as counted"}`);
  for (const [pl, pf] of dPreds) {
    const e = evaluate(rows.map(pf), rows.map((r) => (stripped ? r.strip : r.raw)));
    console.log(`  ${pl.padEnd(38)} ${fmtEv(e)}`);
    B.push({ subset: sl, stripped, predictor: pl, ...evOut(e) });
  }
}
out.B = B;
console.log(`redrawn for 2026: ${D0.filter((r) => r.redrawn).length} · with House rows: ${D0.filter((r) => r.houseRows > 0).length} · contested: ${D0.filter((r) => r.raw != null).length}`);

// District sweeps: change one constant in this process only, recompute all 435, restore.
const Gm = G as unknown as { BS_WEIGHT_K: number; HUBER_C: number; RACE_TYPE_WEIGHTS: Record<string, number>; YEAR_WEIGHTS: Record<number, number> };
const saved = { k: Gm.BS_WEIGHT_K, hub: Gm.HUBER_C, tw: { ...Gm.RACE_TYPE_WEIGHTS }, yw: { ...Gm.YEAR_WEIGHTS } };
const restore = () => { Gm.BS_WEIGHT_K = saved.k; Gm.HUBER_C = saved.hub; Object.assign(Gm.RACE_TYPE_WEIGHTS, saved.tw); Object.assign(Gm.YEAR_WEIGHTS, saved.yw); };
const Bsweep: Record<string, unknown>[] = [];
function dScore(label: string, group: string) {
  const rows = districtRows();
  const all = evaluate(rows.map((r) => r.tpl), rows.map((r) => r.strip));
  const stable = evaluate(rows.filter((r) => !r.redrawn).map((r) => r.tpl), rows.filter((r) => !r.redrawn).map((r) => r.strip));
  const redrawn = evaluate(rows.filter((r) => r.redrawn).map((r) => r.tpl), rows.filter((r) => r.redrawn).map((r) => r.strip));
  const close = evaluate(rows.filter((r) => Math.abs(r.p24) < 15).map((r) => r.tpl), rows.filter((r) => Math.abs(r.p24) < 15).map((r) => r.strip));
  console.log(`  ${label.padEnd(30)} all ${all?.mae.toFixed(3)} · unchanged ${stable?.mae.toFixed(3)} · redrawn ${redrawn?.mae.toFixed(3)} · |pres24|<15 ${close?.mae.toFixed(3)}`);
  Bsweep.push({ group, label, all: all?.mae, stable: stable?.mae, redrawn: redrawn?.mae, close: close?.mae });
}
console.log("\nDistrict sweeps (MAE vs incumbency-removed 2026 House margin, uniform shift removed)");
for (const h of [1e-6, 0.1, 0.2, 0.3, 0.45, 0.6, 0.9]) { Gm.RACE_TYPE_WEIGHTS.H = h; dScore(`House weight ${h} (P 0.60)`, "houseWeight"); restore(); }
for (const lam of [0.5, 0.6, 0.75, 0.87, 1]) { for (const y of G.YEARS) Gm.YEAR_WEIGHTS[y] = lam ** (2026 - y); dScore(`decay ${lam}`, "decay"); restore(); }
for (const k of [2, 5, 10, 20, 1e6]) { Gm.BS_WEIGHT_K = k; dScore(`BS_WEIGHT_K ${k === 1e6 ? "∞ (no downweight)" : k}`, "bsK"); restore(); }
for (const c of [4, 7, 12, 1e6]) { Gm.HUBER_C = c; dScore(`HUBER_C ${c === 1e6 ? "off" : c}`, "huber"); restore(); }
out.Bsweep = Bsweep;

// The district model computes a Huber factor and a boundary weight per row, but each district-year
// holds one presidential row and at most one House row, and a weighted mean of one row is that row:
// the weights cancel and never reach District TPL. Re-aggregate here with the weight applied to the
// row's TYPE weight within its year (what the state model does for a House year) to see what the
// documented behaviour would have scored, and to give BS_WEIGHT_K its first real test.
function districtAgg(id: string, o: { apply: boolean; k: number; huberC: number; hW: number }): number {
  const m = calculateDistrictModel(id);
  const rows = m.races.filter((r) => r.NM != null);
  const agg = (factor: (r: typeof rows[number]) => number) => {
    let numr = 0, den = 0;
    for (const year of new Set(rows.map((r) => r.year))) {
      let wsum = 0, v = 0;
      for (const r of rows.filter((x) => x.year === year)) { const w = (r.raceType === "P" ? 0.6 : o.hW) * factor(r); wsum += w; v += w * r.NM!; }
      if (wsum <= 0) continue;
      const yw = (G.YEAR_WEIGHTS[year] ?? 0) * wsum;
      numr += yw * (v / wsum); den += yw;
    }
    return den > 0 ? numr / den : NaN;
  };
  const lean0 = agg(() => 1);
  if (!o.apply) return lean0;
  return agg((r) => {
    const resid = Math.abs(r.NM! - lean0);
    const hub = resid <= o.huberC ? 1 : o.huberC / resid;
    const bw = r.boundaryShift == null ? 1 : 1 / (1 + (Math.abs(r.boundaryShift) / o.k) ** 2);
    return hub * bw;
  });
}
{
  const chk = D0.slice(0, 60).map((r) => Math.abs(districtAgg(r.id, { apply: false, k: 10, huberC: 7, hW: 0.2 }) - r.tpl));
  console.log(`\nDistrict weights applied (re-aggregation; reproduces the locked TPL to ${Math.max(...chk).toFixed(4)} with weights off)`);
  const Bw: Record<string, unknown>[] = [];
  const el = D0.filter((r) => r.strip != null);
  const score = (label: string, o: { apply: boolean; k: number; huberC: number; hW: number }) => {
    const p = el.map((r) => districtAgg(r.id, o));
    const all = evaluate(p, el.map((r) => r.strip));
    const rd = el.map((r, i) => [r, p[i]] as const).filter(([r]) => r.redrawn);
    const st = el.map((r, i) => [r, p[i]] as const).filter(([r]) => !r.redrawn);
    const eR = evaluate(rd.map(([, v]) => v), rd.map(([r]) => r.strip)), eS = evaluate(st.map(([, v]) => v), st.map(([r]) => r.strip));
    const moved = mean(el.map((r, i) => Math.abs(p[i] - r.tpl)));
    console.log(`  ${label.padEnd(44)} all ${all?.mae.toFixed(3)} · unchanged ${eS?.mae.toFixed(3)} · redrawn ${eR?.mae.toFixed(3)} · mean |Δ TPL| ${moved.toFixed(2)}`);
    Bw.push({ label, all: all?.mae, stable: eS?.mae, redrawn: eR?.mae, moved });
  };
  score("as locked (weights inert)", { apply: false, k: 10, huberC: 7, hW: 0.2 });
  for (const k of [3, 5, 10, 20, 40]) score(`weights applied, K ${k}, Huber 7`, { apply: true, k, huberC: 7, hW: 0.2 });
  for (const k of [5, 10, 20, 1e9]) score(`weights applied, K ${k === 1e9 ? "∞" : k}, Huber off`, { apply: true, k, huberC: 1e9, hW: 0.2 });
  score("weights applied, K ∞, Huber 7 (Huber only)", { apply: true, k: 1e9, huberC: 7, hW: 0.2 });
  for (const hW of [0.4, 0.6]) { score(`House weight ${hW}, weights inert`, { apply: false, k: 10, huberC: 7, hW }); score(`House weight ${hW}, K 10, Huber 7`, { apply: true, k: 10, huberC: 7, hW }); score(`House weight ${hW}, K 10, Huber off`, { apply: true, k: 10, huberC: 1e9, hW }); }
  out.Bweights = Bw;
}

// ── C: multi-round holdout over the window fit ───────────────────────────────
console.log("\n══ C · Multi-round holdout (fit on years ≤ Y−1, predict year Y; incumbency-removed targets) ══");
const ROUNDS = EXT ? [2016, 2018, 2020, 2022, 2024, 2026] : [2020, 2022, 2024, 2026];
const OFFICES = ["P", "S", "G", "H", "L"];
const tgtCache: Record<string, (number | null)[]> = {};
const tgt = (type: string, year: number) => (tgtCache[`${type}${year}`] ??= ABBRS.map((a) => target(a, type, year, true)));
const lastPres = (abbr: string, before: number, k = 0) => { const ys = [...new Set(panel.filter((r) => r.type === "P" && r.year < before).map((r) => r.year))].sort((a, b) => b - a); return ys[k] != null ? presOf(abbr, ys[k]) : null; };
const relTrend = (before: number): (number | null)[] => {
  const a = ABBRS.map((s) => lastPres(s, before, 0)), b = ABBRS.map((s) => lastPres(s, before, 1));
  if (a.some((x) => x == null) || b.some((x) => x == null)) return ABBRS.map(() => null);
  const ma = mean(a as number[]), mb = mean(b as number[]);
  return ABBRS.map((_, i) => (a[i]! - ma) - (b[i]! - mb));
};
type Predictor = (year: number) => (number | null)[];
const thetaPred = (t: Theta): Predictor => (year) => { const fit = fitWindow(t, year - 1); return ABBRS.map((a) => stateTpl(t, fit, a, year - 1)); };
const clone = (t: Theta, patch: Partial<Theta>): Theta => ({ ...JSON.parse(JSON.stringify(t)), ...patch });
const tw = (P: number, S: number, H: number, L: number, Gv: number) => ({ P, S, H, L, G: Gv });
const variants: [string, string, Predictor][] = [
  ["live", "Live constants", thetaPred(LIVE)],
  ["base", "Last presidential result alone", (y) => ABBRS.map((a) => lastPres(a, y))],
  ["base", "0.75 × last + 0.25 × previous president", (y) => ABBRS.map((a) => { const p = lastPres(a, y), q = lastPres(a, y, 1); return p == null ? null : q == null ? p : 0.75 * p + 0.25 * q; })],
  ["typeW", "President only (P 1.0)", thetaPred(clone(LIVE, { typeW: tw(1, 1e-6, 1e-6, 1e-6, 1e-6) }))],
  ["typeW", "P .70 / S .08 / H .12 / L .07 / G .03", thetaPred(clone(LIVE, { typeW: tw(0.7, 0.08, 0.12, 0.07, 0.03) }))],
  ["typeW", "P .45 / S .20 / H .25 / L .07 / G .03", thetaPred(clone(LIVE, { typeW: tw(0.45, 0.2, 0.25, 0.07, 0.03) }))],
  ["typeW", "P .30 / S .30 / H .30 / L .05 / G .05", thetaPred(clone(LIVE, { typeW: tw(0.3, 0.3, 0.3, 0.05, 0.05) }))],
  ["typeW", "P .40 / S .10 / H .30 / L .15 / G .05", thetaPred(clone(LIVE, { typeW: tw(0.4, 0.1, 0.3, 0.15, 0.05) }))],
  ["typeW", "No president (S .25 / H .50 / L .20 / G .05)", thetaPred(clone(LIVE, { typeW: tw(0, 0.25, 0.5, 0.2, 0.05) }))],
  ["decay", `decay ${LAMBDA_AS_SHIPPED.toFixed(2)} (the backtest tool's inverted "live")`, thetaPred(clone(LIVE, { lambda: LAMBDA_AS_SHIPPED }))],
  ["decay", "decay 0.40", thetaPred(clone(LIVE, { lambda: 0.4 }))],
  ["decay", "decay 0.50", thetaPred(clone(LIVE, { lambda: 0.5 }))],
  ["decay", "decay 0.60", thetaPred(clone(LIVE, { lambda: 0.6 }))],
  ["decay", "decay 0.87", thetaPred(clone(LIVE, { lambda: 0.87 }))],
  ["decay", "decay 1.00 (no recency)", thetaPred(clone(LIVE, { lambda: 1 }))],
  ["beta", "β = 1 everywhere (shrink 0)", thetaPred(clone(LIVE, { betaShrink: 0 }))],
  ["beta", "β unshrunk (shrink 1)", thetaPred(clone(LIVE, { betaShrink: 1 }))],
  ["huber", "Huber off", thetaPred(clone(LIVE, { huberC: 1e9 }))],
  ["huber", "Huber C 4", thetaPred(clone(LIVE, { huberC: 4 }))],
  ["strip", "No fundraising strip", thetaPred(clone(LIVE, { ffK: 0 }))],
  ["strip", "No incumbency strip", thetaPred(clone(LIVE, { inc: { H: 0, S: 0, G: 0 } }))],
  ["strip", "House incumbency 5", thetaPred(clone(LIVE, { inc: { H: 5, S: null, G: null } }))],
  ["imp", "Imputed statewide rows weight 1", thetaPred(clone(LIVE, { impW: 1 }))],
];
for (const k of [-0.5, -0.25, 0.25, 0.5]) {
  const base = thetaPred(LIVE);
  variants.push(["trend", `Live + ${k} × last presidential trend`, (y) => { const p = base(y), t = relTrend(y); return p.map((v, i) => (v == null ? null : t[i] == null ? v : v + k * t[i]!)); }]);
}
const C: Record<string, unknown>[] = [];
const header = "variant".padEnd(46) + ROUNDS.map((y) => OFFICES.map((o) => `${o}${String(y).slice(2)}`).join("    ")).join(" | ");
console.log(header);
for (const [group, label, pf] of variants) {
  const cells: Record<string, number | null> = {};
  let line = label.padEnd(46);
  for (const y of ROUNDS) {
    const p = pf(y);
    for (const o of OFFICES) {
      const e = evaluate(p, tgt(o, y));
      cells[`${o}${y}`] = e ? +e.mae.toFixed(3) : null;
      line += (e ? e.mae.toFixed(2) : "  — ").padStart(5) + " ";
    }
    line += "| ";
  }
  const core = Object.entries(cells).filter(([k, v]) => v != null && !k.startsWith("G")).map(([, v]) => v as number);
  const noP = Object.entries(cells).filter(([k, v]) => v != null && !k.startsWith("G") && !k.startsWith("P")).map(([, v]) => v as number);
  const obj = core.length ? mean(core) : null, objNoP = noP.length ? mean(noP) : null;
  console.log(line + ` obj ${obj?.toFixed(3)} · noP ${objNoP?.toFixed(3)}`);
  C.push({ group, label, cells, obj, objNoP });
}
out.C = C; out.rounds = ROUNDS;
console.log("\nLive constants, per round: slope of the target on the prediction, and uniform vs β*-scaled shift");
const Cslope: Record<string, unknown>[] = [];
for (const y of ROUNDS) {
  const fit = fitWindow(LIVE, y - 1);
  const p = ABBRS.map((a) => stateTpl(LIVE, fit, a, y - 1));
  for (const o of OFFICES) {
    const t = tgt(o, y);
    const e = evaluate(p, t);
    if (!e) continue;
    const idx = ABBRS.map((_, i) => i).filter((i) => p[i] != null && t[i] != null);
    const res = idx.map((i) => t[i]! - p[i]!), beta = idx.map((i) => fit.beta[ABBRS[i]] ?? 1);
    const ee = res.reduce((s, x, i) => s + beta[i] * x, 0) / beta.reduce((s, b) => s + b * b, 0);
    const sc = res.map((x, i) => x - beta[i] * ee); const m2 = median(sc);
    const maeBeta = mean(sc.map((x) => Math.abs(x - m2)));
    console.log(`  ${y} ${o}  n=${String(e.n).padStart(2)}  slope ${e.slope.toFixed(2)}  shift ${e.shift.toFixed(1).padStart(6)}  MAE uniform ${e.mae.toFixed(2)} · β*-scaled ${maeBeta.toFixed(2)}`);
    Cslope.push({ year: y, office: o, n: e.n, slope: r2(e.slope), shift: r2(e.shift), maeUniform: r2(e.mae), maeBeta: r2(maeBeta) });
  }
}
out.Cslope = Cslope;

// ── D: the fit with 2026 added ───────────────────────────────────────────────
console.log("\n══ D · Fit with 2026 added ══");
const fitPre = fitWindow(LIVE, 2025);
const years = Object.keys(fitAll.E).map(Number).sort();
const rowsPerYear = (y: number) => panel.filter((r) => r.year === y && !r.imputed && r.value != null).length;
console.log("year   E(≤2025)  E(≤2026)  rows");
for (const y of years) console.log(`${y}   ${(fitPre.E[y] ?? NaN).toFixed(2).padStart(7)}  ${fitAll.E[y].toFixed(2).padStart(7)}   ${rowsPerYear(y)}`);
console.log(`incumbency: ≤2025 S ${fitPre.inc.S.toFixed(2)} G ${fitPre.inc.G.toFixed(2)} · ≤2026 S ${fitAll.inc.S.toFixed(2)} G ${fitAll.inc.G.toFixed(2)}`);
const tplPre: Record<string, number | null> = {}, tplPost: Record<string, number | null> = {};
for (const a of ABBRS) { tplPre[a] = stateTpl(LIVE, fitPre, a, 2025); tplPost[a] = stateTpl(LIVE, fitAll, a, 2026); }
const moves = ABBRS.map((a) => ({ abbr: a, pre: tplPre[a]!, post: tplPost[a]!, d: tplPost[a]! - tplPre[a]!, betaPre: fitPre.beta[a], betaPost: fitAll.beta[a] }));
const medMove = median(moves.map((m) => m.d));
console.log(`State TPL with 2026 in (anchor unchanged): median move ${medMove.toFixed(2)} · mean |move − median| ${mean(moves.map((m) => Math.abs(m.d - medMove))).toFixed(2)}`);
console.log("largest relative moves:", [...moves].sort((a, b) => Math.abs(b.d - medMove) - Math.abs(a.d - medMove)).slice(0, 12).map((m) => `${m.abbr} ${(m.d - medMove >= 0 ? "+" : "") + (m.d - medMove).toFixed(1)}`).join("  "));
const bPre = ABBRS.map((a) => fitPre.beta[a]), bPost = ABBRS.map((a) => fitAll.beta[a]);
console.log(`β* ≤2025 vs ≤2026: r=${ols(bPre, bPost).r.toFixed(2)}`);
// β stability across disjoint windows: early years vs late years
const earlyMax = EXT ? 2018 : 2020;
const fitEarly = fitWindow(clone(LIVE, { betaShrink: 1 }), earlyMax);
const savedPanel = panel.splice(0, panel.length);
panel.push(...savedPanel.filter((r) => r.year > earlyMax));
const fitLate = fitWindow(clone(LIVE, { betaShrink: 1 }), 2026);
panel.splice(0, panel.length, ...savedPanel);
const bE = ABBRS.map((a) => fitEarly.beta[a]), bL = ABBRS.map((a) => fitLate.beta[a]);
const split = ols(bE, bL);
console.log(`β̂ split-half (years ≤${earlyMax} vs later, unshrunk, clamped): r=${split.r.toFixed(2)} slope=${split.slope.toFixed(2)}`);
out.D = { E: years.map((y) => ({ year: y, pre: r2(fitPre.E[y]), post: r2(fitAll.E[y]), rows: rowsPerYear(y) })), inc: { pre: fitPre.inc, post: fitAll.inc }, medMove: r2(medMove),
  moves: moves.map((m) => ({ abbr: m.abbr, pre: r2(m.pre), post: r2(m.post), rel: r2(m.d - medMove), betaPre: r2(m.betaPre), betaPost: r2(m.betaPost) })), betaR: r2(ols(bPre, bPost).r), betaSplit: { r: r2(split.r), slope: r2(split.slope), earlyMax } };

// ── E: does β* predict the 2026 swing? ───────────────────────────────────────
console.log("\n══ E · Elasticity: residual 2026 − TPL against β* ══");
const Eout: Record<string, unknown>[] = [];
function betaTest(label: string, res: number[], beta: number[]) {
  const uni = median(res);
  const maeUni = mean(res.map((x) => Math.abs(x - uni)));
  const e = res.reduce((s, x, i) => s + beta[i] * x, 0) / beta.reduce((s, b) => s + b * b, 0);
  const sc = res.map((x, i) => x - beta[i] * e);
  const m2 = median(sc);
  const maeBeta = mean(sc.map((x) => Math.abs(x - m2)));
  const o = ols(beta, res);
  console.log(`  ${label.padEnd(26)} n=${String(res.length).padStart(3)}  uniform shift MAE ${maeUni.toFixed(2)} · β*-scaled MAE ${maeBeta.toFixed(2)} · residual on β*: slope ${o.slope.toFixed(1)} r ${o.r.toFixed(2)} (a wave of ${uni.toFixed(1)} implies slope ${uni.toFixed(1)})`);
  Eout.push({ label, n: res.length, maeUniform: r2(maeUni), maeBeta: r2(maeBeta), slope: r2(o.slope), r: r2(o.r), wave: r2(uni) });
}
for (const [type, label] of [["S", "Senate"], ["G", "Governor"], ["H", "House (state mean)"], ["L", "State Legislature"]] as const) {
  const pairs = ABBRS.map((a) => [target(a, type, 2026, type !== "L"), stateTplLive[a], fit0.beta[a]?.shrunk ?? 1] as const).filter((p) => p[0] != null);
  betaTest(label, pairs.map((p) => p[0]! - p[1]), pairs.map((p) => p[2]));
}
{
  const rows = D0.filter((r) => r.strip != null);
  betaTest("House districts", rows.map((r) => r.strip! - r.tpl), rows.map((r) => fit0.beta[r.abbr]?.shrunk ?? 1));
  // and the plain lean relationship: did the swing depend on how red or blue the seat is?
  const o = ols(rows.map((r) => r.tpl), rows.map((r) => r.strip! - r.tpl));
  console.log(`  House districts: swing on TPL slope ${o.slope.toFixed(3)} per pt (r ${o.r.toFixed(2)}) — negative = Democrats gained more in redder seats`);
  (out as Record<string, unknown>).swingOnLean = { slope: +o.slope.toFixed(3), r: r2(o.r) };
}
out.E = Eout;

// ── F: trend — continue or revert? ───────────────────────────────────────────
console.log("\n══ F · Presidential trend vs the 2026 residual ══");
const Fout: Record<string, unknown>[] = [];
{
  const rows = D0.filter((r) => r.strip != null);
  const m24 = mean(rows.map((r) => r.p24)), m20 = mean(rows.map((r) => r.p20)), m16 = mean(rows.map((r) => r.p16));
  const res = rows.map((r) => r.strip! - r.tpl); const sh = median(res);
  const t1 = rows.map((r) => (r.p24 - m24) - (r.p20 - m20)), t0 = rows.map((r) => (r.p20 - m20) - (r.p16 - m16));
  for (const [label, t] of [["2020→2024 trend", t1], ["2016→2020 trend", t0]] as const) {
    const o = ols(t as number[], res.map((x) => x - sh));
    console.log(`  House districts, ${label}: residual slope ${o.slope.toFixed(2)} r ${o.r.toFixed(2)}  (positive = the trend continued beyond what TPL holds, negative = it reverted)`);
    Fout.push({ level: "district", label, slope: r2(o.slope), r: r2(o.r), n: o.n });
  }
  // against the 2024 presidential margin itself (no recency blend in the way)
  const o2 = ols(t1, rows.map((r) => r.strip! - r.p24).map((x, _, arr) => x - median(arr)));
  console.log(`  House districts, 2026 − 2024 president on the 2020→2024 trend: slope ${o2.slope.toFixed(2)} r ${o2.r.toFixed(2)}`);
  Fout.push({ level: "district", label: "2026 − 2024 president on 2020→2024 trend", slope: r2(o2.slope), r: r2(o2.r), n: o2.n });
}
for (const [type, label] of [["S", "Senate"], ["G", "Governor"], ["H", "House (state mean)"]] as const) {
  const t = relTrend(2026);
  const pairs = ABBRS.map((a, i) => [target(a, type, 2026, true), stateTplLive[a], t[i]] as const).filter((p) => p[0] != null && p[2] != null);
  const res = pairs.map((p) => p[0]! - p[1]); const sh = median(res);
  const o = ols(pairs.map((p) => p[2]!), res.map((x) => x - sh));
  console.log(`  States, ${label}: residual on 2020→2024 trend slope ${o.slope.toFixed(2)} r ${o.r.toFixed(2)} n ${o.n}`);
  Fout.push({ level: "state", label, slope: r2(o.slope), r: r2(o.r), n: o.n });
}
out.F = Fout;

// ── G: office slopes on the state's lean ─────────────────────────────────────
console.log("\n══ G · Each office's neutral margin against the state's lean (fit through 2026) ══");
const Gout: Record<string, unknown>[] = [];
for (const type of OFFICES) {
  const xs: number[] = [], ys: number[] = [];
  for (const a of ABBRS) for (const y of years) {
    const v = target(a, type, y, true);
    if (v == null || fitAll.lean[a] == null) continue;
    xs.push(fitAll.lean[a]); ys.push(v - fitAll.beta[a] * (fitAll.E[y] ?? 0));
  }
  if (xs.length < 10) continue;
  const o = ols(xs, ys);
  const res = ys.map((y, i) => y - o.intercept - o.slope * xs[i]);
  const mad = median(res.map((x) => Math.abs(x - median(res)))) * 1.4826;
  console.log(`  ${type}  n=${String(o.n).padStart(3)}  slope ${o.slope.toFixed(2)}  intercept ${o.intercept.toFixed(1)}  r ${o.r.toFixed(2)}  robust spread ${mad.toFixed(1)}`);
  Gout.push({ office: type, n: o.n, slope: r2(o.slope), intercept: r2(o.intercept), r: r2(o.r), spread: r2(mad) });
}
out.G = Gout;

if (OUT) { fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(`\nwrote ${OUT}`); }

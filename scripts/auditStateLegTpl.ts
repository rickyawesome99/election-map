/**
 * Audit of the legislative-district TPL (lib/stateLegTpl.ts) over every district: the arithmetic the model
 * claims, then plausibility. Prints counts and the first examples of each failure.
 *
 *   npx tsx --conditions=react-server scripts/auditStateLegTpl.ts
 */
import { stateLegDistricts, type Chamber } from "../data/stateLegDistricts";
import { statesData } from "../data/statesData";
import { districtRaceRows, voteMargin, type DistrictRaceRow } from "../lib/stateLegDistrictRows";
import { legDistrictModel } from "../lib/stateLegTpl";
import { calculateStateModel, getTplFit, raceTypeWeightsFor } from "../lib/tplCompute";
import { TPL_GLOBAL_CONSTANTS as G } from "../data/tplModelData";

const fails = new Map<string, string[]>();
const flag = (k: string, ex: string) => { const a = fails.get(k) ?? []; a.push(ex); fails.set(k, a); };
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;
const E = getTplFit().E;
const stateTpl = new Map(statesData.map((s) => [s.abbr, calculateStateModel(s.abbr, s.name).tpl]));
const byState = new Map<string, { num: number; den: number }>();
let districts = 0, rowsN = 0;
const officeYears = new Map<string, number>();

for (const abbr of Object.keys(stateLegDistricts).sort()) {
  for (const chamber of ["house", "senate"] as Chamber[]) {
    const roster = stateLegDistricts[abbr]?.[chamber];
    if (!roster?.length) continue;
    for (const [key, rows] of districtRaceRows(abbr, chamber, roster)) {
      const id = `${abbr} ${chamber} ${key}`;
      const m = legDistrictModel(abbr, chamber, rows);
      districts++;
      // 1. one row per office and year
      const seen = new Set<string>();
      for (const r of rows) { const k = `${r.year}-${r.office}`; if (seen.has(k)) flag("duplicate row", `${id} ${k}`); seen.add(k); }
      // 2. row arithmetic
      for (const r of m.races) {
        rowsN++;
        officeYears.set(`${r.raceType}`, (officeYears.get(r.raceType) ?? 0) + 1);
        if (r.NM == null) { flag("row without NM", `${id} ${r.year} ${r.race}`); continue; }
        if (Math.abs(r.NM) > 100) flag("|NM| > 100", `${id} ${r.year} ${r.race} ${r.NM.toFixed(1)}`);
        if (r.imputed && r.coverage === 0) {
          if (!near(r.NM, (r.adjustedMargin ?? 0) - (E[r.imputedSourceYear ?? 0] ?? 0))) flag("imputed NM ≠ pres − E(source)", `${id} ${r.year} ${r.race}`);
          if (!near(r.aggWeight, 0.5)) flag("imputed weight ≠ 0.5", `${id} ${r.year} ${r.race} ${r.aggWeight}`);
        } else if (r.raceType === "H" || r.raceType === "L") {
          const c = r.coverage, u = r.uncontestedPres;
          const mc = r.rawMargin ?? 0;
          const want = c >= 1 || !u ? mc + (r.incumbencyPts ?? 0) / Math.max(c, 1e-9) * (c >= 1 ? 1 : 1) + 0 : null;
          // full rebuild: NM = c·(mc + inc + ff − E(y)) + (1−c)·(u − E(uy)); the stored strips are already ×c
          const rebuilt = c * (mc - (E[r.year] ?? 0)) + (r.incumbencyPts ?? 0) + (r.FF_pts ?? 0) + (c < 1 && u ? (1 - c) * (u.margin - (E[u.year] ?? 0)) : 0);
          if (!near(r.NM, rebuilt, 0.05)) flag("H/L NM does not rebuild", `${id} ${r.year} ${r.race} NM ${r.NM.toFixed(2)} vs ${rebuilt.toFixed(2)} (c ${c})`);
          void want;
          if (c < 1 && c > 0 && !u) flag("partial row without uncontested part", `${id} ${r.year} ${r.race}`);
        } else {
          const rebuilt = (r.rawMargin ?? 0) + (r.incumbencyPts ?? 0) + (r.FF_pts ?? 0) - (E[r.year] ?? 0);
          if (!near(r.NM, rebuilt)) flag("statewide NM does not rebuild", `${id} ${r.year} ${r.race} NM ${r.NM.toFixed(2)} vs ${rebuilt.toFixed(2)}`);
          if (r.raceType === "P" && ((r.incumbencyPts ?? 0) !== 0 || (r.FF_pts ?? 0) !== 0)) flag("President row with strips", `${id} ${r.year}`);
        }
        if (r.incumbent === "R" && (r.incumbencyPts ?? 0) > 0) flag("R incumbent stripped toward R", `${id} ${r.year} ${r.race}`);
        if (r.incumbent === "D" && (r.incumbencyPts ?? 0) < 0) flag("D incumbent stripped toward D", `${id} ${r.year} ${r.race}`);
      }
      // 3. aggregation
      let wsum = 0, tpl = 0;
      for (const y of m.yearAggregations) {
        if (!y.racesPresent.length) continue;
        const s = Object.values(y.redistributedWeights).reduce((a, b) => a + b, 0);
        if (!near(s, 1, 1e-6)) flag("office weights ≠ 1", `${id} ${y.year} ${s}`);
        const base = raceTypeWeightsFor(y.year);
        for (const t of y.racesPresent) if (!(t in base)) flag("office not in weights", `${id} ${y.year} ${t}`);
        wsum += y.finalWeight; tpl += y.finalWeight * y.WRS;
        for (const [t, f] of Object.entries(y.typeFactors ?? {})) if (f < 1 && t !== "H" && t !== "L" && y.racesPresent.includes(t)) {
          // statewide offices carry the imputed discount as a factor, nothing else
          const rs = m.races.filter((r) => r.year === y.year && r.raceType === t);
          if (!rs.some((r) => r.imputed)) flag("statewide factor < 1 without imputation", `${id} ${y.year} ${t} ${f}`);
        }
      }
      if (m.yearAggregations.some((y) => y.racesPresent.length) && !near(wsum, 1, 1e-6)) flag("year weights ≠ 1", `${id} ${wsum}`);
      if (!near(tpl, m.tpl, 1e-6)) flag("TPL ≠ Σ weight × WRS", `${id}`);
      if (m.anchor == null) flag("no statewide anchor", id);
      if (!m.races.some((r) => r.raceType === "P")) flag("no President row", id);
      if (!Number.isFinite(m.tpl)) flag("TPL not finite", id);
      // 4. plausibility: TPL inside the range of its own rows
      const nms = m.races.map((r) => r.NM ?? 0);
      if (m.tpl < Math.min(...nms) - 0.01 || m.tpl > Math.max(...nms) + 0.01) flag("TPL outside its rows", `${id} ${m.tpl.toFixed(1)}`);
      // vote-weighted state check (house chambers, or the only chamber)
      if (chamber === "house" || !stateLegDistricts[abbr]?.house?.length) {
        const p = rows.filter((r) => r.office === "PRES").sort((a, b) => b.year - a.year)[0];
        const v = p ? p.all.dem + p.all.rep + p.all.oth : 0;
        const acc = byState.get(abbr) ?? { num: 0, den: 0 };
        acc.num += v * m.tpl; acc.den += v; byState.set(abbr, acc);
      }
      // 5. specials and rounds
      const ussRows = rows.filter((r: DistrictRaceRow) => r.office === "USSS");
      for (const r of ussRows) if (!m.races.some((x) => x.year === r.year && x.race === "Senate Special")) flag("special row with no state stub", `${id} ${r.year}`);
      void voteMargin;
    }
  }
}

console.log(`districts ${districts}, model rows ${rowsN}; by office ${JSON.stringify(Object.fromEntries(officeYears))}`);
console.log(`checks failing: ${fails.size}`);
for (const [k, ex] of [...fails].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k}: ${ex.length}  e.g. ${ex.slice(0, 4).join(" | ")}`);
const diffs = [...byState].map(([st, a]) => ({ st, d: a.num / a.den - (stateTpl.get(st) ?? 0) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
const mean = diffs.reduce((s, x) => s + x.d, 0) / diffs.length;
console.log(`vote-weighted district TPL − State TPL: mean ${mean.toFixed(2)}, largest ${diffs.slice(0, 8).map((x) => `${x.st} ${x.d.toFixed(1)}`).join(", ")}`);
console.log(`HUBER_C ${G.HUBER_C}`);

/**
 * Checks lib/stateLegDistrictRows.ts across all 99 chambers:
 *  1. district sums (all votes) against the precinct file's statewide total, per office-year;
 *  2. precinct-built President on today's lines against the era overlay (data/stateLegPresByEra.ts "current");
 *  3. legislature coverage: how much of each chamber-year sits in contested seats.
 *
 *   npx tsx --conditions=react-server scripts/checkStateLegDistrictRows.ts [ST …]
 */
import { readFileSync } from "fs";
import { join } from "path";
import { stateLegDistricts, type Chamber } from "../data/stateLegDistricts";
import { stateLegPresByEra } from "../data/stateLegPresByEra";
import { districtRaceRows, voteMargin } from "../lib/stateLegDistrictRows";
import { normalizeDistrictKey } from "../lib/stateLegDistrictKey";

const only = process.argv.slice(2).map((s) => s.toUpperCase());
const cov = JSON.parse(readFileSync(join(process.cwd(), "data", "precincts", "coverage.json"), "utf8")) as { states: Record<string, { years: Record<string, Record<string, { d?: number; r?: number; o?: number }>> }> };
const off: string[] = [];
const presDiffs: number[] = [];
const presWorst: [number, string][] = [];
const legCov: number[] = [];
let rows = 0, districts = 0, withRows = 0;
for (const abbr of Object.keys(stateLegDistricts).sort()) {
  if (only.length && !only.includes(abbr)) continue;
  for (const chamber of ["house", "senate"] as Chamber[]) {
    const roster = stateLegDistricts[abbr]?.[chamber];
    if (!roster?.length) continue;
    const byKey = districtRaceRows(abbr, chamber, roster);
    const base = new Set(roster.filter((d) => !d.overlay).map((d) => normalizeDistrictKey(d.number)));
    districts += roster.length;
    const agg = new Map<string, number>();
    for (const [key, list] of byKey) {
      withRows++;
      rows += list.length;
      for (const r of list) {
        if (base.has(key)) agg.set(`${r.year}-${r.office}`, (agg.get(`${r.year}-${r.office}`) ?? 0) + r.all.dem + r.all.rep + r.all.oth);
        if (r.office === "L" && base.has(key)) legCov.push(r.coverage);
      }
    }
    for (const [k, t] of agg) {
      const [y, o] = k.split("-");
      const fileOffice = o === "L" ? (chamber === "house" ? "SLDL" : "SLDU") : o;
      const c = cov.states[abbr]?.years[y]?.[fileOffice];
      const T = (c?.d ?? 0) + (c?.r ?? 0) + (c?.o ?? 0);
      if (T > 0 && Math.abs(t / T - 1) > 0.01) off.push(`${abbr} ${chamber} ${k}: ${(t / T).toFixed(3)}`);
    }
    // President vs the era overlay on today's lines
    const overlay = stateLegPresByEra[abbr]?.[chamber]?.current ?? {};
    const ov = new Map(Object.entries(overlay).map(([k, v]) => [normalizeDistrictKey(k), v]));
    for (const [key, list] of byKey) {
      for (const r of list) {
        if (r.office !== "PRES") continue;
        const o = ov.get(key)?.[String(r.year) as "2016" | "2020" | "2024"];
        if (!o) continue;
        const d = Math.abs(voteMargin(r.all) - o.margin);
        presDiffs.push(d);
        presWorst.push([d, `${abbr} ${chamber} ${key} ${r.year}: precinct ${voteMargin(r.all).toFixed(1)} vs overlay ${o.margin.toFixed(1)}`]);
      }
    }
  }
}
presDiffs.sort((a, b) => a - b);
presWorst.sort((a, b) => b[0] - a[0]);
legCov.sort((a, b) => a - b);
const q = (a: number[], p: number) => a[Math.floor(p * (a.length - 1))] ?? NaN;
console.log(`districts ${districts}, with rows ${withRows}, rows ${rows}`);
console.log(`totals off by >1%: ${off.length}`);
for (const l of off.slice(0, 40)) console.log("  " + l);
console.log(`President precinct vs overlay: n ${presDiffs.length}, median ${q(presDiffs, 0.5).toFixed(2)}, p90 ${q(presDiffs, 0.9).toFixed(2)}, p99 ${q(presDiffs, 0.99).toFixed(2)}`);
for (const [, l] of presWorst.slice(0, 10)) console.log("  " + l);
console.log(`Legislature coverage: n ${legCov.length}, share fully contested ${(legCov.filter((c) => c >= 0.995).length / legCov.length).toFixed(3)}, fully uncontested ${(legCov.filter((c) => c <= 0.005).length / legCov.length).toFixed(3)}, partial ${(legCov.filter((c) => c > 0.005 && c < 0.995).length / legCov.length).toFixed(3)}`);

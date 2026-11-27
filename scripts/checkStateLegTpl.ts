/**
 * Runs the legislative-district TPL (lib/stateLegTpl.ts) over every chamber and prints sanity figures:
 * timing, how TPL sits against the district's 2024 presidential margin and against the frozen 2026 lean
 * (data/forecast-final-2026 via the atlas slices), and the districts furthest from both.
 *
 *   npx tsx --conditions=react-server scripts/checkStateLegTpl.ts [ST …]
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { stateLegDistricts, type Chamber } from "../data/stateLegDistricts";
import { legChamberModels } from "../lib/stateLegTpl";
import { normalizeDistrictKey } from "../lib/stateLegDistrictKey";

const only = process.argv.slice(2).map((s) => s.toUpperCase());
const t0 = Date.now();
const vsPres: number[] = [], vsLean: number[] = [];
const worst: [number, string][] = [];
let n = 0, missing = 0;
for (const abbr of Object.keys(stateLegDistricts).sort()) {
  if (only.length && !only.includes(abbr)) continue;
  for (const chamber of ["house", "senate"] as Chamber[]) {
    const roster = stateLegDistricts[abbr]?.[chamber];
    if (!roster?.length) continue;
    const models = legChamberModels(abbr, chamber, roster);
    const slice = join(process.cwd(), "public", "state-leg-atlas", chamber, `${abbr}.json`);
    const atlas = existsSync(slice) ? (JSON.parse(readFileSync(slice, "utf8")) as { districts: { key: string; projection?: { lean: number | null }; presCurrent: { "2024"?: { margin: number } } }[] }).districts : [];
    const byKey = new Map(atlas.map((d) => [normalizeDistrictKey(d.key), d]));
    for (const d of roster) {
      const k = normalizeDistrictKey(d.number);
      const m = models.get(k);
      if (!m) { missing++; continue; }
      n++;
      const a = byKey.get(k);
      const p24 = a?.presCurrent["2024"]?.margin;
      if (p24 != null) vsPres.push(m.tpl - p24);
      const lean = a?.projection?.lean;
      if (lean != null) {
        vsLean.push(m.tpl - lean);
        worst.push([Math.abs(m.tpl - lean), `${abbr} ${chamber} ${d.number}: TPL ${m.tpl.toFixed(1)} vs frozen lean ${lean.toFixed(1)} (pres24 ${p24?.toFixed(1)})`]);
      }
    }
  }
}
const stats = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length;
  const mae = a.reduce((x, y) => x + Math.abs(y), 0) / a.length;
  return `n ${a.length}, mean ${mean.toFixed(2)}, MAE ${mae.toFixed(2)}, p10 ${s[Math.floor(0.1 * s.length)].toFixed(1)}, p90 ${s[Math.floor(0.9 * s.length)].toFixed(1)}`;
};
console.log(`districts with a TPL ${n}, without ${missing}; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`TPL − 2024 presidential margin: ${stats(vsPres)}`);
console.log(`TPL − frozen 2026 lean:         ${stats(vsLean)}`);
worst.sort((a, b) => b[0] - a[0]);
for (const [, l] of worst.slice(0, 15)) console.log("  " + l);

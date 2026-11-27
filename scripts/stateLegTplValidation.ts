/**
 * The conditional test of the legislative-district TPL (lib/stateLegTpl.ts): the legislative version of
 * scripts/forwardBacktest.ts --conditional (Validation table on the methodology pages).
 *
 * TPL is a measurement, not a forecast. Its one predictive claim is conditional: given the year's environment
 * and the race's own terms, the lean supplies the rest. Each legislative race of year Y is taken apart as
 *
 *   result = lean (built from years before Y) + environment + incumbency + money + leftover
 *
 * with the environment SUPPLIED EXACTLY (one number per year for every legislature, solved so the median
 * leftover is zero; a per-chamber variant is reported too). The figure is the mean size of the leftover. The
 * same equation is run with the district's last presidential margin before Y (on today's lines) in place of
 * TPL; for 2026 also with the frozen 2026 lean (lib/stateLegForecast.ts as published).
 *
 * Targets (clean cases only):
 *  - 2016–2025: the district's legislative row of year Y (precinct votes on today's lines) where it came from
 *    ONE seat of that year (≥ 95% of its contested votes), with both parties on the ballot (coverage ≥ 95%).
 *    Terms: that seat's incumbent sign × INCUMBENCY_PTS, raceMoneyTerm (the model's own strips).
 *  - 2026: the district's 2026 result (data-entry/results-2026 via the atlas slice), one seat, both parties,
 *    with the frozen projection's own incumbency sign and money term.
 *
 *   npx tsx --conditions=react-server scripts/stateLegTplValidation.ts [--emit] [--by-state]
 */
import fs from "fs";
import path from "path";
import { stateLegDistricts, type Chamber } from "../data/stateLegDistricts";
import { stateLegResults } from "../data/stateLegResults";
import { districtRaceRows, voteMargin } from "../lib/stateLegDistrictRows";
import { legDistrictModel } from "../lib/stateLegTpl";
import { STATE_LEG_FORECAST_CONSTANTS as LC } from "../lib/stateLegForecast";
import { raceMoneyTerm } from "../lib/stateLegMoneyModel";
import { indexByNormalizedKey, lookupByDistrictCode, normalizeDistrictKey } from "../lib/stateLegDistrictKey";

const EMIT = process.argv.includes("--emit");
// --house-strips / --no-house-strips: the U.S. House candidate-terms variant on or off (default: LEG_HOUSE_STRIPS).
const HOUSE_STRIPS = process.argv.includes("--house-strips") ? true : process.argv.includes("--no-house-strips") ? false : undefined;
type Pred = { key?: string; year: number; st: string; chamber: Chamber; actual: number; tpl: number; pres: number | null; frozen?: number | null; inc: number; money: number };
const preds: Pred[] = [];

function incumbentSign(r: { candidates?: { party: string; incumbent?: boolean }[] } | undefined): number {
  const inc = (r?.candidates ?? []).filter((c) => c.incumbent);
  const parties = new Set(inc.map((c) => c.party));
  if (parties.size !== 1) return 0;
  const p = [...parties][0];
  return p === "R" ? 1 : p === "D" ? -1 : 0;
}

type SliceDistrict = { key: string; result2026?: { margin: number | null; dem: number; rep: number; seats: number; races: { special: boolean }[] }; projection?: { lean: number | null; incSign: number; money?: { pts: number } | null } };

for (const abbr of Object.keys(stateLegDistricts).sort()) {
  for (const chamber of ["house", "senate"] as Chamber[]) {
    const roster = stateLegDistricts[abbr]?.[chamber];
    if (!roster?.length) continue;
    const byKey = districtRaceRows(abbr, chamber, roster);
    const slicePath = path.join(process.cwd(), "public", "state-leg-atlas", chamber, `${abbr}.json`);
    const slice = fs.existsSync(slicePath) ? (JSON.parse(fs.readFileSync(slicePath, "utf8")) as { districts: SliceDistrict[] }).districts : [];
    const sliceByKey = new Map(slice.map((d) => [normalizeDistrictKey(d.key), d]));
    for (const [key, rows] of byKey) {
      const presBefore = (Y: number) => rows.filter((r) => r.office === "PRES" && r.year < Y).sort((a, b) => b.year - a.year)[0];
      const leanBefore = (Y: number) => {
        const earlier = rows.filter((r) => r.year < Y);
        return earlier.some((r) => r.office === "PRES") ? legDistrictModel(abbr, chamber, earlier, { houseStrips: HOUSE_STRIPS }).tpl : null;
      };
      // 2016–2025 targets from the precinct rows
      for (const r of rows) {
        if (r.office !== "L" || r.year === 2026 || r.coverage < 0.95 || !r.seats?.length || r.seats[0].share < 0.95) continue;
        if (r.contested.dem <= 0 || r.contested.rep <= 0) continue;
        const tpl = leanBefore(r.year);
        if (tpl == null) continue;
        const districts = (stateLegResults as Record<string, Record<string, Partial<Record<Chamber, { districts: Record<string, { candidates?: { party: string; incumbent?: boolean }[] }> }>>>>)[abbr]?.[String(r.year)]?.[chamber]?.districts ?? {};
        const withKeys: Record<string, { key: string; row: { candidates?: { party: string; incumbent?: boolean }[] } }> = {};
        for (const [k, row] of Object.entries(districts)) withKeys[k] = { key: k, row };
        const index = indexByNormalizedKey(withKeys);
        const code = r.seats[0].code;
        const seat = lookupByDistrictCode(index, abbr, chamber, code) ?? lookupByDistrictCode(index, abbr, chamber, code.replace(/^0+(?=\d)/, ""));
        if (!seat) continue;
        const sign = incumbentSign(seat.row);
        const money = raceMoneyTerm(abbr, chamber, seat.key, r.year, sign, LC.MONEY_K, LC.MONEY_CAP)?.pts ?? 0;
        preds.push({ key, year: r.year, st: abbr, chamber, actual: voteMargin(r.contested), tpl, pres: presBefore(r.year) ? voteMargin(presBefore(r.year)!.all) : null, inc: LC.INCUMBENCY_PTS * sign, money });
      }
      // 2026 target from the counted results
      const d = sliceByKey.get(key);
      const res = d?.result2026;
      if (res && res.margin != null && res.seats === 1 && res.dem > 0 && res.rep > 0 && !res.races.some((x) => x.special)) {
        const tpl = leanBefore(2026);
        if (tpl != null) {
          const pr = d!.projection;
          preds.push({ year: 2026, st: abbr, chamber, actual: res.margin, tpl, pres: presBefore(2026) ? voteMargin(presBefore(2026)!.all) : null, frozen: pr?.lean ?? null, inc: LC.INCUMBENCY_PTS * (pr?.incSign ?? 0), money: pr?.money?.pts ?? 0 });
        }
      }
    }
  }
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
/** Mean leftover once the environment is supplied: one number for the group (median leftover zero). */
function solve(ps: Pred[], lean: (p: Pred) => number, terms: boolean, groupBy?: (p: Pred) => string): { mae: number; env: number } {
  const groups = new Map<string, Pred[]>();
  for (const p of ps) { const g = groupBy ? groupBy(p) : "all"; groups.set(g, [...(groups.get(g) ?? []), p]); }
  const res: number[] = [];
  let env = 0;
  for (const g of groups.values()) {
    const base = g.map((p) => p.actual - lean(p) - (terms ? p.inc + p.money : 0));
    const E = median(base);
    if (!groupBy) env = E;
    for (const b of base) res.push(b - E);
  }
  return { mae: mean(res.map(Math.abs)), env };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
type Row = { year: number; n: number; environment: number; tplAlone: number; tplFull: number; presAlone: number; presFull: number; tplFullByChamberEnv: number; presFullByChamberEnv: number; frozenFull?: number; frozenFullByChamberEnv?: number };
const out: Row[] = [];
const years = [...new Set(preds.map((p) => p.year))].sort();
console.log("── Legislative conditional test: mean leftover (pts) once the year's environment is supplied ──");
console.log("year     n   env    TPL alone  TPL+terms   pres alone  pres+terms   | per-chamber env: TPL  pres  | frozen lean+terms");
for (const Y of years) {
  const ps = preds.filter((p) => p.year === Y && p.pres != null);
  if (ps.length < 20) continue;
  const tpl = (p: Pred) => p.tpl, pres = (p: Pred) => p.pres!;
  const byChamber = (p: Pred) => `${p.st}-${p.chamber}`;
  const row: Row = {
    year: Y, n: ps.length, environment: r2(solve(ps, tpl, true).env),
    tplAlone: r2(solve(ps, tpl, false).mae), tplFull: r2(solve(ps, tpl, true).mae),
    presAlone: r2(solve(ps, pres, false).mae), presFull: r2(solve(ps, pres, true).mae),
    tplFullByChamberEnv: r2(solve(ps, tpl, true, byChamber).mae), presFullByChamberEnv: r2(solve(ps, pres, true, byChamber).mae),
  };
  const fz = ps.filter((p) => p.frozen != null);
  if (fz.length >= 20) {
    row.frozenFull = r2(solve(fz, (p) => p.frozen!, true).mae);
    row.frozenFullByChamberEnv = r2(solve(fz, (p) => p.frozen!, true, byChamber).mae);
  }
  out.push(row);
  console.log(`${Y} ${String(row.n).padStart(5)}  ${row.environment.toFixed(1).padStart(5)}   ${row.tplAlone.toFixed(2).padStart(6)}    ${row.tplFull.toFixed(2).padStart(6)}     ${row.presAlone.toFixed(2).padStart(6)}     ${row.presFull.toFixed(2).padStart(6)}    |   ${row.tplFullByChamberEnv.toFixed(2)}  ${row.presFullByChamberEnv.toFixed(2)}  | ${row.frozenFull != null ? `${row.frozenFull.toFixed(2)}, per-chamber env ${row.frozenFullByChamberEnv!.toFixed(2)} (TPL ${r2(solve(fz, (p) => p.tpl, true).mae).toFixed(2)} / ${r2(solve(fz, (p) => p.tpl, true, byChamber).mae).toFixed(2)} on the same ${fz.length})` : ""}`);
}
const n = out.reduce((s, r) => s + r.n, 0);
const w = (k: keyof Row) => r2(out.reduce((s, r) => s + (r[k] as number) * r.n, 0) / n);
const pooled = { n, years: out.length, tplAlone: w("tplAlone"), tplFull: w("tplFull"), presAlone: w("presAlone"), presFull: w("presFull"), tplFullByChamberEnv: w("tplFullByChamberEnv"), presFullByChamberEnv: w("presFullByChamberEnv"), tplBetterIn: out.filter((r) => r.tplFull < r.presFull).length };
console.log(`all ${String(n).padStart(6)}          ${pooled.tplAlone.toFixed(2)}    ${pooled.tplFull.toFixed(2)}     ${pooled.presAlone.toFixed(2)}     ${pooled.presFull.toFixed(2)}    |   ${pooled.tplFullByChamberEnv.toFixed(2)}  ${pooled.presFullByChamberEnv.toFixed(2)}   TPL lower in ${pooled.tplBetterIn} of ${out.length} years`);

if (EMIT) {
  const file = path.join(process.cwd(), "data", "stateLegTplValidation.ts");
  const body = { generatedAt: new Date().toISOString().slice(0, 10), rows: out, pooled };
  fs.writeFileSync(file, `// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegTplValidation.ts --emit\` — do not edit by hand.\n// The conditional test of the legislative-district TPL: every clean one-seat contested legislative race of each\n// year, with the lean built from earlier years only, the year's environment supplied exactly and the race's own\n// incumbency and money terms added. Each figure is the mean leftover in points; pres* run the same equation with\n// the district's last presidential margin; frozenFull (2026) with the frozen 2026 lean.\nexport const STATE_LEG_TPL_VALIDATION = ${JSON.stringify(body, null, 2)};\n`);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

if (process.argv.includes("--by-state")) {
  for (const Y of [2018, 2022, 2024]) {
    const ps = preds.filter((p) => p.year === Y);
    const E = median(ps.map((p) => p.actual - p.tpl - p.inc - p.money));
    const by = new Map<string, number[]>();
    for (const p of ps) by.set(p.st, [...(by.get(p.st) ?? []), Math.abs(p.actual - p.tpl - p.inc - p.money - E)]);
    console.log(`\n${Y} worst states (mean leftover, n):`, [...by].map(([s, a]) => [s, mean(a), a.length] as const).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([s, m, k]) => `${s} ${m.toFixed(1)} (${k})`).join(", "));
  }
}


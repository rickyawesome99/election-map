// The 2026 turnout estimate's backtest and calibration (lib/turnoutModel.ts).
//
// Run:  npx tsx --conditions=react-server scripts/turnoutBacktest.ts
//       npx tsx --conditions=react-server scripts/turnoutBacktest.ts --shrink       (grid over SHRINK_VOTES)
//       npx tsx --conditions=react-server scripts/turnoutBacktest.ts --emit         (write data/turnoutCalibration.ts for /methodology/turnout)
//
// Predicts 2022 — the top statewide race per state, its county split and every contested House
// district on the 2022 lines — from 2018 alone and the 2020 presidential vote, with the live code.
// A single basis midterm is the only honest test the data allow (the live blend needs two), so the
// state-level bias here is the 2018→2022 national swing, not a model error; the county-share and
// district errors are what the model can actually be judged on.
import fs from "node:fs";
import path from "node:path";
import { backtest, ticketEffect, runModel, projectionNational, projectionSummary, LIVE_CONFIG, SHRINK_VOTES, stateTopRace, stateLevelVotes } from "@/lib/turnoutModel";
import { cvapOf, statewideRaces, STATE_ABBRS } from "@/lib/turnout";
import { FIPS_TO_STATE } from "@/lib/fips";

const args = process.argv.slice(2);
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

function report(label: string, r: ReturnType<typeof backtest>) {
  console.log(`\n== ${label}`);
  console.log(`  state top race   n=${r.state.n}  MAPE ${pct(r.state.mape)}  bias ${pct(r.state.bias)}`);
  console.log(`  county top race  n=${r.county.n}  MAPE ${pct(r.county.mape)}  weighted ${pct(r.county.weightedMape)}  bias ${pct(r.county.bias)}`);
  console.log(`  county share     n=${r.countyShare.n}  weighted MAPE ${pct(r.countyShare.weightedMape, 2)}`);
  console.log(`  House districts  n=${r.district.n}  MAPE ${pct(r.district.mape)}  bias ${pct(r.district.bias)}`);
}

const base = backtest(2022, 2018);
report("2022 from 2018 (live constants; competitiveness uses the actual 2022 margin)", base);
report("2022 from 2018 without the competitiveness term", backtest(2022, 2018, { competitivenessSlope: 0 }));
console.log("  worst states:", base.state.rows.slice(0, 8).map((r) => `${r.state} ${r.office} ${pct(r.error)}`).join(", "));

const te = ticketEffect(2018, 2022);
console.log(`\n== ticket effect 2018→2022: others mean log-change ${te.others.toFixed(4)}; switchers:`);
for (const s of te.switchers) console.log(`  ${s.state}: ${s.from} → ${s.to}, log-change ${s.change.toFixed(4)} (excess ${(s.change - te.others).toFixed(4)})`);
console.log(`  implied House-only factor ${te.estimate.toFixed(3)} (live ${LIVE_CONFIG.houseOnlyTicketFactor})`);

// Competitiveness: does a closer top race lift turnout? Regress each state's 2018→2022 log change in
// top-race CVAP turnout on the change in the top race's absolute margin (states with a statewide race both years).
{
  const fipsOf = Object.fromEntries(Object.entries(FIPS_TO_STATE).map(([f, s]) => [s.abbr, f]));
  const xs: number[] = [], ys: number[] = [];
  for (const st of STATE_ABBRS) {
    if (st === "DC") continue;
    const pts: { m: number; rate: number }[] = [];
    for (const y of [2018, 2022]) {
      const top = stateTopRace(st, y); const lv = stateLevelVotes(st, y); const cv = cvapOf("state", fipsOf[st], y);
      if (!top || !lv || !cv) break;
      const { races, senateSpecial } = statewideRaces(st, y);
      const race = top.office === "governor" ? races.governor : [races.senate, senateSpecial].find((r) => r?.votes === top.votes) ?? races.senate;
      if (race?.margin == null) break;
      pts.push({ m: Math.abs(race.margin), rate: lv.votes / cv });
    }
    if (pts.length === 2) { xs.push(pts[1].m - pts[0].m); ys.push(Math.log(pts[1].rate / pts[0].rate)); }
  }
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const slope = sxy / sxx, r = sxy / Math.sqrt(sxx * syy);
  console.log(`\n== competitiveness 2018→2022: n=${n}, slope ${(slope * 100).toFixed(3)}% turnout per point of |margin| (r ${r.toFixed(2)}; 10 pts closer ≈ ${(-slope * 1000).toFixed(1)}% more turnout)`);
}

const grid: { k: number; countyShare: number; county: number; district: number }[] = [];
if (args.includes("--shrink") || args.includes("--emit")) {
  console.log("\n== SHRINK_VOTES grid (2022 from 2018)");
  for (const k of [0, 2000, 5000, 10000, 20000, 50000, 100000, 1e9]) {
    const r = backtest(2022, 2018, { shrinkVotes: k });
    grid.push({ k, countyShare: r.countyShare.weightedMape, county: r.county.weightedMape, district: r.district.mape });
    console.log(`  K=${k === 1e9 ? "∞ (state prior only)" : k.toLocaleString()}: county share ${pct(r.countyShare.weightedMape, 2)}  county votes ${pct(r.county.weightedMape)}  districts ${pct(r.district.mape)}`);
  }
}

const nat = projectionNational();
console.log(`\n== 2026 estimate: House votes ${nat.houseVotes.toLocaleString()} (range ${nat.low.toLocaleString()}–${nat.high.toLocaleString()}), CVAP turnout ${nat.rate}%`);
for (const b of nat.basis) console.log(`  ${b.year}: House ${b.houseVotes.toLocaleString()}, top ${b.topVotes.toLocaleString()}, CVAP ${b.cvap.toLocaleString()} (${((b.topVotes / b.cvap) * 100).toFixed(1)}% top-race turnout)`);
const run = runModel();
const sample = ["GA", "OH", "TX", "MO", "VA"];
for (const st of sample) { const l = run.levels.get(st)!; console.log(`  ${st}: rate ${l.rate?.toFixed(1)} (${Object.entries(l.rateBy).map(([y, r]) => `${y}: ${r?.toFixed(1)}`).join(", ")}) → ${Math.round(l.votes).toLocaleString()} top-race votes; factors ${JSON.stringify(l.officeFactor)}; House drop-off ${l.houseDropoff?.toFixed(3)}`); }
const summ = projectionSummary();
console.log(`  races: ${summ.length}; sample:`, summ.filter((r) => ["S-GA", "G-OH", "H-3912", "H-0512", "H-1220"].includes(r.id)).map((r) => `${r.label} ${r.votes.toLocaleString()} [${r.low.toLocaleString()}–${r.high.toLocaleString()}] prior ${r.prior?.votes?.toLocaleString() ?? "—"}`).join(" | "));

if (args.includes("--emit")) {
  const out = `// Auto-generated by scripts/turnoutBacktest.ts --emit — do not edit by hand.
// The 2026 turnout estimate's backtest (2022 predicted from 2018 and the 2020 presidential vote)
// and the SHRINK_VOTES grid, read by components/methodology/TurnoutMethodology.tsx.
export const TURNOUT_BACKTEST = ${JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    target: 2022, basis: 2018,
    state: { n: base.state.n, mape: base.state.mape, bias: base.state.bias, worst: base.state.rows.slice(0, 6) },
    noCompetitiveness: (() => { const r = backtest(2022, 2018, { competitivenessSlope: 0 }); return { state: { mape: r.state.mape, bias: r.state.bias }, district: r.district, county: r.county }; })(),
    county: base.county, countyShare: base.countyShare, district: base.district,
    ticket: { others: te.others, switchers: te.switchers, estimate: te.estimate },
    grid, liveShrink: SHRINK_VOTES,
    national: nat,
  }, null, 2)} as const;
`;
  fs.writeFileSync(path.join(process.cwd(), "data/turnoutCalibration.ts"), out);
  console.log("\nwrote data/turnoutCalibration.ts");
}

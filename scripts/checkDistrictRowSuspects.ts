/**
 * Flags district race rows (lib/stateLegDistrictRows.ts) that sit far from the same district's other results,
 * the usual sign of precinct votes placed in the wrong place (a seat's votes spread over another seat's
 * precincts) though also of real crossover races (Baker, Scott, Manchin) and strong incumbents.
 *  - Legislature: > 40 pts from the mean of the same year's other contested races in the district.
 *  - Statewide / U.S. House: > 35 pts from the district's two nearest presidential results.
 * Prints the share and the state-years with most flags; --list ST prints every flagged row for one state.
 *
 *   npx tsx --conditions=react-server scripts/checkDistrictRowSuspects.ts [--list ST]
 */
import { stateLegDistricts, type Chamber } from "../data/stateLegDistricts";
import { districtRaceRows, voteMargin } from "../lib/stateLegDistrictRows";

const li = process.argv.indexOf("--list");
const LIST = li > 0 ? process.argv[li + 1]?.toUpperCase() : null;
type Tally = { n: number; bad: number };
const leg = new Map<string, Tally>(), sw = new Map<string, Tally>();
const bump = (m: Map<string, Tally>, k: string, bad: boolean) => { const e = m.get(k) ?? { n: 0, bad: 0 }; e.n++; if (bad) e.bad++; m.set(k, e); };

for (const abbr of Object.keys(stateLegDistricts).sort()) {
  for (const chamber of ["house", "senate"] as Chamber[]) {
    const roster = stateLegDistricts[abbr]?.[chamber];
    if (!roster?.length) continue;
    const firstChamber = chamber === "house" || !stateLegDistricts[abbr]?.house?.length;  // statewide rows once per state
    for (const [key, rows] of districtRaceRows(abbr, chamber, roster)) {
      const pres = rows.filter((r) => r.office === "PRES");
      for (const r of rows) {
        if (r.coverage < 0.95 || r.sameParty || r.office === "PRES") continue;
        if (r.office === "L") {
          const others = rows.filter((x) => x.year === r.year && x.office !== "L" && x.coverage >= 0.95 && !x.sameParty);
          if (!others.length) continue;
          const ref = others.reduce((s, x) => s + voteMargin(x.contested), 0) / others.length;
          const bad = Math.abs(voteMargin(r.contested) - ref) > 40;
          bump(leg, `${abbr} ${r.year} ${chamber}`, bad);
          if (bad && LIST === abbr) console.log(`  L ${abbr} ${chamber} ${key} ${r.year}: ${voteMargin(r.contested).toFixed(1)} vs other races ${ref.toFixed(1)}`);
        } else if (firstChamber) {
          const near = [...pres].sort((a, b) => Math.abs(a.year - r.year) - Math.abs(b.year - r.year)).slice(0, 2);
          if (!near.length) continue;
          const ref = near.reduce((s, x) => s + voteMargin(x.all), 0) / near.length;
          const bad = Math.abs(voteMargin(r.contested) - ref) > 35;
          bump(sw, `${abbr} ${r.year} ${r.office}`, bad);
          if (bad && LIST === abbr) console.log(`  ${r.office} ${abbr} ${key} ${r.year}: ${voteMargin(r.contested).toFixed(1)} vs presidential ${ref.toFixed(1)}`);
        }
      }
    }
  }
}
for (const [label, m] of [["Legislature (>40 pts)", leg], ["Statewide / U.S. House (>35 pts)", sw]] as const) {
  const t = [...m.values()].reduce((a, e) => ({ n: a.n + e.n, bad: a.bad + e.bad }), { n: 0, bad: 0 });
  console.log(`${label}: ${t.bad} of ${t.n} rows (${((100 * t.bad) / t.n).toFixed(1)}%)`);
  console.log("  " + [...m].filter(([, e]) => e.bad >= 3).sort((a, b) => b[1].bad / b[1].n - a[1].bad / a[1].n).slice(0, 20).map(([k, e]) => `${k}: ${e.bad}/${e.n}`).join("; "));
}

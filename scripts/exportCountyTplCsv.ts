// County TPL for every county on file as one reference spreadsheet: data-entry/county_tpl.csv.
// TPL is R-positive (negative = Democratic), as everywhere in the model.
// Run:  npm run export:county-tpl

import { writeFileSync } from "fs";
import { join } from "path";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { statesData } from "@/data/statesData";
import { calculateCountyModel, calculateStateTpl } from "@/lib/tplCompute";

const label = (m: number) => `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`;
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const stateNames = new Map(statesData.map((s) => [s.abbr, s.name]));
const stateTpl = new Map<string, number>();

const rows = Object.entries(countyPresidentialData)
  .sort(([a, ca], [b, cb]) => ca.state.localeCompare(cb.state) || a.localeCompare(b))
  .map(([fips, county]) => {
    const stateName = stateNames.get(county.state) ?? county.state;
    if (!stateTpl.has(county.state)) stateTpl.set(county.state, calculateStateTpl(county.state, stateName));
    const calc = calculateCountyModel(fips);
    const tpl = calc && calc.yearAggregations.length > 0 ? calc.tpl : null;
    return {
      fips,
      state_fips: fips.slice(0, 2),
      county_fips: fips.slice(2),
      state_abbr: county.state,
      state_name: stateName,
      county_name: county.countyName,
      county_tpl: tpl == null ? "" : tpl.toFixed(2),
      county_tpl_label: tpl == null ? "" : label(tpl),
      state_tpl: stateTpl.get(county.state)!.toFixed(2),
      races_counted: calc ? calc.races.filter((r) => r.inAggregation && r.NM != null).length : 0,
    };
  });

const header = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
const out = join(process.cwd(), "data-entry", "county_tpl.csv");
writeFileSync(out, [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n");
console.log(`${rows.length} counties → data-entry/county_tpl.csv`);

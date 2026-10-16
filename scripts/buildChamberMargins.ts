// Corrected state legislative chamber margins for every state → data/generated/chamber-margins.json
// (gitignored; read by lib/chamberMargins.ts for the State TPL and the chamber summaries).
//
// Runs before every `next build` and `next dev` (npm's prebuild / predev hooks, ahead of the
// forecast history, which needs it), or by hand after the state-leg results or pres-by-era data
// change:
//   npx tsx --conditions=react-server scripts/buildChamberMargins.ts
//
// The numbers are lib/stateLegChamberMargin.ts's getChamberMargins, unchanged: this only moves the
// 20 MB of source behind them out of the server bundles. --check verifies the file on disk against
// the live computation and exits 1 on any difference.

import fs from "node:fs";
import path from "node:path";
import { statesData } from "@/data/statesData";
import { getChamberMargins, type ChamberMarginYear } from "@/lib/stateLegChamberMargin";
import type { ChamberMarginsFile } from "@/lib/chamberMargins";

const OUT = path.join(process.cwd(), "data", "generated", "chamber-margins.json");

const states: Record<string, Record<number, ChamberMarginYear>> = {};
for (const s of statesData) states[s.abbr] = getChamberMargins(s.abbr);

if (process.argv.includes("--check")) {
  const onDisk = JSON.parse(fs.readFileSync(OUT, "utf8")) as ChamberMarginsFile;
  let bad = 0;
  for (const abbr of Object.keys(states)) {
    // Same JSON round trip on both sides: undefined fields drop, numeric keys become strings.
    if (JSON.stringify(JSON.parse(JSON.stringify(states[abbr]))) !== JSON.stringify(onDisk.states[abbr])) { bad++; console.log(`  differs: ${abbr}`); }
  }
  console.log(bad ? `Chamber margins: ${bad} state(s) differ from ${OUT}` : `Chamber margins: ${Object.keys(states).length} states match ${OUT}`);
  process.exit(bad ? 1 : 0);
}

const file: ChamberMarginsFile = { generatedAt: new Date().toISOString(), states };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(file));
const years = Object.values(states).reduce((n, s) => n + Object.keys(s).length, 0);
console.log(`Chamber margins: ${Object.keys(states).length} states, ${years} chamber-years → ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);

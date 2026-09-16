#!/usr/bin/env node
/**
 * NATIONAL ENVIRONMENT HISTORY — CSV → TypeScript build script
 *
 *   1. Edit data-entry/national_environment_history.csv
 *      (year, gb_mid_sept, gb_final, approval_net_mid_sept, approval_net_final,
 *       president_party, house_pv_margin, notes — generic-ballot and vote margins are
 *       R-positive; approval is approve − disapprove)
 *   2. Run:  node data-entry/build-national-environment.js
 *   3. data/nationalEnvironmentHistory.ts is regenerated
 *
 * Feeds the forward model's environment conversion (lib/tplCompute.ts
 * getEnvironmentModel) and the forward backtest (scripts/forwardBacktest.ts).
 */

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "national_environment_history.csv");
const OUT = path.join(__dirname, "../data/nationalEnvironmentHistory.ts");

function splitCSVLine(line) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const lines = fs.readFileSync(SRC, "utf8").trim().split(/\r?\n/);
const headers = splitCSVLine(lines[0]);
const rows = lines.slice(1).filter((l) => l.trim()).map((line) => {
  const v = splitCSVLine(line); const r = {};
  headers.forEach((h, i) => { r[h] = (v[i] ?? "").trim(); });
  return r;
});

const num = (x) => { const n = parseFloat(x); return Number.isFinite(n) ? n : null; };
const entries = rows.map((r) => ({
  year: parseInt(r.year, 10),
  gbMidSept: num(r.gb_mid_sept),
  gbFinal: num(r.gb_final),
  approvalMidSept: num(r.approval_net_mid_sept),
  approvalFinal: num(r.approval_net_final),
  presidentParty: r.president_party,
  housePv: num(r.house_pv_margin),
  notes: r.notes,
})).filter((e) => Number.isFinite(e.year)).sort((a, b) => a.year - b.year);

const ts = `// ⚠️  AUTO-GENERATED — do not edit by hand.
// Edit data-entry/national_environment_history.csv, then run:
//   node data-entry/build-national-environment.js
//
// One row per election year. Margins are R-positive (negative = Democratic lead);
// approval is net (approve − disapprove) for the sitting president.

export type NationalEnvironmentYear = {
  year: number;
  gbMidSept: number | null;      // generic ballot average around September 15
  gbFinal: number | null;        // election-eve generic ballot average
  approvalMidSept: number | null;
  approvalFinal: number | null;
  presidentParty: "D" | "R";
  housePv: number | null;        // actual national House popular-vote margin
  notes: string;
};

export const nationalEnvironmentHistory: NationalEnvironmentYear[] = ${JSON.stringify(entries, null, 2)};
`;
fs.writeFileSync(OUT, ts);
console.log(`✓ wrote ${entries.length} years to data/nationalEnvironmentHistory.ts`);

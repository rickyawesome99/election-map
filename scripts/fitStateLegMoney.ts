// Fits a state's legislative money rule for the precinct-district projections
// (lib/precinctDistrict/project.ts) from candidate-committee receipts and district results.
//
//   npx tsx scripts/fitStateLegMoney.ts OH
//
// Inputs
//   data-entry/state-leg-finance/{ST}-house-*.csv   general-election nominees' cycle receipts (Transparency USA,
//                                                    which republishes the state filings; in-kind included)
//   data-entry/state-leg-results/{ST}-{year}.json   the legislative race result per district
//   data/stateLegPres2024.ts                        2024 President by legislative district
// The fit year is the one year with both a presidential baseline by district and receipts: 2024.
//
// Model (the site's residual money basis, re-fitted on the state's own races)
//   structural gap% = a + b × incSign + c × pres margin          what a generic pair in this seat raises
//   residual gap%   = gap% − structural gap%
//   margin          = α + β × pres margin + γ × incSign + K × residual gap%
// K is the OLS coefficient rounded to 0.01; the leave-one-out MAE grid is written beside it so the
// choice can be checked. Output: data/precinct-districts/money/{ST}.json.

import fs from "fs";
import path from "path";
import { stateLegPres2024 } from "@/data/stateLegPres2024";

const ST = (process.argv[2] ?? "").toUpperCase();
if (!ST) throw new Error("usage: fitStateLegMoney.ts <STATE>");
const YEAR = 2024;
const CAP = 3; // same as the congressional House cap (FORECAST_CONSTANTS.MONEY_CAP.H)

const financeFile = fs.readdirSync("data-entry/state-leg-finance").find((f) => f.startsWith(`${ST}-house-`));
if (!financeFile) throw new Error(`no data-entry/state-leg-finance/${ST}-house-*.csv`);

// minimal CSV reader (quoted fields)
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const split = (l: string) => { const out: string[] = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

const finance = parseCsv(fs.readFileSync(path.join("data-entry/state-leg-finance", financeFile), "utf8"))
  .filter((r) => Number(r.cycle) === YEAR && r.election.startsWith("General"));
const results = JSON.parse(fs.readFileSync(`data-entry/state-leg-results/${ST}-${YEAR}.json`, "utf8")).house.districts as Record<string, { demVotes: number; repVotes: number }>;
const pres = stateLegPres2024[ST]?.house ?? {};

interface Race { district: string; y: number; pres: number; inc: number; gap: number }
const races: Race[] = [];
const byDistrict = new Map<string, Record<string, string>[]>();
for (const r of finance) byDistrict.set(r.district, [...(byDistrict.get(r.district) ?? []), r]);
for (const [district, rows] of byDistrict) {
  const d = rows.filter((r) => r.party.startsWith("Dem")), rp = rows.filter((r) => r.party.startsWith("Rep"));
  const v = results[district], p = pres[district];
  if (d.length !== 1 || rp.length !== 1 || !v || !p || !v.demVotes || !v.repVotes || p.demVotes == null || p.repVotes == null) continue;   // contested D-vs-R only
  const dm = Number(d[0].contributions) || 0, rm = Number(rp[0].contributions) || 0;
  if (dm + rm <= 0) continue;
  races.push({
    district,
    y: ((v.repVotes - v.demVotes) / (v.repVotes + v.demVotes)) * 100,
    pres: ((p.repVotes - p.demVotes) / (p.repVotes + p.demVotes)) * 100,
    inc: (rp[0].incumbent === "True" ? 1 : 0) - (d[0].incumbent === "True" ? 1 : 0),
    gap: ((rm - dm) / (rm + dm)) * 100,
  });
}

// OLS via normal equations
function ols(X: number[][], y: number[]): { b: number[]; se: number[]; rmse: number } {
  const k = X[0].length, n = y.length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const inv = invert(A);
  const Xty = Array.from({ length: k }, (_, i) => X.reduce((s, r, t) => s + r[i] * y[t], 0));
  const b = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const res = y.map((v, t) => v - X[t].reduce((s, x, j) => s + x * b[j], 0));
  const ss = res.reduce((s, r) => s + r * r, 0);
  return { b, se: inv.map((row, i) => Math.sqrt((ss / (n - k)) * row[i])), rmse: Math.sqrt(ss / n) };
}
function invert(M: number[][]): number[][] {
  const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => r.slice(n));
}

const structuralOf = (rs: Race[]) => ols(rs.map((r) => [1, r.inc, r.pres]), rs.map((r) => r.gap)).b;
const [a, b, c] = structuralOf(races);
const resid = (r: Race, s: number[]) => r.gap - (s[0] + s[1] * r.inc + s[2] * r.pres);

const noMoney = ols(races.map((r) => [1, r.pres, r.inc]), races.map((r) => r.y));
const withMoney = ols(races.map((r) => [1, r.pres, r.inc, resid(r, [a, b, c])]), races.map((r) => r.y));
const K = Math.round(withMoney.b[3] * 100) / 100;

// leave-one-out MAE for a fixed K with the cap applied (structural model and baseline refitted
// without the held-out race)
const pts = (k: number, r: number) => Math.max(-CAP, Math.min(CAP, k * r));
function looMae(k: number): number {
  let err = 0;
  races.forEach((held, i) => {
    const train = races.filter((_, j) => j !== i);
    const s = structuralOf(train);
    const base = ols(train.map((r) => [1, r.pres, r.inc]), train.map((r) => r.y - pts(k, resid(r, s)))).b;
    const pred = base[0] + base[1] * held.pres + base[2] * held.inc + pts(k, resid(held, s));
    err += Math.abs(pred - held.y);
  });
  return err / races.length;
}
const grid = [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12].map((k) => ({ k, looMae: Math.round(looMae(k) * 1000) / 1000 }));

const out = {
  state: ST, chamber: "house", fitYear: YEAR, n: races.length,
  source: `data-entry/state-leg-finance/${financeFile} (Transparency USA, gross receipts incl. in-kind) · data-entry/state-leg-results/${ST}-${YEAR}.json · data/stateLegPres2024.ts`,
  structural: { intercept: a, incSign: b, pres: c },
  K, kOls: withMoney.b[3], kSe: withMoney.se[3], CAP,
  rmse: { noMoney: noMoney.rmse, withMoney: withMoney.rmse },
  looGrid: grid,
  fitted: new Date().toISOString().slice(0, 10),
};
fs.mkdirSync("data/precinct-districts/money", { recursive: true });
fs.writeFileSync(`data/precinct-districts/money/${ST}.json`, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));

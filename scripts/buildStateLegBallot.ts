// Every office a state legislative seat voted on, by year, on the lines the seat was RUN on:
// data/generated/state-leg-ballot.json.
//
//   npm run state-leg-ballot       (part of predev / prebuild, before candidate-pages; a few seconds)
//
// The legislative twin of scripts/buildDistrictBallot.ts, and the baseline of legislative WAR
// (lib/stateLegWar.ts). Reads the precinct results (public/precincts/results/{ST}/{year}.json: one
// [D, R, other] triple per precinct and office) and sums them to the seats of each chamber AS
// LABELLED IN THAT YEAR'S FILE (`districts.SLDL` / `districts.SLDU`: the seat that carried the
// precinct's legislative votes), so a 2018 race is compared with what its own 2018 voters did
// on the rest of their ballot, whatever the lines are today.
//
// Per seat and year:
//   P, S, G   President, the regular Senate race, governor: margin and total votes.
//   H         U.S. House. The part of the seat inside a contested congressional district counts as
//             cast; the rest is filled with its presidential margin plus the gap the state's
//             contested House precincts ran from their own presidential margin that year.
//   O         The OTHER chamber of the legislature, filled the same way (contested seats as cast,
//             the rest presidential margin + the chamber's contested gap). A chamber placed mostly
//             by spreading (coverage `matched` under LEG_MIN_MATCHED) or with fewer than
//             LEG_MIN_CONTESTED contested seats is left out.
//   L         The seat's own race as summed from precincts: [margin, total, D, R]. Not part of the
//             baseline: it is the check that these precincts really are the seat (against the
//             certified result) and the key that matches a precinct seat code to the site's seat.
//   pres      The 2016 / 2020 / 2024 presidential vote on the same precincts: the second check,
//             against the site's presidential result on that map.
//
// A seat is CONTESTED when both major parties have at least CONTESTED_MIN_SHARE of its two-party
// vote. The presidential reference of a year is that election in a presidential year, both
// neighbours summed in a midterm, and the nearest one in an odd year. Margins are R − D in points
// of the total vote. A precinct belongs to the one seat its label names; a precinct split between
// two seats is counted whole in that one.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CONTESTED_MIN_SHARE = 0.05;
export const LEG_MIN_CONTESTED = 3;
export const LEG_MIN_MATCHED = 0.6;
const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const PRES_REFERENCE: Record<number, number[]> = { 2016: [2016], 2017: [2016], 2018: [2016, 2020], 2019: [2020], 2020: [2020], 2021: [2020], 2022: [2020, 2024], 2023: [2024], 2024: [2024], 2025: [2024], 2026: [2024] };
const CHAMBERS = { house: "SLDL", senate: "SLDU" } as const;

type Triple = [number, number, number];
type PrecinctFile = { n: number; offices: Record<string, (number[] | null)[]>; districts?: Record<string, (string | null)[]> };
/** [margin, total votes] */
type Office = [number, number];
/** [filled margin, share of the seat's turnout inside contested districts] */
type Filled = [number, number];
export interface SeatBallot { P?: Office; S?: Office; G?: Office; H?: Filled; O?: Filled; L?: [number, number, number, number]; pres?: Record<string, Office> }

const ROOT = join(process.cwd(), "public", "precincts", "results");
const coverage = JSON.parse(readFileSync(join(process.cwd(), "data", "precincts", "coverage.json"), "utf8")) as { states: Record<string, { years: Record<string, Record<string, { matched?: number }>> }> };
const matchedShare = (st: string, year: number, office: string): number | null => coverage.states[st]?.years?.[String(year)]?.[office]?.matched ?? null;
const cache = new Map<string, PrecinctFile | null>();
function load(st: string, year: number): PrecinctFile | null {
  const key = `${st}|${year}`;
  if (!cache.has(key)) {
    const path = join(ROOT, st, `${year}.json`);
    cache.set(key, existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as PrecinctFile) : null);
  }
  return cache.get(key)!;
}
const triple = (v: number[] | null | undefined): Triple => (v ? [v[0] || 0, v[1] || 0, v[2] || 0] : [0, 0, 0]);
const add = (a: Triple, b: Triple) => { a[0] += b[0]; a[1] += b[1]; a[2] += b[2]; };
const total = (t: Triple) => t[0] + t[1] + t[2];
const margin = (t: Triple) => ((t[1] - t[0]) / total(t)) * 100;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const bump = <K>(m: Map<K, Triple>, k: K, v: Triple) => add(m.get(k) ?? m.set(k, [0, 0, 0]).get(k)!, v);

/** A districted office (U.S. House, or a legislative chamber) as a per-precinct filled margin: which
 *  precincts sit in a contested district, and the gap contested precincts ran from their presidential vote. */
function filler(file: PrecinctFile, office: string, pres: Triple[], minContested: number): { contested: (i: number) => boolean; gap: number; rows: (number[] | null)[] } | null {
  const rows = file.offices[office], labels = file.districts?.[office];
  if (!rows || !labels) return null;
  const seat = new Map<string, Triple>();
  for (let i = 0; i < file.n; i += 1) if (labels[i] && rows[i]) bump(seat, labels[i]!, triple(rows[i]));
  const contestedSeats = new Set([...seat].filter(([, [d, r]]) => d + r > 0 && Math.min(d, r) / (d + r) >= CONTESTED_MIN_SHARE).map(([k]) => k));
  if (contestedSeats.size < minContested) return null;
  const contested = (i: number) => !!labels[i] && contestedSeats.has(labels[i]!) && total(triple(rows[i])) > 0 && total(pres[i]) > 0;
  const own: Triple = [0, 0, 0], ref: Triple = [0, 0, 0];
  for (let i = 0; i < file.n; i += 1) if (contested(i)) { add(own, triple(rows[i])); add(ref, pres[i]); }
  if (total(own) <= 0 || total(ref) <= 0) return null;
  return { contested, gap: margin(own) - margin(ref), rows };
}

function build(st: string, year: number, office: string, other: string | null): Record<string, SeatBallot> | null {
  const file = load(st, year);
  const labels = file?.districts?.[office];
  if (!file || !labels || !file.offices[office]) return null;
  const n = file.n;
  const out: Record<string, SeatBallot> = {};
  const entry = (k: string) => (out[k] ??= {});

  for (const [src, field] of [["PRES", "P"], ["USS", "S"], ["GOV", "G"]] as const) {
    const rows = file.offices[src];
    if (!rows) continue;
    const sums = new Map<string, Triple>();
    for (let i = 0; i < n; i += 1) if (labels[i] && rows[i]) bump(sums, labels[i]!, triple(rows[i]));
    for (const [k, t] of sums) if (total(t) > 0) entry(k)[field] = [round(margin(t)), total(t)];
  }
  {
    const rows = file.offices[office];
    const sums = new Map<string, Triple>();
    for (let i = 0; i < n; i += 1) if (labels[i] && rows[i]) bump(sums, labels[i]!, triple(rows[i]));
    for (const [k, t] of sums) if (total(t) > 0) entry(k).L = [round(margin(t)), total(t), t[0], t[1]];
  }
  for (const presYear of [2016, 2020, 2024]) {
    const rows = load(st, presYear)?.offices.PRES;
    if (!rows || rows.length !== n) continue;
    const sums = new Map<string, Triple>();
    for (let i = 0; i < n; i += 1) if (labels[i] && rows[i]) bump(sums, labels[i]!, triple(rows[i]));
    for (const [k, t] of sums) if (total(t) > 0) (entry(k).pres ??= {})[presYear] = [round(margin(t)), total(t)];
  }

  // The presidential vote each precinct is compared with.
  const pres: Triple[] = Array.from({ length: n }, () => [0, 0, 0] as Triple);
  for (const refYear of PRES_REFERENCE[year] ?? []) {
    const rows = load(st, refYear)?.offices.PRES;
    if (rows && rows.length === n) for (let i = 0; i < n; i += 1) add(pres[i], triple(rows[i]));
  }
  const fills: ["H" | "O", ReturnType<typeof filler>][] = [["H", filler(file, "USH", pres, 1)]];
  if (other) {
    const matched = matchedShare(st, year, other);
    if (matched == null || matched >= LEG_MIN_MATCHED) fills.push(["O", filler(file, other, pres, LEG_MIN_CONTESTED)]);
  }
  for (const [field, f] of fills) {
    if (!f) continue;
    const per = new Map<string, { own: Triple; presIn: Triple; presOut: Triple }>();
    for (let i = 0; i < n; i += 1) {
      const k = labels[i];
      if (!k) continue;
      const e = per.get(k) ?? per.set(k, { own: [0, 0, 0], presIn: [0, 0, 0], presOut: [0, 0, 0] }).get(k)!;
      if (f.contested(i)) { add(e.own, triple(f.rows[i])); add(e.presIn, pres[i]); } else add(e.presOut, pres[i]);
    }
    for (const [k, e] of per) {
      const wIn = total(e.presIn), wOut = total(e.presOut);
      if (wIn + wOut <= 0) continue;
      const mIn = total(e.own) > 0 ? margin(e.own) : 0, mOut = wOut > 0 ? margin(e.presOut) + f.gap : 0;
      entry(k)[field] = [round((wIn * mIn + wOut * mOut) / (wIn + wOut)), round(wIn / (wIn + wOut), 3)];
    }
  }
  return out;
}

const states = readdirSync(ROOT).filter((d) => /^[A-Z]{2}$/.test(d)).sort();
const seats: Record<string, Record<string, Record<string, Record<string, SeatBallot>>>> = {};
const counts: Record<number, number> = {};
for (const year of YEARS) {
  counts[year] = 0;
  for (const st of states) {
    for (const [chamber, office] of Object.entries(CHAMBERS)) {
      const other = office === "SLDL" ? "SLDU" : "SLDL";
      const r = build(st, year, office, load(st, year)?.offices[other] ? other : null);
      if (!r || Object.keys(r).length === 0) continue;
      (((seats[year] ??= {})[st] ??= {})[chamber]) = r;
      counts[year] += Object.keys(r).length;
    }
  }
}
const outDir = join(process.cwd(), "data", "generated");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "state-leg-ballot.json"), JSON.stringify({ built: new Date().toISOString().slice(0, 10), contestedMinShare: CONTESTED_MIN_SHARE, legMinContested: LEG_MIN_CONTESTED, legMinMatched: LEG_MIN_MATCHED, seats }));
console.log(`State-leg ballot: ${YEARS.map((y) => `${y} ${counts[y]}`).join(" · ")} seats → data/generated/state-leg-ballot.json`);

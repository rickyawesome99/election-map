// Every office a congressional district voted on, by year: data/generated/district-ballot.json.
//
//   npm run district-ballot        (part of predev / prebuild; a few seconds)
//
// Reads the precinct results (public/precincts/results/{ST}/{year}.json: one [D, R, other] triple
// per precinct and office, on each state's 2024 precinct layer) and sums them to congressional
// districts, for the even years 2016 on. Two sets of lines:
//
//   run   the House districts of THAT year (each precinct's `districts.USH` in that year's file),
//         so the figures sit on the turf the year's House race was run on. House WAR reads these.
//   now   the 2024 House districts for every year (the 2024 file's `districts.USH`), so one piece
//         of ground can be followed through time. In a state that has not redrawn since 2024 these
//         are today's lines.
//
// Per district and year: President, Senate and governor margins with their totals, the House
// margin as summed from precincts (a check against the certified result: a district whose precinct
// sum is off was mapped wrongly), and the state legislature.
//
// THE LEGISLATURE. A congressional district covers pieces of many legislative districts, some of
// them uncontested and, in a staggered senate, some not up at all. Per chamber:
//   · a legislative district is CONTESTED when both major parties have at least
//     LEG_CONTESTED_MIN_SHARE of its two-party vote (below that the "opponent" is stray votes);
//   · the contested precincts inside the congressional district give its legislative margin;
//   · every other precinct is filled with its presidential margin plus the GAP the state's
//     contested precincts ran from their own presidential margin that year, the rule the State
//     Legislature row of State TPL uses for unopposed and not-up seats;
//   · the two are weighted by presidential turnout; a chamber with fewer than LEG_MIN_CONTESTED
//     contested districts in the state has no gap and is left out.
// The presidential margin is the same election's in a presidential year and both neighbours summed
// in a midterm (2018 = 2016 + 2020). The chambers are averaged. `legContested` is the share of
// the district's turnout that sits in contested legislative seats.
//
// Margins are R − D in points of the total vote, as everywhere in the model. A precinct belongs to
// the one district that carried its House votes, so a precinct split between two districts is
// counted whole in one of them.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LEG_CONTESTED_MIN_SHARE = 0.05;
export const LEG_MIN_CONTESTED = 3;
/** A legislative chamber is used only where at least this share of its votes was matched to a real precinct. */
export const LEG_MIN_MATCHED = 0.6;
const YEARS = [2016, 2018, 2020, 2022, 2024, 2026];
const PRES_REFERENCE: Record<number, number[]> = { 2016: [2016], 2018: [2016, 2020], 2020: [2020], 2022: [2020, 2024], 2024: [2024], 2026: [2024] };
const NOW_LINES_YEAR = 2024;

type Triple = [number, number, number];
type PrecinctFile = { n: number; offices: Record<string, (number[] | null)[]>; districts?: Record<string, (string | null)[]> };
/** [margin, total votes] */
type Office = [number, number];
export interface DistrictBallotEntry { P?: Office; S?: Office; G?: Office; H?: Office; L?: number; legContested?: number; chambers?: number;
  /** The 2016, 2020 and 2024 presidential vote summed on these lines: checked against the site's own
   *  district presidential results to confirm the precincts really are this district. */
  pres?: Record<string, Office> }

const ROOT = join(process.cwd(), "public", "precincts", "results");
// data/precincts/coverage.json records, per state, year and office, the share of votes that reached
// a precinct through a real precinct match ("matched"); the rest were spread inside their county.
// A chamber placed mostly by spreading has the right state total and the wrong precinct pattern.
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
/** "04" → "4"; an at-large seat ("AL", "00", "0") → "1". */
const districtKey = (k: string | null | undefined): string | null => {
  if (!k) return null;
  if (k === "AL" || /^0+$/.test(k)) return "1";
  const n = parseInt(k, 10);
  return Number.isFinite(n) ? String(n) : null;
};

function build(st: string, year: number, cd: (string | null)[]): Record<string, DistrictBallotEntry> | null {
  const file = load(st, year);
  if (!file) return null;
  const n = file.n;
  const out: Record<string, DistrictBallotEntry> = {};
  const entry = (k: string) => (out[k] ??= {});
  for (const [office, field] of [["PRES", "P"], ["USS", "S"], ["GOV", "G"], ["USH", "H"]] as const) {
    const rows = file.offices[office];
    if (!rows) continue;
    const sums = new Map<string, Triple>();
    for (let i = 0; i < n; i += 1) {
      const k = cd[i];
      if (!k || !rows[i]) continue;
      add(sums.get(k) ?? sums.set(k, [0, 0, 0]).get(k)!, triple(rows[i]));
    }
    for (const [k, t] of sums) if (total(t) > 0) entry(k)[field] = [round(margin(t)), total(t)];
  }

  for (const presYear of [2016, 2020, 2024]) {
    const rows = load(st, presYear)?.offices.PRES;
    if (!rows) continue;
    const sums = new Map<string, Triple>();
    for (let i = 0; i < n; i += 1) { const k = cd[i]; if (k && rows[i]) add(sums.get(k) ?? sums.set(k, [0, 0, 0]).get(k)!, triple(rows[i])); }
    for (const [k, t] of sums) if (total(t) > 0) (entry(k).pres ??= {})[presYear] = [round(margin(t)), total(t)];
  }

  // The presidential vote each precinct is compared with.
  const pres: Triple[] = Array.from({ length: n }, () => [0, 0, 0] as Triple);
  for (const refYear of PRES_REFERENCE[year] ?? []) {
    const rows = load(st, refYear)?.offices.PRES;
    if (rows) for (let i = 0; i < n; i += 1) add(pres[i], triple(rows[i]));
  }
  const chambers = new Map<string, { m: number; share: number }[]>();
  for (const chamber of ["SLDL", "SLDU"]) {
    const rows = file.offices[chamber], ld = file.districts?.[chamber];
    if (!rows || !ld) continue;
    const matched = matchedShare(st, year, chamber);
    if (matched != null && matched < LEG_MIN_MATCHED) continue;
    const seat = new Map<string, [number, number]>();
    for (let i = 0; i < n; i += 1) {
      const k = ld[i];
      if (!k || !rows[i]) continue;
      const t = seat.get(k) ?? seat.set(k, [0, 0]).get(k)!;
      t[0] += rows[i]![0] || 0; t[1] += rows[i]![1] || 0;
    }
    const contestedSeats = new Set([...seat].filter(([, [d, r]]) => d + r > 0 && Math.min(d, r) / (d + r) >= LEG_CONTESTED_MIN_SHARE).map(([k]) => k));
    if (contestedSeats.size < LEG_MIN_CONTESTED) continue;
    const contested = (i: number) => !!ld[i] && contestedSeats.has(ld[i]!) && total(triple(rows[i])) > 0 && total(pres[i]) > 0;
    const stLeg: Triple = [0, 0, 0], stPres: Triple = [0, 0, 0];
    for (let i = 0; i < n; i += 1) if (contested(i)) { add(stLeg, triple(rows[i])); add(stPres, pres[i]); }
    if (total(stLeg) <= 0 || total(stPres) <= 0) continue;
    const gap = margin(stLeg) - margin(stPres);
    const per = new Map<string, { leg: Triple; presIn: Triple; presOut: Triple }>();
    for (let i = 0; i < n; i += 1) {
      const k = cd[i];
      if (!k) continue;
      const e = per.get(k) ?? per.set(k, { leg: [0, 0, 0], presIn: [0, 0, 0], presOut: [0, 0, 0] }).get(k)!;
      if (contested(i)) { add(e.leg, triple(rows[i])); add(e.presIn, pres[i]); } else add(e.presOut, pres[i]);
    }
    for (const [k, e] of per) {
      const wIn = total(e.presIn), wOut = total(e.presOut);
      if (wIn + wOut <= 0) continue;
      const mIn = total(e.leg) > 0 ? margin(e.leg) : 0, mOut = wOut > 0 ? margin(e.presOut) + gap : 0;
      (chambers.get(k) ?? chambers.set(k, []).get(k)!).push({ m: (wIn * mIn + wOut * mOut) / (wIn + wOut), share: wIn / (wIn + wOut) });
    }
  }
  for (const [k, list] of chambers) {
    const e = entry(k);
    e.L = round(list.reduce((a, c) => a + c.m, 0) / list.length);
    e.legContested = round(list.reduce((a, c) => a + c.share, 0) / list.length, 3);
    e.chambers = list.length;
  }
  return out;
}

const states = readdirSync(ROOT).filter((d) => /^[A-Z]{2}$/.test(d)).sort();
const run: Record<string, Record<string, Record<string, DistrictBallotEntry>>> = {};
const now: typeof run = {};
const counts: Record<string, { run: number; now: number; leg: number }> = {};
for (const year of YEARS) {
  counts[year] = { run: 0, now: 0, leg: 0 };
  for (const st of states) {
    const file = load(st, year);
    if (!file) continue;
    const own = file.districts?.USH?.map(districtKey);
    if (own) {
      const r = build(st, year, own);
      if (r && Object.keys(r).length) { (run[year] ??= {})[st] = r; counts[year].run += Object.keys(r).length; counts[year].leg += Object.values(r).filter((e) => e.L != null).length; }
    }
    const today = load(st, NOW_LINES_YEAR)?.districts?.USH?.map(districtKey);
    if (today) {
      const r = build(st, year, today);
      if (r && Object.keys(r).length) { (now[year] ??= {})[st] = r; counts[year].now += Object.keys(r).length; }
    }
  }
}
const outDir = join(process.cwd(), "data", "generated");
mkdirSync(outDir, { recursive: true });
const path = join(outDir, "district-ballot.json");
const houseMatched: Record<string, Record<string, number>> = {};
for (const year of YEARS) for (const st of states) { const m = matchedShare(st, year, "USH"); if (m != null) (houseMatched[year] ??= {})[st] = m; }
writeFileSync(path, JSON.stringify({ built: new Date().toISOString().slice(0, 10), nowLinesYear: NOW_LINES_YEAR, legContestedMinShare: LEG_CONTESTED_MIN_SHARE, legMinContested: LEG_MIN_CONTESTED, legMinMatched: LEG_MIN_MATCHED, houseMatched, run, now }));
console.log(`District ballot: ${YEARS.map((y) => `${y} ${counts[y].run} districts (${counts[y].leg} with a legislature figure)`).join(" · ")} → data/generated/district-ballot.json`);

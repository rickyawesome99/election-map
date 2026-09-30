import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { governorData, houseData, senateData, type RaceForecast } from "@/data/forecastData";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { contestOf, forecastRace, type Contest } from "@/lib/forecast";
import { calculateCountyModel, getNationalEnvironment } from "@/lib/tplCompute";
import { countyDistrictShares2026, projectAll } from "@/lib/turnoutModel";
import { parseCsv } from "@/lib/turnout";
import { ABBR_TO_FIPS } from "@/lib/fips";
import type { CountyMapEntry } from "@/components/PastElectionCountyMap";

// ── Projected results by county ───────────────────────────────────────────────
// The race's forecast margin, spread over its counties. Everything here is downstream of the
// forecast: the race margin is the forecast's, unchanged, and the county figures are the way
// that margin is expected to be made up.
//
//   votes_c    the 2026 turnout estimate's county (or county-piece) votes for the race
//   lean_c     the county's TPL — its neutral-environment lean, R-positive — or, where the
//              county model has nothing to rest on, its 2024 presidential margin. A House
//              district's piece of a split county adds the piece's 2024 deviation from its
//              county (piece House margin − county House margin, same race, from the
//              district-by-county results) where the lines are unchanged and every piece of the
//              county was contested, so a county cut between a suburban and a rural district
//              leans differently on each side.
//   margin_c   = clamp(lean_c + s), with the one shift s solved so that the vote-weighted mean
//              of margin_c over the race's counties equals the forecast margin
//   other_c    the county's 2024 presidential third-party share, capped, so D + R + other = 100
//
// A decided race (one major party absent, or two nominees of the same party) is painted for the
// party that has it, at the forecast's floor, rather than solved.

export const OTHER_SHARE_CAP = 8;
export const COUNTY_MARGIN_CLAMP = 98;

export type ProjectedCounty = {
  fips: string;
  name: string;
  /** House: share of the county's electorate inside the district (1 for a whole county). */
  share: number;
  votes: number;
  lean: number;
  leanBasis: "county-tpl" | "pres-2024" | "piece-2024";
  /** House, split county on unchanged lines: the piece's 2024 deviation from the whole county, in points. */
  pieceDeviation?: number;
  demVotes: number;
  repVotes: number;
  othVotes: number;
  demPct: number;
  repPct: number;
  /** R-positive. */
  margin: number;
};

export type ProjectedRaceResult = {
  office: "senate" | "governor" | "house";
  raceId: string;
  label: string;
  contest: Contest;
  /** The forecast margin, R-positive, unchanged. */
  margin: number;
  /** The uniform shift applied to county leans to hit the forecast margin (0 for a decided race). */
  shift: number;
  votes: number;
  demVotes: number;
  repVotes: number;
  othVotes: number;
  demName: string;
  repName: string;
  demParty: "D" | "R" | "I";
  repParty: "D" | "R" | "I";
  /** Shares of all votes, one decimal, rounded so rep − dem is exactly the one-decimal margin. */
  shares: { dem: number; rep: number; oth: number };
  /** The forecast's 80% interval on the margin, R-positive. */
  interval80: [number, number];
  /** The turnout estimate behind `votes`: its range, the race's CVAP turnout rate, and the last comparable race. */
  turnout: { low: number; high: number; cvap: number | null; rate: number | null; prior: { year: number; votes: number | null } | null };
  counties: ProjectedCounty[];
};

const tplCache = new Map<string, number | null>();
function countyLean(fips: string): { lean: number; basis: ProjectedCounty["leanBasis"] } | null {
  if (!tplCache.has(fips)) {
    const calc = calculateCountyModel(fips);
    tplCache.set(fips, calc && calc.races.some((r) => r.NM != null) ? calc.tpl : null);
  }
  const tpl = tplCache.get(fips);
  if (tpl != null && Number.isFinite(tpl)) return { lean: tpl, basis: "county-tpl" };
  const p = countyPresidentialData[fips]?.years[2024];
  if (p) return { lean: p.margin, basis: "pres-2024" };
  return null;
}

/** `${fips}|${districtId}` → the piece's 2024 House margin minus its county's, in points (R-positive).
 *  Only counties whose every 2024 piece recorded both major parties, so an unopposed neighbour
 *  cannot masquerade as a lean. */
let pieceDeviationCache: Map<string, number> | null = null;
function pieceDeviations(): Map<string, number> {
  if (pieceDeviationCache) return pieceDeviationCache;
  const rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_district_county_results.csv"), "utf8")).filter((r) => r.year === "2024" && r.status !== "missing");
  const byCounty = new Map<string, { district: string; dem: number; gop: number; total: number }[]>();
  for (const r of rows) {
    const fips = ABBR_TO_FIPS[r.state];
    if (!fips) continue;
    const key = r.county_fips;
    if (!byCounty.has(key)) byCounty.set(key, []);
    byCounty.get(key)!.push({ district: fips + r.district.padStart(2, "0"), dem: Number(r.dem || 0), gop: Number(r.gop || 0), total: Number(r.total || 0) });
  }
  const out = new Map<string, number>();
  for (const [fips, pieces] of byCounty) {
    if (pieces.length < 2 || pieces.some((p) => p.dem <= 0 || p.gop <= 0 || p.total <= 0)) continue;
    const tot = pieces.reduce((a, p) => a + p.total, 0);
    const county = (pieces.reduce((a, p) => a + p.gop - p.dem, 0) / tot) * 100;
    for (const p of pieces) out.set(`${fips}|${p.district}`, ((p.gop - p.dem) / p.total) * 100 - county);
  }
  pieceDeviationCache = out;
  return out;
}

/** Shares keyed by county|district, with whether they came from the 2024 pieces (unchanged lines). */
let shareBasisCache: Map<string, string> | null = null;
function shareBasis(fips: string, districtId: string): string | undefined {
  if (!shareBasisCache) shareBasisCache = new Map(countyDistrictShares2026().map((s) => [`${s.fips}|${s.district}`, s.basis]));
  return shareBasisCache.get(`${fips}|${districtId}`);
}

function otherShare(fips: string): number {
  const p = countyPresidentialData[fips]?.years[2024];
  if (!p || !p.totalVotes) return 1.5;
  return Math.min(OTHER_SHARE_CAP, (p.othVotes / p.totalVotes) * 100);
}

const clampMargin = (m: number, other: number) => Math.max(-(100 - other), Math.min(100 - other, Math.max(-COUNTY_MARGIN_CLAMP, Math.min(COUNTY_MARGIN_CLAMP, m))));

/** The shift s such that Σ v_c × clamp(lean_c + s) / Σ v_c = target. Bisection: the weighted mean is monotone in s. */
function solveShift(rows: { votes: number; lean: number; other: number }[], target: number): number {
  const total = rows.reduce((a, r) => a + r.votes, 0);
  if (total <= 0) return 0;
  const mean = (s: number) => rows.reduce((a, r) => a + r.votes * clampMargin(r.lean + s, r.other), 0) / total;
  let lo = -200, hi = 200;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mean(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const raceOf = (office: ProjectedRaceResult["office"], raceId: string): RaceForecast | undefined =>
  (office === "senate" ? senateData : office === "governor" ? governorData : houseData).find((r) => r.id === raceId);

const cache = new Map<string, ProjectedRaceResult | null>();

/** Projected county results for one 2026 race. raceId is the forecast id ("GA", "TX-2", "0512"). */
export function projectRaceResults(office: ProjectedRaceResult["office"], raceId: string): ProjectedRaceResult | null {
  const key = `${office}|${raceId}`;
  if (cache.has(key)) return cache.get(key)!;
  const race = raceOf(office, raceId);
  const turnout = projectAll().find((r) => r.id === `${office === "senate" ? "S" : office === "governor" ? "G" : "H"}-${raceId}`);
  if (!race || !turnout) { cache.set(key, null); return null; }
  const f = forecastRace(race);
  const contest = contestOf(race);
  const decided = contest === "uncontested-D" ? "D" : contest === "uncontested-R" ? "R" : null;
  const rows = turnout.counties.map((c) => {
    const base = countyLean(c.fips) ?? { lean: 0, basis: "pres-2024" as const };
    let lean = base.lean, leanBasis: ProjectedCounty["leanBasis"] = base.basis, pieceDeviation: number | undefined;
    if (office === "house" && c.share < 0.999 && shareBasis(c.fips, raceId) === "pieces2024") {
      const dev = pieceDeviations().get(`${c.fips}|${raceId}`);
      if (dev != null) { lean += dev; leanBasis = "piece-2024"; pieceDeviation = dev; }
    }
    return { fips: c.fips, name: c.name, share: c.share, votes: c.votes, lean, leanBasis, pieceDeviation, other: decided ? 0 : otherShare(c.fips) };
  });
  const shift = decided ? 0 : solveShift(rows, f.margin);
  const counties: ProjectedCounty[] = rows.map((r) => {
    const margin = decided ? (decided === "R" ? 100 : -100) : clampMargin(r.lean + shift, r.other);
    const repPct = (100 - r.other + margin) / 2, demPct = (100 - r.other - margin) / 2;
    const demVotes = Math.round((r.votes * demPct) / 100), repVotes = Math.round((r.votes * repPct) / 100);
    return { fips: r.fips, name: r.name, share: r.share, votes: r.votes, lean: Math.round(r.lean * 100) / 100, leanBasis: r.leanBasis, ...(r.pieceDeviation != null ? { pieceDeviation: Math.round(r.pieceDeviation * 100) / 100 } : {}), demVotes, repVotes, othVotes: Math.max(0, r.votes - demVotes - repVotes), demPct: Math.round(demPct * 100) / 100, repPct: Math.round(repPct * 100) / 100, margin: Math.round(margin * 100) / 100 };
  });
  const sum = (k: "votes" | "demVotes" | "repVotes" | "othVotes") => counties.reduce((a, c) => a + c[k], 0);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const V = sum("votes") || 1;
  const m1 = r1(((sum("repVotes") - sum("demVotes")) / V) * 100), rep1 = r1((sum("repVotes") / V) * 100);
  const shares = { rep: rep1, dem: r1(rep1 - m1), oth: r1((sum("othVotes") / V) * 100) };
  const out: ProjectedRaceResult = {
    office, raceId, label: turnout.label, contest, margin: f.margin, shift,
    votes: sum("votes"), demVotes: sum("demVotes"), repVotes: sum("repVotes"), othVotes: sum("othVotes"),
    demName: race.candidates?.dem.name ?? "Democrat", repName: race.candidates?.rep.name ?? "Republican",
    demParty: race.candidates?.dem.party ?? "D", repParty: race.candidates?.rep.party ?? "R",
    shares,
    interval80: f.interval80,
    turnout: { low: turnout.low, high: turnout.high, cvap: turnout.cvap, rate: turnout.rate, prior: turnout.prior },
    counties,
  };
  cache.set(key, out);
  return out;
}

/** The county map's entries for a race page. */
export function projectedCountyMapEntries(r: ProjectedRaceResult): CountyMapEntry[] {
  return r.counties.map((c) => ({ fips: c.fips, name: c.name, result: { demVotes: c.demVotes, repVotes: c.repVotes, totalVotes: c.votes, demPct: c.demPct, repPct: c.repPct, margin: c.margin } }));
}

// ── Implied generic ballot ────────────────────────────────────────────────────
// Add up the projected votes of every race and read the national margin back out. This is
// what the forecast margins and the turnout estimate together imply the popular vote will be;
// the polling generic ballot went in at the top, so the difference is what the model did to it.

export type ImpliedBallot = {
  office: "house" | "senate" | "governor" | "overall";
  races: number;
  votes: number;
  demVotes: number;
  repVotes: number;
  demPct: number;
  repPct: number;
  /** R-positive, in points of total votes. */
  margin: number;
  /** Two-party margin, the polling generic ballot's basis. */
  twoPartyMargin: number;
};

export type ImpliedGenericBallot = {
  offices: ImpliedBallot[];
  /** House only, decomposed: every race; contested races only; contested races weighted equally. */
  house: { all: number; contestedOnly: number; contestedEqualWeight: number; contestedRaces: number; decidedRaces: number; decidedNetVotes: number };
  /** The polling inputs, R-positive: the live average and the model's shrunk expectation. */
  polling: { gb: number; pvHat: number; eHat: number };
};

let gbCache: ImpliedGenericBallot | null = null;
export function impliedGenericBallot(): ImpliedGenericBallot {
  if (gbCache) return gbCache;
  const all: ProjectedRaceResult[] = [];
  for (const r of senateData) { const p = projectRaceResults("senate", r.id); if (p) all.push(p); }
  for (const r of governorData) { const p = projectRaceResults("governor", r.id); if (p) all.push(p); }
  for (const r of houseData) { const p = projectRaceResults("house", r.id); if (p) all.push(p); }
  const tally = (office: ImpliedBallot["office"], rs: ProjectedRaceResult[]): ImpliedBallot => {
    const votes = rs.reduce((a, r) => a + r.votes, 0), dem = rs.reduce((a, r) => a + r.demVotes, 0), rep = rs.reduce((a, r) => a + r.repVotes, 0);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return { office, races: rs.length, votes, demVotes: dem, repVotes: rep, demPct: r1((dem / votes) * 100), repPct: r1((rep / votes) * 100), margin: r1(((rep - dem) / votes) * 100), twoPartyMargin: r1(((rep - dem) / (rep + dem)) * 100) };
  };
  const house = all.filter((r) => r.office === "house");
  const contested = house.filter((r) => r.contest === "contested");
  const decided = house.filter((r) => r.contest !== "contested");
  const eq = contested.reduce((a, r) => a + r.margin, 0) / (contested.length || 1);
  const env = getNationalEnvironment();
  gbCache = {
    offices: [tally("house", house), tally("senate", all.filter((r) => r.office === "senate")), tally("governor", all.filter((r) => r.office === "governor")), tally("overall", all)],
    house: { all: tally("house", house).margin, contestedOnly: tally("house", contested).margin, contestedEqualWeight: Math.round(eq * 10) / 10, contestedRaces: contested.length, decidedRaces: decided.length, decidedNetVotes: decided.reduce((a, r) => a + r.repVotes - r.demVotes, 0) },
    polling: { gb: env.gb, pvHat: Math.round(env.pvHat * 10) / 10, eHat: Math.round(env.eHat * 10) / 10 },
  };
  return gbCache;
}

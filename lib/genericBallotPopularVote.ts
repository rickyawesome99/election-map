import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { houseData } from "@/data/forecastData";
import { genericBallotPolls } from "@/data/genericBallotPolls";
import { nationalEnvironmentHistory } from "@/data/nationalEnvironmentHistory";
import { presByBoundaryVintage, boundaryVintageForHouseYear, PRES_YEARS_FOR_VINTAGE } from "@/data/presByBoundaryVintage";
import { statesData } from "@/data/statesData";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { impliedGenericBallot, projectRaceResults } from "@/lib/countyProjection";
import { splitCsvLine } from "@/lib/racePollsHistory";
import { calculateStateTpl, effectiveEnvironment, envScaleFor, getEnvironmentModel, getNationalEnvironment, getTplFit } from "@/lib/tplCompute";

// /analysis/generic-ballot: how the generic-ballot poll average relates to the House popular
// vote, on three bases, nationally and by state, 2016–2024 — and the same chain run forward
// for 2026 from the live forecast.
//
// The generic ballot asks every voter which party's House candidate they prefer, so it
// measures an "every seat contested" House vote. The actual count is not that:
//   raw        every vote in every seat, as the official total is reported. An unopposed
//              seat contributes its whole vote to one party.
//   contested  only seats where a Democrat faced a Republican. Drops unopposed seats and
//              same-party finals (California / Washington top-two, Louisiana).
//   imputed    the contested seats plus each dropped seat filled with the two-party vote a
//              D-vs-R contest there would have produced: the district's presidential margin
//              (on the lines the race was run on) plus that year's average gap between the
//              contested seats' House margins and their presidential margins, at the median
//              turnout of the state's contested seats.
// All margins are two-party (R − D) ÷ (R + D), R-positive, like the rest of the site.

export type HouseVoteBasis = "raw" | "contested" | "imputed";
export type SeatKind = "contested" | "unopposed-D" | "unopposed-R" | "same-party-D" | "same-party-R";

export type DroppedSeat = { code: string; kind: Exclude<SeatKind, "contested">; votes: number };

export type StateHouseVote = {
  abbr: string;
  state: string;
  seats: number;
  contestedSeats: number;
  raw: number;
  /** null when no seat in the state had a D-vs-R contest. */
  contested: number | null;
  imputed: number;
  dropped: DroppedSeat[];
};

export type YearHouseVote = {
  year: number;
  gbMidSept: number | null;
  gbFinal: number | null;
  raw: number;
  contested: number;
  imputed: number;
  seats: number;
  kinds: Record<Exclude<SeatKind, "contested">, number>;
  /** vote-weighted mean of (House margin − presidential margin) on contested seats: the imputation offset */
  offset: number;
  imputedSeats: number;
  states: StateHouseVote[];
};

export type StateProjected2026 = {
  abbr: string;
  state: string;
  seats: number;
  contestedSeats: number;
  /** Projected two-party House vote, all seats (an unopposed seat counts for its party in full). */
  raw: number;
  contested: number | null;
  beta: number;
  /** State TPL lean plus the House environment term: the structural baseline before incumbency, money, candidates and polls. */
  leanPlusEnv: number;
  dropped: DroppedSeat[];
};

export type GenericBallotPopularVote = {
  years: YearHouseVote[];
  /** Mean and sd of (House vote − final generic ballot) on each basis, over the years on file. */
  miss: Record<HouseVoteBasis, { mean: number; sd: number; values: { year: number; miss: number }[] }>;
  now: {
    gb: number;
    gbThrough: string | null;
    meanMissRaw: number;
    shrink: number;
    pvHat: number;
    c: number;
    s: number;
    pv0: number;
    eHat: number;
    houseScale: number;
    /** The environment points a β* = 1 House race receives. */
    housePts: number;
    sigmaEHouse: number;
    /** What the race projections sum to. */
    sumAll: number;
    sumContested: number;
    contestedSeats: number;
    unopposedD: number;
    unopposedR: number;
    /** The historical translation of today's generic ballot: GB − mean miss, ± 1.28 sd (an 80% band), per basis. */
    translation: Record<HouseVoteBasis, { mid: number; lo: number; hi: number }>;
    states: StateProjected2026[];
  };
};

type Row = { id: string; code: string; abbr: string; year: number; demName: string; repName: string; dem: number; rep: number; total: number };

function readRows(): Row[] {
  const text = readFileSync(join(process.cwd(), "data-entry", "house_past_results.csv"), "utf8");
  const lines = text.split("\n").slice(1).filter((l) => l.trim());
  return lines.map((l) => {
    const c = splitCsvLine(l);
    return { id: c[0], code: c[1], abbr: c[2], year: Number(c[4]), demName: c[5] ?? "", repName: c[6] ?? "", dem: Number(c[11]) || 0, rep: Number(c[12]) || 0, total: Number(c[14]) || 0 };
  });
}

// Same-party finals are recorded with the second finalist's party in parentheses in the
// other column ("David Kim (D)"); an unopposed seat has an empty name on the missing side.
// A few states (Florida) do not print an unopposed seat's votes at all, so names decide first.
export function seatKind(r: { demName: string; repName: string; dem: number; rep: number }): SeatKind {
  if (/\(D\)\s*$/.test(r.repName)) return "same-party-D";
  if (/\(R\)\s*$/.test(r.demName)) return "same-party-R";
  if (!r.repName.trim()) return "unopposed-D";
  if (!r.demName.trim()) return "unopposed-R";
  if (r.dem === 0 && r.rep > 0) return "unopposed-R";
  if (r.rep === 0 && r.dem > 0) return "unopposed-D";
  return "contested";
}

const twoParty = (d: number, r: number) => (r + d > 0 ? ((r - d) / (r + d)) * 100 : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function presMarginOnLines(r: Row): number | null {
  const v = boundaryVintageForHouseYear(r.year);
  if (!v) return null;
  const ms = PRES_YEARS_FOR_VINTAGE[v].map((py) => presByBoundaryVintage[v][py]?.[r.id]?.margin).filter((m): m is number => m != null);
  return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
}

function yearVote(rows: Row[], year: number): YearHouseVote {
  const yr = rows.filter((r) => r.year === year);
  const kinds = new Map(yr.map((r) => [r, seatKind(r)] as const));
  // imputation offset: contested seats' House margin minus presidential margin, vote-weighted
  let num = 0, den = 0;
  for (const r of yr) {
    if (kinds.get(r) !== "contested") continue;
    const pm = presMarginOnLines(r);
    if (pm == null) continue;
    num += (twoParty(r.dem, r.rep) - pm) * (r.dem + r.rep); den += r.dem + r.rep;
  }
  const offset = den > 0 ? num / den : 0;
  const medianTurnout = new Map<string, number>();
  for (const s of statesData) medianTurnout.set(s.abbr, median(yr.filter((r) => r.abbr === s.abbr && kinds.get(r) === "contested").map((r) => r.dem + r.rep)));
  const stateName = new Map(statesData.map((s) => [s.abbr, s.name]));
  const kindCount: YearHouseVote["kinds"] = { "unopposed-D": 0, "unopposed-R": 0, "same-party-D": 0, "same-party-R": 0 };
  let ND = 0, NR = 0, CD = 0, CR = 0, ID = 0, IR = 0, imputedSeats = 0;
  const states: StateHouseVote[] = [];
  for (const s of statesData) {
    const sr = yr.filter((r) => r.abbr === s.abbr);
    if (!sr.length) continue;
    let d = 0, rr = 0, cd = 0, cr = 0, id = 0, ir = 0, nc = 0;
    const dropped: DroppedSeat[] = [];
    for (const r of sr) {
      const k = kinds.get(r)!;
      d += r.dem; rr += r.rep;
      if (k === "contested") { nc++; cd += r.dem; cr += r.rep; id += r.dem; ir += r.rep; continue; }
      kindCount[k] += 1;
      dropped.push({ code: r.code, kind: k, votes: r.dem + r.rep });
      const pm = presMarginOnLines(r);
      if (pm == null) { id += r.dem; ir += r.rep; continue; } // no presidential result on these lines: keep the recorded vote
      imputedSeats++;
      const m = Math.max(-95, Math.min(95, pm + offset));
      const v = medianTurnout.get(s.abbr) || r.dem + r.rep || 250000;
      id += (v * (1 - m / 100)) / 2; ir += (v * (1 + m / 100)) / 2;
    }
    ND += d; NR += rr; CD += cd; CR += cr; ID += id; IR += ir;
    states.push({ abbr: s.abbr, state: stateName.get(s.abbr) ?? s.abbr, seats: sr.length, contestedSeats: nc, raw: r1(twoParty(d, rr)), contested: nc ? r1(twoParty(cd, cr)) : null, imputed: r1(twoParty(id, ir)), dropped });
  }
  const h = nationalEnvironmentHistory.find((e) => e.year === year);
  return { year, gbMidSept: h?.gbMidSept ?? null, gbFinal: h?.gbFinal ?? null, raw: r1(twoParty(ND, NR)), contested: r1(twoParty(CD, CR)), imputed: r1(twoParty(ID, IR)), seats: yr.length, kinds: kindCount, offset: r1(offset), imputedSeats, states };
}

function projected2026(): StateProjected2026[] {
  const fit = getTplFit();
  const out: StateProjected2026[] = [];
  for (const s of statesData) {
    const races = houseData.filter((h) => h.state === s.name);
    let d = 0, r = 0, cd = 0, cr = 0, nc = 0, n = 0;
    const dropped: DroppedSeat[] = [];
    for (const h of races) {
      const p = projectRaceResults("house", h.id);
      if (!p) continue;
      n++; d += p.demVotes; r += p.repVotes;
      if (p.contest === "contested") { nc++; cd += p.demVotes; cr += p.repVotes; }
      else dropped.push({ code: h.name, kind: p.contest === "uncontested-D" ? "unopposed-D" : p.contest === "uncontested-R" ? "unopposed-R" : p.contest === "same-party-D" ? "same-party-D" : "same-party-R", votes: p.demVotes + p.repVotes });
    }
    if (!n) continue;
    out.push({ abbr: s.abbr, state: s.name, seats: n, contestedSeats: nc, raw: r1(twoParty(d, r)), contested: nc ? r1(twoParty(cd, cr)) : null, beta: fit.beta[s.abbr]?.shrunk ?? 1, leanPlusEnv: r1(calculateStateTpl(s.abbr, s.name) + effectiveEnvironment(s.abbr, "H")), dropped });
  }
  return out;
}

let cache: GenericBallotPopularVote | null = null;
export function genericBallotPopularVote(): GenericBallotPopularVote {
  if (cache) return cache;
  const rows = readRows();
  const years = [2016, 2018, 2020, 2022, 2024].map((y) => yearVote(rows, y));
  const missOn = (basis: HouseVoteBasis) => {
    const values = years.filter((y) => y.gbFinal != null).map((y) => ({ year: y.year, miss: r1(y[basis] - y.gbFinal!) }));
    const mean = values.reduce((a, v) => a + v.miss, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v.miss - mean) ** 2, 0) / Math.max(1, values.length - 1));
    return { mean: r1(mean), sd: r1(sd), values };
  };
  const miss = { raw: missOn("raw"), contested: missOn("contested"), imputed: missOn("imputed") };
  const env = getNationalEnvironment(), m = getEnvironmentModel(), ib = impliedGenericBallot();
  const houseScale = envScaleFor("H");
  const states = projected2026();
  const translation = (basis: HouseVoteBasis) => ({ mid: r1(env.gb + miss[basis].mean), lo: r1(env.gb + miss[basis].mean - 1.2816 * miss[basis].sd), hi: r1(env.gb + miss[basis].mean + 1.2816 * miss[basis].sd) });
  let unopposedD = 0, unopposedR = 0;
  for (const s of states) for (const d of s.dropped) { if (d.kind === "unopposed-D" || d.kind === "same-party-D") unopposedD++; else unopposedR++; }
  cache = {
    years,
    miss,
    now: {
      gb: env.gb,
      gbThrough: genericBallotPolls.reduce<string | null>((a, p) => (a == null || p.endDate > a ? p.endDate : a), null),
      meanMissRaw: r1(m.meanMiss), shrink: F.ENV_MISS_SHRINK, pvHat: r1(env.pvHat), c: m.c, s: m.s, pv0: r1(m.pv0), eHat: r1(env.eHat),
      houseScale, housePts: r1(env.eHat * houseScale), sigmaEHouse: r1(env.sigmaEHouse),
      sumAll: ib.offices.find((o) => o.office === "house")?.twoPartyMargin ?? ib.house.all, sumContested: ib.house.contestedOnly, contestedSeats: ib.house.contestedRaces, unopposedD, unopposedR,
      translation: { raw: translation("raw"), contested: translation("contested"), imputed: translation("imputed") },
      states,
    },
  };
  return cache;
}

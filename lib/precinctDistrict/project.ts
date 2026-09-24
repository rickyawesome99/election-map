// 2026 outlook for a precinct district: a district TPL built from the district's own precinct
// sums, projected forward with the site's fitted national environment, then spread back over
// the precincts. Server-only (it reads the TPL fit, which pulls in the full forecast dataset);
// the page passes the JSON-serializable result to the client explorer.
//
// Specification: /methodology/precinct-district (components/methodology/PrecinctMethodology.tsx).
// A change here gets an entry in data/methodologyChangelog.ts.
//
//   1. Neutral margin per race-year   NM = raw + incumbency strip − β*(state) × E(year)
//      Statewide races always; House / State House rows only in years the footprint was one
//      race (a patchwork of districts is not a race). No fundraising strip: no receipts on file.
//   2. Lean                           year means by RACE_TYPE_WEIGHTS (renormalized over the
//      types present), years by YEAR_WEIGHTS, two-pass Huber (HUBER_C) on race residuals.
//   3. Environment                    + β* × E(2026), the live national environment estimate.
//   4. Seat                           open seat → no incumbency term.
//   5. Down-ballot gap                mean of (State House NM − same-year top-of-ticket NM) over
//      the single-race State House years, shrunk n / (n + GAP_SHRINK_K).
//   Result                            margin ± σ, σ² = (β* σ_E)² + (RACE_SIGMA[LEG_SIGMA_TIER] × LEG_SIGMA_MULTIPLIER)²
//   Precincts                         baseline = BASELINE_PRES_WEIGHT × pres + (1 − w) × State
//      House, latest year; every precinct moves by the district's projected shift (uniform).

import { TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { getTplFit, getNationalEnvironment, winProbabilityD } from "@/lib/tplCompute";
import type { OfficeKey, PrecinctDistrictData, YearResults } from "./types";
import { marginOf, sumOffice, topOfTicket } from "./aggregate";
import { precinctRows, type ExplorerRow } from "./explorer";

export const PROJECTION_CONSTANTS = {
  BASELINE_PRES_WEIGHT: 0.5,   // share of the precinct baseline taken from the presidential margin (rest: State House)
  GAP_SHRINK_K: 1,             // down-ballot gap shrink n / (n + K)
  LEG_INCUMBENCY_TIER: "H" as const,  // State House incumbency strip borrows the fitted House advantage
  LEG_SIGMA_TIER: "H" as const,       // State House race noise starts from RACE_SIGMA.H …
  LEG_SIGMA_MULTIPLIER: 1.5,          // … scaled up: legislative races carry more candidate-specific variance than congressional ones (see methodology)
  MARGIN_CLAMP: 95,            // projected precinct margins are kept inside ±95
};

const RACE_TYPE_OF: Record<string, "P" | "G" | "S" | "H" | "L"> = { pres: "P", gov: "G", ussen: "S", ushouse: "H", sthouse: "L", stsen: "L" };

export interface ProjectionRaceRow {
  year: number;
  office: OfficeKey;
  label: string;
  raceType: "P" | "G" | "S" | "H" | "L";
  candidates: string | null;
  raw: number;            // R-positive two-party margin on today's lines
  incumbent: "D" | "R" | null;
  incPts: number;
  envPts: number;
  NM: number;
  huber: number;          // Huber factor after the two-pass fit (1 = kept in full)
  weight: number;         // final share of the lean
  included: boolean;
  reason?: string;        // why a row is excluded
}

export interface ProjectionYear { year: number; recency: number; coverage: number; weight: number; NM: number | null; types: string[] }

export interface TurnoutScenario {
  id: string;
  label: string;
  basisYear: number | null;
  ballots: number;        // district ballots under the scenario
  d: number;
  r: number;
  margin: number;         // projected two-party margin under the scenario (same as district margin; turnout mix moves it)
  votesToFlip: number;    // net votes the trailing side would need
  trailing: "D" | "R";
}

export interface ProjectedPrecinct {
  id: string;
  sub: string;
  reg: number;
  base: number | null;
  projected: number | null;
  ballots: Record<string, number>;   // scenario id → projected ballots
  twoPartyRate: number;              // (d + r) / ballots in the latest State House race
}

export interface DistrictProjection {
  asOf: string;
  stateAbbr: string;
  beta: number;
  eHat: number;
  sigmaE: number;
  rows: ProjectionRaceRow[];
  years: ProjectionYear[];
  lean: number;
  envPts: number;
  gap: { value: number; raw: number | null; n: number; shrink: number };
  margin: number;
  sigma: number;
  pD: number;
  interval80: [number, number];
  baseline: { year: number; sthouse: number | null; top: number | null; topOffice: OfficeKey | null; blend: number | null };
  shift: number;
  scenarios: TurnoutScenario[];
  precincts: ProjectedPrecinct[];
  constants: typeof PROJECTION_CONSTANTS & { HUBER_C: number; RACE_SIGMA: number; incumbencyPts: number };
}

function singleRace(yr: YearResults, office: OfficeKey): { d?: string; r?: string; dInc?: boolean; rInc?: boolean } | null {
  const m = yr.offices[office];
  if (!m) return null;
  const keys = m.districts ? Object.keys(m.districts) : [];
  if (keys.length > 1) return null;
  const src = keys.length === 1 ? m.districts![keys[0]] : m;
  return { d: src.d, r: src.r, dInc: src.dIncumbent, rInc: src.rIncumbent };
}

export function projectDistrict(data: PrecinctDistrictData): DistrictProjection {
  const { config, results } = data;
  const fit = getTplFit();
  const env = getNationalEnvironment();
  const beta = fit.beta[config.state]?.shrunk ?? 1;
  const incH = fit.incumbency[PROJECTION_CONSTANTS.LEG_INCUMBENCY_TIER] ?? 0;
  const years = [...config.years].sort((a, b) => a - b);

  // rows on today's lines, one footprint for every year
  const rowsByYear = new Map<number, ExplorerRow[]>(years.map((y) => [y, precinctRows(data, y, "current")]));

  // 1. race rows
  const rows: ProjectionRaceRow[] = [];
  for (const y of years) {
    const yr = results.years[String(y)];
    for (const office of Object.keys(yr.offices)) {
      const type = RACE_TYPE_OF[office];
      if (!type) continue;
      const tally = sumOffice(rowsByYear.get(y)!, office);
      const raw = marginOf(tally);
      if (raw == null) continue;
      const race = singleRace(yr, office);
      const meta = yr.offices[office];
      const nDistricts = meta.districts ? Object.keys(meta.districts).length : 0;
      const incumbent: "D" | "R" | null = race?.dInc ? "D" : race?.rInc ? "R" : null;
      const incAdv = type === "L" ? incH : (fit.incumbency[type] ?? 0);
      const incPts = incumbent === "R" ? -incAdv : incumbent === "D" ? incAdv : 0;
      const envPts = -(beta * (fit.E[y] ?? 0));
      const included = race != null;
      rows.push({
        year: y, office, label: `${y} ${meta.label}`, raceType: type,
        candidates: race?.d && race?.r ? `${race.d} (D) vs ${race.r} (R)` : race?.d ? `${race.d} (D)` : race?.r ? `${race.r} (R)` : null,
        raw, incumbent, incPts, envPts, NM: raw + incPts + envPts, huber: 1, weight: 0, included,
        reason: included ? undefined : `${nDistricts} districts summed, not one race`,
      });
    }
  }

  // 2. lean: type-weighted year means, recency-weighted years, two-pass Huber
  const aggregate = (): { lean: number; years: ProjectionYear[] } => {
    const out: ProjectionYear[] = [];
    let num = 0, den = 0;
    for (const y of years) {
      const yrRows = rows.filter((r) => r.year === y && r.included);
      if (!yrRows.length) { out.push({ year: y, recency: G.YEAR_WEIGHTS[y] ?? 0, coverage: 0, weight: 0, NM: null, types: [] }); continue; }
      const types = [...new Set(yrRows.map((r) => r.raceType))];
      const typeNM: Record<string, number> = {};
      for (const t of types) {
        const tr = yrRows.filter((r) => r.raceType === t);
        const w = tr.reduce((s, r) => s + r.huber, 0);
        typeNM[t] = w > 0 ? tr.reduce((s, r) => s + r.huber * r.NM, 0) / w : 0;
      }
      const coverage = types.reduce((s, t) => s + (G.RACE_TYPE_WEIGHTS[t] ?? 0), 0);
      const yearNM = types.reduce((s, t) => s + (G.RACE_TYPE_WEIGHTS[t] ?? 0) * typeNM[t], 0) / (coverage || 1);
      const weight = (G.YEAR_WEIGHTS[y] ?? 0) * coverage;
      out.push({ year: y, recency: G.YEAR_WEIGHTS[y] ?? 0, coverage, weight, NM: yearNM, types });
      num += weight * yearNM; den += weight;
    }
    const lean = den > 0 ? num / den : 0;
    for (const o of out) o.weight = den > 0 ? o.weight / den : 0;
    return { lean, years: out };
  };
  const lean0 = aggregate().lean;
  for (const r of rows) {
    const resid = r.NM - lean0;
    r.huber = Math.abs(resid) <= G.HUBER_C ? 1 : G.HUBER_C / Math.abs(resid);
  }
  const { lean, years: yearAggs } = aggregate();
  // each row's share of the lean = year weight × its type's share within the year × its share within the type
  for (const r of rows) {
    if (!r.included) continue;
    const ya = yearAggs.find((y) => y.year === r.year)!;
    const sameType = rows.filter((x) => x.included && x.year === r.year && x.raceType === r.raceType);
    const typeShare = (G.RACE_TYPE_WEIGHTS[r.raceType] ?? 0) / (ya.coverage || 1);
    const within = r.huber / sameType.reduce((s, x) => s + x.huber, 0);
    r.weight = ya.weight * typeShare * within;
  }

  // 3–5. forward terms
  const envPts = beta * env.eHat;
  const gapYears = rows.filter((r) => r.raceType === "L" && r.included);
  const gaps: number[] = [];
  for (const g of gapYears) {
    const yr = results.years[String(g.year)];
    const top = topOfTicket(yr);
    const topRow = top ? rows.find((r) => r.year === g.year && r.office === top) : null;
    if (topRow) gaps.push(g.NM - topRow.NM);
  }
  const gapRaw = gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : null;
  const shrink = gaps.length / (gaps.length + PROJECTION_CONSTANTS.GAP_SHRINK_K);
  const gap = gapRaw != null ? gapRaw * shrink : 0;
  const margin = lean + envPts + gap;
  const raceSigma = F.RACE_SIGMA[PROJECTION_CONSTANTS.LEG_SIGMA_TIER] * PROJECTION_CONSTANTS.LEG_SIGMA_MULTIPLIER;
  const sigma = Math.sqrt((beta * env.sigmaE) ** 2 + raceSigma ** 2);
  const pD = winProbabilityD(margin, sigma);

  // precinct baseline and uniform shift
  const latestYear = years[years.length - 1];
  const latest = results.years[String(latestYear)];
  const latestRows = rowsByYear.get(latestYear)!;
  const legOffice: OfficeKey | null = latest.offices.sthouse ? "sthouse" : latest.offices.stsen ? "stsen" : null;
  const topOffice = topOfTicket(latest);
  const w = PROJECTION_CONSTANTS.BASELINE_PRES_WEIGHT;
  const blendOf = (r: { races: Record<string, { d: number; r: number }> }): number | null => {
    const a = legOffice && r.races[legOffice] ? marginOf(r.races[legOffice]) : null;
    const b = topOffice && r.races[topOffice] ? marginOf(r.races[topOffice]) : null;
    if (a != null && b != null) return w * b + (1 - w) * a;
    return a ?? b;
  };
  const distLeg = legOffice ? marginOf(sumOffice(latestRows, legOffice)) : null;
  const distTop = topOffice ? marginOf(sumOffice(latestRows, topOffice)) : null;
  const distBlend = distLeg != null && distTop != null ? w * distTop + (1 - w) * distLeg : (distLeg ?? distTop);
  const shift = distBlend != null ? margin - distBlend : 0;

  // turnout scenarios: presidential-year ballots as counted, and each midterm's precinct turnout
  // rate applied to today's registration
  const scenarioDefs: { id: string; label: string; basisYear: number | null }[] = [
    { id: `pres${latestYear}`, label: `${latestYear} turnout`, basisYear: latestYear },
    ...years.filter((y) => !results.years[String(y)].offices.pres && y !== latestYear).sort((a, b) => b - a)
      .map((y) => ({ id: `mid${y}`, label: `${y}-style midterm turnout`, basisYear: y })),
  ];
  const clamp = (v: number) => Math.max(-PROJECTION_CONSTANTS.MARGIN_CLAMP, Math.min(PROJECTION_CONSTANTS.MARGIN_CLAMP, v));
  const precincts: ProjectedPrecinct[] = latestRows.map((p) => {
    const base = blendOf(p);
    const projected = base == null ? null : clamp(base + shift);
    const legRace = legOffice ? p.races[legOffice] : null;
    const twoPartyRate = legRace && p.ballots > 0 ? Math.min(1, (legRace.d + legRace.r) / p.ballots) : 0.95;
    const ballots: Record<string, number> = {};
    for (const s of scenarioDefs) {
      if (s.basisYear === latestYear) { ballots[s.id] = p.ballots; continue; }
      const basis = rowsByYear.get(s.basisYear!)?.find((r) => r.id === p.id);
      const rate = basis && basis.reg > 0 ? basis.ballots / basis.reg : (p.reg > 0 ? p.ballots / p.reg : 0);
      ballots[s.id] = p.reg * Math.min(1, rate);
    }
    return { id: p.id, sub: p.sub, reg: p.reg, base, projected, ballots, twoPartyRate };
  });
  const scenarios: TurnoutScenario[] = scenarioDefs.map((s) => {
    let d = 0, r = 0, ballots = 0;
    for (const p of precincts) {
      if (p.projected == null) continue;
      const b = p.ballots[s.id] ?? 0;
      const two = b * p.twoPartyRate;
      const dShare = (1 - p.projected / 100) / 2;
      d += two * dShare; r += two * (1 - dShare); ballots += b;
    }
    const m = d + r > 0 ? ((r - d) / (d + r)) * 100 : 0;
    return { id: s.id, label: s.label, basisYear: s.basisYear, ballots: Math.round(ballots), d: Math.round(d), r: Math.round(r), margin: m, votesToFlip: Math.round(Math.abs(r - d)), trailing: r > d ? "D" : "R" };
  });

  return {
    asOf: new Date().toISOString().slice(0, 10),
    stateAbbr: config.state, beta, eHat: env.eHat, sigmaE: env.sigmaE,
    rows, years: yearAggs, lean, envPts,
    gap: { value: gap, raw: gapRaw, n: gaps.length, shrink },
    margin, sigma, pD, interval80: [margin - 1.28 * sigma, margin + 1.28 * sigma],
    baseline: { year: latestYear, sthouse: distLeg, top: distTop, topOffice, blend: distBlend },
    shift, scenarios, precincts,
    constants: { ...PROJECTION_CONSTANTS, HUBER_C: G.HUBER_C, RACE_SIGMA: raceSigma, incumbencyPts: incH },
  };
}

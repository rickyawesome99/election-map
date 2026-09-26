// 2026 outlook for a precinct district: a district TPL built from the district's own precinct
// sums, projected forward with the site's fitted national environment, then spread back over
// the precincts. Server-only (it reads the TPL fit, which pulls in the full forecast dataset);
// the page passes the JSON-serializable result to the client explorer.
//
// Specification: /methodology/precinct-district (components/methodology/PrecinctMethodology.tsx).
// A change here gets an entry in data/methodologyChangelog.ts.
//
//   1. Neutral margin per race-year   NM = raw + incumbency strip − β*(state) × E(year) − money
//      Statewide races always; House / State House rows only in years the footprint was one
//      race (a patchwork of districts is not a race). The money strip applies to rows whose
//      nominees' receipts are in finance.json (State House), using the state money calibration.
//   2. Lean                           year means by RACE_TYPE_WEIGHTS (renormalized over the
//      types present), years by YEAR_WEIGHTS, two-pass Huber (HUBER_C) on race residuals.
//   3. Environment                    + β* × E(2026), the live national environment estimate.
//   4. Seat                           open seat → no incumbency term.
//   5. Down-ballot gap                mean of (State House NM − same-year top-of-ticket NM) over
//      the single-race State House years, shrunk n / (n + GAP_SHRINK_K).
//   6. Money                          clamp(K × (scale × gap% − structural gap%), ±CAP), gap% = the
//      nominees' receipts gap to date, scale = PARTIAL_CYCLE_GAP_SCALE.H (receipts are mid-cycle),
//      structural gap% = a + b × incSign + c × latest presidential margin — K, CAP, a, b, c from
//      data/precinct-districts/money/<ST>.json (scripts/fitStateLegMoney.ts). Off without both files.
//   Result                            margin ± σ, σ² = (β* σ_E)² + (RACE_SIGMA[LEG_SIGMA_TIER] × LEG_SIGMA_MULTIPLIER)²
//   Precincts                         baseline = BASELINE_PRES_WEIGHT × pres + (1 − w) × State
//      House, latest year; every precinct moves by the district's projected shift (uniform).
//   Turnout                           2026 ballots per precinct = mean of its midterm turnout rates
//      (ballots ÷ registered, on today's lines) × today's registration; each midterm alone gives the range.

import { TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { getTplFit, getNationalEnvironment, winProbabilityD } from "@/lib/tplCompute";
import type { MoneyCalibration, OfficeKey, PrecinctDistrictData, YearResults } from "./types";
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
  moneyPts: number;       // R-positive points of the nominees' residual money gap, stripped from NM (0 = no receipts on file)
  NM: number;
  huber: number;          // Huber factor after the two-pass fit (1 = kept in full)
  weight: number;         // final share of the lean
  included: boolean;
  reason?: string;        // why a row is excluded
}

export interface ProjectionYear { year: number; recency: number; coverage: number; weight: number; NM: number | null; types: string[] }

export interface TurnoutVotes {
  ballots: number;        // district ballots
  rate: number;           // ballots ÷ today's registration, %
  d: number;
  r: number;
  votesToFlip: number;    // net votes the trailing side would need
  trailing: "D" | "R";
}

export interface TurnoutEstimate extends TurnoutVotes {
  basisYears: number[];   // midterms averaged into each precinct's rate
  margin: number;         // two-party margin of the ballot-weighted precincts (≈ the district projection)
  range: (TurnoutVotes & { year: number })[];   // each basis midterm's rates alone
  presYear: number;
  presBallots: number;    // latest presidential-year ballots as cast, for scale
}

/** A money gap priced under a state calibration (R-positive). */
export interface MoneyGap {
  dReceipts: number;
  rReceipts: number;
  gapPct: number;             // (R$ − D$) / (R$ + D$) × 100
  scale: number;              // 1 for a finished cycle; PARTIAL_CYCLE_GAP_SCALE for the live one
  incSign: number;            // +1 R incumbent, −1 D incumbent, 0 open
  presMargin: number;         // presidential margin the structural gap is read from
  structuralGapPct: number;   // what a generic pair in this seat would raise
  residualGapPct: number;     // scale × gap − structural: what the points are paid on
  pts: number;                // clamp(K × residual, ±CAP)
}

export interface ProjectionMoney extends MoneyGap {
  through: string;
  nextReport?: string;
  calibration: MoneyCalibration;
}

export interface ProjectedPrecinct {
  id: string;
  sub: string;
  reg: number;
  base: number | null;
  projected: number | null;
  ballots: number;                   // 2026 turnout estimate
  ballotsByYear: Record<string, number>;  // each basis midterm's rate on today's registration
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
  money: ProjectionMoney | null;   // null: no finance file or no state calibration
  margin: number;
  sigma: number;
  pD: number;
  interval80: [number, number];
  baseline: { year: number; sthouse: number | null; top: number | null; topOffice: OfficeKey | null; blend: number | null };
  shift: number;
  turnout: TurnoutEstimate;
  precincts: ProjectedPrecinct[];
  constants: typeof PROJECTION_CONSTANTS & { HUBER_C: number; RACE_SIGMA: number; incumbencyPts: number };
}

export function priceMoneyGap(cal: MoneyCalibration, d: number, r: number, incSign: number, presMargin: number, scale: number): MoneyGap {
  const gapPct = ((r - d) / (r + d)) * 100;
  const structuralGapPct = Math.max(-100, Math.min(100, cal.structural.intercept + cal.structural.incSign * incSign + cal.structural.pres * presMargin));
  const residualGapPct = scale * gapPct - structuralGapPct;
  const pts = Math.max(-cal.CAP, Math.min(cal.CAP, cal.K * residualGapPct));
  return { dReceipts: d, rReceipts: r, gapPct, scale, incSign, presMargin, structuralGapPct, residualGapPct, pts };
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
  const { config, results, finance, moneyCalibration: cal } = data;
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
        raw, incumbent, incPts, envPts, moneyPts: 0, NM: raw + incPts + envPts, huber: 1, weight: 0, included,
        reason: included ? undefined : `${nDistricts} districts summed, not one race`,
      });
    }
  }

  // money strip: rows whose nominees' receipts are on file, priced on the nearest presidential
  // margin at or before the row's year (the calibration's structural gap reads a presidential margin)
  const presRaw = (y: number): number | null => {
    const cands = rows.filter((r) => r.office === "pres" && r.year <= y).sort((a, b) => b.year - a.year);
    return cands[0]?.raw ?? rows.find((r) => r.office === "pres")?.raw ?? null;
  };
  if (cal) for (const r of rows) {
    const h = finance?.history[r.office]?.[String(r.year)];
    const pm = presRaw(r.year);
    if (!r.included || !h || h.d + h.r <= 0 || pm == null) continue;
    const incSign = r.incumbent === "R" ? 1 : r.incumbent === "D" ? -1 : 0;
    r.moneyPts = priceMoneyGap(cal, h.d, h.r, incSign, pm, 1).pts;
    r.NM -= r.moneyPts;
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
  // 6. money: the nominees' receipts to date
  let money: ProjectionMoney | null = null;
  const f26 = finance?.["2026"];
  const latestPres = presRaw(Math.max(...years));
  if (cal && f26 && f26.d.receipts + f26.r.receipts > 0 && latestPres != null) {
    const holder = config.election2026?.status === "open" ? null : config.election2026?.seatHolder?.party ?? null;
    const incSign = holder === "R" ? 1 : holder === "D" ? -1 : 0;
    money = { ...priceMoneyGap(cal, f26.d.receipts, f26.r.receipts, incSign, latestPres, F.PARTIAL_CYCLE_GAP_SCALE.H), through: f26.through, nextReport: f26.nextReport, calibration: cal };
  }
  const margin = lean + envPts + gap + (money?.pts ?? 0);
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

  // 2026 turnout: each precinct's midterm turnout rates (on today's lines), averaged, applied to
  // today's registration. Falls back to the latest year's rate when no midterm is on file.
  const midterms = years.filter((y) => !results.years[String(y)].offices.pres && y !== latestYear).sort((a, b) => a - b);
  const clamp = (v: number) => Math.max(-PROJECTION_CONSTANTS.MARGIN_CLAMP, Math.min(PROJECTION_CONSTANTS.MARGIN_CLAMP, v));
  const precincts: ProjectedPrecinct[] = latestRows.map((p) => {
    const base = blendOf(p);
    const projected = base == null ? null : clamp(base + shift);
    const legRace = legOffice ? p.races[legOffice] : null;
    const twoPartyRate = legRace && p.ballots > 0 ? Math.min(1, (legRace.d + legRace.r) / p.ballots) : 0.95;
    const latestRate = p.reg > 0 ? p.ballots / p.reg : 0;
    const ballotsByYear: Record<string, number> = {};
    for (const y of midterms) {
      const basis = rowsByYear.get(y)?.find((r) => r.id === p.id);
      const rate = basis && basis.reg > 0 ? basis.ballots / basis.reg : latestRate;
      ballotsByYear[y] = p.reg * Math.min(1, rate);
    }
    const ballots = midterms.length ? midterms.reduce((s, y) => s + ballotsByYear[y], 0) / midterms.length : p.ballots;
    return { id: p.id, sub: p.sub, reg: p.reg, base, projected, ballots, ballotsByYear, twoPartyRate };
  });
  const reg = precincts.reduce((s, p) => s + p.reg, 0);
  const votesFor = (ballotsOf: (p: ProjectedPrecinct) => number): TurnoutVotes & { margin: number } => {
    let d = 0, r = 0, ballots = 0;
    for (const p of precincts) {
      const b = ballotsOf(p);
      ballots += b;
      if (p.projected == null) continue;
      const two = b * p.twoPartyRate;
      const dShare = (1 - p.projected / 100) / 2;
      d += two * dShare; r += two * (1 - dShare);
    }
    return {
      ballots: Math.round(ballots), rate: reg > 0 ? (ballots / reg) * 100 : 0, d: Math.round(d), r: Math.round(r),
      margin: d + r > 0 ? ((r - d) / (d + r)) * 100 : 0, votesToFlip: Math.round(Math.abs(r - d)), trailing: r > d ? "D" : "R",
    };
  };
  const turnout: TurnoutEstimate = {
    ...votesFor((p) => p.ballots),
    basisYears: midterms,
    range: midterms.map((y) => { const v = votesFor((p) => p.ballotsByYear[y] ?? 0); return { year: y, ballots: v.ballots, rate: v.rate, d: v.d, r: v.r, votesToFlip: v.votesToFlip, trailing: v.trailing }; }),
    presYear: latestYear,
    presBallots: latestRows.reduce((s, p) => s + p.ballots, 0),
  };

  return {
    asOf: new Date().toISOString().slice(0, 10),
    stateAbbr: config.state, beta, eHat: env.eHat, sigmaE: env.sigmaE,
    rows, years: yearAggs, lean, envPts,
    gap: { value: gap, raw: gapRaw, n: gaps.length, shrink },
    money, margin, sigma, pD, interval80: [margin - 1.28 * sigma, margin + 1.28 * sigma],
    baseline: { year: latestYear, sthouse: distLeg, top: distTop, topOffice, blend: distBlend },
    shift, turnout, precincts,
    constants: { ...PROJECTION_CONSTANTS, HUBER_C: G.HUBER_C, RACE_SIGMA: raceSigma, incumbencyPts: incH },
  };
}

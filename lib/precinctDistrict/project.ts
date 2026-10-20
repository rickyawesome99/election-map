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
//      race (a patchwork of districts is not a race). State House rows are stripped of the state
//      legislature model's fitted INCUMBENCY_PTS. The money strip applies to rows whose
//      nominees' receipts are in finance.json (State House).
//   2. Lean                           year means by RACE_TYPE_WEIGHTS (renormalized over the
//      types present), except that State House rows carry the state legislature model's seat
//      weight (TYPE_WEIGHTS.L, × RECENT_SEAT_BOOST in the latest year with one) so the seat's own
//      results pull the lean as they do there; years by YEAR_WEIGHTS, two-pass Huber (HUBER_C)
//      on race residuals. No separate down-ballot term: the seat rows carry it.
//   3. Environment                    + β* × E(2026), the live national environment estimate.
//   4. Seat                           open seat → no incumbency term.
//   5. Money                          clamp(K × (scale × gap% − structural gap%), ±CAP), gap% = the
//      nominees' receipts gap to date; K, CAP and scale are the state legislature model's
//      backtested MONEY_K, MONEY_CAP and PARTIAL_CYCLE_GAP_SCALE; structural gap% = a + b × incSign
//      + c × latest presidential margin from the state's own fit, data/precinct-districts/money/<ST>.json
//      (scripts/fitStateLegMoney.ts; its in-sample K is recorded there but not used). Off without both files.
//   Result                            margin ± σ, σ² = (β* σ_E)² + STATE_SHOCK² + SIGMA², the state
//      legislature model's fitted chamber shock and seat noise (lib/stateLegForecast.ts)
//   Precincts                         precinct TPL = district margin + (relative lean − its vote-weighted
//      mean), relative lean = Σ w × (precinct margin − district margin) / Σ w over the included
//      race-years on today's lines, w = PRECINCT_TPL_DECAY^(latest year − year) × the race-type
//      weight. Subtracting the district margin strips environment, incumbency and candidates in one
//      step. The latest-year baseline (BASELINE_PRES_WEIGHT × pres + (1 − w) × State House) and the
//      uniform shift are kept for comparison.
//   Turnout                           2026 ballots per precinct = mean of its midterm turnout rates
//      (ballots ÷ registered, on today's lines) × today's registration; each midterm alone gives the range.

import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { getTplFit, getNationalEnvironment, winProbabilityD } from "@/lib/tplCompute";
import { STATE_LEG_FORECAST_CONSTANTS as L } from "@/lib/stateLegForecast";
import type { MoneyCalibration, OfficeKey, PrecinctDistrictData, YearResults } from "./types";
import { marginOf, sumOffice, topOfTicket } from "./aggregate";
import { precinctRows, type ExplorerRow } from "./explorer";

export const PROJECTION_CONSTANTS = {
  BASELINE_PRES_WEIGHT: 0.5,   // share of the precinct baseline taken from the presidential margin (rest: State House)
  PRECINCT_TPL_DECAY: 0.5,     // precinct TPL year weight per year back from the latest: 2024 = 1, 2022 = 0.25, 2020 = 0.06 (a two-year half-life; the district lean's 0.75 is far flatter)
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
  base: number | null;              // latest-year baseline: BASELINE_PRES_WEIGHT × pres + (1 − w) × State House
  /** recency-weighted precinct margin relative to the district, over every included race-year */
  relLean: number | null;
  /** precinct TPL: the district projection + (relLean − its vote-weighted mean), clamped */
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
  /** How the seat's own rows are weighted in the lean (the state legislature model's values). */
  seatRows: { typeWeight: number; boost: number; latestYear: number | null };
  money: ProjectionMoney | null;   // null: no finance file or no state calibration
  margin: number;
  sigma: number;
  pD: number;
  interval80: [number, number];
  baseline: { year: number; sthouse: number | null; top: number | null; topOffice: OfficeKey | null; blend: number | null };
  shift: number;
  turnout: TurnoutEstimate;
  precincts: ProjectedPrecinct[];
  /** The designed constants above plus the values borrowed from the TPL fit and the state legislature model. */
  constants: typeof PROJECTION_CONSTANTS & { HUBER_C: number; SEAT_SIGMA: number; STATE_SHOCK: number; incumbencyPts: number; MONEY_K: number; MONEY_CAP: number };
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
  const { config, results, finance } = data;
  const fit = getTplFit();
  const env = getNationalEnvironment();
  const beta = fit.beta[config.state]?.shrunk ?? 1;
  // State House rows: the state legislature model's fitted incumbency advantage (the TPL fit has no
  // state-legislative tier). Money: its backtested K and cap over the state's own typical-gap fit.
  const incH = L.INCUMBENCY_PTS;
  const cal: MoneyCalibration | null = data.moneyCalibration ? { ...data.moneyCalibration, K: L.MONEY_K, CAP: L.MONEY_CAP } : null;
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

  // 2. lean: type-weighted year means, recency-weighted years, two-pass Huber. State House rows
  // take the legislature model's seat weight, boosted in the latest year that has one.
  const latestL = Math.max(-1, ...rows.filter((r) => r.raceType === "L" && r.included).map((r) => r.year));
  const typeWeight = (y: number, t: string): number => (t === "L" ? L.TYPE_WEIGHTS.L * (y === latestL ? L.RECENT_SEAT_BOOST : 1) : (G.RACE_TYPE_WEIGHTS[t] ?? 0));
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
      const coverage = types.reduce((s, t) => s + typeWeight(y, t), 0);
      const yearNM = types.reduce((s, t) => s + typeWeight(y, t) * typeNM[t], 0) / (coverage || 1);
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
    const typeShare = typeWeight(r.year, r.raceType) / (ya.coverage || 1);
    const within = r.huber / sameType.reduce((s, x) => s + x.huber, 0);
    r.weight = ya.weight * typeShare * within;
  }

  // 3–4. forward terms
  const envPts = beta * env.eHat;
  // 5. money: the nominees' receipts to date
  let money: ProjectionMoney | null = null;
  const f26 = finance?.["2026"];
  const latestPres = presRaw(Math.max(...years));
  if (cal && f26 && f26.d.receipts + f26.r.receipts > 0 && latestPres != null) {
    const holder = config.election2026?.status === "open" ? null : config.election2026?.seatHolder?.party ?? null;
    const incSign = holder === "R" ? 1 : holder === "D" ? -1 : 0;
    money = { ...priceMoneyGap(cal, f26.d.receipts, f26.r.receipts, incSign, latestPres, L.PARTIAL_CYCLE_GAP_SCALE), through: f26.through, nextReport: f26.nextReport, calibration: cal };
  }
  const margin = lean + envPts + (money?.pts ?? 0);
  // σ: the national environment's uncertainty through β*, plus the state legislature model's fitted
  // chamber shock and seat noise (a single seat sees both as noise).
  const sigma = Math.sqrt((beta * env.sigmaE) ** 2 + L.STATE_SHOCK ** 2 + L.SIGMA ** 2);
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
  // Precinct TPL, step 1: each precinct's margin relative to the district in every included
  // race-year, recency-weighted (PRECINCT_TPL_DECAY) and race-type-weighted like the district lean.
  const included = rows.filter((r) => r.included);
  const relLeanOf = (id: string): number | null => {
    let num = 0, den = 0;
    for (const r of included) {
      const pr = rowsByYear.get(r.year)?.find((x) => x.id === id)?.races[r.office];
      if (!pr || pr.d + pr.r <= 0) continue;
      const pm = marginOf(pr);
      if (pm == null) continue;
      const w = PROJECTION_CONSTANTS.PRECINCT_TPL_DECAY ** (latestYear - r.year) * typeWeight(r.year, r.raceType);
      num += w * (pm - r.raw); den += w;
    }
    return den > 0 ? num / den : null;
  };
  const precincts: ProjectedPrecinct[] = latestRows.map((p) => {
    const base = blendOf(p);
    const relLean = relLeanOf(p.id);
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
    return { id: p.id, sub: p.sub, reg: p.reg, base, relLean, projected: null, ballots, ballotsByYear, twoPartyRate };
  });
  // Step 2: anchor on the district projection so the 2026 two-party-vote-weighted mean of the
  // precinct TPLs is the projected margin. A precinct with no relative lean (no races on file)
  // falls back to its baseline plus the uniform shift.
  {
    let num = 0, den = 0;
    for (const p of precincts) { if (p.relLean == null) continue; const w = p.ballots * p.twoPartyRate; num += w * p.relLean; den += w; }
    const mean = den > 0 ? num / den : 0;
    for (const p of precincts) p.projected = p.relLean != null ? clamp(margin + p.relLean - mean) : p.base == null ? null : clamp(p.base + shift);
  }
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
    seatRows: { typeWeight: L.TYPE_WEIGHTS.L, boost: L.RECENT_SEAT_BOOST, latestYear: latestL > 0 ? latestL : null },
    money, margin, sigma, pD, interval80: [margin - 1.28 * sigma, margin + 1.28 * sigma],
    baseline: { year: latestYear, sthouse: distLeg, top: distTop, topOffice, blend: distBlend },
    shift, turnout, precincts,
    constants: { ...PROJECTION_CONSTANTS, HUBER_C: G.HUBER_C, SEAT_SIGMA: L.SIGMA, STATE_SHOCK: L.STATE_SHOCK, incumbencyPts: incH, MONEY_K: L.MONEY_K, MONEY_CAP: L.MONEY_CAP },
  };
}

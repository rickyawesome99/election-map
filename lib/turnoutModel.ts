import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { countyHouseData } from "@/data/countyHouseData";
import { senateData, governorData, houseData } from "@/data/forecastData";
import { forecastSummariesFor } from "@/lib/forecast";
import { FIPS_TO_STATE } from "@/lib/fips";
import { countyRunoffScale, cvapOf, parseCsv, presYears, redrawnBetween, statewideRaces, stateNameOf, turnoutRaw, STATE_ABBRS } from "@/lib/turnout";
import type { ProjectedRace, ProjectedRaceDetail, ProjectedCountyRow, ProjectionStateSlice, ProjectionCountySlice, TurnoutOffice } from "@/lib/turnoutTypes";

// ── The 2026 turnout estimate ─────────────────────────────────────────────────
// A level × distribution model. Every constant below is documented on /methodology/turnout
// (DOCUMENTED_IN in components/methodology/TurnoutMethodology.tsx) and every change to one goes in
// data/methodologyChangelog.ts.
//
//   LEVEL      A state's 2026 top-of-the-ticket votes = its latest CVAP × a blend of its top-race
//              CVAP turnout rates in the last two midterms (MIDTERM_WEIGHTS), × a ticket
//              adjustment when the state gains or loses a statewide race relative to the basis
//              midterm (HOUSE_ONLY_TICKET_FACTOR). Each basis midterm alone gives the range.
//   OFFICE     Senate / Governor votes = level × the state's blended office-to-top ratio in the
//              midterms that held that office. House votes are set per district: level within the
//              district × the district's House drop-off from the statewide top race (its own 2022
//              figure when the lines and a contest both existed, shrunk toward the state's
//              contested-seat mean; the state mean alone for redrawn districts) — so an unopposed
//              seat is imputed as if contested, as the page's notes say.
//   SPLIT      A county's share of the state's midterm electorate = its 2024 presidential share ×
//              its midterm propensity (blended midterm share ÷ matching presidential share, shrunk
//              toward 1 with SHRINK_VOTES pseudo-votes), then × its office factor relative to the
//              state's (shrunk the same way), renormalised to the state total. House counties are
//              cut to districts by data-entry/county_district_shares_2026.csv.
//
// scripts/turnoutBacktest.ts predicts 2022 from 2018 alone with the same code and prints the
// county / state / district errors that set SHRINK_VOTES; --emit writes data/turnoutCalibration.ts
// for the methodology tab.

export const ELECTION_YEAR = 2026;
export const BASE_PRES_YEAR = 2024;
/** Weight of each basis midterm in the level and office terms. Set by decision: the more recent
 *  midterm carries more of the signal, the older one keeps a single odd year from dominating. */
export const MIDTERM_WEIGHTS: Record<number, number> = { 2022: 0.6, 2018: 0.4 };
/** Pseudo-votes (in 2024 presidential votes) a county's own history is weighed against the state
 *  prior; a county with this many votes counts half. Fitted on the 2022 backtest. */
export const SHRINK_VOTES = 20000;
/** Ratio of a state's midterm top-race turnout with only House races on the ballot to the same
 *  state with a Senate or governor race. Fitted on the states that switched status between
 *  2018 and 2022. */
export const HOUSE_ONLY_TICKET_FACTOR = 0.92;
/** How far a district's own 2022 House drop-off is trusted against the state mean (0 = state mean
 *  only, 1 = the district alone). Set by decision: one observation per district. */
export const DISTRICT_DROPOFF_WEIGHT = 0.5;
/** Change in log top-race turnout per point of the top race's absolute margin: a closer race turns
 *  out more people. Fitted on the 41 states with a statewide race in both 2018 and 2022 (slope of
 *  the 2018→2022 change in log turnout on the change in |margin|, r = −0.40). For 2026 the margin
 *  is the site's own forecast for the state's closest Senate or governor race. */
export const COMPETITIVENESS_SLOPE = -0.0028;
/** The margin change the competitiveness term is allowed to see, in points. */
export const COMPETITIVENESS_CAP = 30;

type Office = Exclude<TurnoutOffice, "president">;

export type ModelConfig = {
  electionYear: number;
  basePresYear: number;
  midterms: Record<number, number>;
  shrinkVotes: number;
  houseOnlyTicketFactor: number;
  districtDropoffWeight: number;
  competitivenessSlope: number;
  competitivenessCap: number;
};

export const LIVE_CONFIG: ModelConfig = {
  electionYear: ELECTION_YEAR, basePresYear: BASE_PRES_YEAR, midterms: MIDTERM_WEIGHTS,
  shrinkVotes: SHRINK_VOTES, houseOnlyTicketFactor: HOUSE_ONLY_TICKET_FACTOR, districtDropoffWeight: DISTRICT_DROPOFF_WEIGHT,
  competitivenessSlope: COMPETITIVENESS_SLOPE, competitivenessCap: COMPETITIVENESS_CAP,
};

const STATE_FIPS_BY_ABBR: Record<string, string> = Object.fromEntries(Object.entries(FIPS_TO_STATE).map(([f, s]) => [s.abbr, f]));
const isCountyFips = (fips: string) => /^\d{5}$/.test(fips) && !!FIPS_TO_STATE[fips.slice(0, 2)];

// ── Statewide building blocks ────────────────────────────────────────────────

/** The state's top statewide race in a midterm: Senate or governor, whichever drew more votes;
 *  null when the state had neither (its House races were the top of the ticket). */
export function stateTopRace(state: string, year: number): { office: Office; votes: number } | null {
  const { races, senateSpecial } = statewideRaces(state, year);
  let top: { office: Office; votes: number } | null = null;
  for (const r of [races.senate, senateSpecial, races.governor]) {
    if (r?.votes != null && r.votes > 0 && (!top || r.votes > top.votes)) top = { office: r.office as Office, votes: r.votes };
  }
  return top;
}

/** Top-of-ticket votes for the LEVEL term: the top statewide race, else the House total. */
export function stateLevelVotes(state: string, year: number): { votes: number; houseOnly: boolean } | null {
  const top = stateTopRace(state, year);
  if (top) return { votes: top.votes, houseOnly: false };
  const h = statewideRaces(state, year).races.house?.votes;
  return h != null && h > 0 ? { votes: h, houseOnly: true } : null;
}

/** |margin| of the state's top statewide race that year (null when House-only). */
export function stateTopMargin(state: string, year: number): number | null {
  const top = stateTopRace(state, year);
  if (!top) return null;
  const { races, senateSpecial } = statewideRaces(state, year);
  const race = top.office === "governor" ? races.governor : [races.senate, senateSpecial].find((r) => r?.votes === top.votes) ?? races.senate;
  return race?.margin == null ? null : Math.abs(race.margin);
}

let forecastMarginCache: Map<string, number> | null = null;
/** |margin| of the state's closest 2026 Senate or governor race, from the site's forecast. */
export function forecastTopMargin(state: string): number | null {
  if (!forecastMarginCache) {
    forecastMarginCache = new Map();
    for (const rt of ["senate", "governor"] as const) {
      for (const r of forecastSummariesFor(rt)) {
        const cur = forecastMarginCache.get(r.stateAbbr);
        const m = Math.abs(r.margin);
        if (cur == null || m < cur) forecastMarginCache.set(r.stateAbbr, m);
      }
    }
  }
  return forecastMarginCache.get(state) ?? null;
}

/** The margin the level term compares each basis midterm against: the forecast for 2026, the
 *  actual top-race margin for a backtest year. */
function targetTopMargin(state: string, electionYear: number): number | null {
  return electionYear === ELECTION_YEAR ? forecastTopMargin(state) : stateTopMargin(state, electionYear);
}

function stateHasStatewideRace(state: string, electionYear: number): boolean {
  if (electionYear === ELECTION_YEAR) return senateData.some((r) => raceState(r.id) === state) || governorData.some((r) => raceState(r.id) === state);
  return stateTopRace(state, electionYear) != null;
}
const raceState = (id: string) => id.slice(0, 2);

// ── County building blocks ───────────────────────────────────────────────────

type CountyTop = { office: Office; votes: number } | null;

/** The county's votes in the state's top statewide race that year (the same race statewide, so
 *  county shares add up), or its House votes where the state had only House races AND every district
 *  touching the county was contested. */
function countyTopVotes(fips: string, state: string, year: number, contested: Map<string, boolean>): CountyTop {
  const top = stateTopRace(state, year);
  if (top) {
    if (top.office === "governor") { const v = countyGovernorData[fips]?.years[year]?.totalVotes; return v ? { office: "governor", votes: v * countyRunoffScale(state, year, "governor", false) } : null; }
    const { races, senateSpecial } = statewideRaces(state, year);
    // Match the county's regular vs special Senate figure to whichever race is the state's top.
    const useSpecial = senateSpecial && races.senate && senateSpecial.votes != null && races.senate.votes != null && senateSpecial.votes > races.senate.votes;
    const reg = countySenateData[fips]?.years[year]?.totalVotes, sp = countySenateData[fips]?.specialYears?.[year]?.totalVotes;
    const v = useSpecial ? (sp == null ? null : sp * countyRunoffScale(state, year, "senate", true)) : reg != null ? reg * countyRunoffScale(state, year, "senate", false) : sp == null ? null : sp * countyRunoffScale(state, year, "senate", true);
    return v ? { office: "senate", votes: v } : null;
  }
  const h = countyHouseData[fips]?.years[year];
  if (!h || !h.totalVotes) return null;
  const stateFips = fips.slice(0, 2);
  const allContested = (h.districts ?? []).length > 0 && (h.districts ?? []).every((n) => contested.get(`${stateFips}${String(n).padStart(2, "0")}|${year}`) === true);
  return allContested ? { office: "house", votes: h.totalVotes } : null;
}

function countyOfficeVotes(fips: string, office: Office, year: number): number | null {
  const state = FIPS_TO_STATE[fips.slice(0, 2)]?.abbr ?? "";
  if (office === "senate") {
    const reg = countySenateData[fips]?.years[year]?.totalVotes;
    if (reg != null) return reg * countyRunoffScale(state, year, "senate", false);
    const sp = countySenateData[fips]?.specialYears?.[year]?.totalVotes;
    return sp == null ? null : sp * countyRunoffScale(state, year, "senate", true);
  }
  if (office === "governor") { const v = countyGovernorData[fips]?.years[year]?.totalVotes; return v == null ? null : v * countyRunoffScale(state, year, "governor", false); }
  return countyHouseData[fips]?.years[year]?.totalVotes ?? null;
}

const shrink = (own: number | null, prior: number, n: number, k: number) => (own == null ? prior : (n * own + k * prior) / (n + k));

// ── County → district shares ─────────────────────────────────────────────────

export type CountyShare = { fips: string; district: string; share: number; basis: string };
let shares2026: CountyShare[] | null = null;
export function countyDistrictShares2026(): CountyShare[] {
  if (!shares2026) {
    shares2026 = parseCsv(readFileSync(join(process.cwd(), "data-entry", "county_district_shares_2026.csv"), "utf8"))
      .map((r) => ({ fips: r.county_fips, district: r.district, share: Number(r.share), basis: r.basis }));
  }
  return shares2026;
}

/** Shares for a past year from the district-by-county results file (a county piece's share of the
 *  county's House votes); used by the backtest. Counties whose pieces recorded no votes are split evenly. */
export function countyDistrictSharesFor(year: number): CountyShare[] {
  const rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_district_county_results.csv"), "utf8")).filter((r) => Number(r.year) === year && r.status !== "missing");
  const byCounty = new Map<string, { district: string; total: number }[]>();
  for (const r of rows) {
    const st = STATE_FIPS_BY_ABBR[r.state];
    const d = st + r.district.padStart(2, "0");
    if (!byCounty.has(r.county_fips)) byCounty.set(r.county_fips, []);
    byCounty.get(r.county_fips)!.push({ district: d, total: Number(r.total || 0) });
  }
  const out: CountyShare[] = [];
  for (const [fips, pieces] of byCounty) {
    const tot = pieces.reduce((s, p) => s + p.total, 0);
    for (const p of pieces) out.push({ fips, district: p.district, share: tot > 0 ? p.total / tot : 1 / pieces.length, basis: "pieces" });
  }
  return out;
}

// ── The model ────────────────────────────────────────────────────────────────

export type StateLevel = {
  state: string;
  cvap: number | null;
  /** Blended top-race CVAP turnout rate (percent) and the per-midterm rates behind it. */
  rate: number | null;
  rateBy: Record<number, number | null>;
  ticketFactor: number;
  /** The competitiveness adjustment applied per basis midterm (× on the rate), and the margins behind it. */
  competitiveness: Record<number, { factor: number; basisMargin: number | null; targetMargin: number | null }>;
  votes: number;
  low: number;
  high: number;
  officeFactor: Partial<Record<Office, number>>;
  /** Contested-seat House drop-off from the top statewide race (blended across midterms with a statewide race). */
  houseDropoff: number | null;
};

export type CountyWeight = {
  fips: string; state: string; name: string;
  pres: number;
  /** Midterm propensity: blended (county midterm share ÷ county presidential share), shrunk. */
  propensity: number;
  /** Share of the state's midterm top-race electorate. */
  share: number;
  officeFactor: Partial<Record<Office, number>>;
};

export type ModelRun = {
  config: ModelConfig;
  levels: Map<string, StateLevel>;
  counties: Map<string, CountyWeight>;
  /** District House drop-off factors used (district id → factor, plus whether it is the district's own). */
  districtDropoff: Map<string, { factor: number; own: boolean }>;
};

function contestedMap(): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const d of turnoutRaw().houseDistricts) m.set(`${d.id}|${d.year}`, d.contested);
  return m;
}

/** House drop-off per district and per state in one midterm: district House votes ÷ the state's
 *  top statewide race within the district, contested seats only. */
function districtDropoffs(year: number): { byDistrict: Map<string, number>; byState: Map<string, number> } {
  const raw = turnoutRaw();
  const byDistrict = new Map<string, number>();
  const sums = new Map<string, { h: number; t: number }>();
  for (const d of raw.houseDistricts) {
    if (d.year !== year || !d.contested || d.votes == null) continue;
    const top = stateTopRace(d.state, year);
    if (!top) continue;
    const t = raw.statewideByDistrict.get(`${d.id}|${year}|${top.office}`);
    if (t == null || t <= 0) continue;
    byDistrict.set(d.id, d.votes / t);
    const s = sums.get(d.state) ?? { h: 0, t: 0 };
    s.h += d.votes; s.t += t; sums.set(d.state, s);
  }
  const byState = new Map<string, number>();
  for (const [st, s] of sums) if (s.t > 0) byState.set(st, s.h / s.t);
  return { byDistrict, byState };
}

export function runModel(config: ModelConfig = LIVE_CONFIG): ModelRun {
  const midterms = Object.entries(config.midterms).map(([y, w]) => ({ year: Number(y), weight: w })).sort((a, b) => a.year - b.year);
  const contested = contestedMap();
  const levels = new Map<string, StateLevel>();
  const counties = new Map<string, CountyWeight>();

  for (const state of STATE_ABBRS) {
    if (state === "DC") continue;
    const fips = STATE_FIPS_BY_ABBR[state];
    const cvapNow = cvapOf("state", fips, config.basePresYear);
    const rateBy: Record<number, number | null> = {};
    const competitiveness: StateLevel["competitiveness"] = {};
    const has2026Statewide = stateHasStatewideRace(state, config.electionYear);
    const targetMargin = has2026Statewide ? targetTopMargin(state, config.electionYear) : null;
    let wsum = 0, rsum = 0;
    for (const m of midterms) {
      const lv = stateLevelVotes(state, m.year);
      const cv = cvapOf("state", fips, m.year);
      let rate = lv && cv ? (lv.votes / cv) * 100 : null;
      // Put the basis year on the same ticket footing as the target year.
      if (rate != null && lv) {
        if (lv.houseOnly && has2026Statewide) rate /= config.houseOnlyTicketFactor;
        else if (!lv.houseOnly && !has2026Statewide) rate *= config.houseOnlyTicketFactor;
      }
      // A closer top race turns out more people: move the basis year's rate to the target's margin.
      const basisMargin = lv && !lv.houseOnly ? stateTopMargin(state, m.year) : null;
      let cFactor = 1;
      if (rate != null && basisMargin != null && targetMargin != null) {
        const delta = Math.max(-config.competitivenessCap, Math.min(config.competitivenessCap, targetMargin - basisMargin));
        cFactor = Math.exp(config.competitivenessSlope * delta);
        rate *= cFactor;
      }
      competitiveness[m.year] = { factor: cFactor, basisMargin, targetMargin };
      rateBy[m.year] = rate;
      if (rate != null) { wsum += m.weight; rsum += m.weight * rate; }
    }
    const rate = wsum > 0 ? rsum / wsum : null;
    const votes = rate != null && cvapNow ? (rate / 100) * cvapNow : 0;
    const rates = Object.values(rateBy).filter((r): r is number => r != null);
    const low = cvapNow && rates.length ? (Math.min(...rates) / 100) * cvapNow : votes;
    const high = cvapNow && rates.length ? (Math.max(...rates) / 100) * cvapNow : votes;

    // Office factors: office votes ÷ level votes, blended over the midterms that held the office.
    const officeFactor: Partial<Record<Office, number>> = {};
    for (const office of ["senate", "governor"] as Office[]) {
      let ws = 0, fs = 0;
      for (const m of midterms) {
        const lv = stateLevelVotes(state, m.year);
        const { races, senateSpecial } = statewideRaces(state, m.year);
        const r = office === "senate" ? (races.senate?.votes != null && senateSpecial?.votes != null ? Math.max(races.senate.votes, senateSpecial.votes) : races.senate?.votes ?? senateSpecial?.votes) : races.governor?.votes;
        if (lv && r != null && r > 0) { ws += m.weight; fs += m.weight * (r / lv.votes); }
      }
      if (ws > 0) officeFactor[office] = fs / ws;
    }
    // Contested-seat House drop-off, blended over midterms with a statewide top race.
    let wd = 0, dsum = 0;
    for (const m of midterms) {
      const d = districtDropoffs(m.year).byState.get(state);
      if (d != null) { wd += m.weight; dsum += m.weight * d; }
    }
    const houseDropoff = wd > 0 ? dsum / wd : null;
    levels.set(state, { state, cvap: cvapNow, rate, rateBy, ticketFactor: config.houseOnlyTicketFactor, competitiveness, votes, low, high, officeFactor, houseDropoff });
  }

  // County propensities.
  const byState = new Map<string, string[]>();
  for (const fips of Object.keys(countyPresidentialData)) {
    if (!isCountyFips(fips)) continue;
    const st = FIPS_TO_STATE[fips.slice(0, 2)].abbr;
    if (st === "DC") continue;
    if (!byState.has(st)) byState.set(st, []);
    byState.get(st)!.push(fips);
  }
  for (const [state, fipsList] of byState) {
    const presNow = new Map<string, number>();
    for (const f of fipsList) { const v = presYears(f)[config.basePresYear]?.totalVotes; if (v) presNow.set(f, v); }
    const presTotalNow = [...presNow.values()].reduce((a, b) => a + b, 0);
    if (presTotalNow === 0) continue;
    // Per midterm: county share of state top votes, and of the matching presidential vote.
    const perMid = midterms.map((m) => {
      const top = new Map<string, number>(); let topTot = 0;
      const pres = new Map<string, number>(); let presTot = 0;
      for (const f of fipsList) {
        const t = countyTopVotes(f, state, m.year, contested);
        const p = presYears(f)[m.year - 2]?.totalVotes;
        if (t && p) { top.set(f, t.votes); topTot += t.votes; pres.set(f, p); presTot += p; }
      }
      return { ...m, top, topTot, pres, presTot };
    });
    const weights = new Map<string, CountyWeight>();
    let raw = 0;
    for (const f of fipsList) {
      const p = presNow.get(f);
      if (!p) continue;
      let ws = 0, ps = 0;
      for (const m of perMid) {
        const t = m.top.get(f), pr = m.pres.get(f);
        if (t != null && pr != null && m.topTot > 0 && m.presTot > 0) { ws += m.weight; ps += m.weight * ((t / m.topTot) / (pr / m.presTot)); }
      }
      const propensity = shrink(ws > 0 ? ps / ws : null, 1, p, config.shrinkVotes);
      const w = propensity * (p / presTotalNow);
      raw += w;
      weights.set(f, { fips: f, state, name: countyPresidentialData[f].countyName, pres: p, propensity, share: w, officeFactor: {} });
    }
    // Office factors relative to the state's own, per county, shrunk toward 1.
    for (const office of ["senate", "governor", "house"] as Office[]) {
      let ws = 0;
      const acc = new Map<string, number>();
      for (const m of midterms) {
        const lvS = stateLevelVotes(state, m.year);
        const { races, senateSpecial } = statewideRaces(state, m.year);
        const rS = office === "senate" ? (races.senate?.votes ?? senateSpecial?.votes) : office === "governor" ? races.governor?.votes : races.house?.votes;
        if (!lvS || rS == null || rS <= 0) continue;
        if (office === "house" && lvS.houseOnly) continue;
        const stateRatio = rS / lvS.votes;
        for (const f of fipsList) {
          const t = countyTopVotes(f, state, m.year, contested);
          let v = countyOfficeVotes(f, office, m.year);
          if (office === "house") {
            // Only where every district touching the county was contested that year.
            const h = countyHouseData[f]?.years[m.year];
            const ok = h && (h.districts ?? []).length > 0 && (h.districts ?? []).every((n) => contested.get(`${f.slice(0, 2)}${String(n).padStart(2, "0")}|${m.year}`) === true);
            if (!ok) v = null;
          }
          if (t && v != null && v > 0 && t.office !== office) acc.set(f, (acc.get(f) ?? 0) + m.weight * ((v / t.votes) / stateRatio));
          else if (t && v != null && v > 0 && t.office === office) acc.set(f, (acc.get(f) ?? 0) + m.weight * 1);
        }
        ws += m.weight;
      }
      for (const [f, w] of weights) {
        const own = acc.has(f) && ws > 0 ? acc.get(f)! / ws : null;
        w.officeFactor[office] = shrink(own, 1, w.pres, config.shrinkVotes);
      }
    }
    for (const w of weights.values()) { w.share = raw > 0 ? w.share / raw : 0; counties.set(w.fips, w); }
  }

  // District drop-off: the district's own 2022 figure when the lines and a contest existed, shrunk toward the state mean.
  const districtDropoff = new Map<string, { factor: number; own: boolean }>();
  const latestMid = Math.max(...midterms.map((m) => m.year));
  const dd = districtDropoffs(latestMid);
  for (const r of houseData) {
    const state = r.name.slice(0, 2);
    const lvl = levels.get(state);
    const stateMean = lvl?.houseDropoff ?? nationalHouseDropoff(midterms);
    const own = !redrawnBetween(state, latestMid, config.electionYear) ? dd.byDistrict.get(r.id) : undefined;
    districtDropoff.set(r.id, own != null ? { factor: config.districtDropoffWeight * own + (1 - config.districtDropoffWeight) * stateMean, own: true } : { factor: stateMean, own: false });
  }
  return { config, levels, counties, districtDropoff };
}

function nationalHouseDropoff(midterms: { year: number; weight: number }[]): number {
  let ws = 0, s = 0;
  for (const m of midterms) {
    const d = districtDropoffs(m.year).byState;
    let h = 0, t = 0;
    for (const st of d.keys()) { const lv = stateLevelVotes(st, m.year); if (lv) { h += d.get(st)! * lv.votes; t += lv.votes; } }
    if (t > 0) { ws += m.weight; s += m.weight * (h / t); }
  }
  return ws > 0 ? s / ws : 0.9;
}

// ── Races ────────────────────────────────────────────────────────────────────

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function lastMidtermWithOffice(state: string, office: Office, before: number): { year: number; votes: number | null } | null {
  for (let y = before - 4; y >= 2016; y -= 4) {
    const { races, senateSpecial } = statewideRaces(state, y);
    const r = office === "senate" ? races.senate ?? senateSpecial : races[office];
    if (r) return { year: y, votes: r.votes };
  }
  return null;
}

function statewideRaceDetail(run: ModelRun, office: "senate" | "governor", id: string, special: boolean): ProjectedRaceDetail | null {
  const state = raceState(id);
  const lvl = run.levels.get(state);
  if (!lvl) return null;
  const f = lvl.officeFactor[office] ?? 1;
  const total = lvl.votes * f;
  const rows: ProjectedCountyRow[] = [];
  let norm = 0;
  for (const c of run.counties.values()) if (c.state === state) norm += c.share * (c.officeFactor[office] ?? 1);
  for (const c of run.counties.values()) {
    if (c.state !== state) continue;
    const w = norm > 0 ? (c.share * (c.officeFactor[office] ?? 1)) / norm : 0;
    const cv = cvapOf("county", c.fips, run.config.basePresYear);
    const v = total * w;
    rows.push({ fips: c.fips, name: c.name, pres2024: c.pres, midtermRatio: r3(c.propensity), officeFactor: r3(c.officeFactor[office] ?? 1), share: 1, votes: r0(v), low: r0(lvl.low * f * w), high: r0(lvl.high * f * w), cvap: cv, rate: cv ? r1((v / cv) * 100) : null });
  }
  rows.sort((a, b) => b.votes - a.votes);
  const pres2024 = statewideRaces(state, run.config.basePresYear).races.president?.votes ?? 0;
  return {
    id: `${office === "senate" ? "S" : "G"}-${id}`, office, state, label: stateNameOf(state) + (special ? " (special)" : ""), special: special || undefined,
    votes: r0(total), low: r0(lvl.low * f), high: r0(lvl.high * f), cvap: lvl.cvap, rate: lvl.cvap ? r1((total / lvl.cvap) * 100) : null,
    prior: lastMidtermWithOffice(state, office, run.config.electionYear), pres2024, counties: rows,
  };
}

function houseRaceDetail(run: ModelRun, id: string, name: string, shares: CountyShare[]): ProjectedRaceDetail | null {
  const state = name.slice(0, 2);
  const lvl = run.levels.get(state);
  if (!lvl) return null;
  const dd = run.districtDropoff.get(id) ?? { factor: lvl.houseDropoff ?? 0.9, own: false };
  const rows: ProjectedCountyRow[] = [];
  let total = 0, low = 0, high = 0, cvapSum = 0, pres = 0;
  for (const s of shares) {
    if (s.district !== id) continue;
    const c = run.counties.get(s.fips);
    if (!c) continue;
    const f = c.officeFactor.house ?? 1;
    const v = lvl.votes * c.share * f * s.share * dd.factor;
    const lo = lvl.low * c.share * f * s.share * dd.factor, hi = lvl.high * c.share * f * s.share * dd.factor;
    const cv = cvapOf("county", s.fips, run.config.basePresYear);
    const cvPiece = cv != null ? cv * s.share : null;
    total += v; low += lo; high += hi; cvapSum += cvPiece ?? 0; pres += c.pres * s.share;
    rows.push({ fips: s.fips, name: c.name, pres2024: r0(c.pres * s.share), midtermRatio: r3(c.propensity), officeFactor: r3(f * dd.factor), share: r3(s.share), votes: r0(v), low: r0(lo), high: r0(hi), cvap: cvPiece != null ? r0(cvPiece) : null, rate: cvPiece ? r1((v / cvPiece) * 100) : null });
  }
  rows.sort((a, b) => b.votes - a.votes);
  const priorYear = Math.max(...Object.keys(run.config.midterms).map(Number));
  const priorRow = !redrawnBetween(state, priorYear, run.config.electionYear) ? turnoutRaw().houseDistricts.find((d) => d.id === id && d.year === priorYear) : undefined;
  return {
    id: `H-${id}`, office: "house", state, label: name,
    votes: r0(total), low: r0(low), high: r0(high), cvap: cvapSum ? r0(cvapSum) : null, rate: cvapSum ? r1((total / cvapSum) * 100) : null,
    prior: priorRow ? { year: priorYear, votes: priorRow.votes } : null, pres2024: r0(pres), counties: rows,
  };
}

let projectionCache: ProjectedRaceDetail[] | null = null;

/** Every 2026 race with its county split. */
export function projectAll(): ProjectedRaceDetail[] {
  if (projectionCache) return projectionCache;
  const run = runModel();
  const shares = countyDistrictShares2026();
  const out: ProjectedRaceDetail[] = [];
  for (const r of senateData) { const d = statewideRaceDetail(run, "senate", r.id.slice(0, 2), r.electionType === "Special"); if (d) { d.id = `S-${r.id}`; out.push(d); } }
  for (const r of governorData) { const d = statewideRaceDetail(run, "governor", r.id, false); if (d) out.push(d); }
  for (const r of houseData) { const d = houseRaceDetail(run, r.id, r.name, shares); if (d) out.push(d); }
  projectionCache = out;
  return out;
}

export function projectionSummary(): ProjectedRace[] {
  return projectAll().map((r) => { const { counties, ...rest } = r; void counties; return rest; });
}

export function projectionStateSlice(state: string): ProjectionStateSlice {
  return { state, races: projectAll().filter((r) => r.state === state) };
}

/** County view of the estimate for the map: each county's projected votes per office (House summed
 *  over its district pieces), with CVAP turnout. */
export function projectionCountySlice(): ProjectionCountySlice {
  const entries: ProjectionCountySlice["entries"] = {};
  for (const r of projectAll()) {
    for (const c of r.counties) {
      const e = entries[c.fips] ?? (entries[c.fips] = { name: c.name, state: r.state, cvap: cvapOf("county", c.fips, BASE_PRES_YEAR), votes: {}, low: {}, high: {} });
      e.votes[r.office] = (e.votes[r.office] ?? 0) + c.votes;
      e.low[r.office] = (e.low[r.office] ?? 0) + c.low;
      e.high[r.office] = (e.high[r.office] ?? 0) + c.high;
    }
  }
  return { entries };
}

export function projectionStates(): string[] {
  return [...new Set(projectAll().map((r) => r.state))].sort();
}

/** National view of the estimate: implied House votes and turnout, against the basis midterms. */
export function projectionNational(): { houseVotes: number; low: number; high: number; cvap: number; rate: number; basis: { year: number; houseVotes: number; topVotes: number; cvap: number }[] } {
  const races = projectAll().filter((r) => r.office === "house");
  const houseVotes = races.reduce((s, r) => s + r.votes, 0);
  const low = races.reduce((s, r) => s + r.low, 0), high = races.reduce((s, r) => s + r.high, 0);
  let cvap = 0;
  for (const st of STATE_ABBRS) if (st !== "DC") cvap += cvapOf("state", STATE_FIPS_BY_ABBR[st], BASE_PRES_YEAR) ?? 0;
  const basis = Object.keys(MIDTERM_WEIGHTS).map(Number).sort().map((year) => {
    let h = 0, t = 0, c = 0;
    for (const st of STATE_ABBRS) {
      if (st === "DC") continue;
      h += statewideRaces(st, year).races.house?.votes ?? 0;
      t += stateLevelVotes(st, year)?.votes ?? 0;
      c += cvapOf("state", STATE_FIPS_BY_ABBR[st], year) ?? 0;
    }
    return { year, houseVotes: h, topVotes: t, cvap: c };
  });
  return { houseVotes, low, high, cvap, rate: r1((houseVotes / cvap) * 100), basis };
}

// ── Backtest ─────────────────────────────────────────────────────────────────

export type BacktestResult = {
  target: number;
  config: ModelConfig;
  state: { n: number; mape: number; bias: number; rows: { state: string; office: string; predicted: number; actual: number; error: number }[] };
  county: { n: number; mape: number; weightedMape: number; bias: number };
  district: { n: number; mape: number; bias: number };
  /** Distribution-only: county share errors with the state total taken as known. */
  countyShare: { n: number; weightedMape: number };
};

/** Predict the top statewide race, the county split and every contested House district of
 *  `target` from the midterm `basis` (a single earlier midterm) and the presidential election two
 *  years before `target`, with the live code. */
export function backtest(target: number, basis: number, overrides: Partial<ModelConfig> = {}): BacktestResult {
  const config: ModelConfig = { ...LIVE_CONFIG, electionYear: target, basePresYear: target - 2, midterms: { [basis]: 1 }, ...overrides };
  const run = runModel(config);
  const contested = contestedMap();
  // State level: predicted top-race votes vs actual.
  const stateRows: BacktestResult["state"]["rows"] = [];
  for (const [state, lvl] of run.levels) {
    const actual = stateLevelVotes(state, target);
    if (!actual || lvl.votes <= 0) continue;
    stateRows.push({ state, office: stateTopRace(state, target)?.office ?? "house", predicted: lvl.votes, actual: actual.votes, error: lvl.votes / actual.votes - 1 });
  }
  const mape = (errs: number[]) => (errs.length ? errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length : 0);
  const bias = (errs: number[]) => (errs.length ? errs.reduce((s, e) => s + e, 0) / errs.length : 0);
  // County: predicted top-race votes (level × share) vs actual, and share-only errors.
  const cErr: number[] = [], cW: number[] = [], sErr: number[] = [], sW: number[] = [];
  for (const c of run.counties.values()) {
    const lvl = run.levels.get(c.state);
    const actualTop = countyTopVotes(c.fips, c.state, target, contested);
    const actualState = stateLevelVotes(c.state, target);
    if (!lvl || !actualTop || !actualState || actualTop.votes <= 0) continue;
    const pred = lvl.votes * c.share;
    cErr.push(pred / actualTop.votes - 1); cW.push(actualTop.votes);
    // Share with the state total known: compare county share of state top votes.
    const actualShare = actualTop.votes / actualState.votes;
    sErr.push(c.share / actualShare - 1); sW.push(actualTop.votes);
  }
  const wmape = (errs: number[], w: number[]) => { let s = 0, t = 0; errs.forEach((e, i) => { s += Math.abs(e) * w[i]; t += w[i]; }); return t ? s / t : 0; };
  // Districts on the target year's lines, contested seats only.
  const shares = countyDistrictSharesFor(target);
  const dd = districtDropoffs(basis);
  const dErr: number[] = [];
  for (const d of turnoutRaw().houseDistricts) {
    if (d.year !== target || !d.contested || d.votes == null || d.votes <= 0) continue;
    const lvl = run.levels.get(d.state);
    if (!lvl) continue;
    const stateMean = lvl.houseDropoff ?? dd.byState.get(d.state);
    if (stateMean == null) continue;
    let pred = 0;
    for (const s of shares) {
      if (s.district !== d.id) continue;
      const c = run.counties.get(s.fips);
      if (c) pred += lvl.votes * c.share * (c.officeFactor.house ?? 1) * s.share * stateMean;
    }
    if (pred > 0) dErr.push(pred / d.votes - 1);
  }
  const sErrs = stateRows.map((r) => r.error);
  return {
    target, config,
    state: { n: stateRows.length, mape: mape(sErrs), bias: bias(sErrs), rows: stateRows.sort((a, b) => Math.abs(b.error) - Math.abs(a.error)) },
    county: { n: cErr.length, mape: mape(cErr), weightedMape: wmape(cErr, cW), bias: bias(cErr) },
    district: { n: dErr.length, mape: mape(dErr), bias: bias(dErr) },
    countyShare: { n: sErr.length, weightedMape: wmape(sErr, sW) },
  };
}

/** The ticket effect: how much lower a state's midterm top-race turnout runs with only House races
 *  on the ballot, from the states that switched status between two midterms. */
export function ticketEffect(a: number, b: number): { switchers: { state: string; from: string; to: string; change: number }[]; others: number; estimate: number } {
  const rate = (st: string, y: number) => { const lv = stateLevelVotes(st, y); const cv = cvapOf("state", STATE_FIPS_BY_ABBR[st], y); return lv && cv ? { rate: lv.votes / cv, houseOnly: lv.houseOnly } : null; };
  const switchers: { state: string; from: string; to: string; change: number }[] = [];
  const otherChanges: number[] = [];
  for (const st of STATE_ABBRS) {
    if (st === "DC") continue;
    const ra = rate(st, a), rb = rate(st, b);
    if (!ra || !rb) continue;
    const change = Math.log(rb.rate / ra.rate);
    if (ra.houseOnly !== rb.houseOnly) switchers.push({ state: st, from: ra.houseOnly ? "House only" : "statewide", to: rb.houseOnly ? "House only" : "statewide", change });
    else otherChanges.push(change);
  }
  const others = otherChanges.reduce((s, v) => s + v, 0) / (otherChanges.length || 1);
  // Sign the switchers' excess change so that gaining a statewide race is positive.
  const signed = switchers.map((s) => (s.to === "statewide" ? 1 : -1) * (s.change - others));
  const estimate = Math.exp(-(signed.reduce((x, y) => x + y, 0) / (signed.length || 1)));
  return { switchers, others, estimate };
}

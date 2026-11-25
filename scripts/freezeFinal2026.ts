// The final 2026 forecast, frozen for the site. Every number a page shows about the 2026 forecast —
// races, chambers, the Outlook, the forecast-over-time series, the race pages' calculation cards,
// projected votes down to the county, the state legislature projections, the turnout estimate, the
// generic-ballot page and the /enight priors — is written here once, from the locked model, and
// read back by lib/final2026.ts. Pages read those files, never the live model, so lib/tplCompute.ts,
// lib/forecast.ts and the rest can change (a new TPL year, a new model) without moving the 2026
// forecast as published.
//
// Run ONCE, against the locked model (FORECAST_FINAL_AT set, `npm run check-lock` passing):
//   npm run freeze-final-2026             writes data/forecast-final-2026/frozen/ and its manifest
//   npm run freeze-final-2026 -- --verify recomputes and compares with the files on disk (meaningful
//                                         only while the live model is still the 2026 one)
// After the model changes, do not rerun it: the frozen files are the record. `npm run check-final-2026`
// (scripts/checkFinal2026.ts) checks them against the manifest's hashes.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { senateData, governorData, houseData, type RaceType, type RaceForecast } from "@/data/forecastData";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { forecastRace, getChamberSimulations, type ForecastFields } from "@/lib/forecast";
import { outlookData } from "@/lib/outlookData";
import { getForecastHistory } from "@/lib/forecastHistory";
import { projectRaceResults, impliedGenericBallot } from "@/lib/countyProjection";
import {
  calculateStateTpl, calculateDistrictTpl, effectiveEnvironment, raceIncumbencyPts, racePollingFor, computeProjectedMargin,
  raceMoneyTerm, raceFundraising2026, raceFundraisingSource2026, raceFinanceDetail2026, candidateQuality,
  getNationalEnvironment, nationalSigmaFor, incumbentAdvantage, computeIncumbentPts,
} from "@/lib/tplCompute";
import { alignedParty } from "@/data/raceEligibility";
import { projectChamber, projectDistrict, STATE_LEG_FORECAST_CONSTANTS } from "@/lib/stateLegForecast";
import { projectChamberPopularVote, projectAllChamberPopularVotes } from "@/lib/stateLegPopularVote";
import { runModel, projectAll, projectionNational, projectionStates, projectionStateSlice, projectionCountySlice } from "@/lib/turnoutModel";
import { genericBallotPopularVote } from "@/lib/genericBallotPopularVote";
import { resultsPriors } from "@/lib/resultsPriors";
import { RESULTS_OFFICES } from "@/lib/resultsTypes";
import { precinctDistrictSlugs, getPrecinctDistrict } from "@/lib/precinctDistrict/registry";
import { projectDistrict as projectPrecinctDistrict } from "@/lib/precinctDistrict/project";
import { FORECAST_FINAL_AT } from "@/lib/forecastClock";

if (!FORECAST_FINAL_AT) throw new Error("FORECAST_FINAL_AT is null: the forecast is not locked, nothing to freeze");

const DIR = path.join(process.cwd(), "data", "forecast-final-2026", "frozen");
const VERIFY = process.argv.includes("--verify");
const RACES: Record<RaceType, RaceForecast[]> = { house: houseData, senate: senateData, governor: governorData };
const TYPES: RaceType[] = ["house", "senate", "governor"];

// ── JSON safety: anything JSON would silently change (NaN, ±Infinity, undefined in an array, Map,
// Date, a class instance) is reported, so the frozen value is the value the page got.
const problems: string[] = [];
function audit(v: unknown, at: string): void {
  if (typeof v === "number" && !Number.isFinite(v)) problems.push(`${at}: ${v}`);
  else if (typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") problems.push(`${at}: ${typeof v}`);
  else if (v instanceof Map || v instanceof Set || v instanceof Date) problems.push(`${at}: ${v.constructor.name}`);
  else if (Array.isArray(v)) v.forEach((x, i) => { if (x === undefined) problems.push(`${at}[${i}]: undefined`); else audit(x, `${at}[${i}]`); });
  else if (v && typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) problems.push(`${at}: ${proto?.constructor?.name}`);
    for (const [k, x] of Object.entries(v)) audit(x, `${at}.${k}`);
  }
}

/** The forecast fields of a race, without the race record itself (pages merge it back from forecastData). */
function forecastFields(r: RaceForecast): ForecastFields {
  const f = forecastRace(r) as RaceForecast & ForecastFields;
  return {
    margin: f.margin, sigma: f.sigma, probability: f.probability, interval80: f.interval80, rating: f.rating,
    office: f.office, stateAbbr: f.stateAbbr, beta: f.beta, model: f.model, pollMargin: f.pollMargin,
    pollWeight: f.pollWeight, pollCount: f.pollCount, pollShade: f.pollShade, contest: f.contest, threeWay: f.threeWay,
  };
}

const stateAbbrOf = (r: RaceForecast) => forecastFields(r).stateAbbr;

/** Everything a race page's forecast sections read (hero, Forecast Calculation card, polls, fundraising). */
function raceCard(type: RaceType, r: RaceForecast) {
  const abbr = stateAbbrOf(r);
  const moneyTerm = raceMoneyTerm(r);
  const inc = [r.candidates?.dem, r.candidates?.rep].find((c) => c?.incumbent) ?? null;
  return {
    tpl: type === "house" ? calculateDistrictTpl(r.id) : calculateStateTpl(type === "governor" ? r.id.toUpperCase() : abbr, r.name),
    incumbentPts: raceIncumbencyPts(r),
    // The office advantage alone, without the competitive-seat extra (the public methodology's worked examples).
    baseIncumbentPts: computeIncumbentPts(forecastFields(r).office, inc ? alignedParty(inc) : null, inc?.appointed ?? false),
    fundraising: raceFundraising2026(type, r.id) ?? null,
    fundraisingSource: raceFundraisingSource2026(type, r.id) ?? null,
    financeDetail: type === "governor" ? null : raceFinanceDetail2026(type, r.id) ?? null,
    moneyTerm,
    gb: type === "house" ? effectiveEnvironment(abbr, "H") : effectiveEnvironment(type === "governor" ? r.id.toUpperCase() : abbr),
    polling: racePollingFor(r),
    projectedMargin: computeProjectedMargin(r),
    quality: candidateQuality(r),
  };
}

function build(): Record<string, unknown> {
  const files: Record<string, unknown> = {};

  // Races: the forecast fields of every race, by type and race id.
  files["races.json"] = Object.fromEntries(TYPES.map((t) => [t, Object.fromEntries(RACES[t].map((r) => [r.id, forecastFields(r)]))]));
  files["race-cards.json"] = Object.fromEntries(TYPES.map((t) => [t, Object.fromEntries(RACES[t].map((r) => [r.id, raceCard(t, r)]))]));
  files["chambers.json"] = getChamberSimulations();
  files["outlook.json"] = outlookData();
  const history = getForecastHistory();
  if (!history) throw new Error("data/generated/forecast-history.json is missing: run `npm run history` first");
  files["history.json"] = history;
  files["national.json"] = {
    environment: getNationalEnvironment(),
    sigma: { H: nationalSigmaFor("H"), S: nationalSigmaFor("S"), G: nationalSigmaFor("G") },
    incumbentAdvantage: incumbentAdvantage(),
    stateLegMoney: { K: STATE_LEG_FORECAST_CONSTANTS.MONEY_K, CAP: STATE_LEG_FORECAST_CONSTANTS.MONEY_CAP },
  };

  // Projected votes, down to the county (lib/countyProjection.ts), and the turnout estimate behind them.
  files["projections.json"] = {
    races: Object.fromEntries(TYPES.map((t) => [t, Object.fromEntries(RACES[t].map((r) => [r.id, projectRaceResults(t, r.id)]))])),
    impliedGenericBallot: impliedGenericBallot(),
  };
  files["turnout.json"] = {
    projectAll: projectAll(),
    national: projectionNational(),
    states: projectionStates(),
    stateSlices: Object.fromEntries(projectionStates().map((s) => [s, projectionStateSlice(s)])),
    countySlice: projectionCountySlice(),
    // The turnout model's per-state levels (runModel().levels), for the methodology's worked example.
    levels: Object.fromEntries(runModel().levels),
  };

  // State legislatures: every chamber's projection (with every district's), the districts of chambers
  // with nothing on the ballot, and the projected popular votes.
  const chambers: Record<string, unknown> = {};
  const loneDistricts: Record<string, unknown> = {};
  const popularVotes: Record<string, unknown> = {};
  const mismatched: string[] = [];
  for (const abbr of Object.keys(stateLegDistricts).sort()) {
    for (const chamber of ["house", "senate"] as Chamber[]) {
      const roster = stateLegDistricts[abbr]?.[chamber] ?? [];
      if (roster.length === 0) continue;
      const key = `${abbr}:${chamber}`;
      const p = projectChamber(abbr, chamber);
      chambers[key] = p;
      if (p) {
        // projectChamber passes { targetYear }; candidate pages and the atlas call projectDistrict with
        // no options. Check they agree, so one frozen district answers both.
        for (const d of roster.slice(0, 3)) {
          const a = JSON.stringify(projectDistrict(abbr, chamber, d)), b = JSON.stringify(p.districts.find((x) => x.key === d.number));
          if (a !== b) mismatched.push(`${key}:${d.number}`);
        }
      } else if (!(UNICAMERAL_STATES.has(abbr) && chamber === "house")) {
        for (const d of roster) loneDistricts[`${key}:${d.number}`] = projectDistrict(abbr, chamber, d);
      }
      popularVotes[key] = p ? projectChamberPopularVote(abbr, chamber) : null;
    }
  }
  if (mismatched.length) throw new Error(`projectDistrict with and without options differ: ${mismatched.slice(0, 5).join(", ")}`);
  // projectAllChamberPopularVotes() is the non-null chambers in this same order; lib/final2026.ts rebuilds it.
  const all = JSON.stringify(projectAllChamberPopularVotes());
  if (all !== JSON.stringify(Object.values(popularVotes).filter(Boolean))) throw new Error("projectAllChamberPopularVotes() is no longer the per-chamber popular votes in order");
  // Split so the pages that only need a chamber's totals don't parse every district: the summary file
  // holds each chamber and popular vote without its `districts`, the district file holds those.
  const summary: Record<string, unknown> = {}, districts: Record<string, unknown> = {};
  for (const key of Object.keys(chambers)) {
    const c = chambers[key] as { districts: unknown } | null;
    const pv = popularVotes[key] as { districts: unknown } | null;
    summary[key] = { chamber: c ? { ...c, districts: undefined } : null, popularVote: pv ? { ...pv, districts: undefined } : null };
    districts[key] = { chamber: c?.districts ?? null, popularVote: pv?.districts ?? null };
  }
  files["state-leg-chambers.json"] = summary;
  files["state-leg-districts.json"] = { chambers: districts, loneDistricts };

  files["generic-ballot.json"] = genericBallotPopularVote();
  files["results-priors.json"] = Object.fromEntries(RESULTS_OFFICES.map((o) => [o, resultsPriors(o)]));
  files["precinct-districts.json"] = Object.fromEntries(precinctDistrictSlugs().map((slug) => {
    const data = getPrecinctDistrict(slug);
    return [slug, data ? projectPrecinctDistrict(data) : null];
  }));
  return files;
}

const files = build();
for (const [name, v] of Object.entries(files)) audit(v, name);
if (problems.length) {
  console.error(`${problems.length} values JSON cannot keep:\n  ${problems.slice(0, 40).join("\n  ")}`);
  process.exit(1);
}

const text = (v: unknown) => JSON.stringify(v);
// builtAt in the priors is a wall-clock stamp; everything else must reproduce exactly.
const comparable = (name: string, s: string) => (name === "results-priors.json" ? s.replace(/"builtAt":"[^"]*"/g, '"builtAt":""') : s);

if (VERIFY) {
  let bad = 0;
  for (const [name, v] of Object.entries(files)) {
    const disk = fs.readFileSync(path.join(DIR, name), "utf8");
    if (comparable(name, disk) !== comparable(name, text(v))) { console.error(`DIFFERS: ${name}`); bad += 1; }
  }
  if (bad) process.exit(1);
  console.log(`Frozen 2026 forecast OK: ${Object.keys(files).length} files match the live model`);
} else {
  fs.mkdirSync(DIR, { recursive: true });
  const manifest: Record<string, unknown> = {
    note: "The final 2026 forecast as pages show it, frozen from the locked model. Read by lib/final2026.ts; never regenerate after the model changes. Hashes are checked by `npm run check-final-2026`.",
    lockedAt: FORECAST_FINAL_AT.toISOString(),
    frozenAt: new Date().toISOString(),
    commit: (() => { try { return execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(); } catch { return null; } })(),
    files: {} as Record<string, { bytes: number; sha256: string }>,
  };
  for (const [name, v] of Object.entries(files)) {
    const s = text(v);
    fs.writeFileSync(path.join(DIR, name), s);
    (manifest.files as Record<string, unknown>)[name] = { bytes: Buffer.byteLength(s), sha256: crypto.createHash("sha256").update(s).digest("hex") };
    console.log(`${name.padEnd(24)} ${(Buffer.byteLength(s) / 1e6).toFixed(2)} MB`);
  }
  fs.writeFileSync(path.join(DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

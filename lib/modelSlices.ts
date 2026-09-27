import "server-only";

// ── /model page data slices ───────────────────────────────────────────────────
// TplModelPage.tsx is a client component (interactive tables, maps and popups) that used to
// import lib/tplCompute directly — which dragged the compute hub and every dataset behind it
// (county results, fundraising, polls, forecastData…) into the /model bundle and into the
// shared chunk of every page that also mounts ForecastMap. The page now receives a small
// summary as props and fetches one state's or one district's full calculation on demand from
// the static routes under app/api/model/.

import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import {
  calculateStateModel,
  calculateDistrictModel,
  computeWarTable,
  getTplFit,
  incumbentAdvantage,
  type StateModelCalculation,
  type DistrictModelCalculation,
  type TplFit,
  type WarRow,
} from "@/lib/tplCompute";

export type ModelStateScore = { abbr: string; name: string; tpl: number };
export type ModelDistrictScore = { id: string; code: string; state: string; stateName: string; tpl: number };

export type ModelSummary = {
  fit: TplFit;
  incumbentAdvantage: Record<string, number>;
  states: ModelStateScore[];
  medianStateTpl: number;
  districts: ModelDistrictScore[];
  medianDistrictTpl: number;
  /** State abbreviation → that state's districts, sorted by number. */
  districtsByState: Record<string, { id: string; code: string; num: number }[]>;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
}

let summaryCache: ModelSummary | null = null;
export function buildModelSummary(): ModelSummary {
  if (summaryCache) return summaryCache;
  const states = statesData.map((s) => ({ abbr: s.abbr, name: s.name, tpl: calculateStateModel(s.abbr, s.name).tpl }));
  const districts = Object.entries(districtPresidentialData).map(([id, d]) => ({
    id, code: d.code, state: d.state, stateName: d.stateName, tpl: calculateDistrictModel(id).tpl,
  }));
  const districtsByState: ModelSummary["districtsByState"] = {};
  for (const [id, d] of Object.entries(districtPresidentialData)) {
    (districtsByState[d.state] ??= []).push({ id, code: d.code, num: parseInt(d.code.split("-")[1]) });
  }
  for (const arr of Object.values(districtsByState)) arr.sort((a, b) => a.num - b.num);
  summaryCache = {
    fit: getTplFit(),
    incumbentAdvantage: incumbentAdvantage(),
    states,
    medianStateTpl: median(states.map((s) => s.tpl)),
    districts,
    medianDistrictTpl: median(districts.map((d) => d.tpl)),
    districtsByState,
  };
  return summaryCache;
}

export function stateModelSlice(abbr: string): StateModelCalculation | null {
  const state = statesData.find((s) => s.abbr === abbr);
  return state ? calculateStateModel(state.abbr, state.name) : null;
}

export function districtModelSlice(id: string): DistrictModelCalculation | null {
  return districtPresidentialData[id] ? calculateDistrictModel(id) : null;
}

export function warSlice(): WarRow[] {
  return computeWarTable();
}

export const modelStateParams = () => statesData.map((s) => ({ abbr: s.abbr }));
export const modelDistrictParams = () => Object.keys(districtPresidentialData).map((id) => ({ id }));

/** The first state and district the page shows before any selection — rendered into the
 * page's props so the initial paint is complete without a fetch. */
export function defaultModelSelection() {
  const summary = buildModelSummary();
  const abbr = statesData[0].abbr;
  const firstStateAbbr = Object.keys(summary.districtsByState).sort()[0];
  const districtId = summary.districtsByState[firstStateAbbr]?.[0]?.id ?? "";
  return { abbr, districtId };
}

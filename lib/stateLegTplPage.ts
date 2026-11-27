import "server-only";
/**
 * The legislative-district TPL section's data (components/tpl/StateLegTplSection.tsx): one file per district,
 * public/state-leg-tpl/{chamber}/{ST}/{normalized key}.json, written by scripts/buildStateLegAtlasSlices.ts and
 * fetched by the district view when it opens. Same row and year shapes as a county page (lib/modelSlices.ts),
 * with nulls left out and figures rounded, so a district costs a few KB.
 */
import type { Chamber } from "../data/stateLegDistricts";
import { statesData } from "../data/statesData";
import { LEG_ROW_DEFAULTS as ROW_DEFAULTS, type StateLegTplPageData, type TplAsOf, type TplRace } from "../components/tpl/types";
import { toTplRace } from "./modelSlices";
import { calculateStateModel, getTplFit, incumbentAdvantage, leanAsOf, type YearAggregation } from "./tplCompute";
import { legChamberModels, type LegComputedRace, type LegDistrictModel } from "./stateLegTpl";
import type { RosterEntry } from "./stateLegDistrictRows";

const CHECKED = ["H", "L"] as const;
const stateTplCache = new Map<string, number>();

/** Numbers to 2 decimals, nulls and undefined left out. */
function compact<T>(v: T): T {
  if (Array.isArray(v)) return v.map(compact) as T;
  if (typeof v === "number") return (Math.round(v * 100) / 100) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x != null) out[k] = compact(x);
    return out as T;
  }
  return v;
}

function overTime(m: LegDistrictModel): TplAsOf[] {
  return m.yearAggregations
    .filter((y) => y.finalWeight > 0)
    .sort((a, b) => a.year - b.year)
    .flatMap((y) => {
      const asOf = leanAsOf(m.races, y.year, m.anchor, CHECKED);
      return asOf == null ? [] : [{ year: y.year, tpl: asOf, wrs: y.WRS, weight: y.finalWeight }];
    });
}

function rowOf(abbr: string, r: LegComputedRace): TplRace & { coverage?: number; note?: string } {
  const row = toTplRace(abbr, r);
  // A U.S. House or legislature row is the district's own share of one or more races: no seat or past-race page of its own.
  if (r.raceType === "H" || r.raceType === "L") { row.detailHref = undefined; row.pastHref = undefined; row.demWar = null; row.repWar = null; }
  const out: Record<string, unknown> = { ...row, ...(r.coverage < 0.999 ? { coverage: r.coverage } : {}), ...(r.note ? { note: r.note } : {}) };
  // Fields at their usual value are left out of the file; the page fills them back in (LEG_ROW_DEFAULTS).
  for (const [k, v] of Object.entries(ROW_DEFAULTS)) if (out[k] === v) delete out[k];
  return out as TplRace & { coverage?: number; note?: string };
}

/** Every district's TPL page data for one chamber, keyed by normalized district key. */
export function stateLegTplPages(abbr: string, chamber: Chamber, roster: RosterEntry[]): Map<string, StateLegTplPageData> {
  const state = statesData.find((s) => s.abbr === abbr);
  if (!stateTplCache.has(abbr) && state) stateTplCache.set(abbr, calculateStateModel(abbr, state.name).tpl);
  const fit = getTplFit();
  const E = Object.fromEntries(Object.entries(fit.E).map(([y, v]) => [y, Math.round(v * 1000) / 1000]));
  const out = new Map<string, StateLegTplPageData>();
  for (const [key, m] of legChamberModels(abbr, chamber, roster)) {
    const years: YearAggregation[] = m.yearAggregations.map((a) => ({ ...a, env: fit.E[a.year] ?? 0 }));
    out.set(key, compact({
      state: abbr, stateId: state?.id ?? abbr.toLowerCase(), stateName: state?.name ?? abbr, chamber,
      tpl: m.tpl, stateTpl: stateTplCache.get(abbr) ?? 0, anchor: m.anchor,
      E, incumbentAdvantage: incumbentAdvantage(),
      races: m.races.filter((r) => r.NM != null).map((r) => rowOf(abbr, r)),
      yearAggregations: years.filter((y) => y.racesPresent.length > 0),
      tplOverTime: overTime(m),
    }));
  }
  return out;
}

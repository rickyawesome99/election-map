import "server-only";
/**
 * The legislative-district TPL section's data (components/tpl/StateLegTplSection.tsx): one file per district,
 * public/state-leg-tpl/{chamber}/{ST}/{normalized key}.json, written by scripts/buildStateLegAtlasSlices.ts and
 * fetched by the district view when it opens. Same row and year shapes as a county page (lib/modelSlices.ts),
 * with nulls left out and figures rounded, so a district costs a few KB.
 */
import type { Chamber } from "../data/stateLegDistricts";
import { statesData } from "../data/statesData";
import { houseDistrictInfo } from "../data/forecastData";
import { ABBR_TO_FIPS } from "./fips";
import { LEG_ROW_DEFAULTS as ROW_DEFAULTS, type StateLegTplPageData, type TplAsOf, type TplRace } from "../components/tpl/types";
import { toTplRace } from "./modelSlices";
import { calculateStateModel, getTplFit, incumbentAdvantage, leanAsOf, type YearAggregation } from "./tplCompute";
import { legChamberModels, type LegComputedRace, type LegDistrictModel } from "./stateLegTpl";
import type { RosterEntry } from "./stateLegDistrictRows";

const CHECKED = ["H", "L"] as const;

/** The congressional map a state's U.S. House races of `year` were run on ("2012 map"), or null when it is
 * today's: the latest redraw on or before the year in data/forecastData.ts houseDistrictInfo (2012 before any). */
const redrawCache = new Map<string, number[]>();
function congressionalMapOf(abbr: string, year: number): string | null {
  if (!redrawCache.has(abbr)) {
    const fips = ABBR_TO_FIPS[abbr];
    const years = new Set<number>();
    for (const [id, entries] of Object.entries(houseDistrictInfo)) if (fips && id.slice(0, 2) === fips) for (const e of entries) years.add(e.year);
    redrawCache.set(abbr, [...years].sort((a, b) => a - b));
  }
  const redraws = redrawCache.get(abbr)!;
  const startOf = (y: number) => redraws.filter((r) => r <= y).pop() ?? 2012;
  const s = startOf(year);
  return s === startOf(2026) ? null : `${s} map`;
}
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

function rowOf(abbr: string, r: LegComputedRace, eraOf?: (year: number) => string | null): TplRace & { coverage?: number; note?: string } {
  const row = toTplRace(abbr, r);
  // A legislature row from a year held on an older map: which map, and the seats its votes came from.
  const era = r.raceType === "L" ? eraOf?.(r.year) ?? null : null;
  if (era) {
    const seats = (r.seats ?? []).filter((x) => x.share >= 0.05).slice(0, 4).map((x) => x.code.replace(/^0+(?=\w)/, ""));
    r = { ...r, note: [`${era}${seats.length ? `: seat${seats.length > 1 ? "s" : ""} ${seats.join(", ")}` : ""}`, r.note].filter(Boolean).join(" · ") };
  }
  // A U.S. House row: the congressional districts its votes were cast in, and the map when it is not today's.
  if (r.raceType === "H" && r.seats?.length) {
    const cds = r.seats.filter((x) => x.share >= 0.05).slice(0, 4).map((x) => x.code);
    const map = congressionalMapOf(abbr, r.year);
    if (cds.length) r = { ...r, note: [`${map ? `${map}: ` : ""}${cds.length > 1 ? "CDs" : "CD"} ${cds.join(", ")}`, r.note].filter(Boolean).join(" · ") };
  }
  // A U.S. House or legislature row is the district's own share of one or more races: no seat or past-race page of its own.
  if (r.raceType === "H" || r.raceType === "L") { row.detailHref = undefined; row.pastHref = undefined; row.demWar = null; row.repWar = null; }
  const out: Record<string, unknown> = { ...row, ...(r.coverage < 0.995 ? { coverage: r.coverage } : {}), ...(r.note ? { note: r.note } : {}) };
  // Fields at their usual value are left out of the file; the page fills them back in (LEG_ROW_DEFAULTS).
  for (const [k, v] of Object.entries(ROW_DEFAULTS)) if (out[k] === v) delete out[k];
  return out as TplRace & { coverage?: number; note?: string };
}

/** Every district's TPL page data for one chamber, keyed by normalized district key. */
/** eraOf: a year held on an older map → that map's name ("2012 map"); null on today's map. */
export function stateLegTplPages(abbr: string, chamber: Chamber, roster: RosterEntry[], eraOf?: (year: number) => string | null): Map<string, StateLegTplPageData> {
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
      races: m.races.filter((r) => r.NM != null).map((r) => rowOf(abbr, r, eraOf)),
      yearAggregations: years.filter((y) => y.racesPresent.length > 0),
      tplOverTime: overTime(m),
    }));
  }
  return out;
}

// Demographic metrics for precinct-district pages: the per-precinct fields the build script
// carries (2020 Census + ACS block-group aggregates) turned into a fixed menu of map/table
// metrics, plus the population-weighted rollups the district and subdivision views need.

import type { DemographicRow } from "./types";

// Representative age per Census bracket for a single continuous "average age" (65+ is placed
// near that open-ended bracket's typical age rather than at a raw midpoint).
const AGE_MID = { under18: 9, a18_34: 26, a35_64: 49.5, a65: 75 };
// Representative years of schooling per attainment bracket (HS-only is the implied remainder).
const EDU_YEARS = { noHs: 10, hs: 12, someCollege: 14, bachelors: 17 };

export function avgAge(d: DemographicRow): number | null {
  const pop = d.total_pop ?? 0;
  if (pop <= 0) return null;
  return ((d.age_under18 ?? 0) * AGE_MID.under18 + (d.age_18_34 ?? 0) * AGE_MID.a18_34 +
    (d.age_35_64 ?? 0) * AGE_MID.a35_64 + (d.age_65plus ?? 0) * AGE_MID.a65) / pop;
}

export function eduYears(d: DemographicRow): number | null {
  if (d.pct_no_hs_diploma == null || d.pct_some_college == null || d.pct_bachelors_plus == null) return null;
  const hsOnly = Math.max(0, 100 - d.pct_no_hs_diploma - d.pct_some_college - d.pct_bachelors_plus);
  return (d.pct_no_hs_diploma * EDU_YEARS.noHs + hsOnly * EDU_YEARS.hs + d.pct_some_college * EDU_YEARS.someCollege + d.pct_bachelors_plus * EDU_YEARS.bachelors) / 100;
}

const share = (num: number | undefined, d: DemographicRow) => {
  const pop = d.total_pop ?? 0;
  return pop > 0 && num != null ? (num / pop) * 100 : null;
};

export type DemoMetricKey =
  | "pct_white" | "pct_black" | "pct_hispanic" | "pct_asian"
  | "pct_65plus" | "pct_under35" | "avg_age"
  | "pct_college" | "edu_years" | "med_income";

export interface DemoMetric {
  key: DemoMetricKey;
  label: string;        // "% college"
  short: string;        // table header
  group: "race" | "age" | "education" | "income";
  format: (v: number) => string;
  domain: [number, number];   // color ramp bounds
  value: (d: DemographicRow) => number | null;
  /** how to roll up across precincts: population-weighted mean of the metric */
  weight?: (d: DemographicRow) => number;
}

const pct1 = (v: number) => `${v.toFixed(1)}%`;

export const DEMO_METRICS: DemoMetric[] = [
  { key: "pct_white",    label: "% white",          short: "White",     group: "race",      format: pct1, domain: [40, 100],   value: (d) => d.pct_white ?? null },
  { key: "pct_black",    label: "% Black",          short: "Black",     group: "race",      format: pct1, domain: [0, 40],     value: (d) => d.pct_black ?? null },
  { key: "pct_hispanic", label: "% Hispanic",       short: "Hispanic",  group: "race",      format: pct1, domain: [0, 15],     value: (d) => d.pct_hispanic ?? null },
  { key: "pct_asian",    label: "% Asian",          short: "Asian",     group: "race",      format: pct1, domain: [0, 15],     value: (d) => d.pct_asian ?? null },
  { key: "pct_65plus",   label: "% 65 and over",    short: "65+",       group: "age",       format: pct1, domain: [10, 35],    value: (d) => share(d.age_65plus, d) },
  { key: "pct_under35",  label: "% under 35",       short: "Under 35",  group: "age",       format: pct1, domain: [25, 55],    value: (d) => share((d.age_under18 ?? 0) + (d.age_18_34 ?? 0), d) },
  { key: "avg_age",      label: "Average age",      short: "Avg age",   group: "age",       format: (v) => `${v.toFixed(1)}`, domain: [34, 50], value: avgAge },
  { key: "pct_college",  label: "% bachelor's+",    short: "College",   group: "education", format: pct1, domain: [10, 70],    value: (d) => d.pct_bachelors_plus ?? null },
  { key: "edu_years",    label: "Avg. schooling",   short: "Schooling", group: "education", format: (v) => `${v.toFixed(1)} yrs`, domain: [12.5, 15.5], value: eduYears },
  { key: "med_income",   label: "Median income",    short: "Income",    group: "income",    format: (v) => `$${Math.round(v / 1000)}k`, domain: [40000, 140000], value: (d) => d.med_hh_income ?? null },
];

export const DEMO_METRIC_BY_KEY: Record<DemoMetricKey, DemoMetric> =
  Object.fromEntries(DEMO_METRICS.map((m) => [m.key, m])) as Record<DemoMetricKey, DemoMetric>;

/** Population-weighted mean of a metric over a set of precincts (income and averages included). */
export function popWeightedMetric(rows: DemographicRow[], metric: DemoMetric): number | null {
  let num = 0, den = 0;
  for (const d of rows) {
    const v = metric.value(d);
    const w = d.total_pop ?? 0;
    if (v == null || w <= 0) continue;
    num += v * w; den += w;
  }
  return den > 0 ? num / den : null;
}

export function sumPopulation(rows: DemographicRow[]): number {
  return rows.reduce((s, d) => s + (d.total_pop ?? 0), 0);
}

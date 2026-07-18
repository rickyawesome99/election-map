export type DemoProps = {
  total_pop?: number;
  pct_white?: number | null;
  pct_black?: number | null;
  pct_hispanic?: number | null;
  pct_asian?: number | null;
  med_hh_income?: number | null;
  pct_bachelors_plus?: number | null;
  pct_no_hs_diploma?: number | null;
  pct_some_college?: number | null;
  age_under18?: number;
  age_18_34?: number;
  age_35_64?: number;
  age_65plus?: number;
};

// Representative age per Census age bracket, used to build a single continuous "average age"
// estimate (65+ is approximated near that open-ended bracket's typical age, not its raw midpoint).
const AGE_MIDPOINT_UNDER18 = 9;
const AGE_MIDPOINT_18_34 = 26;
const AGE_MIDPOINT_35_64 = 49.5;
const AGE_MIDPOINT_65_PLUS = 75;

/** Weighted-average age estimated from the four Census age brackets. */
export function avgAge(props: DemoProps): number | null {
  const pop = props.total_pop ?? 0;
  if (pop <= 0) return null;
  const u18 = props.age_under18 ?? 0;
  const a1834 = props.age_18_34 ?? 0;
  const a3564 = props.age_35_64 ?? 0;
  const a65p = props.age_65plus ?? 0;
  return (
    u18 * AGE_MIDPOINT_UNDER18 +
    a1834 * AGE_MIDPOINT_18_34 +
    a3564 * AGE_MIDPOINT_35_64 +
    a65p * AGE_MIDPOINT_65_PLUS
  ) / pop;
}

// Representative years-of-schooling per attainment bracket, used to build a single
// continuous "average years of education" index (analogous to median income).
const EDU_YEARS_NO_HS = 10;
const EDU_YEARS_HS_ONLY = 12;
const EDU_YEARS_SOME_COLLEGE = 14;
const EDU_YEARS_BACHELORS_PLUS = 17;

/** Weighted-average years of schooling from the three ACS attainment shares (HS-only is the implied remainder). */
export function eduYears(props: DemoProps): number | null {
  const noHs = props.pct_no_hs_diploma;
  const someCollege = props.pct_some_college;
  const bachelorsPlus = props.pct_bachelors_plus;
  if (noHs == null || someCollege == null || bachelorsPlus == null) return null;
  const hsOnly = Math.max(0, 100 - noHs - someCollege - bachelorsPlus);
  return (
    (noHs / 100) * EDU_YEARS_NO_HS +
    (hsOnly / 100) * EDU_YEARS_HS_ONLY +
    (someCollege / 100) * EDU_YEARS_SOME_COLLEGE +
    (bachelorsPlus / 100) * EDU_YEARS_BACHELORS_PLUS
  );
}

/** Population-weighted average of a per-precinct metric across a set of precincts. */
export function popWeightedAvg(precincts: DemoProps[], getValue: (props: DemoProps) => number | null): number | null {
  let sumWeighted = 0;
  let sumWeight = 0;
  for (const p of precincts) {
    const value = getValue(p);
    const weight = p.total_pop ?? 0;
    if (value == null || weight <= 0) continue;
    sumWeighted += value * weight;
    sumWeight += weight;
  }
  return sumWeight > 0 ? sumWeighted / sumWeight : null;
}

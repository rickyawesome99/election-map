// Shared shapes for the precinct-district analysis pages (/analysis/districts/[slug]).
// Everything here mirrors what scripts/build-precinct-district.py writes to
// data/precinct-districts/<slug>/ — one folder per district, nothing district-specific in code.

// Known keys: "pres" | "gov" | "ussen" | "ushouse" | "sthouse" | "stsen"; any other statewide office a
// district file carries (e.g. "ag") is allowed, so this stays an open string.
export type OfficeKey = string;

export interface OfficeMeta {
  label: string;      // "U.S. Senate"
  short: string;      // "Senate"
  level: "national" | "state" | "district";
  // Candidate names for the year (both present when the office was one race across the footprint).
  d?: string;
  r?: string;
  dIncumbent?: boolean;
  rIncumbent?: boolean;
  // District-level offices: which districts the footprint's precincts belonged to that year, with
  // the candidates known for each. More than one key = a patchwork, not a single race.
  districts?: Record<string, { precincts: number; d?: string; r?: string; dIncumbent?: boolean; rIncumbent?: boolean }>;
}

export interface RaceVotes {
  d: number;
  r: number;
  t: number;        // total ballots in the race (≥ d + r; the remainder is other/write-in)
  dist?: string;    // district label for district-level offices ("CD-13", "HD-35")
}

export interface PrecinctYear {
  id: string;                        // precinct name as the county prints it, e.g. "CUY FALLS 2-A"
  sub: string;                       // subdivision id (township / city / village)
  reg: number;                       // registered voters
  ballots: number;                   // ballots cast
  races: Record<OfficeKey, RaceVotes>;
}

export interface YearResults {
  era: string;
  offices: Record<OfficeKey, OfficeMeta>;
  precincts: PrecinctYear[];
}

export interface DistrictResults {
  slug: string;
  years: Record<string, YearResults>;
}

export interface Subdivision {
  id: string;
  name: string;
  kind: "city" | "village" | "township" | (string & {});
}

export interface BoundaryEra {
  id: string;
  label: string;
  years: number[];
  current: boolean;
  precincts: number;
  geography: string;                // URL under /public: one polygon per precinct
  geographySubdivisions?: string;   // the same precincts dissolved into townships / cities
}

export interface Election2026 {
  date: string;
  status: "open" | "incumbent" | (string & {});
  seatHolder?: { name: string; party: "D" | "R" | "I"; note?: string };
  candidates?: { d?: { name: string; party: string }; r?: { name: string; party: string } };
  primaryDate?: string;
  sources?: string[];
}

export interface DistrictConfig {
  slug: string;
  state: string;
  stateName: string;
  chamber: "house" | "senate";
  number: string;
  name: string;
  shortName: string;
  county: string;
  blurb: string;
  stateLegDistrictId?: string | null;
  subdivisions: Subdivision[];
  offices: Record<OfficeKey, Pick<OfficeMeta, "label" | "short" | "level">>;
  eras: BoundaryEra[];
  years: number[];
  composition: Record<string, Record<OfficeKey, string[]>>;
  election2026?: Election2026 | null;
  sources: { label: string; text: string }[];
  crosswalk: { method: string; blocks: string };
  generated: string;
}

export interface DemographicRow {
  total_pop?: number;
  age_under18?: number;
  age_18_34?: number;
  age_35_64?: number;
  age_65plus?: number;
  pop_white?: number;
  pop_black?: number;
  pop_hispanic?: number;
  pop_asian?: number;
  pct_white?: number;
  pct_black?: number;
  pct_hispanic?: number;
  pct_asian?: number;
  pct_native?: number;
  pct_multi?: number;
  med_hh_income?: number;
  pct_bachelors_plus?: number;
  pct_no_hs_diploma?: number;
  pct_some_college?: number;
}

export interface DistrictDemographics {
  era: string;
  source?: string;
  precincts: Record<string, DemographicRow>;
}

export interface EraCrosswalk {
  // old precinct id -> [[new precinct id, weight], ...]; weights sum to 1
  forward: Record<string, [string, number][]>;
  // new precinct id -> [[old precinct id, share of the new precinct's 2020 population], ...]
  composition: Record<string, [string, number][]>;
  // old precinct id -> share of its 2020 population that landed inside the current geography
  coverage: Record<string, number>;
  areaFallback: string[];
  // old precincts whose population mostly (>50%) sits outside the current district; they are
  // dropped from the current-lines view and only appear under original lines
  excluded: { precinct: string; subdivision: string | null; coverage: number }[];
  summary: { oldPrecincts: number; newPrecincts: number; oldMappingMostlyToOne: number; areaFallback: number; excluded: number };
}

export interface DistrictCrosswalk {
  to: string;
  method: string;
  blocks: string;
  eras: Record<string, EraCrosswalk>;
}

export interface CandidateFinance {
  name: string;
  committee: string;
  receipts: number;       // gross: cash + in-kind, net of refunds (the calibration's measure)
  inKind: number;
  spent: number;
  cashOnHand: number;
  url: string;
  caveats?: string[];
}

/** data/precinct-districts/<slug>/finance.json — hand-entered from the state filings. */
export interface DistrictFinance {
  note: string;
  "2026": { through: string; nextReport?: string; d: CandidateFinance; r: CandidateFinance };
  /** past nominees' receipts by office and year, used to strip money from those race rows */
  history: Partial<Record<string, Record<string, { d: number; r: number; dName?: string; rName?: string }>>>;
}

/** data/precinct-districts/money/<ST>.json — written by scripts/fitStateLegMoney.ts. */
export interface MoneyCalibration {
  state: string;
  chamber: string;
  fitYear: number;
  n: number;
  source: string;
  structural: { intercept: number; incSign: number; pres: number };
  K: number;
  kOls: number;
  kSe: number;
  CAP: number;
  rmse: { noMoney: number; withMoney: number };
  looGrid: { k: number; looMae: number }[];
  fitted: string;
}

export interface PrecinctDistrictData {
  config: DistrictConfig;
  results: DistrictResults;
  demographics: DistrictDemographics;
  crosswalk: DistrictCrosswalk;
  finance?: DistrictFinance;
  moneyCalibration?: MoneyCalibration;
}

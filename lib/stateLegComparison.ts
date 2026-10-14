// Types for the state legislative model comparison (/analysis/state-leg-models), shared by the
// build script that writes public/state-leg-comparison/*.json, the server page that reads the
// summary, and the client table that fetches the district rows.

export type ModelId = "ours" | "sn" | "ei";

export const MODEL_NAME: Record<ModelId, string> = { ours: "This site", sn: "State Navigate", ei: "ElectIndex" };

/** One model's call on one district: R-positive margin, P(Democrat), and the model's own rating. */
export interface ModelCall {
  m: number;
  pD: number | null;
  rating: string;
  /** The model marks the seat uncontested (one major party on the ballot). */
  unc: boolean;
  /** Seat rows folded into this district (State Navigate and ElectIndex list the A/B states per seat). */
  n: number;
  /** The model's own view of who holds the seat and who it favors. */
  cur: "D" | "R" | null;
  lead: "D" | "R" | "I" | null;
}

export interface ComparisonDistrict {
  abbr: string;
  chamber: "house" | "senate";
  key: string;
  label: string;
  href: string;
  seats: number;
  /** Our roster's sitting party: D, R, O, mixed or vac. */
  cur: string;
  contest: string;
  ours: ModelCall | null;
  sn: ModelCall | null;
  ei: ModelCall | null;
}

export interface ComparisonSummary {
  built: string;
  sources: Record<"sn" | "ei", { name: string; url: string; fetched: string; run: string | null; hero: { seats: number; demPickups: number; repPickups: number } | null }>;
  districts: number;
  toplines: { model: ModelId; seats: number; demFav: number; repFav: number; othFav: number; demPick: number; repPick: number; demChambers: number }[];
  agreement: {
    model: "sn" | "ei";
    n: number;
    bias: number;
    mad: number;
    corr: number;
    favoredDisagree: number;
    within10: number;
    bands: { band: string; ours: number | null; oursN: number; theirs: number | null; theirsN: number }[];
    states: { abbr: string; n: number; bias: number; mad: number }[];
  }[];
  chambers: {
    abbr: string; chamber: "house" | "senate"; state: string; href: string; totalSeats: number | null; seatsUp: number; nowD: number; nowR: number;
    ours: { d: number; r: number; pD: number | null };
    sn: { d: number; r: number; pD: number | null } | null;
    ei: { d: number; r: number | null; pD: number | null } | null;
  }[];
  unmatched: { sn: number; ei: number };
}

// Shared types and small helpers for the Legislative District Atlas (the per-chamber pages at
// /states/[id]/legislature/[chamber]). No data imports: the client reads one per-chamber JSON
// slice from public/state-leg-atlas/{chamber}/{ST}.json, built by scripts/buildStateLegAtlasSlices.ts.

import type { Chamber, Incumbent } from "@/data/stateLegDistricts";
import type { Demographics } from "@/data/demographics";
import type { StateLegDistrictResult } from "@/data/stateLegResults";
import type { StateLegRedistrictingEntry } from "@/data/stateLegRedistricting";
import type { StateLegDistrictCandidates2026 } from "@/data/stateLegCandidates2026";
import type { StateLegOutgoing2026 } from "@/data/stateLegOutgoing2026";

export type AtlasPresVote = { demPct: number; repPct: number; margin: number; totalVotes: number | null; estimated?: boolean };

export type AtlasPresByEra = {
  era: string;
  /** Elections held on these lines, or empty for the current map. */
  years: number[];
  pres: Partial<Record<"2016" | "2020" | "2024", AtlasPresVote>>;
  pop2020?: number;
};

export type AtlasResult = StateLegDistrictResult & {
  year: number;
  /** "current" or the superseded boundary vintage the election was held on. */
  era: string;
};

export type AtlasDistrict = {
  key: string;
  label: string;
  geoid?: string;
  seats?: number;
  incumbents: Incumbent[];
  lastElection: number | null;
  nextElection: number | null;
  demographics?: Demographics;
  /** Presidential results on today's lines (2024 precinct-exact, 2016/2020 from the era overlay). */
  presCurrent: Partial<Record<"2016" | "2020" | "2024", AtlasPresVote>>;
  /** The same district KEY on each map era it existed on, oldest first, current last. */
  presByEra: AtlasPresByEra[];
  /** This district key's legislative results, newest first, each tagged with the lines it ran on. */
  results: AtlasResult[];
  /** Redistricting history, oldest transition first. */
  redistricting: StateLegRedistrictingEntry[];
  /** 2026 general-election field, where the chamber is on the ballot (Ballotpedia). */
  candidates2026?: StateLegDistrictCandidates2026;
  /** The 2026 projection (lib/stateLegForecast.ts), where the chamber is on the ballot. */
  projection?: AtlasProjection;
  /** Members not seeking re-election in 2026 and why (Wikipedia's retirement lists). */
  outgoing2026?: StateLegOutgoing2026[];
  /** Fundraising per cycle, newest first, where a source covers the state (lib/stateLegMoney.ts). */
  money?: AtlasMoney[];
  /** An overlay district (a New Hampshire floterial): no polygon of its own, sits on `components`. */
  overlay?: boolean;
  components?: string[];
};

/** One row of a district's 2026 lean ledger (lib/stateLegForecast.ts ProjectionRow, as shipped). */
export type AtlasProjectionRow = { year: number; kind: "P" | "L"; label: string; era: string; raw: number; relocated: boolean; coverage: number; presDelta: number; incSign: number; incPts: number; envPts: number; NM: number; huber: number; weight: number };

export type AtlasProjection = {
  lean: number | null;
  beta: number;
  envPts: number;
  incSign: number;
  incPts: number;
  margin: number | null;
  sigma: number;
  pD: number | null;
  rating: string | null;
  contest: "contested" | "uncontested-D" | "uncontested-R" | "none" | "other" | "not-up";
  seats: number;
  rows: AtlasProjectionRow[];
};

export type AtlasChamberProjection = {
  year: number;
  totalSeats: number | null;
  seatsUp: number;
  holdover: { dem: number; rep: number; oth: number };
  decided: { dem: number; rep: number };
  expectedDem: number;
  expectedRep: number;
  lo80: number;
  hi80: number;
  majority: number | null;
  supermajority: number | null;
  pDemControl: number | null;
  pRepControl: number | null;
  pDemSuper: number | null;
  pRepSuper: number | null;
  unprojected: number;
  eHat: number;
  sigmaE: number;
};

export type AtlasMoneyCandidate = { name: string; party: "D" | "R" | "O"; contributions: number | null; matched: boolean };
export type AtlasMoney = {
  year: number;
  source: string;
  dataThrough: string | null;
  candidates: AtlasMoneyCandidate[];
  /** Finance records that matched no candidate on the atlas's list. */
  unmatched: AtlasMoneyCandidate[];
  demTotal: number | null;
  repTotal: number | null;
  /** (R − D) / (R + D) × 100 of the two parties' contributions. */
  gapPct: number | null;
};

export type AtlasEra = { key: string; label: string; years: number[]; source?: string; enactedDate?: string; note?: string; verified: boolean };

export type AtlasChamber = {
  abbr: string;
  chamber: Chamber;
  built: string;
  /** When the 2026 candidate lists were fetched, if the chamber is on the ballot. */
  candidates2026Fetched?: string;
  /** Chamber-level simulation, where the chamber is on the ballot. */
  projection?: AtlasChamberProjection;
  eras: AtlasEra[];
  electionYears: number[];
  districts: AtlasDistrict[];
};

export const CHAMBER_SLUGS: Chamber[] = ["house", "senate"];

export function atlasSliceUrl(abbr: string, chamber: Chamber): string {
  return `/state-leg-atlas/${chamber}/${abbr}.json`;
}

/** URL hash for one district: #hd-31, #sd-5, #hd-BE1 (New Hampshire), #hd-Addison-1 (Vermont). */
export function districtHash(chamber: Chamber, key: string): string {
  return `#${chamber === "house" ? "hd" : "sd"}-${encodeURIComponent(key)}`;
}

export function keyFromHash(hash: string, chamber: Chamber): string | null {
  const prefix = chamber === "house" ? "#hd-" : "#sd-";
  if (!hash.startsWith(prefix)) return null;
  const key = decodeURIComponent(hash.slice(prefix.length));
  return key || null;
}

/** "12" before "12A" before "13"; named districts alphabetical after the numbered ones. */
export function compareDistrictKeys(a: string, b: string): number {
  const ma = a.match(/^(\d+)([A-Za-z]*)$/);
  const mb = b.match(/^(\d+)([A-Za-z]*)$/);
  if (ma && mb) {
    const na = parseInt(ma[1], 10), nb = parseInt(mb[1], 10);
    if (na !== nb) return na - nb;
    return ma[2].localeCompare(mb[2]);
  }
  if (ma) return -1;
  if (mb) return 1;
  // New Hampshire: county code then number.
  const ha = a.match(/^([A-Z]{2})(\d+)$/), hb = b.match(/^([A-Z]{2})(\d+)$/);
  if (ha && hb) return ha[1] === hb[1] ? parseInt(ha[2], 10) - parseInt(hb[2], 10) : ha[1].localeCompare(hb[1]);
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Short district name for boxes and headings: "HD 31", "SD 5", "BE1", "Addison-1". */
export function shortDistrictName(chamber: Chamber, key: string): string {
  return /^\d+[A-Za-z]?$/.test(key) ? `${chamber === "house" ? "HD" : "SD"} ${key}` : key;
}

/** "$66.5k", "$1.2M", "$890". */
export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k` : a.toFixed(0);
  return `${v < 0 ? "−" : ""}$${s}`;
}

/** Two-party R-positive margin of a legislative result, or null where no count exists. */
export function resultMargin(r: StateLegDistrictResult): number | null {
  if (r.noCount || r.totalVotes == null || r.totalVotes === 0 || r.demVotes == null || r.repVotes == null) return null;
  return ((r.repVotes - r.demVotes) / r.totalVotes) * 100;
}

/** How a 2026 field reads for the selector and the header: who is in it and whether both majors are. */
export function contest2026(c: StateLegDistrictCandidates2026 | undefined): { label: string; status: "contested" | "uncontested-D" | "uncontested-R" | "none" | "other"; open: boolean } | null {
  if (!c) return null;
  const real = c.candidates.filter((x) => !x.writeIn);
  const parties = new Set(real.map((x) => x.party));
  const open = !c.candidates.some((x) => x.incumbent);
  if (real.some((x) => x.canceledGeneral)) {
    const parties = new Set(real.map((x) => x.party));
    const p = parties.size === 1 ? [...parties][0] : null;
    const who = real.length === 1 ? real[0].name : `${real.length} ${p ?? ""} filers`.trim();
    if (p === "D") return { label: `${who} (D), general canceled`, status: "uncontested-D", open };
    if (p === "R") return { label: `${who} (R), general canceled`, status: "uncontested-R", open };
    return { label: "General election canceled", status: "none", open };
  }
  const names = (p: "D" | "R" | "O") => real.filter((x) => x.party === p).map((x) => x.name.split(" ").slice(-1)[0] + (x.incumbent ? " (inc.)" : ""));
  if (parties.has("D") && parties.has("R")) return { label: `${names("D").join(", ")} (D) vs ${names("R").join(", ")} (R)`, status: "contested", open };
  if (parties.has("D")) return { label: `${names("D").join(", ")} (D), no Republican`, status: "uncontested-D", open };
  if (parties.has("R")) return { label: `${names("R").join(", ")} (R), no Democrat`, status: "uncontested-R", open };
  if (real.length) return { label: real.map((x) => `${x.name} (${x.partyLabel ?? "Other"})`).join(", "), status: "other", open };
  return { label: "No candidates listed", status: "none", open };
}

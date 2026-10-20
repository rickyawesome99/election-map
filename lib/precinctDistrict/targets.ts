// The door-knocking list: every precinct on today's lines with the targeting metrics the explorer
// computes (Priority, average Republican share, split-ticket and turnout votes), its competitiveness
// band, and the 2026 turnout estimate. Built on the server by the page and handed to the client
// list as plain rows, so the list never imports the district data itself.

import { getRaceColor } from "@/lib/colorScale";
import type { PrecinctDistrictData } from "./types";
import { marginOf, subdivisionName } from "./aggregate";
import { precinctRows, targetingContext, targetingRows, type PriorityCategory } from "./explorer";
import type { DistrictProjection } from "./project";

// Ratings on the precinct TPL (lib/precinctDistrict/project.ts: the district projection plus the
// precinct's recency-weighted lean relative to the district), the site's own rating bands
// (lib/colorScale marginToRating): Safe 15+, Likely 5–15, Lean 1–5, Tilt under 1. A different lens
// from the Priority categories, which name the task (bank, turn out, persuade) on the all-years
// average R share.
export type BandKey = "safeR" | "likelyR" | "leanR" | "tiltR" | "tiltD" | "leanD" | "likelyD" | "safeD";

export const BANDS: { key: BandKey; label: string; short: string; min: number; max: number; color: string; describe: string }[] = [
  { key: "safeR",   label: "Safe Republican",     short: "Safe R",   min: 15, max: Infinity, color: getRaceColor(15), describe: "R+15 or more" },
  { key: "likelyR", label: "Likely Republican",   short: "Likely R", min: 5, max: 15, color: getRaceColor(5), describe: "R+5 to R+15" },
  { key: "leanR",   label: "Lean Republican",     short: "Lean R",   min: 1, max: 5, color: getRaceColor(1), describe: "R+1 to R+5" },
  { key: "tiltR",   label: "Tilt Republican",     short: "Tilt R",   min: 0, max: 1, color: getRaceColor(0.5), describe: "even to R+1" },
  { key: "tiltD",   label: "Tilt Democratic",     short: "Tilt D",   min: -1, max: 0, color: getRaceColor(-0.5), describe: "under D+1" },
  { key: "leanD",   label: "Lean Democratic",     short: "Lean D",   min: -5, max: -1, color: getRaceColor(-1), describe: "D+1 to D+5" },
  { key: "likelyD", label: "Likely Democratic",   short: "Likely D", min: -15, max: -5, color: getRaceColor(-5), describe: "D+5 to D+15" },
  { key: "safeD",   label: "Safe Democratic",     short: "Safe D",   min: -Infinity, max: -15, color: getRaceColor(-15), describe: "D+15 or more" },
];

export const BAND_BY_KEY = Object.fromEntries(BANDS.map((b) => [b.key, b])) as Record<BandKey, (typeof BANDS)[number]>;

export function bandOf(tpl: number | null): BandKey | null {
  if (tpl == null) return null;
  return BANDS.find((b) => tpl >= b.min && tpl < b.max)?.key ?? "safeD";
}

export interface TargetRow {
  id: string;
  sub: string;
  subName: string;
  rank: number | null;
  category: PriorityCategory | null;
  /** rating band on the precinct TPL (Safe / Likely / Lean / Tilt) */
  band: BandKey | null;
  /** 2 × average R share − 100, R-positive */
  avgMargin: number | null;
  avgR: number | null;
  /** latest-year State House and presidential margins, as counted */
  sthouse: number | null;
  pres: number | null;
  /** precinct TPL: the district projection + the precinct's recency-weighted lean relative to the district */
  tpl: number | null;
  /** the relative lean itself (precinct minus district, R-positive) */
  relLean: number | null;
  reg: number;
  /** latest-year ballots cast */
  ballots: number;
  /** 2026 turnout estimate */
  ballots2026: number | null;
  /** midterm drop-off ballots: latest presidential-year ballots − most recent midterm's */
  dropBallots: number | null;
  persuadable: number | null;
  turnoutVotes: number | null;
  priority: number | null;
  estimated: boolean;
}

export interface TargetList {
  year: number;
  /** the presidential year the bands are cut on (the latest year with a presidential race) */
  presYear: number | null;
  midtermYear: number | null;
  allYears: [number, number] | null;
  rows: TargetRow[];
}

export function targetList(data: PrecinctDistrictData, projection: DistrictProjection | null): TargetList {
  const ctx = targetingContext(data);
  const latest = new Map(precinctRows(data, ctx.year, "current").map((r) => [r.id, r]));
  const proj = new Map((projection?.precincts ?? []).map((p) => [p.id, p]));
  const presYear = ctx.year === (ctx.presYears?.[1] ?? null) ? ctx.year : (ctx.presYears?.[1] ?? null);
  const presRows = presYear != null && presYear !== ctx.year ? new Map(precinctRows(data, presYear, "current").map((r) => [r.id, r])) : latest;
  const rows = targetingRows(data, "precinct").map((t): TargetRow => {
    const p = latest.get(t.id);
    const pr = proj.get(t.id);
    const avgMargin = t.avgR == null ? null : 2 * t.avgR - 100;
    const presRow = presRows.get(t.id);
    const pres = presRow?.races.pres ? marginOf(presRow.races.pres) : null;
    return {
      id: t.id, sub: t.sub, subName: subdivisionName(data.config, t.sub),
      rank: t.rank, category: t.category, band: bandOf(pr?.projected ?? null),
      avgMargin, avgR: t.avgR,
      sthouse: p?.races.sthouse ? marginOf(p.races.sthouse) : null,
      pres,
      tpl: pr?.projected ?? null,
      relLean: pr?.relLean ?? null,
      reg: pr?.reg ?? p?.reg ?? 0,
      ballots: t.ballots,
      ballots2026: pr?.ballots ?? null,
      dropBallots: t.dropoff != null ? Math.max(0, t.ballots * t.dropoff / 100) : null,
      persuadable: t.persuadable, turnoutVotes: t.turnoutVotes, priority: t.priority,
      estimated: t.estimated,
    };
  });
  rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  return { year: ctx.year, presYear, midtermYear: ctx.midtermYear, allYears: ctx.allYears, rows };
}

// The door-knocking list: every precinct on today's lines with the targeting metrics the explorer
// computes (Priority, average Republican share, split-ticket and turnout votes), its competitiveness
// band, and the 2026 turnout estimate. Built on the server by the page and handed to the client
// list as plain rows, so the list never imports the district data itself.

import { getRaceColor } from "@/lib/colorScale";
import type { PrecinctDistrictData } from "./types";
import { marginOf, subdivisionName } from "./aggregate";
import { precinctRows, targetingContext, targetingRows, type PriorityCategory } from "./explorer";
import type { DistrictProjection } from "./project";

// Competitiveness bands, cut on the precinct's average two-party margin (2 × average R share − 100)
// at the site's likely / safe cut points: Swing within 5 points, Lean 5 to 15, Safe 15 and more.
// A different lens from the Priority categories, which name the task (bank, turn out, persuade)
// rather than how the precinct leans.
export type BandKey = "safeR" | "leanR" | "swing" | "leanD" | "safeD";

export const BANDS: { key: BandKey; label: string; short: string; min: number; max: number; color: string; describe: string }[] = [
  { key: "safeR", label: "Safe Republican",   short: "Safe R", min: 15, max: Infinity, color: getRaceColor(15), describe: "Average margin R+15 or more" },
  { key: "leanR", label: "Lean Republican",   short: "Lean R", min: 5, max: 15, color: getRaceColor(5), describe: "Average margin R+5 to R+15" },
  { key: "swing", label: "Swing",             short: "Swing",  min: -5, max: 5, color: "#8e5bd0", describe: "Average margin within 5 points of even" },
  { key: "leanD", label: "Lean Democratic",   short: "Lean D", min: -15, max: -5, color: getRaceColor(-5), describe: "Average margin D+5 to D+15" },
  { key: "safeD", label: "Safe Democratic",   short: "Safe D", min: -Infinity, max: -15, color: getRaceColor(-15), describe: "Average margin D+15 or more" },
];

export const BAND_BY_KEY = Object.fromEntries(BANDS.map((b) => [b.key, b])) as Record<BandKey, (typeof BANDS)[number]>;

export function bandOf(avgMargin: number | null): BandKey | null {
  if (avgMargin == null) return null;
  return BANDS.find((b) => avgMargin >= b.min && avgMargin < b.max)?.key ?? "safeD";
}

export interface TargetRow {
  id: string;
  sub: string;
  subName: string;
  rank: number | null;
  category: PriorityCategory | null;
  band: BandKey | null;
  /** 2 × average R share − 100, R-positive */
  avgMargin: number | null;
  avgR: number | null;
  /** latest-year State House and presidential margins, as counted */
  sthouse: number | null;
  pres: number | null;
  /** projected 2026 precinct margin (the district projection spread back) */
  projected: number | null;
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
  midtermYear: number | null;
  allYears: [number, number] | null;
  rows: TargetRow[];
}

export function targetList(data: PrecinctDistrictData, projection: DistrictProjection | null): TargetList {
  const ctx = targetingContext(data);
  const latest = new Map(precinctRows(data, ctx.year, "current").map((r) => [r.id, r]));
  const proj = new Map((projection?.precincts ?? []).map((p) => [p.id, p]));
  const rows = targetingRows(data, "precinct").map((t): TargetRow => {
    const p = latest.get(t.id);
    const pr = proj.get(t.id);
    const avgMargin = t.avgR == null ? null : 2 * t.avgR - 100;
    return {
      id: t.id, sub: t.sub, subName: subdivisionName(data.config, t.sub),
      rank: t.rank, category: t.category, band: bandOf(avgMargin),
      avgMargin, avgR: t.avgR,
      sthouse: p?.races.sthouse ? marginOf(p.races.sthouse) : null,
      pres: p?.races.pres ? marginOf(p.races.pres) : null,
      projected: pr?.projected ?? null,
      reg: pr?.reg ?? p?.reg ?? 0,
      ballots: t.ballots,
      ballots2026: pr?.ballots ?? null,
      dropBallots: t.dropoff != null ? Math.max(0, t.ballots * t.dropoff / 100) : null,
      persuadable: t.persuadable, turnoutVotes: t.turnoutVotes, priority: t.priority,
      estimated: t.estimated,
    };
  });
  rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  return { year: ctx.year, midtermYear: ctx.midtermYear, allYears: ctx.allYears, rows };
}

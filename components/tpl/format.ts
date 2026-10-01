// Display helpers shared by the TPL pages. Two-decimal margins are the pipeline's own precision
// (a strip of 0.61 pts matters in a ledger); the one-decimal fmtMargin from lib/colorScale is for
// headline figures.

import { candidateSlug } from "@/lib/candidateSlug";
import type { RaceType, WarOffice, WarSlim } from "./types";

export function fmt2(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.005) return "EVEN";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(2)}`;
}

export function fmt1(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.05) return "EVEN";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`;
}

export function marginColor(v: number | null | undefined): string {
  if (v == null) return "var(--app-text-very-muted)";
  if (Math.abs(v) < 0.005) return "var(--app-text-primary)";
  return v > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

export function marginBg(v: number | null | undefined): string {
  if (v == null || Math.abs(v) < 0.005) return "transparent";
  return v > 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)";
}

/** A signed points value ("+3.00", "−0.61"), or a dash. */
export function signed(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.0005) return "0";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
}

export function partyColor(party: string | undefined): string {
  if (party === "R") return "var(--party-rep)";
  if (party === "D") return "var(--party-dem)";
  return "var(--party-ind)";
}

// WAR (Wins Above Replacement): the original approval green / disapproval red.
export const WAR_GOOD = "#22c55e";
export const WAR_BAD = "#ef4444";

export const RACE_TYPE_LABELS: Record<RaceType, string> = { P: "President", S: "Senate", G: "Governor", H: "House", L: "State Leg" };
export const MATRIX_ROWS: { key: RaceType; label: string; short: string }[] = [
  { key: "P", label: "President", short: "Pres." }, { key: "H", label: "House Avg.", short: "House" }, { key: "S", label: "Senate", short: "Sen." }, { key: "L", label: "State Leg.", short: "Leg." }, { key: "G", label: "Governor", short: "Gov." },
];
export const OFFICE_LABELS: Record<WarOffice, string> = { P: "President", S: "Senate", G: "Governor", H: "House" };

/** The candidates view with one person selected. */
export function candidateHref(name: string): string {
  return `/model/candidates?c=${candidateSlug(name)}`;
}
export { candidateSlug };

export function stateHref(id: string): string {
  return `/model/${id.toLowerCase()}`;
}
export function districtHref(stateId: string, code: string): string {
  return `/model/${stateId.toLowerCase()}#${code.toLowerCase()}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * Career WAR: races summed, except a presidential run, which is scored state by state (50+ rows
 * per election) — those rows count as their average per state per election, not their sum.
 */
export function careerWar(rows: Pick<WarSlim, "office" | "war">[]): number {
  const pres = rows.filter((r) => r.office === "P");
  const other = rows.reduce((t, r) => (r.office === "P" ? t : t + r.war), 0);
  return other + (pres.length ? pres.reduce((t, r) => t + r.war, 0) / pres.length : 0);
}

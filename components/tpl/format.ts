// Display helpers shared by the TPL pages. Two-decimal margins are the pipeline's own precision
// (a strip of 0.61 pts matters in a ledger); the one-decimal fmtMargin from lib/colorScale is for
// headline figures.

import { candidateSlug } from "@/lib/candidateSlug";
import type { RaceType, WarOffice } from "./types";

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

export const RACE_TYPE_LABELS: Record<RaceType, string> = { P: "President", S: "Senate", G: "Governor", H: "House", L: "State Leg" };
export const MATRIX_ROWS: { key: RaceType; label: string }[] = [
  { key: "P", label: "President" }, { key: "H", label: "House avg" }, { key: "S", label: "Senate" }, { key: "L", label: "State leg" }, { key: "G", label: "Governor" },
];
export const OFFICE_LABELS: Record<WarOffice, string> = { P: "President", S: "Senate", G: "Governor", H: "House" };

/** The candidates view with one person selected. */
export function candidateHref(name: string): string {
  return `/model/candidates?c=${candidateSlug(name)}`;
}
export { candidateSlug };

export function stateHref(id: string): string {
  return `/model/states/${id.toLowerCase()}`;
}
export function districtHref(stateId: string, code: string): string {
  return `/model/states/${stateId.toLowerCase()}#${code.toLowerCase()}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

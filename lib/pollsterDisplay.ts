// Shared display helpers for the pollster ratings page (/analysis/pollsters) and the grade
// chips on the race pages.

/** "D+2.1" / "R+0.4" for an R-positive lean (a bias or house effect), "Even" inside ±0.05. */
export function fmtLean(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.05) return "Even";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`;
}
export function leanColor(v: number | null | undefined): string {
  if (v == null || Math.abs(v) < 0.05) return "var(--app-text-muted)";
  return v > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

/** Signed points vs the field: "−0.6" is better than a typical poll of the same races. */
export function fmtVsField(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
}

/** Background tint for a score or excess error: teal = beat the field, amber = trailed it, clear at 0. */
export function vsFieldTint(v: number | null | undefined, full = 1.2): string {
  if (v == null) return "transparent";
  const share = Math.round(Math.min(1, Math.abs(v) / full) * 38);
  return share < 3 ? "transparent" : `color-mix(in srgb, var(${v < 0 ? "--poll-better" : "--poll-worse"}) ${share}%, transparent)`;
}

const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];
export const gradeRank = (g: string | null) => (g == null ? GRADE_ORDER.length : GRADE_ORDER.indexOf(g));
/** Chip tint by grade band: A/B+ teal, B…C+ neutral, C and below amber. */
export function gradeTint(grade: string | null): string {
  const r = gradeRank(grade);
  if (grade == null) return "transparent";
  if (r <= 3) return `color-mix(in srgb, var(--poll-better) ${r <= 2 ? 30 : 16}%, transparent)`;
  if (r >= 7) return `color-mix(in srgb, var(--poll-worse) ${r >= 9 ? 34 : 18}%, transparent)`;
  return "var(--app-tab-bg)";
}

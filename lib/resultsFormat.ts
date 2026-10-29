import type { Party, RacePrior } from "@/lib/resultsTypes";

// Client-safe formatting shared by the Results page's pieces.

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtPct = (n: number, d = 1) => `${n.toFixed(d)}%`;

/** An R-positive margin as "D+3.2" / "R+1.0" / "Even", with the race's own party letters. */
export function fmtMargin(m: number | null, prior?: Pick<RacePrior, "dem" | "rep">, d = 1): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (Math.abs(m) < 0.05) return "Even";
  const side = m > 0 ? prior?.rep.party ?? "R" : prior?.dem.party ?? "D";
  return `${side}+${Math.abs(m).toFixed(d)}`;
}

/** A call (projected/forecast/counted margin): names its leader by the exact sign ("R+0.0"), "Even" only at a true tie. */
export function fmtCall(m: number | null, prior?: Pick<RacePrior, "dem" | "rep">, d = 1): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m === 0) return "Even";
  const side = m > 0 ? prior?.rep.party ?? "R" : prior?.dem.party ?? "D";
  return `${side}+${Math.abs(m).toFixed(d)}`;
}

export const partyColor = (p: Party | null | undefined) => (p === "R" ? "var(--party-rep)" : p === "I" ? "var(--party-ind)" : p === "D" ? "var(--party-dem)" : "var(--app-text-primary)");
export const marginSideColor = (m: number | null, prior?: Pick<RacePrior, "dem" | "rep">) =>
  m == null || Math.abs(m) < 0.05 ? "var(--app-text-primary)" : partyColor(m > 0 ? prior?.rep.party ?? "R" : prior?.dem.party ?? "D");
/** marginSideColor for a call: the leader's color down to a true tie, matching fmtCall. */
export const callSideColor = (m: number | null, prior?: Pick<RacePrior, "dem" | "rep">) =>
  m == null || m === 0 ? "var(--app-text-primary)" : partyColor(m > 0 ? prior?.rep.party ?? "R" : prior?.dem.party ?? "D");

/** How much is counted: none (0%), partial (1–99%), or done (100%). With a `done` flag, only a
 *  finished county is done, however far its count has run past the expected vote. */
export type InState = "none" | "partial" | "done";
export function inState(pct: number, done?: boolean): InState {
  if (done || (done === undefined && pct >= 100)) return "done";
  return pct > 0 ? "partial" : "none";
}
/** The % in, rounded so a partial count never reads "0%" or "100%". */
export function fmtIn(pct: number, done?: boolean): string {
  const st = inState(pct, done);
  return st === "done" ? "100%" : st === "none" ? "0%" : `${Math.min(99, Math.max(1, Math.round(pct)))}%`;
}
// Fallbacks = the light-theme tokens, so a stylesheet without them (a stale dev build) still colors the count.
export const inColor = (st: InState) => (st === "done" ? "var(--count-done, #22c55e)" : st === "partial" ? "var(--count-partial, #a86400)" : "var(--app-text-very-muted)");

/** "19:30" (Eastern) → "7:30 PM". */
export function fmtClose(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 || h === 24 ? "AM" : "PM"}`;
}

/** Sort key for a closing time: minutes after noon ET, so midnight and 1 AM sort after 11 PM. */
export function closeMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h < 12 ? h + 24 : h) - 12) * 60 + m;
}

export const fmtTime = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—");

/** The hash a race's detail section answers to. */
export const raceHash = (p: Pick<RacePrior, "office" | "id">) => `${p.office}-${p.id}`;

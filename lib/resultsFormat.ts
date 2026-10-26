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

export const partyColor = (p: Party | null | undefined) => (p === "R" ? "var(--party-rep)" : p === "I" ? "var(--party-ind)" : p === "D" ? "var(--party-dem)" : "var(--app-text-primary)");
export const marginSideColor = (m: number | null, prior?: Pick<RacePrior, "dem" | "rep">) =>
  m == null || Math.abs(m) < 0.05 ? "var(--app-text-primary)" : partyColor(m > 0 ? prior?.rep.party ?? "R" : prior?.dem.party ?? "D");

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

// Which threshold a chamber's seat split clears: the one classification behind the "Now" status,
// each simulated outcome in lib/stateLegForecast.ts, and the majority pills.

export type ChamberOutcome = "dSuper" | "dMaj" | "tie" | "none" | "rMaj" | "rSuper";

/** Display order, D side to R side. */
export const CHAMBER_OUTCOMES: ChamberOutcome[] = ["dSuper", "dMaj", "tie", "none", "rMaj", "rSuper"];

export const OUTCOME_LABEL: Record<ChamberOutcome, string> = {
  dSuper: "D Supermajority", dMaj: "D Majority", tie: "Tie", none: "No majority", rMaj: "R Majority", rSuper: "R Supermajority",
};

export const outcomeColor = (o: ChamberOutcome): string | null =>
  o === "dSuper" || o === "dMaj" ? "var(--party-dem)" : o === "rSuper" || o === "rMaj" ? "var(--party-rep)" : null;

export function chamberOutcome(dem: number, rep: number, majority: number, supermajority: number | null): ChamberOutcome {
  // An even split is its own outcome, not a failed majority for whichever party reads first.
  if (dem === rep) return "tie";
  const leadIsD = dem > rep;
  const held = Math.max(dem, rep);
  if (supermajority != null && held >= supermajority) return leadIsD ? "dSuper" : "rSuper";
  if (held >= majority) return leadIsD ? "dMaj" : "rMaj";
  // Third-party, independent or vacant seats can leave the largest caucus short of the threshold.
  return "none";
}

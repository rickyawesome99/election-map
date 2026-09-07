// Race eligibility for the TPL model (Phase 2 of the TPL rebuild).
//
// A race margin is only a usable R-vs-D measurement when a genuine (or
// caucus-aligned) nominee of EACH major party was on the general ballot.
// forecastData stores the two leading candidates in the dem/rep slots and
// records a candidate's true party in demParty/repParty when it differs from
// the slot ("I" = independent/third party, or the other major party in a
// same-party general such as a CA/WA top-two or LA runoff).
//
// Ineligible races are not blended or dropped — the model imputes the seat's
// structural lean from the nearest presidential result and gives the row
// IMPUTED_RACE_WEIGHT in aggregation (see lib/tplCompute.ts).

export type RaceEligibility = "eligible" | "no-dem" | "no-rep" | "same-party";

// Independents who function as a major party's nominee: they caucus with the
// party and the party fields no candidate against them, so their slot margin
// IS a measurement of that party's strength. Matched by candidate name.
//
// Reviewed and deliberately NOT listed (their races impute instead):
//   Dan Osborn (NE-Sen 2024), Evan McMullin (UT-Sen 2022), Cara Mund (ND-01
//   2022), Ricky Dale Harrington Jr. (AR-Sen 2020), and every minor-party
//   stand-in (Libertarian/Green/etc.) occupying an empty major-party slot.
export const ALIGNED_INDEPENDENTS: Record<string, "D" | "R"> = {
  "Bernie Sanders": "D",
  "Angus King": "D",
};

export interface EligibilityInput {
  demPct?: number;
  repPct?: number;
  demCandidate?: string;
  repCandidate?: string;
  demParty?: string;
  repParty?: string;
}

function effectiveParty(
  override: string | undefined,
  candidate: string | undefined,
  slotParty: "D" | "R"
): string {
  if (override == null) return slotParty;
  if (override === "I" && candidate != null && ALIGNED_INDEPENDENTS[candidate] != null) {
    return ALIGNED_INDEPENDENTS[candidate];
  }
  return override;
}

export function classifyEligibility(r: EligibilityInput): RaceEligibility {
  const demFilled = (r.demPct ?? 0) > 0;
  const repFilled = (r.repPct ?? 0) > 0;
  const demSlotParty = demFilled ? effectiveParty(r.demParty, r.demCandidate, "D") : null;
  const repSlotParty = repFilled ? effectiveParty(r.repParty, r.repCandidate, "R") : null;
  const hasDem = demSlotParty === "D" || repSlotParty === "D";
  const hasRep = demSlotParty === "R" || repSlotParty === "R";
  if (hasDem && hasRep) return "eligible";
  if (demSlotParty != null && demSlotParty === repSlotParty) return "same-party";
  if (!hasDem) return "no-dem";
  return "no-rep";
}

// Human-readable reasons for UI display.
export const ELIGIBILITY_LABELS: Record<Exclude<RaceEligibility, "eligible">, string> = {
  "no-dem": "No Democratic nominee",
  "no-rep": "No Republican nominee",
  "same-party": "Same-party general",
};

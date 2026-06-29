// Manual margin overrides for races where the structural model is inapplicable.
// Values use R-positive convention (positive = R wins, negative = D wins).

export const GOVERNOR_MANUAL_MARGINS: Record<string, number> = {
  VT: 60,  // Phil Scott — uniquely popular R governor in a D+35 state
  NH: 20,  // NH governor — personal brand significantly exceeds party baseline
};

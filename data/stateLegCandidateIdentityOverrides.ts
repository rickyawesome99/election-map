// Hand rulings on whether two state legislative candidate spellings are one person, for the pairs
// the automatic rules in lib/stateLegCandidateIdentity.ts cannot settle. The review list they come
// from is written by scripts/audit-state-leg-candidate-identity.ts.
//
// Each entry: [state, spelling, other spelling, why]. Spellings exactly as the data carries them.
// MERGE joins the two even with no seat link (and over a name rule, so be sure); SPLIT keeps two
// apart that the rules would join.

export type IdentityRuling = [abbr: string, a: string, b: string, note: string];

// Works across surnames too (a married or hyphenated name). Where the spelling itself is simply
// wrong, fix it at the source instead, as was done for Ohio's "Kristina Daleyroegner" (2016/2018
// results, now "Kristina Roegner", 2026-10-12).
export const STATE_LEG_IDENTITY_MERGE: IdentityRuling[] = [
  ["VA", "R. Lee Ware Jr.", "Lee Ware", "Delegate R. Lee Ware Jr. goes by Lee (HD-65/72); held apart by the first-name rule (user ruling 2026-10-21)"],
  ["VA", "Robert Lee Ware Jr.", "Lee Ware", "the same delegate's full name (HD-65 2019/2021); user ruling 2026-10-21"],
];

export const STATE_LEG_IDENTITY_SPLIT: IdentityRuling[] = [];

// The name a merged person's page shows, when the most-used spelling is not the right one:
// [state, spelling exactly as the data carries it, why]. Beats the sitting member's roster spelling.
export const STATE_LEG_DISPLAY_NAME: [abbr: string, spelling: string, note: string][] = [];

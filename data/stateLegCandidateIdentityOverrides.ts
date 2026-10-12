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
export const STATE_LEG_IDENTITY_MERGE: IdentityRuling[] = [];

export const STATE_LEG_IDENTITY_SPLIT: IdentityRuling[] = [];

// The name a merged person's page shows, when the most-used spelling is not the right one:
// [state, spelling exactly as the data carries it, why]. Beats the sitting member's roster spelling.
export const STATE_LEG_DISPLAY_NAME: [abbr: string, spelling: string, note: string][] = [];

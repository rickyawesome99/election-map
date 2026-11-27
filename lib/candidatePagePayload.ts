// Everything a candidate page renders, precomputed per slug by scripts/buildCandidatePages.ts
// into data/generated/candidate-pages/{ST|federal}.json and read by lib/candidatePages.ts.
//
// Computing it per request meant the route carried the whole state legislative model (the results,
// pres-by-era, redistricting and finance modules, ~40 MB of source) and built both candidate indexes
// (~40,000 people) on its first request after every deploy — a ~10 s first load on Vercel.
// Types only: nothing here pulls a data module in.

import type { CandidatePage } from "@/lib/candidateIndex";
import type { StateLegCandidatePage } from "@/lib/stateLegCandidateIndex";
import type { WarSlim } from "@/lib/modelSlices";
import type { LegWarSlim } from "@/components/tpl/types";
import type { LegProjection, RaceMoney } from "@/components/candidates/StateLegRaceRow";

/** A candidate's WAR row with the opponent's WAR in the same race (null when the opponent has no scored row). */
export type CandidateWarRow = WarSlim & { oppWar?: number | null };

/** A 2026 race as counted (data-entry results, the same files the race and district pages read),
 *  ready to draw as a row of the candidate's electoral history. */
export type CandidateResult2026 = {
  contestants: { name: string; party: string; partyTag: string; votes: number | null; pct: number | null; winner: boolean; self: boolean; incumbent?: boolean; slug?: string }[];
  /** Democratic share of the two-party vote, 0–100; null without a count. */
  demShare: number | null;
  /** R-positive, in points of all votes; null without a count. */
  margin: number | null;
  called: boolean;
  /** Whether this candidate won; null until the race is called. */
  won: boolean | null;
  /** Share of the expected vote counted, 0–1, where known. */
  counted: number | null;
};

export type CandidatePagePayload = {
  federal: CandidatePage | null;
  leg: StateLegCandidatePage | null;
  /** Aligned with leg.races: the 2026 projection (current races only), the fundraising line and the race's WAR. */
  legRaces: { projection: LegProjection; money: RaceMoney; result2026?: CandidateResult2026 | null;
    /** Legislative WAR of the race (lib/stateLegWar.ts); absent where the race is not scored. */
    war?: LegWarSlim }[];
  /** Aligned with federal.history: where each row links. */
  historyHrefs: string[];
  /** Aligned with federal.history: the 2026 result of a current race, where one is on file. */
  historyResults2026?: (CandidateResult2026 | null)[];
  /** Wins Above Replacement rows, the same numbers as /war. */
  war: CandidateWarRow[];
};

/** `Record<slug, payload>` per shard: one file per state (state legislative slugs end in the
 *  state's abbreviation) and one for every federal slug. */
export type CandidatePageShard = Record<string, CandidatePagePayload>;

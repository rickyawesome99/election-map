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
import type { LegProjection, RaceMoney } from "@/components/candidates/StateLegRaceRow";

export type CandidatePagePayload = {
  federal: CandidatePage | null;
  leg: StateLegCandidatePage | null;
  /** Aligned with leg.races: the 2026 projection (current races only) and the fundraising line. */
  legRaces: { projection: LegProjection; money: RaceMoney }[];
  /** Aligned with federal.history: where each row links. */
  historyHrefs: string[];
  /** Wins Above Replacement rows, the same numbers as /model/candidates. */
  war: WarSlim[];
};

/** `Record<slug, payload>` per shard: one file per state (state legislative slugs end in the
 *  state's abbreviation) and one for every federal slug. */
export type CandidatePageShard = Record<string, CandidatePagePayload>;

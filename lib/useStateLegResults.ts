"use client";

import { useEffect, useState } from "react";
import type { StateLegChamberResults } from "@/data/stateLegResults";
import type { Chamber } from "@/data/stateLegDistricts";

/** One state's whole history: election year -> chamber -> that chamber's district results. */
export type StateLegResultsByYear = Record<string, Partial<Record<Chamber, StateLegChamberResults>>>;

// One in-flight/settled promise per state, shared across every mount for the life of the tab, so
// switching chambers or years never refetches and two mounts never race.
const cache = new Map<string, Promise<StateLegResultsByYear>>();

function load(stateAbbr: string): Promise<StateLegResultsByYear> {
  const cached = cache.get(stateAbbr);
  if (cached) return cached;
  const promise = fetch(`/state-leg-results/${stateAbbr}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} fetching ${stateAbbr} legislative results`);
      return res.json() as Promise<StateLegResultsByYear>;
    })
    .catch((err) => {
      // A failed fetch must not be cached as a permanent failure - drop it so a later mount retries.
      cache.delete(stateAbbr);
      throw err;
    });
  cache.set(stateAbbr, promise);
  return promise;
}

/**
 * Past per-district legislative results for one state, fetched from the static file written by
 * scripts/split-state-leg-results.mjs.
 *
 * Deliberately NOT imported: data/stateLegResults.ts holds every state's districts for every year
 * (~3.6 MB) and would land in the bundle of every state legislature page. `enabled` keeps even the
 * per-state file (tens of KB) off the wire until the reader actually opens a past year.
 */
export function useStateLegResults(stateAbbr: string, enabled: boolean) {
  // The state is stored WITH the abbreviation it belongs to so that a change of state never shows
  // the previous state's results for the render between the change and the new fetch resolving.
  const [loaded, setLoaded] = useState<{ abbr: string; data: StateLegResultsByYear } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    load(stateAbbr).then(
      (data) => active && setLoaded({ abbr: stateAbbr, data }),
      () => active && setFailedFor(stateAbbr)
    );
    return () => {
      active = false;
    };
  }, [stateAbbr, enabled]);

  const data = loaded?.abbr === stateAbbr ? loaded.data : null;
  const failed = failedFor === stateAbbr;
  return { data, loading: enabled && !data && !failed, failed };
}

/**
 * A district's two-party-plus-other margin, + = R and - = D, matching lib/colorScale.ts.
 *
 * NULL where the district has no published count. Oklahoma, Florida, Texas and Hawaii declare an
 * unopposed candidate elected without printing the race, so `totalVotes` is null for that seat -
 * treating it as a zero-vote district would paint a fake exact tie on the map.
 */
export function districtResultMargin(result: { demVotes: number | null; repVotes: number | null; totalVotes: number | null } | undefined): number | null {
  if (!result || result.totalVotes == null || result.totalVotes === 0) return null;
  return (((result.repVotes ?? 0) - (result.demVotes ?? 0)) / result.totalVotes) * 100;
}

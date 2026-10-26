import type { LiveCandidate, LiveCounty, LiveRace, Party, RacePrior } from "@/lib/resultsTypes";

// The browser's client for civicAPI (also used on the server by the archive's seat series) (https://civicapi.org — free, no key; attribution on the page).
// Two shapes of request: the ~1 KB topline (`?light`) for every race on each refresh, and the full
// payload with county results for the races the page wants in detail. Both are plain GETs the API
// serves with open CORS and a 15-second cache. Payloads are normalized here to LiveRace so the
// needle and the page never see the feed's own field names.

export const CIVIC_BASE = "https://civicapi.org/api/v2/";
export const CIVIC_ATTRIBUTION = { label: "civicAPI", href: "https://civicapi.org" };

/** Parallel requests in flight; the feed is cached at the edge, so this is politeness, not need. */
const CONCURRENCY = 6;

type RawCandidate = { name?: string; party?: string; votes?: number | string; percent?: number | string; winner?: boolean; incumbent?: boolean; major_candidate?: boolean };
type RawRegion = { name?: string; type?: string; fips?: string; percent_reporting?: number | null; candidates?: RawCandidate[] };
type RawRace = {
  percent_reporting?: number | null; test_data?: boolean; last_updated?: string | null; called_at?: string | null;
  candidates?: RawCandidate[]; region_results?: Record<string, RawRegion> | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "")) || 0 : 0);

const PARTY_OF: Record<string, Party> = { Democratic: "D", Democrat: "D", "Democratic-Farmer-Labor": "D", "Democratic-NPL": "D", Republican: "R" };
export const partyOf = (p: string | undefined): Party | null => (p ? PARTY_OF[p] ?? (/^(Independent|Nonpartisan|No Party|Unaffiliated)/i.test(p) ? "I" : null) : null);

/** The feed's county-equivalent region types: Louisiana parishes, Virginia's independent cities,
 *  Connecticut's planning regions (the county data's unit there since 2022). Towns and townships
 *  (ME, MA, NH, VT, CT) sit beside the counties and are skipped. */
const COUNTY_TYPES = new Set(["County", "Parish", "City", "Planning Region", "Borough", "Census Area", "Municipality", "City and Borough"]);
// "City" is kept: Virginia has a Fairfax County and a Fairfax City, a Richmond County and a Richmond City.
const countyKey = (n: string) => n.toLowerCase().replace(/\b(county|parish|borough|census area|municipality|planning region)\b/g, "").replace(/\bst\.?\s/g, "saint ").replace(/[^a-z]/g, "");

const lastName = (n: string) => n.trim().toLowerCase().replace(/[.,'"]/g, "").replace(/\s+(jr|sr|ii|iii|iv)$/i, "").split(/\s+/).pop() ?? "";

/** Which feed candidate is our Democratic slot and which our Republican slot: by party, then by
 *  surname for an independent slot (Osborn in NE), then the largest candidate of that party. */
export function matchSlots(prior: RacePrior, cands: RawCandidate[]): { dem: RawCandidate | null; rep: RawCandidate | null } {
  const pick = (slot: RacePrior["dem"]): RawCandidate | null => {
    const byName = cands.find((c) => c.name && lastName(c.name) === lastName(slot.name) && lastName(slot.name).length > 2);
    if (byName) return byName;
    const party = cands.filter((c) => partyOf(c.party) === slot.party);
    return party.sort((a, b) => num(b.votes) - num(a.votes))[0] ?? null;
  };
  const dem = pick(prior.dem);
  const rep = pick(prior.rep) === dem ? cands.filter((c) => c !== dem && partyOf(c.party) === prior.rep.party).sort((a, b) => num(b.votes) - num(a.votes))[0] ?? null : pick(prior.rep);
  return { dem, rep };
}

function tallyRegion(prior: RacePrior, cands: RawCandidate[] | undefined, demName: string | null, repName: string | null) {
  let dem = 0, rep = 0, total = 0;
  for (const c of cands ?? []) {
    const v = num(c.votes);
    total += v;
    if (demName && c.name === demName) dem += v;
    else if (repName && c.name === repName) rep += v;
    else if (!demName && partyOf(c.party) === prior.dem.party) dem += v;
    else if (!repName && partyOf(c.party) === prior.rep.party) rep += v;
  }
  return { dem, rep, oth: Math.max(0, total - dem - rep), total };
}

/** The feed's payload → LiveRace. `counties` stays null for a topline (light) payload. */
export function normalizeRace(prior: RacePrior, raw: RawRace, fetchedAt = Date.now()): LiveRace {
  const cands = raw.candidates ?? [];
  const { dem, rep } = matchSlots(prior, cands);
  const t = tallyRegion(prior, cands, dem?.name ?? null, rep?.name ?? null);
  const winner = cands.find((c) => c.winner);
  const called = !!raw.called_at || !!winner;
  const winnerParty: Party | null = winner ? (winner === dem ? prior.dem.party : winner === rep ? prior.rep.party : partyOf(winner.party)) : null;
  const candidates: LiveCandidate[] = cands
    .map((c) => ({ name: c.name ?? "", party: c.party ?? "", votes: num(c.votes), percent: num(c.percent), winner: !!c.winner, incumbent: !!c.incumbent }))
    .sort((a, b) => b.votes - a.votes);
  let counties: LiveCounty[] | null = null;
  if (raw.region_results && typeof raw.region_results === "object") {
    counties = [];
    const byName = new Map(prior.counties.map((c) => [countyKey(c.name), c.fips]));
    for (const r of Object.values(raw.region_results)) {
      if (!r || !COUNTY_TYPES.has(r.type ?? "County")) continue;
      const c = tallyRegion(prior, r.candidates, dem?.name ?? null, rep?.name ?? null);
      // Some regions come without a FIPS (all of Rhode Island's, a few elsewhere): match the name.
      const fips = r.fips && byName.size ? r.fips : byName.get(countyKey(r.name ?? "")) ?? r.fips ?? null;
      counties.push({ fips, name: r.name ?? "", pct: r.percent_reporting == null ? null : num(r.percent_reporting), ...c });
    }
  }
  return {
    civicId: prior.civicId ?? 0, fetchedAt, lastUpdated: raw.last_updated ?? null, percentReporting: num(raw.percent_reporting),
    called, calledAt: raw.called_at ?? null, winner: called ? winnerParty : null, testData: !!raw.test_data,
    ...t, candidates, counties,
  };
}

export async function fetchRace(prior: RacePrior, detail: boolean, signal?: AbortSignal): Promise<LiveRace | null> {
  if (!prior.civicId) return null;
  const res = await fetch(`${CIVIC_BASE}race/${prior.civicId}${detail ? "" : "?light"}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`civicAPI ${res.status} for race ${prior.civicId}`);
  return normalizeRace(prior, (await res.json()) as RawRace);
}

/** Fetch many races with bounded concurrency; a failed race is skipped (its previous payload stays). */
export async function fetchRaces(priors: RacePrior[], detail: (p: RacePrior) => boolean, onRace: (prior: RacePrior, live: LiveRace) => void, signal?: AbortSignal): Promise<{ ok: number; failed: number }> {
  const queue = priors.filter((p) => p.civicId);
  let i = 0, ok = 0, failed = 0;
  const worker = async () => {
    while (i < queue.length && !signal?.aborted) {
      const p = queue[i++];
      try {
        const live = await fetchRace(p, detail(p), signal);
        if (live) { onRace(p, live); ok++; }
      } catch (e) {
        if (signal?.aborted) return;
        failed++;
        if (process.env.NODE_ENV !== "production") console.warn(e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return { ok, failed };
}

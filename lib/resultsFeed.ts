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

export type RawCandidate = { name?: string; party?: string; votes?: number | string; percent?: number | string; winner?: boolean; incumbent?: boolean; major_candidate?: boolean };
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
/** Independent cities (Virginia's 5xx–8xx, Baltimore, St. Louis, Carson City): the priors name them
 *  bare ("Richmond", "Franklin"), the same as the county they share a name with. */
const isCityFips = (f: string) => /^(51[5-8]\d\d|24510|29510|32510)$/.test(f);

/** Feed regions that are part of a prior county, by state FIPS and region name: their votes add
 *  into that county. Chicago reports apart from suburban Cook (the feed's "Cook" row is the rest
 *  of the county, so the two always add); Rhode Island reports by town, rolled up to its five
 *  counties unless the feed sends the county itself. */
const RI_TOWNS: Record<string, string[]> = {
  "44001": ["Barrington", "Bristol", "Warren"],
  "44003": ["Coventry", "East Greenwich", "Warwick", "West Greenwich", "West Warwick"],
  "44005": ["Jamestown", "Little Compton", "Middletown", "Newport", "Portsmouth", "Tiverton"],
  "44007": ["Burrillville", "Central Falls", "Cranston", "Cumberland", "East Providence", "Foster", "Glocester", "Johnston", "Lincoln", "North Providence", "North Smithfield", "Pawtucket", "Providence", "Scituate", "Smithfield", "Woonsocket"],
  "44009": ["Charlestown", "Exeter", "Hopkinton", "Narragansett", "New Shoreham", "North Kingstown", "Richmond", "South Kingstown", "Westerly"],
};
const PARTS = new Map<string, { fips: string; always: boolean }>([
  ["17:chicago", { fips: "17031", always: true }],
  ...Object.entries(RI_TOWNS).flatMap(([fips, towns]) => towns.map((t) => [`44:${countyKey(t)}`, { fips, always: false }] as const)),
]);
/** Feed FIPS that the priors carry under another: Shannon renamed Oglala Lakota (2015); Kalawao
 *  is counted with Maui. Their votes add into the prior county. */
const FIPS_PARTS: Record<string, string> = { "46113": "46102", "15005": "15009" };

/** A region's prior FIPS by name, city- or county-side by the row's type. The feed sends
 *  Virginia's cities with no FIPS as "Chesapeake City" (type City); "James City County" is a county. */
function nameMatcher(prior: RacePrior): (name: string, type: string) => string | null {
  const byKey = new Map<string, string>();
  for (const c of prior.counties) byKey.set(`${isCityFips(c.fips) ? "c" : "k"}:${countyKey(c.name)}`, c.fips);
  return (name, type) => {
    const cls = type === "City" ? "c" : "k", key = countyKey(name), bare = countyKey(name.replace(/\s+city$/i, ""));
    return byKey.get(`${cls}:${key}`) ?? (bare !== key ? byKey.get(`c:${bare}`) : undefined) ?? byKey.get(`${cls === "c" ? "k" : "c"}:${key}`) ?? null;
  };
}

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

/** Several candidates per party on one ballot: a Louisiana jungle round, or Alaska's and Maine's
 *  ranked-choice first choices (whose same-party votes mostly transfer by the final round). */
const isMultiField = (prior: RacePrior) => prior.jungle || prior.rcv;

/** A multi-field race's region also carries its two leading candidates (LiveCounty.top). */
function topTwo(cands: RawCandidate[] | undefined) {
  return (cands ?? []).map((c) => ({ name: c.name ?? "", party: partyOf(c.party), votes: num(c.votes) })).sort((a, b) => b.votes - a.votes).slice(0, 2);
}

/** The D and R sides of a region. In a multi-field race each side is a party bloc: the named slot
 *  candidate (the forecast's opponent can be an independent, AK-01's Hill) plus every Democrat or
 *  every Republican, as the forecast and the county priors measure it. Elsewhere a side is the one
 *  matched candidate. */
function tallyRegion(prior: RacePrior, cands: RawCandidate[] | undefined, demName: string | null, repName: string | null) {
  const multi = isMultiField(prior);
  let dem = 0, rep = 0, total = 0;
  for (const c of cands ?? []) {
    const v = num(c.votes), p = partyOf(c.party);
    total += v;
    if (demName && c.name === demName) dem += v;
    else if (repName && c.name === repName) rep += v;
    else if (multi ? p === "D" : !demName && p === prior.dem.party) dem += v;
    else if (multi ? p === "R" : !repName && p === prior.rep.party) rep += v;
  }
  return { dem, rep, oth: Math.max(0, total - dem - rep), total, ...(multi ? { top: topTwo(cands) } : {}) };
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
    const priorFips = new Set(prior.counties.map((c) => c.fips));
    const byName = nameMatcher(prior);
    const state = prior.counties[0]?.fips.slice(0, 2) ?? "";
    // One row per prior county. A row carrying a prior FIPS goes first, and a second row for the
    // same county (another level of the same votes) is dropped, never added. Parts of a county
    // (PARTS, FIPS_PARTS) add up into it; a row that matches nothing is kept with its own FIPS or
    // none, so its votes still count (the needle carries them as they are).
    const direct = new Map<string, LiveCounty>(), parts = new Map<string, { rows: LiveCounty[]; always: boolean }>(), other: LiveCounty[] = [];
    const regions = Object.values(raw.region_results).filter((r): r is RawRegion => !!r);
    regions.sort((a, b) => Number(!!b.fips && priorFips.has(b.fips)) - Number(!!a.fips && priorFips.has(a.fips)));
    for (const r of regions) {
      const name = r.name ?? "", type = r.type ?? "County";
      const row: LiveCounty = { fips: null, name, pct: r.percent_reporting == null ? null : num(r.percent_reporting), ...tallyRegion(prior, r.candidates, dem?.name ?? null, rep?.name ?? null) };
      const part = r.fips && FIPS_PARTS[r.fips] ? { fips: FIPS_PARTS[r.fips], always: true } : !/\bcounty\b/i.test(name) && !(r.fips && priorFips.has(r.fips)) ? PARTS.get(`${state}:${countyKey(name)}`) : undefined;
      if (part && priorFips.has(part.fips)) {
        const g = parts.get(part.fips) ?? { rows: [], always: part.always };
        g.rows.push(row); parts.set(part.fips, g);
        continue;
      }
      if (!COUNTY_TYPES.has(type)) continue;
      // Some regions come without a FIPS (Virginia's cities, a few elsewhere): match the name.
      const fips = r.fips && priorFips.has(r.fips) ? r.fips : byName(name, type);
      if (fips) { if (!direct.has(fips)) direct.set(fips, { ...row, fips, type }); }
      else other.push({ ...row, fips: r.fips ?? null, type });
    }
    for (const [fips, g] of parts) {
      const base = direct.get(fips);
      if (base && !g.always) continue;
      const all = base ? [base, ...g.rows] : g.rows;
      direct.set(fips, {
        fips, name: base?.name ?? prior.counties.find((c) => c.fips === fips)?.name ?? g.rows[0].name,
        pct: all.every((x) => x.pct != null) ? Math.min(...all.map((x) => x.pct!)) : null,
        dem: all.reduce((a, x) => a + x.dem, 0), rep: all.reduce((a, x) => a + x.rep, 0), oth: all.reduce((a, x) => a + x.oth, 0), total: all.reduce((a, x) => a + x.total, 0),
      });
    }
    counties = [...direct.values(), ...other];
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

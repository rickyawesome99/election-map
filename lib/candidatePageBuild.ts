import "server-only";
import { getAllCandidateSlugs, getCandidatePage, type CandidateHistoryEntry } from "@/lib/candidateIndex";
import { findStateLegCandidate, getAllStateLegCandidatePages, getStateLegCandidatePage, type StateLegCandidatePage, type StateLegRace } from "@/lib/stateLegCandidateIndex";
import { pastElectionHref } from "@/lib/pastElections";
import { warForCandidate, warSlice, type WarSlim } from "@/lib/modelSlices";
import { stateLegMoney } from "@/lib/stateLegMoney";
import { personKey } from "@/lib/stateLegForecast";
import { projectDistrict } from "@/lib/final2026"; // the 2026 projection as published
import { fieldPersons } from "@/lib/stateLegAtlas";
import { stateLegDistricts } from "@/data/stateLegDistricts";
import type { LegProjection, RaceMoney } from "@/components/candidates/StateLegRaceRow";
import type { CandidatePagePayload, CandidateResult2026 } from "@/lib/candidatePagePayload";
import { raceResult2026 } from "@/lib/raceResults2026";
import { districtResults2026 } from "@/lib/stateLegResults2026";
import { candidateSlug } from "@/lib/candidateSlug";

// The heavy side of the candidate pages: joins the federal and state legislative records and
// computes the per-race figures, for scripts/buildCandidatePages.ts. Only that script imports
// this module; the page itself reads the generated shards (lib/candidatePages.ts).

/** Both records behind one slug, in either order. A person with both (a state legislator who ran
 *  for Congress) gets one page: the two indexes are joined on name and state. */
export function resolveCandidate(slug: string): { federal: ReturnType<typeof getCandidatePage>; leg: StateLegCandidatePage | null } {
  const federal = getCandidatePage(slug);
  let leg = getStateLegCandidatePage(slug);
  if (federal && !leg) leg = findStateLegCandidate(federal.name, federal.state);
  let fed = federal;
  if (leg && !fed) {
    const f = getCandidatePage(candidateSlug(leg.name, leg.abbr));
    if (f && f.state === leg.stateName) fed = f;
  }
  return { federal: fed, leg };
}

/** The race's own spelling of this person (the finance join is keyed on the atlas's list for that year). */
function legName(leg: StateLegCandidatePage, race: StateLegRace): string {
  const m = stateLegMoney(race.abbr, race.chamber, race.district, race.year);
  return m?.candidates.find((c) => leg.spellings.includes(c.name))?.name ?? leg.name;
}

/** The candidate's own contributions in a race, and everyone else's, from the state filings. */
function legMoney(race: StateLegRace, name: string): RaceMoney {
  const m = stateLegMoney(race.abbr, race.chamber, race.district, race.year);
  if (!m) return null;
  const mine = m.candidates.find((c) => c.name === name) ?? m.candidates.find((c) => c.matched && c.party === race.party && race.others.every((o) => o.name !== c.name));
  if (!mine?.matched) return null;
  const others = m.candidates.filter((c) => c !== mine && c.matched && c.contributions != null);
  return { contributions: mine.contributions, opponents: others.length ? others.reduce((s, c) => s + (c.contributions ?? 0), 0) : null, dataThrough: m.dataThrough, source: m.source };
}

function legProjection(race: StateLegRace, name: string): LegProjection {
  if (!race.isCurrent) return null;
  const d = stateLegDistricts[race.abbr]?.[race.chamber]?.find((x) => x.number === race.district);
  if (!d) return null;
  const p = projectDistrict(race.abbr, race.chamber, d);
  const indep = p.indep ? {
    isMe: personKey(p.indep.name) === personKey(name), name: p.indep.name, opp: (p.indep.slot === "D" ? "R" : "D") as "D" | "R",
    advantage: p.indep.advantage, pI: p.pI ?? 0, sameElectorate: p.indep.sameElectorate,
  } : null;
  const persons = p.candidates2026 ? fieldPersons(p.candidates2026, d.incumbents ?? []).filter((x) => !x.writeIn) : [];
  return { margin: p.margin, rating: p.rating, pD: p.pD, contest: p.contest, indep, pI: p.pI, guaranteed: p.guaranteed, nominees: { dem: persons.filter((x) => x.party === "D").length, rep: persons.filter((x) => x.party === "R").length } };
}

// A past Senate or Governor row opens that election's own page; everything else opens the seat page.
function historyHref(entry: CandidateHistoryEntry): string {
  if (entry.isCurrent || entry.raceType === "president") return entry.racePath;
  const seatId = entry.racePath.split("/").pop() ?? "";
  return pastElectionHref(entry.raceType, seatId, entry.year) ?? entry.racePath;
}

const surnameOf = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter((w) => w && !/^(jr|sr|ii|iii|iv)$/.test(w)).pop() ?? "";
const twoParty = (dem: number, rep: number) => (dem + rep > 0 ? (dem / (dem + rep)) * 100 : null);

/** A current federal race as counted, with this candidate marked; null when the race has no saved
 *  result or the candidate is not in the slot the record puts them in (lost a primary, withdrew). */
function federalResult2026(entry: CandidateHistoryEntry, name: string, opponentSlug: string | undefined): CandidateResult2026 | null {
  if (!entry.isCurrent || entry.raceType === "president") return null;
  const res = raceResult2026(entry.raceType, entry.raceId);
  if (!res || res.total <= 0) return null;
  const me = res.candidates.find((c) => c.slot === entry.side);
  if (!me || surnameOf(me.name) !== surnameOf(name)) return null;
  const dem = res.candidates.find((c) => c.slot === "dem"), rep = res.candidates.find((c) => c.slot === "rep");
  return {
    contestants: res.candidates.map((c) => ({
      name: c === me ? name : c.name, party: c.party, partyTag: c.party === "I" && c.partyLabel ? c.partyLabel : c.party, votes: c.votes, pct: c.pct,
      winner: res.called && c.winner, self: c === me, incumbent: c === me ? entry.incumbent : undefined,
      slug: c !== me && c.slot && opponentSlug ? opponentSlug : undefined,
    })),
    demShare: twoParty(dem?.votes ?? 0, rep?.votes ?? 0),
    margin: res.slotMargin ?? (rep && dem ? rep.pct - dem.pct : null),
    called: res.called, won: res.called ? me.winner : null, counted: res.countedShare,
  };
}

/** A current state legislative race as counted: the race (post or special) this person is in. */
function legResult2026(leg: StateLegCandidatePage, race: StateLegRace): CandidateResult2026 | null {
  if (!race.isCurrent) return null;
  const district = districtResults2026(race.abbr, race.chamber).get(race.district);
  if (!district) return null;
  const mine = new Set([leg.name, ...leg.spellings].map(personKey));
  const contest = district.races.find((r) => r.special === !!race.special && r.candidates.some((c) => mine.has(personKey(c.name))))
    ?? district.races.find((r) => r.candidates.some((c) => mine.has(personKey(c.name))));
  if (!contest) return null;
  const votesOf = (p: "D" | "R") => contest.candidates.reduce((t, c) => (c.party === p ? t + (c.votes ?? 0) : t), 0);
  const dem = votesOf("D"), rep = votesOf("R");
  const slugOf = (n: string) => race.others.find((o) => personKey(o.name) === personKey(n))?.slug;
  const me = contest.candidates.find((c) => mine.has(personKey(c.name)))!;
  return {
    contestants: contest.candidates.map((c) => ({
      name: c === me ? leg.name : c.name, party: c.party, partyTag: c.party === "D" || c.party === "R" ? c.party : c.partyLabel?.replace(/ Party$/, "") ?? "I",
      votes: c.votes, pct: c.pct, winner: contest.called && !!c.winner, self: c === me, incumbent: c.incumbent, slug: c === me ? undefined : slugOf(c.name),
    })),
    demShare: twoParty(dem, rep),
    margin: contest.total > 0 ? ((rep - dem) / contest.total) * 100 : null,
    called: contest.called, won: contest.called ? !!me.winner : null, counted: contest.counted,
  };
}

// The other candidate's WAR in each scored race, keyed by the race.
const raceKey = (r: WarSlim) => `${r.state}|${r.office}|${r.race}|${r.year}`;
let warByRace: Map<string, WarSlim[]> | null = null;
function opponentWar(row: WarSlim): number | null {
  if (!warByRace) {
    warByRace = new Map();
    for (const r of warSlice()) { const list = warByRace.get(raceKey(r)); if (list) list.push(r); else warByRace.set(raceKey(r), [r]); }
  }
  return warByRace.get(raceKey(row))?.find((r) => r.candidate !== row.candidate)?.war ?? null;
}

export function buildCandidatePayload(slug: string): CandidatePagePayload | null {
  const { federal, leg } = resolveCandidate(slug);
  if (!federal && !leg) return null;
  const name = federal?.name ?? leg!.name;
  return {
    federal,
    leg,
    legRaces: (leg?.races ?? []).map((race) => { const n = legName(leg!, race); return { projection: legProjection(race, n), money: legMoney(race, n), result2026: legResult2026(leg!, race) }; }),
    historyHrefs: (federal?.history ?? []).map(historyHref),
    historyResults2026: (federal?.history ?? []).map((entry) => federalResult2026(entry, federal!.name, entry.raceId === federal!.currentRace?.id ? federal!.currentRace?.opponent?.slug : entry.oppSlug)),
    // WAR rows are found by name. With a federal record the record's state settles whose they are; a
    // page without one (a state legislator) keeps only rows from races in its own state, or
    // Virginia's Phil Scott picks up the Vermont governor's.
    war: warForCandidate(name, federal?.state ?? leg?.abbr)
      .filter((r) => federal || (r.state === leg?.abbr && r.office !== "P"))
      .map((r) => ({ ...r, oppWar: opponentWar(r) })),
  };
}

/** Every slug that resolves to a page and the shard it belongs in: a state legislative slug goes
 *  in its state's file, a federal slug in federal.json (either kind may carry both records). */
export function allCandidateSlugs(): { slug: string; shard: string }[] {
  const out: { slug: string; shard: string }[] = [];
  for (const slug of getAllCandidateSlugs()) out.push({ slug, shard: "federal" });
  for (const p of getAllStateLegCandidatePages()) out.push({ slug: p.slug, shard: p.abbr });
  return out;
}

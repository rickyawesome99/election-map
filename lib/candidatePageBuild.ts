import "server-only";
import { getAllCandidateSlugs, getCandidatePage, type CandidateHistoryEntry } from "@/lib/candidateIndex";
import { findStateLegCandidate, getAllStateLegCandidatePages, getStateLegCandidatePage, type StateLegCandidatePage, type StateLegRace } from "@/lib/stateLegCandidateIndex";
import { pastElectionHref } from "@/lib/pastElections";
import { warForCandidate } from "@/lib/modelSlices";
import { stateLegMoney } from "@/lib/stateLegMoney";
import { personKey, projectDistrict } from "@/lib/stateLegForecast";
import { fieldPersons } from "@/lib/stateLegAtlas";
import { stateLegDistricts } from "@/data/stateLegDistricts";
import type { LegProjection, RaceMoney } from "@/components/candidates/StateLegRaceRow";
import type { CandidatePagePayload } from "@/lib/candidatePagePayload";

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
    const f = getCandidatePage(candidateSlugOf(leg.name));
    if (f && f.state === leg.stateName) fed = f;
  }
  return { federal: fed, leg };
}
const candidateSlugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

export function buildCandidatePayload(slug: string): CandidatePagePayload | null {
  const { federal, leg } = resolveCandidate(slug);
  if (!federal && !leg) return null;
  const name = federal?.name ?? leg!.name;
  return {
    federal,
    leg,
    legRaces: (leg?.races ?? []).map((race) => { const n = legName(leg!, race); return { projection: legProjection(race, n), money: legMoney(race, n) }; }),
    historyHrefs: (federal?.history ?? []).map(historyHref),
    war: warForCandidate(name),
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

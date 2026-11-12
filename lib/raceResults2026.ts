import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "@/lib/turnout";
import type { CountyMapEntry } from "@/components/PastElectionCountyMap";

// ── 2026 results for the race pages ───────────────────────────────────────────
// The saved post-election results (data-entry/results_2026_seats.csv + results_2026_counties.csv,
// written by the hand-run `npm run results-snapshot`, see lib/resultsSnapshot.ts), shaped for a
// race page's results section (headed 2026 Election). Nothing here touches the live feed: a page shows what the
// files hold. The forecast these replaced is archived in data/forecast-final-2026/.
//
// The CSVs' dem_/rep_ columns are SLOTS and, where a party runs several candidates (Alaska's top
// four, Louisiana's open primary), the slot carries the party's whole bloc. A candidate row here
// takes the candidate's own count from the `candidates` column instead, so the shares on the page
// are each person's, and the other candidates fill "Others" or, at MIN_OWN_ROW_PCT, their own row.

/** A candidate outside the race's two slots gets their own row from this share of the vote. */
export const MIN_OWN_ROW_PCT = 5;

export type ResultParty = "D" | "R" | "I";

export type ResultCandidate = {
  name: string;
  party: ResultParty;
  /** The feed's party label for a candidate of neither major party ("Libertarian", "Forward"). */
  partyLabel?: string;
  votes: number;
  pct: number;
  winner: boolean;
  /** Which of the race's two slots the candidate holds; null for a candidate outside them. */
  slot: "dem" | "rep" | null;
  /** The final forecast's projected share for this person (data/forecast-final-2026/), when they were a projected nominee. */
  projectedPct: number | null;
};

export type RaceResult2026 = {
  office: "senate" | "governor" | "house";
  raceId: string;
  contest: string;
  total: number;
  /** Rows with their own line, most votes first: the slot candidates and any outside one at MIN_OWN_ROW_PCT. */
  candidates: ResultCandidate[];
  others: { votes: number; pct: number };
  called: boolean;
  winnerParty: ResultParty | null;
  /** The share of the expected vote counted, 0–1 (the Results page's estimate when the files were saved). */
  countedShare: number;
  /** Ranked-choice count (Alaska): with a party's candidates split, the headline margin is party against party. */
  rcv: boolean;
  /** The two slots' votes, R-positive points of all votes: each party's bloc where it ran several candidates. */
  slotMargin: number | null;
  /** A slot party ran several candidates, so the county figures are that party's bloc, not one person's. */
  bloc: { dem: boolean; rep: boolean };
  /** Slot candidates as the county map labels them. */
  demName: string;
  repName: string;
  demParty: ResultParty;
  repParty: ResultParty;
  counties: CountyMapEntry[];
  /** When the snapshot was fetched (ms). */
  asOf: number;
};

const num = (v: string) => Number(v) || 0;
const PLACEHOLDER = /^(Democratic|Republican) Candidate$/;
const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv"]);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** The surname's parts: "Bernadette Greene-Placentia" → greene, placentia; nicknames and suffixes dropped. */
function surnames(name: string): string[] {
  const words = fold(name).replace(/"[^"]*"/g, " ").split(/\s+/).map((w) => w.replace(/[.,]/g, "")).filter((w) => w && !SUFFIX.has(w));
  return words.length ? words[words.length - 1].split("-") : [];
}
const sameSurname = (a: string, b: string) => { const sa = surnames(a), sb = surnames(b); return sa.some((x) => sb.includes(x)); };

function labelParty(label: string): { party: ResultParty; partyLabel?: string } {
  if (/^Democrat/i.test(label)) return { party: "D" };
  if (/^Republican/i.test(label)) return { party: "R" };
  if (/write-?in/i.test(label)) return { party: "I", partyLabel: "Write-in" };
  const clean = label.replace(/\/Unenrolled$/, "").replace(/^Other Party$/, "Other").replace(/ Party$/, "");
  return { party: "I", partyLabel: clean };
}

/** "Name (Party Label) 1234; …" → candidates with their own votes. */
function parseCandidates(cell: string) {
  return cell.split("; ").flatMap((part) => {
    const m = /^(.*) \(([^)]*)\) (\d+)$/.exec(part.trim());
    return m ? [{ name: m[1], ...labelParty(m[2]), votes: Number(m[3]) }] : [];
  });
}

type ArchivedRace = { office: string; id: string; dem: { name: string } | null; rep: { name: string } | null; projected: { shares: { dem: number; rep: number } } | null };

/** The archived final projection's share per nominee, by office|id. */
function projectedShares(): Map<string, { name: string; pct: number }[]> {
  const races = JSON.parse(readFileSync(join(process.cwd(), "data", "forecast-final-2026", "races.json"), "utf8")) as Record<string, ArchivedRace>;
  const out = new Map<string, { name: string; pct: number }[]>();
  for (const r of Object.values(races)) {
    if (!r.projected) continue;
    out.set(`${r.office}|${r.id}`, (["dem", "rep"] as const).flatMap((s) => (r[s] ? [{ name: r[s]!.name, pct: r.projected!.shares[s] }] : [])));
  }
  return out;
}

let cache: Map<string, RaceResult2026> | null = null;

function load(): Map<string, RaceResult2026> {
  if (cache) return cache;
  const countyRows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_counties.csv"), "utf8"));
  const countiesByRace = new Map<string, CountyMapEntry[]>();
  for (const c of countyRows) {
    const total = num(c.total_votes);
    if (!c.fips || total <= 0) continue;
    const dem = num(c.dem_votes), rep = num(c.rep_votes), pctIn = num(c.feed_pct_reporting);
    const key = `${c.office}|${c.race_id}`;
    if (!countiesByRace.has(key)) countiesByRace.set(key, []);
    countiesByRace.get(key)!.push({
      fips: c.fips,
      name: c.county,
      result: {
        demVotes: dem, repVotes: rep, totalVotes: total,
        demPct: (dem / total) * 100, repPct: (rep / total) * 100, margin: ((rep - dem) / total) * 100,
        ...(c.done !== "1" && pctIn > 0 && pctIn < 100 ? { reporting: `${Math.round(pctIn)}% in` } : {}),
      },
    });
  }

  const projections = projectedShares();
  const out = new Map<string, RaceResult2026>();
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_seats.csv"), "utf8"))) {
    const office = r.office as RaceResult2026["office"];
    const total = num(r.total_votes);
    const pool = parseCandidates(r.candidates);
    const projected = projections.get(`${office}|${r.race_id}`) ?? [];
    // By name, not slot: Louisiana's finalists and some late swaps aren't the nominees the model projected.
    const projectedPct = (name: string) => projected.find((p) => sameSurname(p.name, name))?.pct ?? null;
    const called = r.called === "1";
    const taken = new Set<number>();
    const slotRows: ResultCandidate[] = [];
    for (const slot of ["dem", "rep"] as const) {
      const name = r[`${slot}_name`], party = (r[`${slot}_party`] || (slot === "dem" ? "D" : "R")) as ResultParty;
      if (!name || PLACEHOLDER.test(name)) continue;
      let hits = pool.map((c, i) => ({ c, i })).filter(({ c, i }) => !taken.has(i) && sameSurname(c.name, name));
      if (hits.length > 1) hits = hits.filter(({ c }) => c.party === party).length ? hits.filter(({ c }) => c.party === party) : hits;
      const hit = hits.length === 1 ? hits[0] : null;
      if (hit) taken.add(hit.i);
      // No match (or no count printed): the slot's own column, which is the candidate's when the party ran one.
      const votes = hit ? hit.c.votes : num(r[`${slot}_votes`]);
      slotRows.push({ name, party, votes, pct: total > 0 ? (votes / total) * 100 : 0, winner: false, slot, projectedPct: projectedPct(name) });
    }
    const outside = pool.filter((_, i) => !taken.has(i));
    const ownRows: ResultCandidate[] = outside
      .filter((c) => total > 0 && (c.votes / total) * 100 >= MIN_OWN_ROW_PCT)
      .map((c) => ({ name: c.name, party: c.party, ...(c.partyLabel ? { partyLabel: c.partyLabel } : {}), votes: c.votes, pct: (c.votes / total) * 100, winner: false, slot: null, projectedPct: projectedPct(c.name) }));
    const candidates = [...slotRows, ...ownRows].sort((a, b) => b.votes - a.votes);
    if (called && r.winner_name) {
      const w = candidates.find((c) => sameSurname(c.name, r.winner_name) && (c.party === r.winner_party || !r.winner_party));
      if (w) w.winner = true;
    }
    // An unopposed race with no count printed (Florida): the one candidate is the winner.
    if (called && candidates.length === 1) candidates[0].winner = true;
    const othVotes = Math.max(0, total - candidates.reduce((a, c) => a + c.votes, 0));
    const slotOwn = (slot: "dem" | "rep") => slotRows.find((c) => c.slot === slot)?.votes ?? 0;
    const bloc = { dem: num(r.dem_votes) > slotOwn("dem"), rep: num(r.rep_votes) > slotOwn("rep") };
    const dParty = (r.dem_party || "D") as ResultParty, rParty = (r.rep_party || "R") as ResultParty;
    // No like-for-like projection: a same-party final (the model never projected one), or a party that ran
    // several candidates (Alaska, Louisiana), where the projected share was the party's, not one person's.
    const blocParties = new Set([...(bloc.dem ? [dParty] : []), ...(bloc.rep ? [rParty] : [])]);
    for (const c of candidates) if (r.contest.startsWith("same-party") || blocParties.has(c.party)) c.projectedPct = null;
    out.set(`${office}|${r.race_id}`, {
      office, raceId: r.race_id, contest: r.contest, total,
      rcv: r.state === "AK",
      slotMargin: total > 0 ? ((num(r.rep_votes) - num(r.dem_votes)) / total) * 100 : null,
      candidates,
      others: { votes: othVotes, pct: total > 0 ? (othVotes / total) * 100 : 0 },
      called,
      winnerParty: (r.winner_party || null) as ResultParty | null,
      countedShare: num(r.counted_share),
      bloc,
      demName: bloc.dem ? `${dParty === "R" ? "Republican" : "Democratic"} candidates` : r.dem_name,
      repName: bloc.rep ? `${rParty === "D" ? "Democratic" : "Republican"} candidates` : r.rep_name,
      demParty: dParty, repParty: rParty,
      counties: countiesByRace.get(`${office}|${r.race_id}`) ?? [],
      asOf: Date.parse(r.fetched_at) || 0,
    });
  }
  cache = out;
  return out;
}

/** The saved 2026 result for a race page; raceId is the forecast id ("GA", "TX-2", "3909"). */
export function raceResult2026(office: RaceResult2026["office"], raceId: string): RaceResult2026 | null {
  return load().get(`${office}|${raceId}`) ?? null;
}

import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyEligibility } from "@/data/raceEligibility";
import { parseCsv } from "@/lib/turnout";
import type { PostElectionRow } from "@/lib/postElectionTypes";
import type { Party } from "@/lib/resultsTypes";

// The saved results behind /analysis/post-election: data-entry/results_2026_seats.csv, written by
// hand-run `npm run results-snapshot` (scripts/build-results-snapshot.ts). Read at build; nothing
// here touches the live feed, so the page shows exactly what the file holds.

export type ResultsSnapshot = { asOf: number; rows: PostElectionRow[] };

const num = (v: string) => Number(v) || 0;
const party = (v: string) => (v || null) as Party | null;

/** "Evan Low (D)": a slot's candidate carrying their true party, as house_past_results.csv writes it. */
export function slotCandidate(cell: string) {
  const m = /^(.*) \(([A-Z])\)$/.exec(cell);
  return m ? { name: m[1], party: m[2] } : { name: cell || undefined, party: undefined };
}

/** Each district's 2024 House margin to swing from, by label. A seat whose lines moved for 2026 has
 *  no real number, so it is estimated: the 2024 margin less the district number's change in 2024
 *  presidential margin between the maps (the shift boundaryStripFor applies in lib/tplCompute.ts), or
 *  with no D vs R race in 2024, the presidential margin on the new lines alone. A seat on unmoved
 *  lines with no such race has nothing to compare. */
export function house2024Baselines(): Map<string, NonNullable<PostElectionRow["housePrev"]>> {
  const redrawn = new Set(parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_redistrict.csv"), "utf8")).filter((r) => r.new_26 === "Yes").map((r) => r.district_name));
  const presOld = new Map(parseCsv(readFileSync(join(process.cwd(), "data-entry", "pres_by_boundary_vintage.csv"), "utf8")).filter((r) => r.boundary_year === "2024" && r.pres_year === "2024").map((r) => [r.district_name, { margin: num(r.margin), total: num(r.total_votes) }]));
  const presNew = new Map(parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_pres_2026_dist.csv"), "utf8")).map((r) => [r.code, { margin: ((num(r.pres24_rep) - num(r.pres24_dem)) / num(r.pres24_total)) * 100, total: num(r.pres24_total) }]));
  const out = new Map<string, NonNullable<PostElectionRow["housePrev"]>>();
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_past_results.csv"), "utf8"))) {
    if (r.year !== "2024") continue;
    const dem = slotCandidate(r.dem_candidate), rep = slotCandidate(r.rep_candidate);
    const contested = classifyEligibility({ demPct: num(r.dem_pct), repPct: num(r.rep_pct), demCandidate: dem.name, repCandidate: rep.name, demParty: dem.party, repParty: rep.party }, r.state_abbr) === "eligible";
    const onNew = presNew.get(r.district_name), onOld = presOld.get(r.district_name);
    // The same presidential total on both maps means the lines stayed: the redraw flag covers all 14 of
    // NC's seats, but only NC-01 and NC-03 changed. The margin can't tell: TX-15 moved and barely shifted.
    if (redrawn.has(r.district_name) && onNew && onOld && onNew.total !== onOld.total) out.set(r.district_name, { margin: contested ? num(r.margin) - (onOld.margin - onNew.margin) : onNew.margin, estimated: true });
    else if (contested) out.set(r.district_name, { margin: num(r.margin), estimated: false });
  }
  return out;
}

/** Each state's House popular vote in a year on every seat, unopposed ones included: margin over all
 *  votes, R-positive, as the cards read. A same-party final's second finalist sits in the other slot,
 *  so those votes go to their true party; an independent standing in a slot counts for that slot's
 *  party, as partyVotes does. */
function houseVotesByState(year: number) {
  const votes = new Map<string, { dem: number; rep: number; total: number }>();
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_past_results.csv"), "utf8"))) {
    if (r.year !== String(year)) continue;
    const v = votes.get(r.state_abbr) ?? { dem: 0, rep: 0, total: 0 };
    v.total += num(r.total_votes);
    if (slotCandidate(r.dem_candidate).party === "R") v.rep += num(r.dem_votes);
    else v.dem += num(r.dem_votes);
    if (slotCandidate(r.rep_candidate).party === "D") v.dem += num(r.rep_votes);
    else v.rep += num(r.rep_votes);
    votes.set(r.state_abbr, v);
  }
  return votes;
}

export function houseStatePopularVote(year: number): Record<string, number> {
  return Object.fromEntries([...houseVotesByState(year)].map(([state, { dem, rep, total }]) => [state, ((rep - dem) / total) * 100]));
}

/** The national House popular vote in a year, summed the same way; null for a year not in the file. */
export function houseNationalPopularVote(year: number): number | null {
  let dem = 0, rep = 0, total = 0;
  for (const v of houseVotesByState(year).values()) { dem += v.dem; rep += v.rep; total += v.total; }
  return total > 0 ? ((rep - dem) / total) * 100 : null;
}

export function readResultsSnapshot(): ResultsSnapshot {
  const house24 = house2024Baselines();
  const raw = parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_seats.csv"), "utf8"));
  let asOf = 0;
  const rows = raw.map((r): PostElectionRow => {
    asOf = Math.max(asOf, Date.parse(r.fetched_at) || 0);
    const dem = num(r.dem_votes), rep = num(r.rep_votes), oth = num(r.other_votes), total = num(r.total_votes);
    return {
      prior: {
        office: r.office as PostElectionRow["prior"]["office"], id: r.race_id, label: r.label, state: r.state, stateName: r.state_name, special: r.special === "1", seatParty: party(r.seat_party),
        dem: { name: r.dem_name, party: r.dem_party as Party, incumbent: r.dem_incumbent === "1" },
        rep: { name: r.rep_name, party: r.rep_party as Party, incumbent: r.rep_incumbent === "1" },
        forecast: { margin: num(r.forecast_margin), rating: r.forecast_rating, contest: r.contest as PostElectionRow["prior"]["forecast"]["contest"] },
      },
      live: total > 0 ? { dem, rep, oth, total } : null,
      proj: {
        locked: r.called === "1", winner: party(r.winner_party),
        currentMargin: total > 0 ? ((rep - dem) / total) * 100 : null,
        margin: num(r.projected_margin), countedShare: num(r.counted_share), projectedTotal: num(r.projected_total),
      },
      housePrev: r.office === "house" && r.contest === "contested" && r.dem_party === "D" && r.rep_party === "R" ? house24.get(r.label) ?? null : null,
    };
  });
  return { asOf, rows };
}

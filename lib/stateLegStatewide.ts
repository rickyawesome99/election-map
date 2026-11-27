import "server-only";
/**
 * The atlas's comparison rows under the structural lean: how each district, on today's lines, voted for
 * U.S. Senate (and a same-day special), Governor and U.S. House 2016–2026. Built from the district race
 * rows (lib/stateLegDistrictRows.ts). Display only: NOT part of the frozen 2026 lean.
 *
 * A U.S. House row shows the margin of its contested part (Democrat against Republican) and the share
 * that part makes up ("x% covered"); a row with no contested part is left out, as is a statewide race
 * with both slots in one party.
 */
import type { Chamber } from "../data/stateLegDistricts";
import { districtRaceRows, voteMargin, type RosterEntry } from "./stateLegDistrictRows";

export type StatewideOffice = "USS" | "USSS" | "GOV" | "USH";
export type StatewideDistrictVote = {
  year: number;
  office: StatewideOffice;
  dem: number;
  rep: number;
  oth: number;
  /** R − D, points of all votes cast in the contested part. */
  margin: number;
  splitShare: number;
  basis: "votes" | "population";
  dLabel?: string;
  /** Share of the votes in Democrat-vs-Republican contests, where under 1 (U.S. House). */
  coverage?: number;
  missing?: number;
  note?: string;
};

const SHOWN: Set<string> = new Set(["USS", "USSS", "GOV", "USH"]);

export function statewideByDistrict(abbr: string, chamber: Chamber, roster: RosterEntry[]): Map<string, StatewideDistrictVote[]> {
  const out = new Map<string, StatewideDistrictVote[]>();
  for (const [key, rows] of districtRaceRows(abbr, chamber, roster)) {
    const list: StatewideDistrictVote[] = [];
    for (const r of rows) {
      if (!SHOWN.has(r.office) || r.sameParty || r.coverage <= 0) continue;
      const v = r.contested;
      const row: StatewideDistrictVote = {
        year: r.year, office: r.office as StatewideOffice, dem: v.dem, rep: v.rep, oth: v.oth,
        margin: +voteMargin(v).toFixed(2), splitShare: r.splitShare, basis: r.basis,
      };
      if (r.dLabel) row.dLabel = r.dLabel;
      if (r.coverage < 0.995) row.coverage = r.coverage;
      if (r.missing >= 0.005) row.missing = r.missing;
      if (r.note) row.note = r.note;
      list.push(row);
    }
    if (list.length) out.set(key, list);
  }
  return out;
}

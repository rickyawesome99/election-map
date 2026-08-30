import { statesData } from "@/data/statesData";
import { stateLegData, type StateLegEntry } from "@/data/forecastData";
import { stateLegResults } from "@/data/stateLegResults";
import { UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";

/**
 * Aggregation for /audit/state-leg-results section 3, kept OUT of the client component on
 * purpose: data/stateLegResults.ts is ~2.5 MB of per-district rows and the audit only ever needs
 * one summary row per chamber-year, so the page computes these on the server and ships the few
 * hundred rows rather than the whole district file.
 */

export type AggregateAuditRow = {
  abbr: string;
  chamber: Chamber;
  chamberLabel: string;
  year: number;
  districtCount: number;
  /** Districts carrying an actual vote count; the rest exist but were never counted. */
  countedDistricts: number;
  source: string;
  note?: string;
  /** True when the districts and the statewide row trace to the same source. */
  sharedLineage: boolean;
  statewideSource: string;
  aggDem: number;
  aggRep: number;
  aggOth: number;
  aggTotal: number;
  aggMargin: number;
  stwDem: number | null;
  stwRep: number | null;
  stwOth: number | null;
  stwTotal: number | null;
  stwMargin: number | null;
  demDiff: number | null;
  repDiff: number | null;
  othDiff: number | null;
  totalDiff: number | null;
  marginDiff: number | null;
};

const CHAMBER_LABEL: Record<Chamber, string> = { house: "House", senate: "Senate" };

/**
 * The state legislature CSV files Nebraska's unicameral body under "House", so a chamber key
 * coming out of the district data has to be mapped to that convention rather than to "Senate".
 */
function csvType(abbr: string, chamber: Chamber): StateLegEntry["type"] {
  if (UNICAMERAL_STATES.has(abbr)) return "House";
  return chamber === "house" ? "House" : "Senate";
}

/**
 * Two source strings share a lineage when they name the same dataset. Compared on a normalized
 * root rather than byte-for-byte so that a variant label ("… (district level)") cannot be reported
 * as independent corroboration of the dataset it came from.
 */
function sameLineage(a: string, b: string): boolean {
  const root = (s: string) =>
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]/g, "");
  if (!a || !b) return false;
  const ra = root(a);
  const rb = root(b);
  return ra === rb || ra.startsWith(rb) || rb.startsWith(ra);
}

export function buildAggregateAuditRows(): AggregateAuditRow[] {
  const nameByAbbr = new Map(statesData.map((s) => [s.abbr, s.name]));
  const rows: AggregateAuditRow[] = [];

  for (const [abbr, byYear] of Object.entries(stateLegResults)) {
    const stateName = nameByAbbr.get(abbr);
    if (!stateName) continue;
    for (const [yearKey, byChamber] of Object.entries(byYear)) {
      const year = Number(yearKey);
      for (const [chamberKey, block] of Object.entries(byChamber)) {
        const chamber = chamberKey as Chamber;
        if (!block) continue;
        const districts = Object.values(block.districts ?? {});
        if (districts.length === 0) continue;

        let aggDem = 0;
        let aggRep = 0;
        let aggOth = 0;
        let aggTotal = 0;
        let countedDistricts = 0;
        for (const d of districts) {
          // A district with no published count contributes nothing and must not be read as a
          // zero-vote result - see StateLegDistrictResult's noCount.
          if (d.totalVotes == null) continue;
          aggDem += d.demVotes ?? 0;
          aggRep += d.repVotes ?? 0;
          aggOth += d.othVotes ?? 0;
          aggTotal += d.totalVotes;
          countedDistricts += 1;
        }
        const aggMargin = aggTotal ? ((aggRep - aggDem) / aggTotal) * 100 : 0;

        const type = csvType(abbr, chamber);
        const entry = (stateLegData[stateName] ?? []).find((e) => e.year === year && e.type === type);
        const stwDem = entry?.demVotes ?? null;
        const stwRep = entry?.repVotes ?? null;
        const stwOth = entry?.othVotes ?? null;
        const stwTotal = entry?.totalVotes ?? null;
        const stwMargin =
          stwDem != null && stwRep != null && stwTotal ? ((stwRep - stwDem) / stwTotal) * 100 : null;

        rows.push({
          abbr,
          chamber,
          chamberLabel: UNICAMERAL_STATES.has(abbr) ? "Unicameral" : CHAMBER_LABEL[chamber],
          year,
          districtCount: districts.length,
          countedDistricts,
          source: block.source,
          note: block.note,
          statewideSource: entry?.source ?? "",
          sharedLineage: sameLineage(entry?.source ?? "", block.source),
          aggDem,
          aggRep,
          aggOth,
          aggTotal,
          aggMargin,
          stwDem,
          stwRep,
          stwOth,
          stwTotal,
          stwMargin,
          demDiff: stwDem == null ? null : aggDem - stwDem,
          repDiff: stwRep == null ? null : aggRep - stwRep,
          othDiff: stwOth == null ? null : aggOth - stwOth,
          totalDiff: stwTotal == null ? null : aggTotal - stwTotal,
          marginDiff: stwMargin == null ? null : aggMargin - stwMargin,
        });
      }
    }
  }

  return rows.sort(
    (a, b) =>
      Math.abs(b.marginDiff ?? 0) - Math.abs(a.marginDiff ?? 0) ||
      a.abbr.localeCompare(b.abbr) ||
      b.year - a.year
  );
}

import { electionYear, stateLegData } from "@/data/forecastData";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { stateLegCandidates2026 } from "@/data/stateLegCandidates2026";
import { contest2026 } from "@/lib/stateLegAtlas";
import { projectChamber } from "@/lib/stateLegForecast";
import { latestChamberSeats } from "@/lib/stateLegSeats";
import { getChamberMargins } from "@/lib/stateLegChamberMargin";
import { summarizeUpcoming } from "@/lib/stateLegUpcoming";

/**
 * Everything the chamber header (/states/[id]/legislature/[chamber]) and the chamber cards on the
 * legislature landing page say about one chamber: seats now, the 2026 projection, the corrected
 * chamber margin, what's up this cycle and the current map. Server-only (projectChamber).
 */
export function chamberSummary(abbr: string, stateName: string, chamber: Chamber) {
  const unicameral = UNICAMERAL_STATES.has(abbr);
  const roster = stateLegDistricts[abbr]?.[chamber] ?? [];
  const mapInfo = stateLegMapInfo[abbr]?.[chamber] ?? null;
  const calendar = stateLegCalendar[abbr]?.[chamber];
  const entries = stateLegData[stateName] ?? [];
  // Nebraska's unicameral results are stored under "House" in the composition data.
  const seats = latestChamberSeats(entries, unicameral ? "House" : chamber === "house" ? "House" : "Senate");
  const totalSeats = mapInfo?.totalSeats ?? calendar?.eras.at(-1)?.totalSeats ?? seats?.total ?? null;
  const upcoming = summarizeUpcoming(roster, electionYear, totalSeats, calendar?.termYears ?? null);
  const currentEra = calendar?.eras.at(-1);
  const projection = projectChamber(abbr, chamber);
  const field = stateLegCandidates2026[abbr]?.[chamber];
  const fieldStats = field ? (() => {
    const list = Object.entries(field).map(([key, c]) => contest2026(c, roster.find((d) => d.number === key)?.incumbents ?? [])!);
    return { districts: list.length, contested: list.filter((c) => c.status === "contested").length, open: list.filter((c) => c.open).length };
  })() : null;

  // Latest corrected chamber margin: contested votes + uncontested seats imputed from president.
  const margin = (() => {
    const years = getChamberMargins(abbr);
    for (const y of Object.keys(years).map(Number).sort((a, b) => b - a)) {
      const d = years[y].chambers.find((c) => c.chamber === chamber);
      if (!d || d.rawMargin == null) continue;
      const w = d.contested.weight + d.imputed.weight;
      const corrected = w > 0 ? ((d.contested.margin ?? 0) * d.contested.weight + (d.imputed.margin ?? 0) * d.imputed.weight) / w : null;
      return { year: y, raw: d.rawMargin, corrected, imputed: d.imputed.districts };
    }
    return null;
  })();

  return { unicameral, roster, mapInfo, calendar, seats, totalSeats, upcoming, currentEra, projection, fieldStats, margin };
}

export type ChamberSummaryData = ReturnType<typeof chamberSummary>;

export function chamberName(stateName: string, chamber: Chamber, unicameral: boolean): string {
  if (unicameral) return `${stateName} Legislature`;
  return `${stateName} State ${chamber === "house" ? "House" : "Senate"}`;
}

export function chamberShortLabel(chamber: Chamber, unicameral: boolean): string {
  return unicameral ? "Legislature" : chamber === "house" ? "State House" : "State Senate";
}

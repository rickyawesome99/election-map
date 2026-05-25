import { presPastResults, senateData, senateHoldovers, senateNoElection, governorData, governorNoElection } from "@/data/forecastData";
import { popVoteData } from "@/data/popVoteData";

// Returns signed D-R margin (positive = D wins) for the given state, year, and race.
// Returns null if no statewide data is found.
export function getStatewideMargin(stateAbbr: string, year: number, race: string): number | null {
  if (race === "President") {
    const entry = (presPastResults[stateAbbr] ?? []).find((r) => r.year === year);
    return entry != null ? entry.demPct - entry.repPct : null;
  }

  if (race.includes("Senate")) {
    const allSenate = [
      ...senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-")),
      ...senateHoldovers.filter((d) => d.abbr === stateAbbr),
      ...senateNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of allSenate) {
      const entry = (seat.pastResults ?? []).find((r) => r.year === year);
      if (entry != null) return entry.demPct - entry.repPct;
    }
    return null;
  }

  if (race.includes("Governor")) {
    const allGov = [
      ...governorData.filter((d) => d.id === stateAbbr),
      ...governorNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of allGov) {
      const entry = (seat.pastResults ?? []).find((r) => r.year === year);
      if (entry != null) return entry.demPct - entry.repPct;
    }
    return null;
  }

  return null;
}

// Returns national D-R popular vote margin (positive = D wins) for the given race type and year.
// Senate special elections map to the Senate aggregate for that year.
export function getNationalMargin(race: string, year: number): number | null {
  let type: "President" | "House" | "Senate" | "Governor" | null = null;
  if (race === "President") type = "President";
  else if (race.includes("Senate")) type = "Senate";
  else if (race.includes("Governor")) type = "Governor";
  else if (race.includes("House")) type = "House";
  if (!type) return null;
  const entry = popVoteData.find((r) => r.type === type && r.year === year);
  // margin field is rep_pct - dem_pct; negate to get signed D-R value
  return entry != null ? -entry.margin : null;
}

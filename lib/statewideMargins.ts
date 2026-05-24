import { presPastResults, senateData, senateHoldovers, governorData, governorNoElection } from "@/data/forecastData";

// Returns signed D-R margin (positive = D wins) for the given state, year, and race.
// Returns null if no statewide data is found.
export function getStatewideMargin(stateAbbr: string, year: number, race: string): number | null {
  if (race === "President") {
    const entry = (presPastResults[stateAbbr] ?? []).find((r) => r.year === year);
    return entry != null ? entry.demPct - entry.repPct : null;
  }

  if (race.includes("Senate")) {
    const allSenate = [
      ...senateData.filter((d) => d.id === stateAbbr),
      ...senateHoldovers.filter((d) => d.abbr === stateAbbr),
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

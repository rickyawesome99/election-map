// The 2026 market board for /analysis/markets: every Senate, governor and House race with the
// Polymarket price the race pages show (forecastData polyDem, written into the forecast sheet CSVs
// by scripts/fetch-polymarket-2026.py), beside this site's own probability. Server-only: it runs the forecast.

import { governorData, houseData, senateData, type RaceForecast, type RaceType } from "@/data/forecastData";
import { forecastRace } from "@/lib/forecast";
import type { MarketBoardOffice, MarketBoardRace } from "@/lib/marketBoardDisplay";

/** When the polyDem column was last re-read from Polymarket (scripts/fetch-polymarket-2026.py). Bump with the data. */
export const POLYMARKET_2026_READ = "2026-10-19";

function hrefOf(race: RaceForecast): string {
  switch (race.raceType) {
    case "senate": return `/senate/${race.id.toLowerCase().replace(/-2$/, "2")}`;
    case "governor": return `/governor/${race.id.toLowerCase()}`;
    case "house": return `/house/${race.name.toLowerCase()}`;
  }
}

function rowOf(race: RaceForecast): MarketBoardRace | null {
  if (race.polyDem == null) return null;
  return {
    id: race.id,
    office: race.raceType,
    name: race.raceType === "house" ? race.name : race.electionType === "Special" ? `${race.state} (special)` : race.state,
    short: race.raceType === "house" ? race.name : `${race.id.replace(/-2$/, "")}${race.electionType === "Special" ? " (Sp)" : ""}`,
    state: race.state,
    href: hrefOf(race),
    pDem: race.polyDem,
    modelPDem: forecastRace(race).probability,
  };
}

const SOURCES: [RaceType, string, RaceForecast[]][] = [["senate", "Senate", senateData], ["governor", "Governor", governorData], ["house", "House", houseData]];

export const marketBoard: MarketBoardOffice[] = SOURCES.map(([office, label, data]) => ({
  office, label, races: data.map(rowOf).filter((r): r is MarketBoardRace => r != null),
}));

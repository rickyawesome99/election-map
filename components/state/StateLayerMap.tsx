"use client";

import { useMemo } from "react";
import type { PastResult } from "@/data/forecastData";
import type { Chamber } from "@/data/stateLegDistricts";
import type { ForecastedRace } from "@/lib/forecast";
import type { ChamberMapData } from "@/lib/statePage";
import { useStateLegResults } from "@/lib/useStateLegResults";
import StateDistrictMap from "@/components/StateDistrictMap";
import HousePastMap from "@/components/HousePastMap";
import StateLegDistrictMap from "@/components/StateLegDistrictMap";

export type MapLayer = "house" | "stateHouse" | "stateSenate";
const HOUSE_YEARS = [2024, 2022, 2020, 2018, 2016];

export function chamberOfLayer(layer: MapLayer): Chamber | null {
  return layer === "stateHouse" ? "house" : layer === "stateSenate" ? "senate" : null;
}

/** Past years the layer can draw, newest first. */
export function layerYears(layer: MapLayer, housePastResults: Record<string, PastResult[]>, houseRaces: ForecastedRace[], chambers: Partial<Record<Chamber, ChamberMapData>>): number[] {
  const chamber = chamberOfLayer(layer);
  if (chamber) return chambers[chamber]?.electionYears ?? [];
  const found = new Set<number>();
  for (const results of Object.values(housePastResults)) for (const r of results) found.add(r.year);
  for (const race of houseRaces) for (const r of race.pastResults ?? []) found.add(r.year);
  return HOUSE_YEARS.filter((y) => found.has(y));
}

/**
 * The ballot section's one map. Three layers (U.S. House and the two chambers) and one year
 * control: the election-year chip is the projection, any other chip is that year's results on
 * the lines it ran on. The parent owns layer, year and selection so the ballot rows and the
 * results cards can drive the map too.
 */
export default function StateLayerMap({
  stateAbbr,
  stateName,
  stateFips,
  electionYear,
  layer,
  year,
  houseRaces,
  housePastResults,
  housePastHrefs,
  chambers,
  selectedHouse,
  onSelectHouse,
  selectedLegKey,
  onSelectLeg,
}: {
  stateAbbr: string;
  stateName: string;
  stateFips: string;
  electionYear: number;
  layer: MapLayer;
  year: number;
  houseRaces: ForecastedRace[];
  housePastResults: Record<string, PastResult[]>;
  housePastHrefs: Record<string, string>;
  chambers: Partial<Record<Chamber, ChamberMapData>>;
  selectedHouse: ForecastedRace | null;
  onSelectHouse: (race: ForecastedRace | null) => void;
  selectedLegKey: string | null;
  onSelectLeg: (key: string | null) => void;
}) {
  const chamber = chamberOfLayer(layer);
  const data = chamber ? chambers[chamber] : undefined;
  const isPast = year !== electionYear;
  const { data: resultsData, loading: resultsLoading } = useStateLegResults(stateAbbr, !!chamber && isPast);

  const chamberResults = chamber && isPast ? resultsData?.[String(year)]?.[chamber] ?? null : null;
  const vintage = chamber && isPast ? data?.historicalMaps[String(year)] : undefined;
  const boundaryUrl = chamber
    ? vintage
      ? `/state-leg-districts-historical/${chamber}/${stateAbbr}-${vintage}.json`
      : `/state-leg-districts/${chamber}/${stateAbbr}.json`
    : "";
  const era = useMemo(() => (chamber && isPast ? data?.eras.find((e) => e.electionYears.includes(year)) : undefined), [chamber, isPast, data, year]);
  const chamberLabel = data?.isUnicameral ? "Legislature" : chamber === "house" ? "State House" : "State Senate";
  const boundaryNote = chamber && isPast && era
    ? `${chamberLabel} boundaries used in ${year}${era.source ? ` · ${era.source}` : ""}${vintage ? "" : " (still in effect)"}`
    : null;

  if (chamber) {
    if (!data) return null;
    return (
      <StateLegDistrictMap
        stateAbbr={stateAbbr}
        stateName={stateName}
        chamber={chamber}
        isUnicameral={data.isUnicameral}
        mapInfo={data.mapInfo}
        boundaryUrl={boundaryUrl}
        boundaryNote={boundaryNote}
        districts={data.roster}
        results={chamberResults?.districts ?? null}
        resultsYear={isPast ? year : null}
        resultsSource={chamberResults?.source ?? null}
        resultsLoading={resultsLoading}
        viewMode={isPast ? "results" : "seats"}
        custom={isPast ? null : data.custom}
        upcomingYear={electionYear}
        selectedKey={selectedLegKey}
        onSelect={onSelectLeg}
        hideLegend
      />
    );
  }

  if (!isPast) {
    return (
      <StateDistrictMap
        houseRaces={houseRaces}
        stateAbbr={stateAbbr}
        stateName={stateName}
        selected={selectedHouse}
        onSelect={onSelectHouse}
      />
    );
  }
  return (
    <HousePastMap
      key={year}
      houseRaces={houseRaces}
      historicalResults={housePastResults}
      pastHrefs={housePastHrefs}
      stateAbbr={stateAbbr}
      stateFips={stateFips}
      selectedYear={year}
    />
  );
}

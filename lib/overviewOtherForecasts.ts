// The Overview's Other Forecasts panel, computed on the server (app/overview/page.tsx). Server-only:
// it runs the forecast comparison and reads every race's market price.

import type { OverviewData } from "@/components/OverviewEditorial";
import { governorData, houseData, senateData, type RaceType } from "@/data/forecastData";
import { externalForecasts, EXTERNAL_FORECASTS_READ } from "@/data/externalForecasts";
import { comparisonFor } from "@/lib/forecastComparison";
import { POLYMARKET_2026_READ } from "@/lib/marketBoard";
import { SEAT_HOLDOVERS } from "@/lib/forecast";
import polymarketControl from "@/data/polymarketControl.json";

// The Other Forecasts panel: Polymarket, DDHQ and VoteHub (user, 2026-10-22), the two models read through the
// /analysis/forecasts comparison so a refresh of that page's snapshot updates these rows too.
const OVERVIEW_FORECASTERS = ["ddhq", "votehub"];
const CHAMBER_TYPES: RaceType[] = ["house", "senate", "governor"];

export function otherForecasts(): OverviewData["otherForecasts"] {
  const byChamber = Object.fromEntries(CHAMBER_TYPES.map((type) => [type, comparisonFor(type).toplines])) as Record<RaceType, ReturnType<typeof comparisonFor>["toplines"]>;
  const rows: OverviewData["otherForecasts"]["rows"] = OVERVIEW_FORECASTERS.map((id) => {
    const f = externalForecasts.find((x) => x.id === id)!;
    return {
      id, name: f.name, short: f.shortName ?? f.name, kind: f.kind, href: f.urls.home,
      cells: Object.fromEntries(CHAMBER_TYPES.map((type) => {
        const t = byChamber[type][id];
        return [type, t?.demSeats == null || t.repSeats == null ? null : { dem: Math.round(t.demSeats), rep: Math.round(t.repSeats), tossups: t.tossups || null, pDem: t.pDemControl }];
      })) as OverviewData["otherForecasts"]["rows"][number]["cells"],
    };
  });
  // Polymarket: every race's favourite (the polyDem price the race pages show), summed with the
  // seats not up this year; a race priced dead even counts as neither. The control odds are its own
  // House and Senate control markets (scripts/fetch-polymarket-2026.py); none exists for governors.
  const market = (data: { polyDem?: number | null }[], type: RaceType, pDem: number | null = null) => {
    const priced = data.filter((r) => r.polyDem != null) as { polyDem: number }[];
    const even = priced.filter((r) => r.polyDem === 0.5).length;
    return { dem: SEAT_HOLDOVERS[type].dem + priced.filter((r) => r.polyDem > 0.5).length, rep: SEAT_HOLDOVERS[type].rep + priced.filter((r) => r.polyDem < 0.5).length, tossups: even || null, pDem };
  };
  rows.unshift({ id: "polymarket", name: "Polymarket", short: "Polymarket", kind: "market", href: "/analysis/markets",
    cells: { house: market(houseData, "house", polymarketControl.house), senate: market(senateData, "senate", polymarketControl.senate), governor: market(governorData, "governor") } });
  return { rows, forecastsRead: EXTERNAL_FORECASTS_READ, marketRead: POLYMARKET_2026_READ };
}


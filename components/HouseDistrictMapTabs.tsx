"use client";

import Link from "next/link";
import { useState } from "react";
import DistrictMiniMap from "@/components/DistrictMiniMap";
import HouseDistrictCountyMap from "@/components/HouseDistrictCountyMap";
import type { CountyMapEntry } from "@/components/PastElectionCountyMap";

// The House page's District Map: the 2026 projected result by county (default), and the district
// lines over time. The projection is the race's forecast margin spread over its counties by the
// turnout estimate (lib/countyProjection.ts), drawn on the 2026 county pieces.

export type HouseProjectionMap = {
  piecesUrl: string;
  district: number;
  districtLabel: string;
  counties: CountyMapEntry[];
  demName: string;
  repName: string;
  demParty: "D" | "R" | "I";
  repParty: "D" | "R" | "I";
  /** R-positive forecast margin, for the caption. */
  margin: number;
  votes: number;
};

type Tab = "projection" | "lines";

export default function HouseDistrictMapTabs({ raceId, stateAbbr, margin, boundaryYears, projection }: {
  raceId: string;
  stateAbbr: string;
  margin: number;
  boundaryYears: number[];
  projection: HouseProjectionMap | null;
}) {
  const [tab, setTab] = useState<Tab>(projection ? "projection" : "lines");
  const tabs: { key: Tab; label: string }[] = [...(projection ? [{ key: "projection" as Tab, label: "2026 projection" }] : []), { key: "lines", label: "District lines" }];
  return (
    <div>
      {tabs.length > 1 && (
        <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="District map view">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={t.key === tab} onClick={() => setTab(t.key)} className="rounded-md px-2.5 py-1 text-xs font-semibold"
              style={t.key === tab ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" } : { color: "var(--app-text-muted)" }}>{t.label}</button>
          ))}
        </div>
      )}
      {tab === "projection" && projection ? (
        <HouseDistrictCountyMap
          piecesUrl={projection.piecesUrl}
          district={projection.district}
          districtLabel={projection.districtLabel}
          stateAbbr={stateAbbr}
          counties={projection.counties}
          demName={projection.demName}
          repName={projection.repName}
          demParty={projection.demParty}
          repParty={projection.repParty}
          height={280}
          caption={
            <div className="px-1 pt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
              Projected 2026 result by county: the forecast margin ({projection.margin > 0 ? projection.repParty : projection.demParty}+{Math.abs(projection.margin).toFixed(1)}) spread over the district&apos;s counties by their lean, on {projection.votes.toLocaleString()} estimated votes. Split counties show the district&apos;s share, with the piece&apos;s own 2024 lean where the lines are unchanged. <Link href="/methodology/turnout#county-results" className="underline underline-offset-2">How this is built</Link>.
            </div>
          }
        />
      ) : (
        <div style={{ height: 280 }}>
          <DistrictMiniMap raceId={raceId} stateAbbr={stateAbbr} margin={margin} boundaryYears={boundaryYears} />
        </div>
      )}
    </div>
  );
}

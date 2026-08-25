"use client";

import { useState } from "react";
import StateLegDistrictMap from "./StateLegDistrictMap";
import StateLegDistrictTable from "./StateLegDistrictTable";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { ChamberMapInfo } from "@/data/stateLegMapInfo";

export default function StateLegSection({
  stateAbbr,
  stateName,
  districtsByChamber,
  mapInfoByChamber = {},
  isUnicameral = false,
}: {
  stateAbbr: string;
  stateName: string;
  districtsByChamber: Partial<Record<Chamber, StateLegDistrict[]>>;
  mapInfoByChamber?: Partial<Record<Chamber, ChamberMapInfo>>;
  isUnicameral?: boolean;
}) {
  const [chamber, setChamber] = useState<Chamber>("house");
  // Nebraska's single chamber is classified as "senate" (SLDU) in Census/TIGER data, so
  // that's the chamber key its data is stored and looked up under even though the UI
  // just calls it "Legislature".
  const activeChamber = isUnicameral ? "senate" : chamber;
  const districts = districtsByChamber[activeChamber] ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Chamber toggle — hidden for unicameral Nebraska, which has one chamber */}
      <div
        className="flex items-end gap-5 min-w-0"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        {isUnicameral ? (
          <span className="pb-2.5 text-sm font-semibold" style={{ color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }}>
            Legislature
          </span>
        ) : (
          (["house", "senate"] as Chamber[]).map((c) => (
            <button
              key={c}
              onClick={() => setChamber(c)}
              className="pb-2.5 text-sm font-semibold transition-colors"
              style={
                chamber === c
                  ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                  : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }
              }
            >
              {c === "house" ? "State House" : "State Senate"}
            </button>
          ))
        )}
      </div>

      <StateLegDistrictMap
        stateAbbr={stateAbbr}
        stateName={stateName}
        chamber={activeChamber}
        isUnicameral={isUnicameral}
        mapInfo={mapInfoByChamber[activeChamber] ?? null}
      />

      <StateLegDistrictTable
        districts={districts}
        chamber={activeChamber}
        stateName={stateName}
        isUnicameral={isUnicameral}
      />
    </div>
  );
}

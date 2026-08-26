"use client";

import { useState, useCallback, type ReactNode } from "react";
import StateLegDistrictMap from "./StateLegDistrictMap";
import StateLegDistrictTable from "./StateLegDistrictTable";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { ChamberMapInfo } from "@/data/stateLegMapInfo";

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-dem)",
  R: "var(--party-rep)",
  I: "var(--party-ind)",
  O: "var(--app-text-secondary)",
};

// Deliberately compact — this sits above the "About the X Legislature" section on desktop, so
// it shouldn't push that content far down the page.
function SelectedDistrictPanel({ district, onClose }: { district: StateLegDistrict; onClose: () => void }) {
  const incumbents = district.incumbents ?? [];
  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-2 mb-2" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
          Selected District
        </h2>
        <button onClick={onClose} aria-label="Close" style={{ color: "var(--app-text-very-muted)" }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex items-start justify-between gap-3 pb-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div className="min-w-0">
          <div className="text-sm font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            {district.label}
          </div>
          {incumbents.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {incumbents.map((inc, i) => (
                <div key={i} className="flex items-baseline gap-1.5 text-xs">
                  <span className="font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{inc.name}</span>
                  <span className="font-bold shrink-0" style={{ color: PARTY_COLOR[inc.party] }}>({inc.party})</span>
                  {inc.lastElection != null && (
                    <span className="shrink-0" style={{ fontSize: 10, color: "var(--app-text-very-muted)" }}>{inc.lastElection}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Vacant</div>
          )}
          {district.lastElection != null && !incumbents.some((inc) => inc.lastElection != null) && (
            <div className="mt-1" style={{ fontSize: 10, color: "var(--app-text-very-muted)" }}>
              Last elected {district.lastElection}
            </div>
          )}
        </div>
        {district.margin != null && (
          <div
            className="tabular-nums font-extrabold shrink-0 text-base"
            style={{ color: district.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
          >
            {district.margin <= 0 ? "D" : "R"}+{Math.abs(district.margin).toFixed(1)}
          </div>
        )}
      </div>
    </section>
  );
}

export default function StateLegSection({
  stateAbbr,
  stateName,
  districtsByChamber,
  mapInfoByChamber = {},
  isUnicameral = false,
  sidebar,
}: {
  stateAbbr: string;
  stateName: string;
  districtsByChamber: Partial<Record<Chamber, StateLegDistrict[]>>;
  mapInfoByChamber?: Partial<Record<Chamber, ChamberMapInfo>>;
  isUnicameral?: boolean;
  sidebar?: ReactNode;
}) {
  const [chamber, setChamber] = useState<Chamber>("house");
  const [selected, setSelected] = useState<StateLegDistrict | null>(null);
  // Nebraska's single chamber is classified as "senate" (SLDU) in Census/TIGER data, so
  // that's the chamber key its data is stored and looked up under even though the UI
  // just calls it "Legislature".
  const activeChamber = isUnicameral ? "senate" : chamber;
  const districts = districtsByChamber[activeChamber] ?? [];

  // A selected district belongs to one chamber's map; switching chambers invalidates it.
  const handleChamberSwitch = useCallback((c: Chamber) => {
    setChamber(c);
    setSelected(null);
  }, []);

  return (
    // On mobile this collapses to one flattened stack (both column wrappers below switch to
    // `display: contents`), so the per-item `order-N`/`md:order-N` classes place the selected-
    // district panel between the map and the table on mobile, but above the sidebar on desktop
    // — where it's a sibling inside the (now real) right-hand flex column instead.
    <div className="grid grid-cols-1 gap-4 md:gap-8 md:grid-cols-2 md:items-start">
      <div className="contents md:flex md:flex-col md:gap-4">
        {/* Chamber toggle — hidden for unicameral Nebraska, which has one chamber */}
        <div
          className="order-1 flex items-end gap-5 min-w-0"
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
                onClick={() => handleChamberSwitch(c)}
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

        <div className="order-2">
          <StateLegDistrictMap
            stateAbbr={stateAbbr}
            stateName={stateName}
            chamber={activeChamber}
            isUnicameral={isUnicameral}
            mapInfo={mapInfoByChamber[activeChamber] ?? null}
            districts={districts}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        <div className="order-4">
          <StateLegDistrictTable
            districts={districts}
            chamber={activeChamber}
            stateName={stateName}
            isUnicameral={isUnicameral}
          />
        </div>
      </div>

      <div className="contents md:flex md:flex-col md:gap-8">
        {selected && (
          <div className="order-3 md:order-1">
            <SelectedDistrictPanel district={selected} onClose={() => setSelected(null)} />
          </div>
        )}
        <div className="order-5 md:order-2 flex flex-col gap-8">{sidebar}</div>
      </div>
    </div>
  );
}

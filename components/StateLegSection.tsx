"use client";

import { useState, useCallback, useMemo, type ReactNode } from "react";
import StateLegDistrictMap from "./StateLegDistrictMap";
import StateLegDistrictTable from "./StateLegDistrictTable";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { ChamberMapInfo } from "@/data/stateLegMapInfo";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";
import { fmtMargin } from "@/lib/colorScale";

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-dem)",
  R: "var(--party-rep)",
  I: "var(--party-ind)",
  O: "var(--app-text-secondary)",
};

// Deliberately compact — this sits above the "About the X Legislature" section on desktop, so
// it shouldn't push that content far down the page.
function SelectedDistrictPanel({
  district,
  viewMode,
  presidentialResult,
  onClose,
}: {
  district: StateLegDistrict;
  viewMode: MapViewMode;
  presidentialResult?: StateLegPres2024;
  onClose: () => void;
}) {
  const incumbents = district.incumbents ?? [];
  const isPresidentialView = viewMode === "president";
  const displayedMargin = isPresidentialView ? presidentialResult?.margin : district.margin;
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
          {isPresidentialView ? (
            <div className="text-xs" style={{ color: presidentialResult ? "var(--app-text-muted)" : "var(--app-text-very-muted)" }}>
              {presidentialResult ? "2024 presidential vote margin" : "2024 result not yet sourced"}
              {presidentialResult?.estimated && (
                <span className="ml-1 italic">(estimated)</span>
              )}
            </div>
          ) : incumbents.length > 0 ? (
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
          {!isPresidentialView && district.lastElection != null && !incumbents.some((inc) => inc.lastElection != null) && (
            <div className="mt-1" style={{ fontSize: 10, color: "var(--app-text-very-muted)" }}>
              Last elected {district.lastElection}
            </div>
          )}
        </div>
        {displayedMargin != null && (
          <div
            className="tabular-nums font-extrabold shrink-0 text-base"
            style={{ color: displayedMargin <= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
          >
            {isPresidentialView
              ? fmtMargin(displayedMargin)
              : `${displayedMargin <= 0 ? "D" : "R"}+${Math.abs(displayedMargin).toFixed(1)}`}
          </div>
        )}
      </div>
    </section>
  );
}

// Tallies whatever the map is currently showing: incumbent seats-by-party in "seats" mode
// (matching the hero stat row, including multi-member districts as one seat per incumbent),
// or district-level 2024 presidential winners in "president" mode.
function DistrictCountBar({
  districts,
  pres2024,
  viewMode,
}: {
  districts: StateLegDistrict[];
  pres2024: Record<string, StateLegPres2024>;
  viewMode: MapViewMode;
}) {
  const stats = useMemo(() => {
    if (viewMode === "president") {
      let dem = 0;
      let rep = 0;
      let missing = 0;
      for (const d of districts) {
        const result = pres2024[d.number];
        if (!result) missing++;
        else if (result.margin <= 0) dem++;
        else rep++;
      }
      return [
        { key: "D", label: "D", value: dem, color: PARTY_COLOR.D },
        { key: "R", label: "R", value: rep, color: PARTY_COLOR.R },
        ...(missing > 0 ? [{ key: "missing", label: "No data", value: missing, color: "var(--app-text-very-muted)" }] : []),
      ];
    }
    const counts: Record<string, number> = {};
    let vacant = 0;
    for (const d of districts) {
      const incumbents = d.incumbents ?? [];
      if (incumbents.length === 0) {
        vacant++;
        continue;
      }
      for (const inc of incumbents) counts[inc.party] = (counts[inc.party] ?? 0) + 1;
    }
    const entries: { key: string; label: string; value: number; color: string }[] = (["D", "R", "I", "O"] as const)
      .filter((p) => counts[p])
      .map((p) => ({ key: p, label: p, value: counts[p], color: PARTY_COLOR[p] }));
    if (vacant > 0) entries.push({ key: "vacant", label: "Vacant", value: vacant, color: "var(--app-text-very-muted)" });
    return entries;
  }, [districts, pres2024, viewMode]);

  if (districts.length === 0 || stats.length === 0) return null;

  return (
    <div className="order-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {stats.map((s) => (
        <span key={s.key} className="flex items-baseline gap-1.5">
          <span className="text-sm font-extrabold tabular-nums" style={{ color: s.color }}>
            {s.value}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function StateLegSection({
  stateAbbr,
  stateName,
  districtsByChamber,
  mapInfoByChamber = {},
  pres2024ByChamber = {},
  isUnicameral = false,
  sidebar,
}: {
  stateAbbr: string;
  stateName: string;
  districtsByChamber: Partial<Record<Chamber, StateLegDistrict[]>>;
  mapInfoByChamber?: Partial<Record<Chamber, ChamberMapInfo>>;
  pres2024ByChamber?: Partial<Record<Chamber, Record<string, StateLegPres2024>>>;
  isUnicameral?: boolean;
  sidebar?: ReactNode;
}) {
  const [chamber, setChamber] = useState<Chamber>("house");
  const [selected, setSelected] = useState<StateLegDistrict | null>(null);
  const [viewMode, setViewMode] = useState<MapViewMode>("seats");
  // Nebraska's single chamber is classified as "senate" (SLDU) in Census/TIGER data, so
  // that's the chamber key its data is stored and looked up under even though the UI
  // just calls it "Legislature".
  const activeChamber = isUnicameral ? "senate" : chamber;
  const districts = districtsByChamber[activeChamber] ?? [];
  const pres2024 = pres2024ByChamber[activeChamber] ?? {};

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
          className="order-1 flex items-end justify-between gap-3 min-w-0"
          style={{ borderBottom: "1px solid var(--app-border)" }}
        >
          <div className="flex items-end gap-5 min-w-0">
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

          {/* Map view-mode toggle — orthogonal to the chamber toggle above */}
          <div className="mb-1.5 flex shrink-0 items-center gap-0.5 rounded-full p-0.5" style={{ background: "var(--app-tab-bg)" }}>
            {([["seats", "Seats"], ["president", "2024 President"]] as [MapViewMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors"
                style={
                  viewMode === mode
                    ? { background: "var(--app-panel)", color: "var(--app-text-primary)" }
                    : { color: "var(--app-text-muted)" }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <DistrictCountBar districts={districts} pres2024={pres2024} viewMode={viewMode} />

        <div className="order-3">
          <StateLegDistrictMap
            stateAbbr={stateAbbr}
            stateName={stateName}
            chamber={activeChamber}
            isUnicameral={isUnicameral}
            mapInfo={mapInfoByChamber[activeChamber] ?? null}
            districts={districts}
            pres2024={pres2024}
            viewMode={viewMode}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        <div className="order-5">
          <StateLegDistrictTable
            districts={districts}
            chamber={activeChamber}
            stateName={stateName}
            isUnicameral={isUnicameral}
            pres2024={pres2024}
          />
        </div>
      </div>

      <div className="contents md:flex md:flex-col md:gap-8">
        {selected && (
          <div className="order-4 md:order-1">
            <SelectedDistrictPanel
              district={selected}
              viewMode={viewMode}
              presidentialResult={pres2024[selected.number]}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
        <div className="order-5 md:order-2 flex flex-col gap-8">{sidebar}</div>
      </div>
    </div>
  );
}

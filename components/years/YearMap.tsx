"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geography } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import PinnedMapCard, { PinnedCardClose, PinnedCardLink, pinFromEvent, type MapPin } from "@/components/maps/PinnedMapCard";
import { FlipPatternDefs, FlipSwatch, flipBackground, flipFill } from "@/components/FlipStripes";
import { normalizeGeographyWinding, type WindableGeography } from "@/lib/geoWinding";
import { STATES_10M_URL } from "@/lib/projectedMaps";
import { startPendingNav } from "@/lib/navPending";
import { useDesktopPointer } from "@/lib/useDesktopPointer";
import { useMapTooltip } from "@/lib/useMapTooltip";
import type { YearMapUnit, YearOfficeSummary, YearUnitClass } from "@/lib/yearPageTypes";

// One office's map on the Years page: every seat on the ballot by the party that won it, striped
// where it changed hands. States for the statewide offices and the legislatures, the year's own
// district lines for the House. A fixed view (no zoom), so five of them scroll like pictures; a
// click opens a shape's race; on a phone a tap pins its hover card, which links to it. Drawn in TplMaps' wide frame, which lib/projectedMaps.ts pre-projects for
// the state file and every district era.

type GeoFeature = { rsmKey: string; properties?: Record<string, string | undefined> } & WindableGeography;

const FRAME = { width: 800, height: 480, projectionConfig: { scale: 1000 } };
// The frame's Albers layout sits left of centre (as TplMaps' WIDE_SHIFT).
const SHIFT = 29;

export const YEAR_FILL: Record<YearUnitClass, string> = { D: "#1b408c", R: "#be1c29", I: "#a08c20", split: "#4B0082", open: "#8b949e" };

// Module-level: react-simple-maps re-fetches a file whenever this function's identity changes.
const parseDistricts = (geographies: never[]) => (geographies as GeoFeature[]).map(normalizeGeographyWinding);

const UnitLayer = memo(function UnitLayer({ geographies, district, units, onHover, onPick }: {
  geographies: GeoFeature[]; district: boolean; units: Record<string, YearMapUnit>;
  onHover: (u: YearMapUnit | null) => void; onPick: (key: string | null, e: React.MouseEvent) => void;
}) {
  return (
    <>
      {geographies.map((geo) => {
        const key = (district ? geo.properties?.GEOID : geo.properties?.name) ?? "";
        const u = units[key];
        const color = u ? YEAR_FILL[u.cls] : null;
        const fill = !color ? "var(--map-unfilled)" : u!.flipped ? flipFill(color) : color;
        const base = district ? 0.35 : 0.9;
        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            aria-label={u?.title}
            onMouseEnter={() => u && onHover(u)}
            onMouseLeave={() => onHover(null)}
            onClick={(e: React.MouseEvent) => onPick(u ? key : null, e)}
            style={{
              default: { fill, stroke: "var(--app-bg)", strokeWidth: base, outline: "none" },
              hover: { fill, stroke: "var(--app-text-primary)", strokeWidth: district ? 0.9 : 1.5, outline: "none", cursor: u ? "pointer" : "default" },
              pressed: { fill, stroke: "var(--app-text-primary)", strokeWidth: district ? 1.2 : 2, outline: "none" },
            }}
          />
        );
      })}
    </>
  );
});

const LINE = { fill: "none", stroke: "var(--app-bg)", strokeWidth: 1, outline: "none", pointerEvents: "none" as const };
const StateLines = memo(function StateLines() {
  return (
    <Geographies geography={STATES_10M_URL}>
      {({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => <Geography key={geo.rsmKey} geography={geo} style={{ default: LINE, hover: LINE, pressed: LINE }} />)}
    </Geographies>
  );
});

const partyText = (p: YearMapUnit["lines"][number]["party"]) => (p === "D" ? "var(--party-dem)" : p === "R" ? "var(--party-rep)" : p === "I" ? "var(--party-ind)" : "var(--app-text-muted)");

const BOX = { width: 240, padding: "10px 12px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" } as const;

/** The site's map hover card (components/CountyTooltip.tsx): the name in small caps, each figure in
 *  serif in its party's colour, the detail under it. `aside` sits right of the name (the pinned
 *  card's close button) and `footer` under everything (its link). */
function UnitCard({ unit, aside, footer }: { unit: YearMapUnit; aside?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[10.5px] font-bold uppercase tracking-[0.07em]" style={{ textWrap: "balance" }}>{unit.title}</div>
        {aside}
      </div>
      {unit.lines.map((l, i) => (
        <div key={i} className={i > 0 ? "mt-2 border-t pt-2" : "mt-1"} style={{ borderColor: "var(--app-border)" }}>
          {l.label && <div className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-text-muted)" }}>{l.label}</div>}
          <div className="flex items-baseline justify-between gap-2">
            <span className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: unit.lines.length > 1 ? 22 : 28, lineHeight: 1.1, color: partyText(l.party) }}>{l.head}</span>
            {l.note && <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: `color-mix(in srgb, ${partyText(l.party)} 14%, transparent)`, color: partyText(l.party) }}>{l.note}</span>}
          </div>
          {l.sub && <div className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: l.party ? partyText(l.party) : "var(--app-text-muted)" }}>{l.sub}</div>}
        </div>
      ))}
      {unit.foot && <div className="mt-1.5 text-[11.5px] leading-snug tabular-nums" style={{ color: "var(--app-text-muted)" }}>{unit.foot}</div>}
      {footer}
    </>
  );
}

/** A clicked or tapped shape: its key, and where in the map's box the press landed. */
type Pinned = { key: string; at: MapPin };

export default function YearMap({ map, label }: { map: YearOfficeSummary["map"]; label: string }) {
  const district = map.level === "district";
  const [hovered, setHovered] = useState<YearMapUnit | null>(null);
  // With a mouse, hover shows the card and a click opens the place's page. A phone has no hover, so
  // a tap pins the same card where it landed, with a close button and a link to the page.
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const desktop = useDesktopPointer();
  const router = useRouter();
  const { onMouseMove, tooltipRef } = useMapTooltip(14, 8);
  const onPick = useCallback((key: string | null, e: React.MouseEvent) => {
    if (desktop) {
      const href = key ? (map.units[key] ?? map.insets?.find((i) => i.key === key)?.unit)?.href : null;
      if (!href) return;
      if (e.metaKey || e.ctrlKey) { window.open(href, "_blank", "noopener"); return; }
      startPendingNav(href);
      router.push(href);
      return;
    }
    const at = pinFromEvent(e);
    setPinned((was) => (!key || !at || was?.key === key ? null : { key, at }));
  }, [desktop, map, router]);
  // Read through the key, so a year switch shows the same place's new result, or drops the card.
  const pinnedUnit = pinned ? map.units[pinned.key] ?? map.insets?.find((i) => i.key === pinned.key)?.unit ?? null : null;
  const anyFlip = Object.values(map.units).some((u) => u.flipped) || !!map.insets?.some((i) => i.unit.flipped);

  return (
    <div>
      <div data-map-pin="" className="relative w-full" style={{ aspectRatio: "800 / 480" }} onMouseMove={onMouseMove} onMouseLeave={() => setHovered(null)} role="group" aria-label={label}>
        {hovered && hovered !== pinnedUnit && (
          <div ref={tooltipRef} className="pointer-events-none absolute z-20 hidden rounded-lg md:block" style={BOX}>
            <UnitCard unit={hovered} />
          </div>
        )}
        {pinned && pinnedUnit && (
          <PinnedMapCard pin={pinned.at} width={BOX.width} label={pinnedUnit.title}>
            <div className="rounded-lg" style={BOX}>
              <UnitCard unit={pinnedUnit}
                aside={<PinnedCardClose onClick={() => setPinned(null)} />}
                footer={pinnedUnit.href && <div className="mt-2.5"><PinnedCardLink href={pinnedUnit.href}>Go to {pinnedUnit.title}</PinnedCardLink></div>} />
            </div>
          </PinnedMapCard>
        )}
        {map.insets && map.insets.length > 0 && (
          // The Senate's special elections: a box each in the corner, read and pressed like a state.
          <div className="absolute bottom-0 right-0 z-10 text-right">
            <div className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Special{map.insets.length === 1 ? "" : "s"}</div>
            <div className="mt-0.5 flex justify-end gap-1">
              {map.insets.map(({ key, abbr, unit }) => (
                <button key={key} type="button" aria-label={unit.title} onMouseEnter={() => setHovered(unit)} onMouseLeave={() => setHovered(null)} onClick={(e) => onPick(key, e)}
                  className="ix-press grid h-7 w-8 place-items-center rounded text-[11px] font-bold text-white"
                  style={{ background: unit.flipped ? flipBackground(YEAR_FILL[unit.cls], 1.5, "rgba(255,255,255,0.35)") : YEAR_FILL[unit.cls], outline: pinned?.key === key ? "2px solid var(--app-text-primary)" : undefined, outlineOffset: 1 }}>
                  {abbr}
                </button>
              ))}
            </div>
          </div>
        )}
        <ComposableMap projection="geoAlbersUsa" {...FRAME} style={{ width: "100%", height: "100%" }}>
          <FlipPatternDefs colors={Object.values(YEAR_FILL)} />
          <g transform={`translate(${SHIFT} 0)`}>
            {/* Keyed on the file: a year switch that changes the district era starts a fresh layer. */}
            <Geographies key={map.geoUrl} geography={map.geoUrl} parseGeographies={district ? parseDistricts : undefined}>
              {({ geographies }: { geographies: GeoFeature[] }) => <UnitLayer geographies={geographies} district={district} units={map.units} onHover={setHovered} onPick={onPick} />}
            </Geographies>
            {district && <StateLines />}
          </g>
        </ComposableMap>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
        {map.legend.map((l) => (
          <span key={l.cls} className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: YEAR_FILL[l.cls] }} />{l.label}</span>
        ))}
        {anyFlip && <span className="inline-flex items-center gap-1.5"><FlipSwatch size={10} />Changed party</span>}
        {map.unfilledLabel && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--map-unfilled)" }} />{map.unfilledLabel}</span>}
      </div>
    </div>
  );
}

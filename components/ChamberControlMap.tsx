"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geography, ZoomableGroup } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import type { RaceType } from "@/data/forecastData";
import { seatPartyIn, type ChamberSeat, type ChamberView, type SeatParty } from "@/lib/chamberPageTypes";
import { isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { fmtSeatMargin } from "@/lib/chamberPageFormat";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { startPendingNav } from "@/lib/navPending";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { FlipPatternDefs, FlipSwatch, flipFill } from "./FlipStripes";
import { HoverBox, HoverFoot, HoverRow, HoverRows, HoverTitle } from "./StateLegHoverCard";

// The control map on /house, /senate and /governor: every seat by the party holding it, in the
// counted 2026 results, the final forecast, or going into the election. The House draws its 435
// districts; the Senate shades a state by its two seats; a governorship is its state.

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
// The same display files as the forecast map (components/ForecastMap.tsx).
const HOUSE_DISTRICTS_URL = "/congressional-districts-2026-lite.json";
const HOUSE_STATE_LINES_URL = "/congressional-districts-2026-lite-state-lines.json";

type GeoFeature = { rsmKey: string; properties?: Record<string, string | undefined> };

type UnitClass = "D" | "R" | "I" | "split";
const FILL: Record<UnitClass, string> = { D: "#1b408c", R: "#be1c29", I: "#a08c20", split: "#4B0082" };
const PARTY_VAR: Record<SeatParty, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)" };
const PARTY_WORD: Record<SeatParty, string> = { D: "Democratic", R: "Republican", I: "Independent" };

/** One shape on the map: a district, or a state with its one governor or two senators. */
type Unit = { key: string; title: string; href: string; seats: ChamberSeat[] };

function unitClass(u: Unit, view: ChamberView): UnitClass {
  const parties = new Set(u.seats.map((s) => seatPartyIn(s, view)));
  return parties.size === 1 ? [...parties][0] : "split";
}
const unitFlips = (u: Unit, view: ChamberView) => view !== "now" && u.seats.some((s) => seatPartyIn(s, view) !== s.before.party);

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md p-0.5" style={{ background: "var(--app-tab-bg)" }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="rounded px-2.5 py-1 text-xs font-semibold"
          style={v === value ? { background: "var(--app-panel)", color: "var(--app-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : { color: "var(--app-text-muted)" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// The paths re-render when the view changes, not on every hover or pan frame.
const UnitLayer = memo(function UnitLayer({ geographies, house, units, view, onHover, onOpen }: {
  geographies: GeoFeature[];
  house: boolean;
  units: Map<string, Unit>;
  view: ChamberView;
  onHover: (u: Unit | null) => void;
  onOpen: (u: Unit, newTab: boolean) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <>
      {geographies.map((geo) => {
        let u: Unit | undefined;
        if (house) {
          const id = geo.properties?.GEOID;
          if (!isCongressionalDistrictGeoid(id) || !id) return null;
          // Census at-large GEOIDs end in "00"; the seat ids end in "01".
          u = units.get(id) ?? (id.endsWith("00") ? units.get(id.slice(0, -2) + "01") : undefined);
        } else {
          u = units.get(geo.properties?.name ?? "");
        }
        const cls = u ? unitClass(u, view) : null;
        const fill = !u || !cls ? "var(--map-unfilled)" : unitFlips(u, view) ? flipFill(FILL[cls]) : FILL[cls];
        const thin = house ? 0.4 : 1;
        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            aria-label={u ? `${u.title}: ${cls === "split" ? "split" : PARTY_WORD[cls as SeatParty]}` : undefined}
            onMouseEnter={() => u && onHover(u)}
            onMouseLeave={() => onHover(null)}
            onPointerDown={(e: React.PointerEvent) => { start.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; }}
            onPointerUp={(e: React.PointerEvent) => {
              const s = start.current;
              start.current = null;
              // A pan ends on a shape too: only a press that stayed put opens the page.
              if (!u || !s || Math.hypot(e.clientX - s.x, e.clientY - s.y) > (e.pointerType === "touch" ? 10 : 5)) return;
              onOpen(u, e.metaKey || e.ctrlKey);
            }}
            style={{
              default: { fill, stroke: "var(--app-bg)", strokeWidth: thin, outline: "none" },
              hover: { fill, stroke: "var(--app-text-primary)", strokeWidth: house ? 0.8 : 1.5, outline: "none", cursor: u ? "pointer" : "default" },
              pressed: { fill, stroke: "var(--app-text-primary)", strokeWidth: house ? 1.2 : 2, outline: "none" },
            }}
          />
        );
      })}
    </>
  );
});

const StateLines = memo(function StateLines() {
  const style = { fill: "none", stroke: "var(--app-bg)", strokeWidth: 1.5, outline: "none", pointerEvents: "none" as const };
  return (
    <Geographies geography={HOUSE_STATE_LINES_URL}>
      {({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => <Geography key={geo.rsmKey} geography={geo} style={{ default: style, hover: style, pressed: style }} />)}
    </Geographies>
  );
});

function SeatLines({ seat, view, year }: { seat: ChamberSeat; view: ChamberView; year: number }) {
  const p = seatPartyIn(seat, view);
  const changed = view !== "now" && p !== seat.before.party;
  const who = view === "results" && seat.result?.name ? seat.result.name : view === "projected" && seat.projected ? `${PARTY_WORD[seat.projected.party]} favored` : seat.before.name;
  const value = view === "results" && seat.result ? fmtSeatMargin(seat) : view === "projected" && seat.projected ? seat.projected.rating : seat.up ? `Up in ${year}` : `Next up ${seat.nextElection ?? "—"}`;
  const was = `${seat.before.name} (${seat.before.party})`;
  const note = !seat.up ? `Not up in ${year}`
    : view === "projected" ? (changed ? `Projected flip · held by ${was}` : `Held by ${was}`)
    : changed ? `Flip · was ${was}`
    : seat.result?.name === seat.before.name ? (seat.result.called ? "Incumbent re-elected" : "Incumbent leads")
    : `Hold · was ${was}`;
  return (
    <>
      <HoverRow label={`${who} (${p})`} color={PARTY_VAR[p]} labelColor="var(--app-text-primary)" value={value} valueColor={view === "now" ? undefined : PARTY_VAR[p]} />
      {view !== "now" && <HoverRow label={note} labelColor="var(--app-text-muted)" />}
    </>
  );
}

export default function ChamberControlMap({ office, seats, year, uncalled }: { office: RaceType; seats: ChamberSeat[]; year: number; uncalled: number }) {
  const router = useRouter();
  const house = office === "house";
  const [view, setView] = useState<ChamberView>("results");
  const [hovered, setHovered] = useState<Unit | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [moved, setMoved] = useState(false);
  const { onMouseMove, tooltipRef } = useMapTooltip(14, 8);

  const units = useMemo(() => {
    const out = new Map<string, Unit>();
    for (const s of seats) {
      const key = house ? s.geoid ?? s.key : s.stateName;
      const u = out.get(key);
      if (u) {
        u.seats.push(s);
        // A state's Senate shape opens the race on the ballot when it has one.
        if (s.up && !u.seats[0].up) u.href = s.href;
      } else out.set(key, { key, title: house ? s.label : s.stateName, href: s.href, seats: [s] });
    }
    return out;
  }, [seats, house]);

  const onOpen = useCallback((u: Unit, newTab: boolean) => {
    if (newTab) { window.open(u.href, "_blank", "noopener"); return; }
    startPendingNav(u.href);
    router.push(u.href);
  }, [router]);

  const counts: Record<SeatParty, number> = { D: 0, R: 0, I: 0 };
  let flips = 0;
  for (const s of seats) {
    const p = seatPartyIn(s, view);
    counts[p] += 1;
    if (view !== "now" && p !== s.before.party) flips += 1;
  }
  const splitStates = office === "senate" ? [...units.values()].filter((u) => unitClass(u, view) === "split").length : 0;
  const seatWord = office === "governor" ? "governorships" : "seats";

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-3 pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Control map</h2>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Toggle value={view} onChange={setView} options={[["results", `${year} results`], ["projected", `Projected ${year}`], ["now", "Before"]]} />
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-4xl" style={{ aspectRatio: "975 / 610" }} onMouseMove={onMouseMove}>
        {hovered && (
          <HoverBox boxRef={tooltipRef} width={248}>
            <HoverTitle>{hovered.title}</HoverTitle>
            <HoverRows>
              {hovered.seats.map((s) => <SeatLines key={s.key} seat={s} view={view} year={year} />)}
            </HoverRows>
            {view === "results" && hovered.seats.some((s) => s.up && s.result && !s.result.called) && <HoverFoot>Not yet called; shaded for the leader</HoverFoot>}
          </HoverBox>
        )}

        <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1100 }} width={975} height={610} style={{ width: "100%", height: "100%" }}>
          <FlipPatternDefs colors={Object.values(FILL)} />
          <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setMoved(true)}>
            <Geographies geography={house ? HOUSE_DISTRICTS_URL : STATES_URL}>
              {({ geographies }: { geographies: GeoFeature[] }) => (
                <UnitLayer geographies={geographies} house={house} units={units} view={view} onHover={setHovered} onOpen={onOpen} />
              )}
            </Geographies>
            {house && <StateLines />}
          </ZoomableGroup>
        </ComposableMap>

        {moved && (
          <button
            onClick={() => { setMapKey((k) => k + 1); setMoved(false); }}
            className="absolute left-2 top-2 z-10 rounded-md px-2.5 py-1 text-xs font-medium"
            style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
          >
            Reset
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
        {(["D", "R", "I"] as SeatParty[]).filter((p) => p !== "I" || counts.I > 0).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: FILL[p] }} />
            {PARTY_WORD[p]} <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{counts[p]}</span>
          </span>
        ))}
        {office === "senate" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: FILL.split }} />
            One senator of each party <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{splitStates}</span>
          </span>
        )}
        {view !== "now" && (
          <span className="inline-flex items-center gap-1.5">
            <FlipSwatch /> {view === "results" ? "Flipped" : "Projected flip"} <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{flips}</span>
          </span>
        )}
      </div>
      <p className="mt-2 max-w-3xl text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        The counts are {seatWord}. {year} results shade each seat for its winner{uncalled > 0 ? ", or its leader where the race is not called," : ""} and, where the seat was not on the ballot, for the member holding it; Projected is the final forecast&apos;s favorite; Before is the chamber going into the election. Stripes mark a seat that changes party.
        {office === "senate" ? " A state is purple when its two senators are of different parties, and striped when either seat changes party. Independents who caucus with the Democrats are counted with them." : ""}
      </p>
    </section>
  );
}

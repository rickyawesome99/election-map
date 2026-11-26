"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geography, ZoomableGroup } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import type { RaceType } from "@/data/forecastData";
import { seatPartyIn, type ChamberSeat, type ChamberView, type SeatParty } from "@/lib/chamberPageTypes";
import { isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { getRaceColor, marginToRating } from "@/lib/colorScale";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { startPendingNav } from "@/lib/navPending";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { FlipPatternDefs, FlipSwatch, flipFill } from "./FlipStripes";
import CountyTooltip, { type CountyTooltipProps } from "./CountyTooltip";
import { ForecastRatingPill } from "./Sidebar";

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
const PARTY_WORD: Record<SeatParty, string> = { D: "Democratic", R: "Republican", I: "Independent" };

// The House's results and projected views shade each district by its margin on the rating scale
// (user, 2026-11-25), as the forecast map does. One sample margin inside each band, Safe D → Safe R.
const BAND_MARGINS = [-20, -10, -3, -0.5, 0.5, 3, 10, 20];
const BANDS = BAND_MARGINS.map((m) => ({ color: getRaceColor(m), label: marginToRating(m) }));

/** A seat's margin in a view, signed by the party ahead (R positive) so a same-party final reads as
 *  that party's; an unopposed seat is safe. Null in the Before view or with no figure. */
function seatMargin(seat: ChamberSeat, view: ChamberView): number | null {
  if (view === "projected") return seat.projected ? Math.abs(seat.projected.margin) * (seat.projected.party === "R" ? 1 : -1) : null;
  if (view !== "results" || !seat.result?.party) return null;
  const size = seat.result.unopposed ? 100 : seat.result.margin == null ? null : Math.abs(seat.result.margin);
  return size == null ? null : size * (seat.result.party === "R" ? 1 : -1);
}

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
const UnitLayer = memo(function UnitLayer({ geographies, house, units, view, rated, onHover, onOpen }: {
  geographies: GeoFeature[];
  house: boolean;
  units: Map<string, Unit>;
  view: ChamberView;
  /** Shade by margin on the rating scale instead of by party. */
  rated: boolean;
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
        const margin = rated && u ? seatMargin(u.seats[0], view) : null;
        const color = !u || !cls ? null : margin != null ? getRaceColor(margin) : FILL[cls];
        const fill = !u || !color ? "var(--map-unfilled)" : unitFlips(u, view) ? flipFill(color) : color;
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

const seatTitle = (seat: ChamberSeat) => `${seat.label}${seat.special ? " (special)" : ""}`;

/** One seat as the site's map hover card (components/CountyTooltip.tsx, as on the forecast and
 *  county maps): the margin as the serif headline over a share bar and the two candidates, the
 *  rating pill beside the name. Before, and a seat nobody contested, is the member's name. */
function seatCard(seat: ChamberSeat, view: ChamberView, year: number): CountyTooltipProps {
  const title = seatTitle(seat), race = seat.race;
  const side = (s: NonNullable<ChamberSeat["race"]>["dem"], pct: number, votes: number | null) => ({ name: s.name, party: s.party, pct, votes, note: s.incumbent ? "Inc." : undefined });
  if (view === "now" || !race) {
    return { kind: "message", title, subtitle: `Before the ${year} election`, headline: { text: seat.before.name, party: seat.before.party }, message: seat.up ? `Seat up in ${year}` : `Not up in ${year} · next election ${seat.nextElection ?? "—"}` };
  }
  const was = `${seat.before.name} (${seat.before.party})`;
  if (view === "projected" && seat.projected) {
    const flip = seat.projected.party !== seat.before.party;
    // The forecast map's card: the projected margin split into two shares of 100.
    const demPct = Math.max(0, Math.min(100, 50 - seat.projected.margin / 2));
    return { kind: "result", title, subtitle: flip ? `Projected flip · held by ${was}` : "Projected margin", margin: seat.projected.margin, totalVotes: null, dem: side(race.dem, demPct, null), rep: side(race.rep, 100 - demPct, null) };
  }
  // The results card carries no line under the name and no rating pill (user, 2026-11-25).
  const r = seat.result;
  if (!r || r.unopposed || r.margin == null || race.total <= 0) {
    return { kind: "message", title, headline: r?.name && r.party ? { text: r.name, party: r.party } : undefined, message: "Unopposed" };
  }
  const pct = (v: number) => (v / race.total) * 100;
  return { kind: "result", title, margin: r.margin, totalVotes: race.total, dem: side(race.dem, pct(race.dem.votes), race.dem.votes), rep: side(race.rep, pct(race.rep.votes), race.rep.votes) };
}

export default function ChamberControlMap({ office, seats, year }: { office: RaceType; seats: ChamberSeat[]; year: number }) {
  const router = useRouter();
  const house = office === "house";
  // The three views read the same on every chamber (user, 2026-11-25): Before is every seat by
  // party; Projected and the results are only the seats on the ballot, shaded on the rating scale.
  const [view, setView] = useState<ChamberView>("results");
  const upOnly = view !== "now";
  const shown = useMemo(() => (upOnly ? seats.filter((s) => s.up) : seats), [seats, upOnly]);
  const [hovered, setHovered] = useState<Unit | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [moved, setMoved] = useState(false);
  const { onMouseMove, tooltipRef } = useMapTooltip(14, 8);

  const units = useMemo(() => {
    const out = new Map<string, Unit>();
    for (const s of shown) {
      const key = house ? s.geoid ?? s.key : s.stateName;
      const u = out.get(key);
      if (u) {
        u.seats.push(s);
        // A state's Senate shape opens the race on the ballot when it has one.
        if (s.up && !u.seats[0].up) u.href = s.href;
      } else out.set(key, { key, title: house ? s.label : s.stateName, href: s.href, seats: [s] });
    }
    return out;
  }, [shown, house]);

  const onOpen = useCallback((u: Unit, newTab: boolean) => {
    if (newTab) { window.open(u.href, "_blank", "noopener"); return; }
    startPendingNav(u.href);
    router.push(u.href);
  }, [router]);

  const counts: Record<SeatParty, number> = { D: 0, R: 0, I: 0 };
  let flips = 0;
  for (const s of shown) {
    const p = seatPartyIn(s, view);
    counts[p] += 1;
    if (view !== "now" && p !== s.before.party) flips += 1;
  }
  const splitStates = office === "senate" ? [...units.values()].filter((u) => unitClass(u, view) === "split").length : 0;
  const rated = upOnly;
  const notUp = upOnly ? new Set(seats.map((s) => s.stateAbbr)).size - units.size : 0;
  const bandCounts = new Map<string, number>();
  if (rated) for (const s of shown) { const m = seatMargin(s, view); if (m != null) { const k = marginToRating(m); bandCounts.set(k, (bandCounts.get(k) ?? 0) + 1); } }

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-3 pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Control map</h2>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Toggle value={view} onChange={setView} options={[["results", `${year} results`], ["projected", `Projected ${year}`], ["now", "Before"]]} />
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-4xl" style={{ aspectRatio: "975 / 610" }} onMouseMove={onMouseMove}>
        {hovered && (() => {
          const cards = hovered.seats.map((s) => ({ seat: s, card: seatCard(s, view, year), margin: seatMargin(s, view) }));
          const pill = (m: number | null) => (m != null && view === "projected" ? <ForecastRatingPill margin={m} /> : undefined);
          // One seat: the card itself. A state's two senators (Before): both in one box, the name once.
          if (cards.length === 1) return <CountyTooltip {...cards[0].card} boxRef={tooltipRef} className="absolute z-20 hidden md:block" aside={pill(cards[0].margin)} />;
          return (
            <div ref={tooltipRef} className="pointer-events-none absolute z-20 hidden rounded-lg md:block" style={{ width: 228, padding: "10px 12px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
              {cards.map(({ seat, card, margin }, i) => (
                <div key={seat.key} className={i > 0 ? "mt-2 border-t pt-2" : undefined} style={{ borderColor: "var(--app-border)" }}>
                  <CountyTooltip {...card} title={i === 0 ? hovered.title : ""} subtitle={i === 0 ? card.subtitle : undefined} variant="card" aside={pill(margin)} />
                </div>
              ))}
            </div>
          );
        })()}

        <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1100 }} width={975} height={610} style={{ width: "100%", height: "100%" }}>
          <FlipPatternDefs colors={[...Object.values(FILL), ...BANDS.map((b) => b.color)]} />
          <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setMoved(true)}>
            <Geographies geography={house ? HOUSE_DISTRICTS_URL : STATES_URL}>
              {({ geographies }: { geographies: GeoFeature[] }) => (
                <UnitLayer geographies={geographies} house={house} units={units} view={view} rated={rated} onHover={setHovered} onOpen={onOpen} />
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
        {rated && BANDS.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: b.color }} />
            {b.label} <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{bandCounts.get(b.label) ?? 0}</span>
          </span>
        ))}
        {!rated && (["D", "R", "I"] as SeatParty[]).filter((p) => p !== "I" || counts.I > 0).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: FILL[p] }} />
            {PARTY_WORD[p]} <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{counts[p]}</span>
          </span>
        ))}
        {office === "senate" && !rated && (
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
        {upOnly && notUp > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--map-unfilled)" }} />
            No {year} race <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{notUp}</span>
          </span>
        )}
      </div>
    </section>
  );
}

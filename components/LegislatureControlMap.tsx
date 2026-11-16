"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geography } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { startPendingNav } from "@/lib/navPending";
import { FlipPatternDefs, FlipSwatch, flipFill } from "./FlipStripes";
import { HoverBox, HoverFoot, HoverNote, HoverRow, HoverRows, HoverTitle } from "./StateLegHoverCard";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type GeoFeature = { rsmKey: string; properties?: Record<string, string | undefined> };

export type ControlClass = "superD" | "majD" | "split" | "majR" | "superR";

/** One chamber's composition, now and projected. Built on the server (app/legislatures/page.tsx). */
export type LegislatureMapChamber = {
  href: string;
  label: string;              // "House" | "Senate" | "Legislature"
  totalSeats: number;
  majority: number;
  supermajority: number;      // veto-override threshold
  now: { dem: number; rep: number; oth: number; year: number } | null;
  /** null when the chamber has no 2026 election — grayed out in the projected view. */
  projected: { dem: number; rep: number; pDem: number | null; pRep: number | null } | null;
  /** The chamber after the counted 2026 election (winners, leaders where uncalled, plus members not up); null when it held none. */
  result: { dem: number; rep: number; oth: number; uncalled: number } | null;
};

export type LegislatureMapState = {
  name: string;
  abbr: string;
  house: LegislatureMapChamber | null;
  senate: LegislatureMapChamber | null; // Nebraska: the same unicameral chamber as `house`
};

// Rating-scale colours (lib/colorScale): Safe ↔ supermajority, Likely ↔ bare majority.
const FILL: Record<ControlClass, string> = {
  superD: "#1b408c",
  majD: "#587ccc",
  split: "#4B0082", // SPLIT_FILL, as on the states map
  majR: "#ff5864",
  superR: "#be1c29",
};
const LEGEND: Array<[ControlClass, string]> = [
  ["superD", "D supermajority"],
  ["majD", "D majority"],
  ["split", "No majority / tied"],
  ["majR", "R majority"],
  ["superR", "R supermajority"],
];

export function controlClass(dem: number, rep: number, majority: number, supermajority: number): ControlClass {
  if (dem >= supermajority) return "superD";
  if (rep >= supermajority) return "superR";
  if (dem >= majority) return "majD";
  if (rep >= majority) return "majR";
  return "split";
}

/** Party holding a majority of all seats, or null when nobody does. */
function controlOf(dem: number, rep: number, majority: number): "D" | "R" | null {
  return dem >= majority ? "D" : rep >= majority ? "R" : null;
}

type View = "results" | "projected" | "now";
type Side = "house" | "senate";

function seatsFor(c: LegislatureMapChamber, view: View): { dem: number; rep: number } | null {
  if (view === "results") return c.result ? { dem: c.result.dem, rep: c.result.rep } : null;
  if (view === "projected") return c.projected ? { dem: c.projected.dem, rep: c.projected.rep } : null;
  return c.now ? { dem: c.now.dem, rep: c.now.rep } : null;
}

/** Changing hands in the projected or results view: that view's majority party differs from today's. Losing a majority
 * without the other party gaining one shows as purple, not as a flip. */
function flipOf(c: LegislatureMapChamber, view: View): { from: "D" | "R" | null; to: "D" | "R" } | null {
  const next = view === "results" ? c.result : view === "projected" ? c.projected : null;
  if (!next || !c.now) return null;
  const to = controlOf(next.dem, next.rep, c.majority);
  const from = controlOf(c.now.dem, c.now.rep, c.majority);
  return to && to !== from ? { from, to } : null;
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md p-0.5" style={{ background: "var(--app-tab-bg)" }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="px-2.5 py-1 text-xs font-semibold rounded"
          style={v === value ? { background: "var(--app-panel)", color: "var(--app-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : { color: "var(--app-text-muted)" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function LegislatureControlMap({ states, year }: { states: LegislatureMapState[]; year: number }) {
  const router = useRouter();
  const [view, setView] = useState<View>("results");
  const [side, setSide] = useState<Side>("house");
  const [hovered, setHovered] = useState<LegislatureMapState | null>(null);
  const { onMouseMove: onTooltipMove, tooltipRef } = useMapTooltip(14, 8);
  const byName = new Map(states.map((s) => [s.name, s]));

  const counts: Record<ControlClass, number> = { superD: 0, majD: 0, split: 0, majR: 0, superR: 0 };
  let noElection = 0;
  let flips = 0;
  const classOf = new Map<string, { cls: ControlClass; flip: boolean } | null>();
  for (const s of states) {
    const c = s[side];
    const seats = c && seatsFor(c, view);
    const flip = !!c && flipOf(c, view) != null;
    const v = c && seats ? { cls: controlClass(seats.dem, seats.rep, c.majority, c.supermajority), flip } : null;
    classOf.set(s.name, v);
    if (v) counts[v.cls] += 1;
    if (c && ((view === "projected" && !c.projected) || (view === "results" && !c.result))) noElection += 1;
    if (flip) flips += 1;
  }

  const hov = hovered?.[side] ?? null;
  const hovSeats = hov && seatsFor(hov, view);
  const hovFlip = hov ? flipOf(hov, view) : null;

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center gap-3 pb-3 mb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Control map</h2>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Toggle value={view} onChange={setView} options={[["results", `${year} results`], ["projected", `Projected ${year}`], ["now", "Current"]]} />
          <Toggle value={side} onChange={setSide} options={[["house", "House"], ["senate", "Senate"]]} />
        </div>
      </div>

      <div className="relative w-full max-w-4xl mx-auto" style={{ aspectRatio: "975 / 610" }} onMouseMove={onTooltipMove}>
        {hovered && hov && (() => {
          // The state-leg hover card: the seat split under the name, then status and change, thresholds, odds.
          const noElection = (view === "projected" && !hov.projected) || (view === "results" && !hov.result);
          const frac = view === "projected";
          const n = (v: number) => (frac ? v.toFixed(1) : String(v));
          const cls = hovSeats ? controlClass(hovSeats.dem, hovSeats.rep, hov.majority, hov.supermajority) : null;
          const clsColor = cls === "superD" || cls === "majD" ? "var(--party-dem)" : cls === "superR" || cls === "majR" ? "var(--party-rep)" : undefined;
          // Seats gained against today's chamber, named for the party with the bigger gain.
          const net = view !== "now" && hovSeats && hov.now ? (() => {
            const d = hovSeats.dem - hov.now.dem, r = hovSeats.rep - hov.now.rep;
            const party = d > r ? "D" : r > d ? "R" : null, gain = Math.max(d, r);
            return party && gain >= (frac ? 0.05 : 1) ? { text: `+${n(gain)} ${party}`, color: party === "D" ? "var(--party-dem)" : "var(--party-rep)" } : null;
          })() : null;
          const oth = view === "now" ? hov.now?.oth : view === "results" ? hov.result?.oth : 0;
          const party = (p: "D" | "R" | null) => (p === "D" ? "var(--party-dem)" : p === "R" ? "var(--party-rep)" : undefined);
          const foot = view === "results" && hov.result && hov.result.uncalled > 0 ? `${hov.result.uncalled} race${hov.result.uncalled === 1 ? "" : "s"} not yet called`
            : view === "now" && hov.now ? `As of ${hov.now.year}` : null;
          return (
            <HoverBox boxRef={tooltipRef} width={228}>
              <HoverTitle>{hovered.name} {hov.label}</HoverTitle>
              {/* The seat split under the name, the party with more seats first ("74R · 26D"). */}
              {!noElection && hovSeats && (
                <div className="mb-1.5 whitespace-nowrap tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: 19, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
                  {(hovSeats.rep > hovSeats.dem ? (["R", "D"] as const) : (["D", "R"] as const)).map((p, k) => (
                    <span key={p}>
                      {k > 0 && <span style={{ color: "var(--app-text-very-muted)" }}>&thinsp;·&thinsp;</span>}
                      <span style={{ color: p === "D" ? "var(--party-dem)" : "var(--party-rep)" }}>{n(p === "D" ? hovSeats.dem : hovSeats.rep)}{p}</span>
                    </span>
                  ))}
                </div>
              )}
              {noElection ? <HoverNote>No {year} election</HoverNote> : !hovSeats || !cls ? <HoverNote>No composition on record</HoverNote> : (
                <>
                  <HoverRows>
                    <HoverRow label={LEGEND.find(([c]) => c === cls)![1]} color={clsColor} labelColor={clsColor ?? "var(--app-text-primary)"} value={net?.text} valueColor={net?.color} />
                    {oth ? <HoverRow label="Independent / other" value={oth} /> : null}
                    <HoverRow label="Majority · supermajority" value={`${hov.majority} · ${hov.supermajority}`} />
                    {view === "projected" && hov.projected && (hov.projected.pDem != null || hov.projected.pRep != null) && (
                      <HoverRow label="Control odds" value={<><span style={{ color: "var(--party-dem)" }}>D {Math.round((hov.projected.pDem ?? 0) * 100)}%</span> <span style={{ color: "var(--party-rep)" }}>R {Math.round((hov.projected.pRep ?? 0) * 100)}%</span></>} />
                    )}
                    {hovFlip && view === "projected" && <HoverRow label="Projected flip" value={<><span style={{ color: party(hovFlip.from) }}>{hovFlip.from ?? "none"}</span> → {hovFlip.to}</>} valueColor={party(hovFlip.to)} />}
                  </HoverRows>
                  {foot && <HoverFoot>{foot}</HoverFoot>}
                </>
              )}
            </HoverBox>
          );
        })()}

        <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1100 }} width={975} height={610} style={{ width: "100%", height: "100%" }}>
          <FlipPatternDefs colors={Object.values(FILL)} />
          <Geographies geography={STATES_URL}>
            {({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => {
              const s = byName.get(geo.properties?.name ?? "");
              const v = s ? classOf.get(s.name) : null;
              const fill = !v ? "var(--map-unfilled)" : v.flip ? flipFill(FILL[v.cls]) : FILL[v.cls];
              const href = s?.[side]?.href;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  aria-label={s ? `${s.name}${v ? ` ${LEGEND.find(([c]) => c === v.cls)![1]}` : ""}` : undefined}
                  onMouseEnter={() => s && setHovered(s)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => { if (href) { startPendingNav(href); router.push(href); } }}
                  style={{
                    default: { fill, stroke: "var(--app-bg)", strokeWidth: 1, outline: "none" },
                    hover: { fill, stroke: "var(--app-text-primary)", strokeWidth: 1.5, outline: "none", cursor: href ? "pointer" : "default" },
                    pressed: { fill, stroke: "var(--app-text-primary)", strokeWidth: 2, outline: "none" },
                  }}
                />
              );
            })}
          </Geographies>
        </ComposableMap>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
        {LEGEND.map(([cls, label]) => (
          <span key={cls} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: FILL[cls] }} />
            {label} <span className="tabular-nums font-semibold" style={{ color: "var(--app-text-primary)" }}>{counts[cls]}</span>
          </span>
        ))}
        {view !== "now" && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <FlipSwatch /> {view === "results" ? "Flipped" : "Projected flip"} <span className="tabular-nums font-semibold" style={{ color: "var(--app-text-primary)" }}>{flips}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "var(--map-unfilled)" }} />
              No {year} election <span className="tabular-nums font-semibold" style={{ color: "var(--app-text-primary)" }}>{noElection}</span>
            </span>
          </>
        )}
      </div>
      <p className="mt-2 max-w-3xl text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        Supermajority is the chamber&apos;s veto-override threshold. Projected composition is the mean simulated seat count; the {year} results count each seat for its winner, or its leader where the race is not called, plus the members whose seats were not up. Stripes mark a chamber whose majority passes to the other party; a chamber is shaded by who holds a majority of all seats, so coalition arrangements (Alaska) and independents are not credited to either party. Nebraska&apos;s unicameral Legislature appears under both chambers.
      </p>
    </section>
  );
}

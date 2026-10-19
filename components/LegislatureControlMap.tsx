"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { FlipPatternDefs, FlipSwatch, flipFill } from "./FlipStripes";

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

type View = "now" | "projected";
type Side = "house" | "senate";

function seatsFor(c: LegislatureMapChamber, view: View): { dem: number; rep: number } | null {
  if (view === "projected") return c.projected ? { dem: c.projected.dem, rep: c.projected.rep } : null;
  return c.now ? { dem: c.now.dem, rep: c.now.rep } : null;
}

/** Projected to change hands: the projected majority party differs from today's. Losing a majority
 * without the other party gaining one shows as purple, not as a flip. */
function flipOf(c: LegislatureMapChamber): { from: "D" | "R" | null; to: "D" | "R" } | null {
  if (!c.projected || !c.now) return null;
  const to = controlOf(c.projected.dem, c.projected.rep, c.majority);
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
  const [view, setView] = useState<View>("projected");
  const [side, setSide] = useState<Side>("house");
  const [hovered, setHovered] = useState<LegislatureMapState | null>(null);
  const tip = useMapTooltip(14, 8);
  const byName = new Map(states.map((s) => [s.name, s]));

  const counts: Record<ControlClass, number> = { superD: 0, majD: 0, split: 0, majR: 0, superR: 0 };
  let noElection = 0;
  let flips = 0;
  const classOf = new Map<string, { cls: ControlClass; flip: boolean } | null>();
  for (const s of states) {
    const c = s[side];
    const seats = c && seatsFor(c, view);
    const flip = view === "projected" && !!c && flipOf(c) != null;
    const v = c && seats ? { cls: controlClass(seats.dem, seats.rep, c.majority, c.supermajority), flip } : null;
    classOf.set(s.name, v);
    if (v) counts[v.cls] += 1;
    if (view === "projected" && c && !c.projected) noElection += 1;
    if (flip) flips += 1;
  }

  const hov = hovered?.[side] ?? null;
  const hovSeats = hov && seatsFor(hov, view);
  const hovFlip = view === "projected" && hov ? flipOf(hov) : null;

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center gap-3 pb-3 mb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Control map</h2>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Toggle value={view} onChange={setView} options={[["projected", `Projected ${year}`], ["now", "Current"]]} />
          <Toggle value={side} onChange={setSide} options={[["house", "House"], ["senate", "Senate"]]} />
        </div>
      </div>

      <div className="relative w-full max-w-4xl mx-auto" style={{ aspectRatio: "975 / 610" }} onMouseMove={tip.onMouseMove}>
        {hovered && hov && (
          <div ref={tip.tooltipRef} className="hidden md:block absolute z-20 pointer-events-none rounded-lg text-xs"
            style={{ width: 210, padding: "8px 10px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}>
            <div className="font-bold">{hovered.name} {hov.label}</div>
            {view === "projected" && !hov.projected ? <div className="mt-1" style={{ color: "var(--app-text-muted)" }}>No {year} election</div> : hovSeats ? (
              <div className="mt-1 tabular-nums">
                <span style={{ color: "var(--party-dem)" }}>{view === "projected" && hov.projected ? hov.projected.dem.toFixed(1) : hovSeats.dem} D</span>
                {" – "}
                <span style={{ color: "var(--party-rep)" }}>{view === "projected" && hov.projected ? hov.projected.rep.toFixed(1) : hovSeats.rep} R</span>
                {view === "now" && hov.now?.oth ? <span style={{ color: "var(--party-ind)" }}> – {hov.now.oth} oth</span> : null}
                <span style={{ color: "var(--app-text-muted)" }}> of {hov.totalSeats}</span>
              </div>
            ) : <div className="mt-1" style={{ color: "var(--app-text-muted)" }}>No composition on record</div>}
            <div className="mt-0.5 text-[10px]" style={{ color: "var(--app-text-muted)" }}>Majority {hov.majority} · supermajority {hov.supermajority}</div>
            {view === "projected" && hov.projected && (hov.projected.pDem != null || hov.projected.pRep != null) && (
              <div className="mt-0.5 text-[10px]" style={{ color: "var(--app-text-muted)" }}>
                P(control): <span style={{ color: "var(--party-dem)" }}>D {Math.round((hov.projected.pDem ?? 0) * 100)}%</span> · <span style={{ color: "var(--party-rep)" }}>R {Math.round((hov.projected.pRep ?? 0) * 100)}%</span>
              </div>
            )}
            {hovFlip && <div className="mt-0.5 text-[10px] font-semibold">Projected flip: {hovFlip.from ?? "no majority"} → {hovFlip.to}</div>}
            {view === "now" && hov.now && <div className="mt-0.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>As of {hov.now.year}</div>}
          </div>
        )}

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
                  onClick={() => { if (href) window.location.assign(href); }}
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
        {view === "projected" && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <FlipSwatch /> Projected flip <span className="tabular-nums font-semibold" style={{ color: "var(--app-text-primary)" }}>{flips}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "var(--map-unfilled)" }} />
              No {year} election <span className="tabular-nums font-semibold" style={{ color: "var(--app-text-primary)" }}>{noElection}</span>
            </span>
          </>
        )}
      </div>
      <p className="mt-2 max-w-3xl text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        Supermajority is the chamber&apos;s veto-override threshold. Projected composition is the mean simulated seat count, and stripes mark a chamber whose majority is projected to pass to the other party; a chamber is shaded by who holds a majority of all seats, so coalition arrangements (Alaska) and independents are not credited to either party. Nebraska&apos;s unicameral Legislature appears under both chambers.
      </p>
    </section>
  );
}

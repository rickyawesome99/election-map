"use client";

import { useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { computeTrumpApprovalAverage } from "@/lib/trumpApprovalAverage";
import { getRaceColor, marginToRating } from "@/lib/colorScale";
import { calculateStateTpl } from "@/lib/tplCompute";
import { useDarkMode } from "@/lib/useDarkMode";
import { electionYear } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import {
  DARK_THEME,
  LIGHT_THEME,
  projectedGovernorData,
  projectedHouseData,
  projectedSenateData,
  SEAT_HOLDOVERS,
  type Theme,
} from "./ForecastMap";
import PollingAverageCard from "./PollingAverageCard";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
type MapMode = "house" | "senate" | "governor";
type ForecastRace = (typeof projectedHouseData)[number];
type GeoFeature = { rsmKey: string; id?: string | number; properties?: Record<string, string | undefined> };

function formatMargin(margin: number) {
  if (Math.abs(margin) < 0.05) return "EVEN";
  return `${margin <= 0 ? "D" : "R"}+${Math.abs(margin).toFixed(1)}`;
}

function seatTotals(data: { margin: number }[], holdover: { dem: number; rep: number }) {
  return {
    dem: holdover.dem + data.filter((race) => race.margin <= 0).length,
    rep: holdover.rep + data.filter((race) => race.margin > 0).length,
  };
}

function SectionHead({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return (
    <div className="border-b-2 pb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ borderColor: theme.textPrimary, color: theme.textPrimary }}>
      {children}
    </div>
  );
}

export default function OverviewEditorial() {
  const darkMode = useDarkMode();
  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const gb = computeGenericBallotAverage(new Date());
  const approval = computeTrumpApprovalAverage(new Date());
  const house = seatTotals(projectedHouseData, SEAT_HOLDOVERS.house);
  const senate = seatTotals(projectedSenateData, SEAT_HOLDOVERS.senate);
  const governor = seatTotals(projectedGovernorData, SEAT_HOLDOVERS.governor);

  const stateMargins = useMemo(() => {
    return new Map(statesData.map((state) => [state.name, calculateStateTpl(state.abbr, state.name)]));
  }, []);

  const keyRaces = useMemo(() => {
    const withType: { race: ForecastRace; type: MapMode }[] = [
      ...projectedSenateData.map((race) => ({ race, type: "senate" as const })),
      ...projectedGovernorData.map((race) => ({ race, type: "governor" as const })),
      ...projectedHouseData.map((race) => ({ race, type: "house" as const })),
    ];
    return withType.sort((a, b) => Math.abs(a.race.margin) - Math.abs(b.race.margin)).slice(0, 5);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: t.bg, color: t.textPrimary }}>
      <section style={{ background: "linear-gradient(105deg, color-mix(in srgb, var(--party-rep) 7%, var(--app-bg)) 0%, var(--app-bg) 48%, color-mix(in srgb, var(--party-dem) 6%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 sm:pb-8 sm:pt-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: t.tabBg, color: t.textMuted }}>NATIONAL</span>
              <h1 className="mt-4" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.7rem, 6.4vw, 5.25rem)", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 0.92 }}>{electionYear} Outlook</h1>
              <p className="mt-4 text-sm sm:text-base" style={{ color: t.textMuted }}>Projected Balance of Power and National Polling · General November 3, 2026</p>
            </div>
            <div className="shrink-0 md:text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>Generic Ballot</div>
              <div className="mt-2 tabular-nums" style={{ color: gb.diff <= 0 ? t.demText : t.repText, fontFamily: "var(--font-serif)", fontSize: "clamp(3rem, 6vw, 4.75rem)", fontWeight: 700, lineHeight: 0.9 }}>{formatMargin(gb.diff)}</div>
              <div className="mt-2 text-sm font-semibold"><span style={{ color: t.demText }}>D {gb.dem.toFixed(1)}%</span><span className="px-2" style={{ color: t.textVeryMuted }}>·</span><span style={{ color: t.repText }}>R {gb.rep.toFixed(1)}%</span></div>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-y-5 border-t pt-5 sm:grid-cols-4" style={{ borderColor: t.border }}>
            {[
              [<span key="house"><span style={{ color: t.demText }}>{house.dem}D</span>–<span style={{ color: t.repText }}>{house.rep}R</span></span>, "House", "/house"],
              [<span key="senate"><span style={{ color: t.demText }}>{senate.dem}D</span>–<span style={{ color: t.repText }}>{senate.rep}R</span></span>, "Senate", "/senate"],
              [<span key="governors"><span style={{ color: t.demText }}>{governor.dem}D</span>–<span style={{ color: t.repText }}>{governor.rep}R</span></span>, "Governors", "/governor"],
              [<span key="approval" style={{ color: approval.diff > 0 ? t.repText : t.demText }}>Disapprove +{Math.abs(approval.diff).toFixed(1)}</span>, "President Approval", null],
            ].map(([value, label, href], index) => {
              const content = <><div className="text-xl font-extrabold tabular-nums sm:text-2xl">{value}</div><div className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>{label}{href && <span aria-hidden="true">↗</span>}</div></>;
              const className = `${index ? "sm:border-l sm:pl-7" : ""} ${href ? "transition-opacity hover:opacity-65" : ""}`;
              const style = index ? { borderColor: t.border } : undefined;
              return href ? <a key={String(label)} href={String(href)} className={className} style={style}>{content}</a> : <div key={String(label)} className={className} style={style}>{content}</div>;
            })}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-8 lg:grid-cols-[1.45fr_0.75fr] lg:gap-12">
          <section>
            <div className="flex items-baseline justify-between gap-4 border-b-2 pb-2" style={{ borderColor: t.textPrimary }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em]">State TPL</div>
              <div className="text-[11px]" style={{ color: t.textMuted }}>Click to view a state</div>
            </div>
            <div className="h-[310px] sm:h-[420px]">
              <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1120 }} style={{ width: "100%", height: "100%" }}>
                <Geographies geography={STATES_URL}>{({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => {
                  const state = geo.properties?.name as string;
                  const margin = stateMargins.get(state);
                  const stateSlug = statesData.find((entry) => entry.name === state)?.id;
                  return <Geography key={geo.rsmKey} geography={geo} onClick={() => { if (stateSlug) window.location.assign(`/states/${stateSlug}`); }} aria-label={`${state}${margin == null ? "" : ` ${formatMargin(margin)}`}`} style={{ default: { fill: margin == null ? t.mapUnfilled : getRaceColor(margin), stroke: t.mapStroke, strokeWidth: 1.2, outline: "none" }, hover: { fill: margin == null ? t.hoverUnfilled : getRaceColor(margin), stroke: t.hoverStroke, strokeWidth: 1.7, outline: "none", cursor: "pointer" }, pressed: { fill: margin == null ? t.mapUnfilled : getRaceColor(margin), stroke: t.hoverStroke, strokeWidth: 2, outline: "none" } }} />;
                })}</Geographies>
              </ComposableMap>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-3" style={{ borderColor: t.border }}>{["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"].map((label, i) => <span key={label} className="flex items-center gap-1.5 text-[9px]" style={{ color: t.textMuted }}><i className="h-2.5 w-4" style={{ background: ["#1a4480", "#4275b5", "#82b4f0", "#aecef5", "#f5aeae", "#f08282", "#c04040", "#8b1a1a"][i] }} />{label}</span>)}</div>
          </section>

          <section>
            <SectionHead theme={t}>Key Races</SectionHead>
            <div>{keyRaces.map(({ race, type }) => {
              const href = `/${type}/${(type === "house" ? race.name : race.id).toLowerCase().replace(/-2$/, "2")}`;
              return <a key={`${type}-${race.id}`} href={href} className="grid grid-cols-[1fr_auto] gap-3 py-4 transition-opacity hover:opacity-70" style={{ borderBottom: `1px solid ${t.border}` }}><div><div className="font-semibold">{type === "house" ? race.name : race.state}</div><div className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: t.textMuted }}>{type === "house" ? "U.S. House" : type === "senate" ? "U.S. Senate" : "Governor"}</div></div><div className="text-right"><div className="text-lg font-extrabold tabular-nums" style={{ color: race.margin <= 0 ? t.demText : t.repText }}>{formatMargin(race.margin)}</div><div className="text-[10px]" style={{ color: t.textMuted }}>{marginToRating(race.margin)}</div></div></a>;
            })}</div>
          </section>
        </div>

        <section className="mt-10">
          <SectionHead theme={t}>National Polling</SectionHead>
          <div className="pt-3"><PollingAverageCard theme={t} variant="editorial" tableHeight={288} /></div>
        </section>
      </main>
    </div>
  );
}

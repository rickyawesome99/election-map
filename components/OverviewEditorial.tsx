"use client";

import Link from "next/link";
import { ComposableMap, Geography } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import { formatProjectedMargin, getRaceColor, marginToRating, fmtLean } from "@/lib/colorScale";
import { useDarkMode } from "@/lib/useDarkMode";
import { statesData } from "@/data/statesData";
import type { RaceType } from "@/data/forecastData";
import type { ChamberSimulation } from "@/lib/forecast";
import { DARK_THEME, LIGHT_THEME, type Theme } from "./ForecastMap";
import PollingAverageCard from "./PollingAverageCard";
import type { PollingCardData } from "@/lib/pollingCardData";
import SeatHistogram from "./SeatHistogram";
import ForecastTrend, { type ForecastTrendDay } from "./ForecastTrend";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
type GeoFeature = { rsmKey: string; id?: string | number; properties?: Record<string, string | undefined> };

/** Computed by app/overview/page.tsx on the server. */
export type OverviewData = {
  electionYear: number;
  genericBallot: { diff: number; dem: number; rep: number };
  approval: { diff: number; approve: number; disapprove: number };
  seats: Record<RaceType, { dem: number; rep: number }>;
  totalSeats: Record<RaceType, number>;
  sims: Record<RaceType, ChamberSimulation>;
  /** State name → state TPL (R-positive). */
  stateMargins: Record<string, number>;
  /** Five well-known outside forecasts + Polymarket's summed favourites (app/overview/page.tsx). */
  otherForecasts: {
    rows: { id: string; name: string; short: string; kind: "model" | "ratings" | "market"; href: string; cells: Record<RaceType, ForecastCell | null> }[];
    forecastsRead: string;
    marketRead: string;
  };
  /** Date of the latest commit (ISO), shown as "Updated". */
  updated: string;
  /** When the page was computed (epoch ms) — the national polling averages are drawn as of it. */
  asOf: number;
  /** The national polling card's series as of `asOf` (lib/pollingCardData). */
  pollingCard: PollingCardData;
  /** The forecast rerun once per day (lib/forecastHistory.ts); null if the series was not generated. */
  trend: ForecastTrendDay[] | null;
};

export type ForecastCell = { dem: number; rep: number; tossups: number | null; pDem: number | null };

// Seats that are a majority outright: the Senate's tie goes to the Republican vice president.
export const MAJORITY: Record<RaceType, { dem: number; rep: number }> = { house: { dem: 218, rep: 218 }, senate: { dem: 51, rep: 50 }, governor: { dem: 26, rep: 26 } };
const CHAMBER_COLUMNS: [RaceType, string][] = [["house", "House"], ["senate", "Senate"], ["governor", "Governors"]];
const KIND_LABEL = { model: "Model", ratings: "Ratings", market: "Market" } as const;

// One cell: the D–R seats as a stacked bar (the comparison page's SeatBar look) with a tick at the
// majority line, and the control odds (or toss-ups) under it in the favourite's colour.
function ForecastCellView({ cell, type, theme: t }: { cell: ForecastCell | null; type: RaceType; theme: Theme }) {
  if (!cell) return <div className="text-center text-sm" style={{ color: t.textVeryMuted }}>—</div>;
  const total = cell.dem + cell.rep + (cell.tossups ?? 0);
  const w = (n: number) => `${(n / total) * 100}%`;
  const dem = cell.pDem != null && cell.pDem >= 0.5;
  return (
    <div>
      <div className="relative h-6 w-full overflow-hidden rounded-sm" aria-label={`${cell.dem} D – ${cell.rep} R${cell.tossups ? `, ${cell.tossups} toss-up` : ""}`}>
        <div className="absolute inset-y-0 left-0" style={{ width: w(cell.dem), background: "var(--party-dem)" }} />
        {!!cell.tossups && <div className="absolute inset-y-0" style={{ left: w(cell.dem), width: w(cell.tossups), background: "var(--rating-tossup)" }} />}
        <div className="absolute inset-y-0 right-0" style={{ width: w(cell.rep), background: "var(--party-rep)" }} />
        <div className="absolute -inset-y-px w-0.5" style={{ left: w(MAJORITY[type].dem - 0.5), background: t.bg }} />
        <span className="absolute inset-y-0 left-1.5 flex items-center text-[11px] font-bold tabular-nums text-white sm:text-xs">{cell.dem}</span>
        <span className="absolute inset-y-0 right-1.5 flex items-center text-[11px] font-bold tabular-nums text-white sm:text-xs">{cell.rep}</span>
      </div>
      <div className="mt-1.5 whitespace-nowrap text-[10px] leading-tight tabular-nums sm:text-[11px]" style={{ color: t.textMuted }}>
        {cell.pDem != null
          ? <><span className="font-bold" style={{ color: dem ? t.demText : t.repText }}>{Math.round((dem ? cell.pDem : 1 - cell.pDem) * 100)}% {dem ? "D" : "R"}</span> control</>
          : cell.tossups ? `${cell.tossups} toss-up${cell.tossups === 1 ? "" : "s"}` : "\u00a0"}
      </div>
    </div>
  );
}

function OtherForecasts({ data, theme: t }: { data: OverviewData["otherForecasts"]; theme: Theme }) {
  const grid = "grid grid-cols-[5rem_repeat(3,minmax(0,1fr))] items-center gap-x-3 sm:grid-cols-[8rem_repeat(3,minmax(0,1fr))] sm:gap-x-8";
  const link = "text-xs font-semibold underline decoration-dotted decoration-1 underline-offset-[3px] hover:decoration-solid sm:text-sm";
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 pb-2" style={{ borderColor: t.textPrimary }}>
        <div className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.12em]">Other Forecasts</div>
        <div className="text-[11px]" style={{ color: t.textMuted }}>Projected seats, D–R · <Link prefetch={false} href="/analysis/forecasts" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">compare all 16</Link></div>
      </div>
      {/* One column per chamber, one row per source. */}
      <div className={`${grid} pb-2 pt-4`}>
        <span />
        {CHAMBER_COLUMNS.map(([type, label]) => (
          <div key={type} className="flex flex-wrap items-baseline justify-between gap-x-2 leading-tight">
            <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
            <span className="hidden text-[10px] tabular-nums sm:inline" style={{ color: t.textVeryMuted }}>{MAJORITY[type].dem} to win</span>
          </div>
        ))}
      </div>
      {data.rows.map((row) => (
        <div key={row.id} className={`${grid} border-t py-3.5`} style={{ borderColor: t.border }}>
          <div className="leading-tight">
            {row.kind === "market"
              ? <Link prefetch={false} href={row.href} className={link} style={{ textDecorationColor: t.textVeryMuted }}>{row.short}</Link>
              : <a href={row.href} target="_blank" rel="noopener noreferrer" className={link} style={{ textDecorationColor: t.textVeryMuted }}>{row.short}</a>}
            <div className="mt-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: t.textVeryMuted }}>{KIND_LABEL[row.kind]}</div>
          </div>
          {CHAMBER_COLUMNS.map(([type]) => <ForecastCellView key={type} cell={row.cells[type]} type={type} theme={t} />)}
        </div>
      ))}
      <p className="border-t pt-2.5 text-[10px] leading-relaxed" style={{ borderColor: t.border, color: t.textVeryMuted }}>
        Seats: Polymarket = the betting favourite in every race, summed; DDHQ and VoteHub = each model&rsquo;s own published totals. Polymarket&rsquo;s control odds are its House and Senate control markets; it has none for governors. The tick marks the majority line. Models read {shortDate(data.forecastsRead)}, markets {shortDate(data.marketRead)}.
      </p>
    </section>
  );
}

// The header tiles' rating: the odds the favoured party wins the chamber (for governors, a
// majority of the 50), banded like a race rating.
export function chamberCall(sim: ChamberSimulation, total: number) {
  const pDem = sim.pDemControl ?? Object.entries(sim.histogram).reduce((sum, [seats, share]) => sum + (Number(seats) > total / 2 ? share : 0), 0);
  const party = pDem >= 0.5 ? "D" : "R";
  const odds = party === "D" ? pDem : 1 - pDem;
  return { party, odds, rating: `${odds >= 0.95 ? "Safe" : odds >= 0.8 ? "Likely" : odds >= 0.65 ? "Lean" : "Tilt"} ${party}` };
}

// Header tile colour: one deep hue per party (approval: disapprove red / approve green), stepped
// lighter toward white for the less certain calls so a Tilt tile never reads as grey.
const TILE_HUE = { D: "#1b408c", R: "#be1c29", approve: "#1e7b46", disapprove: "#b42318" } as const;
const TILE_STRENGTH: Record<string, number> = { Safe: 100, Likely: 100, Lean: 78, Tilt: 58 };
const tileColor = (hue: keyof typeof TILE_HUE, rating = "Likely") => `color-mix(in srgb, ${TILE_HUE[hue]} ${TILE_STRENGTH[rating.split(" ")[0]] ?? 100}%, #ffffff)`;

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function SectionHead({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return (
    <div className="border-b-2 pb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ borderColor: theme.textPrimary, color: theme.textPrimary }}>
      {children}
    </div>
  );
}

export default function OverviewEditorial({ data }: { data: OverviewData }) {
  const darkMode = useDarkMode();
  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const { electionYear, genericBallot: gb, approval, otherForecasts, seats, totalSeats, sims, stateMargins, updated, trend, pollingCard } = data;
  const house = seats.house;
  const senate = seats.senate;
  const governor = seats.governor;
  const TOTAL_SEATS_BY_TYPE = totalSeats;

  return (
    <div className="min-h-screen" style={{ background: t.bg, color: t.textPrimary }}>
      <section style={{ background: PAGE_HERO_BG }}>
        <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} pb-6 sm:pb-8`}>
          <h1 style={PAGE_TITLE_STYLE}>{electionYear} Outlook</h1>
          <p className="mt-4 text-sm sm:text-base" style={{ color: t.textMuted }}>Projected Balance of Power and National Polling · General November 3, 2026</p>
          <p className="mt-1.5 text-xs" style={{ color: t.textVeryMuted }}>Updated {shortDate(updated)}</p>
          {/* One row of solid tiles: the two national averages, then the three chambers. Two over
              three on phones. Every tile is a link. */}
          <div className="mt-7 grid grid-cols-6 gap-2 sm:gap-3 lg:grid-cols-5">
            {[
              { key: "gb", label: "Generic Ballot", href: "#national-polling", value: fmtLean(gb.diff), sub: `D ${gb.dem.toFixed(1)} · R ${gb.rep.toFixed(1)}`, bg: tileColor(gb.diff <= 0 ? "D" : "R", marginToRating(gb.diff)) },
              { key: "approval", label: "Pres. Approval", href: "#national-polling", value: `${approval.diff > 0 ? "−" : "+"}${Math.abs(approval.diff).toFixed(1)}`, sub: `${approval.approve.toFixed(1)} approve · ${approval.disapprove.toFixed(1)} disapprove`, bg: tileColor(approval.diff > 0 ? "disapprove" : "approve") },
              ...([["house", "House", "/house", house], ["senate", "Senate", "/senate", senate], ["governor", "Governors", "/governor", governor]] as const).map(([type, label, href, s]) => {
                const call = chamberCall(sims[type], TOTAL_SEATS_BY_TYPE[type]);
                return { key: type, label, href, value: `${s.dem}–${s.rep}`, sub: `${call.rating} · ${Math.round(call.odds * 100)}% ${call.party} ${type === "governor" ? "majority" : "control"}`, short: call.rating, bg: tileColor(call.party as "D" | "R", call.rating) };
              }),
            ].map((tile, i) => (
              <Link prefetch={false} key={tile.key} href={tile.href} className={`group block rounded-md px-3 py-3 transition-[filter] hover:brightness-110 sm:px-4 sm:py-3.5 ${i < 2 ? "col-span-3" : "col-span-2"} lg:col-span-1`} style={{ background: tile.bg, color: "#ffffff" }}>
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] underline decoration-dotted decoration-1 underline-offset-[3px] group-hover:decoration-solid" style={{ opacity: 0.85 }}>{tile.label}</span>
                <div className="mt-2 whitespace-nowrap text-xl font-extrabold leading-none tabular-nums sm:text-2xl">{tile.value}</div>
                <div className="mt-2 text-[11px] font-semibold leading-snug" style={{ opacity: 0.9 }}>
                  {"short" in tile ? <><span className="sm:hidden">{tile.short}</span><span className="hidden sm:inline">{tile.sub}</span></> : tile.sub}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <main className={`${PAGE_CONTAINER} pb-6 pt-2 sm:pb-8 sm:pt-0`}>
        {/* Results link, map, then Other Forecasts. */}
        <div className="grid gap-8">
          {/* Election night: the live results page, boxed at the top (user, 2026-10-25). */}
          <Link prefetch={false} href="/results" className="group flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--app-text-primary)_5%,transparent)]" style={{ border: `2px solid ${t.textPrimary}` }}>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em]">Election Night Results</div>
              <div className="mt-1 text-sm" style={{ color: t.textMuted }}>Live counts for every Senate, governor and House race against the forecast, with a projected final margin as counties report.</div>
            </div>
            <span className="text-sm font-semibold underline decoration-dotted underline-offset-4 group-hover:decoration-solid">Open the results page →</span>
          </Link>
          <section>
            <div className="flex items-baseline justify-between gap-4 border-b-2 pb-2" style={{ borderColor: t.textPrimary }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em]">State TPL</div>
              <div className="text-[11px]" style={{ color: t.textMuted }}>Click to view a state</div>
            </div>
            <div className="h-[310px] sm:h-[420px]">
              <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1120 }} style={{ width: "100%", height: "100%" }}>
                <Geographies geography={STATES_URL}>{({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => {
                  const state = geo.properties?.name as string;
                  const margin = stateMargins[state];
                  const stateSlug = statesData.find((entry) => entry.name === state)?.id;
                  return <Geography key={geo.rsmKey} geography={geo} onClick={() => { if (stateSlug) window.location.assign(`/states/${stateSlug}`); }} aria-label={`${state}${margin == null ? "" : ` ${formatProjectedMargin(margin)}`}`} style={{ default: { fill: margin == null ? t.mapUnfilled : getRaceColor(margin), stroke: t.mapStroke, strokeWidth: 1.2, outline: "none" }, hover: { fill: margin == null ? t.hoverUnfilled : getRaceColor(margin), stroke: t.hoverStroke, strokeWidth: 1.7, outline: "none", cursor: "pointer" }, pressed: { fill: margin == null ? t.mapUnfilled : getRaceColor(margin), stroke: t.hoverStroke, strokeWidth: 2, outline: "none" } }} />;
                })}</Geographies>
              </ComposableMap>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-3" style={{ borderColor: t.border }}>{["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"].map((label, i) => <span key={label} className="flex items-center gap-1.5 text-[9px]" style={{ color: t.textMuted }}><i className="h-2.5 w-4" style={{ background: ["#1a4480", "#4275b5", "#82b4f0", "#aecef5", "#f5aeae", "#f08282", "#c04040", "#8b1a1a"][i] }} />{label}</span>)}</div>
          </section>

          <OtherForecasts data={otherForecasts} theme={t} />
        </div>

        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 pb-2" style={{ borderColor: t.textPrimary }}>
            <div className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.12em]">Seat Distribution</div>
            <div className="text-[11px]" style={{ color: t.textMuted }}>Democratic seats across {sims.house.sims.toLocaleString()} simulated elections</div>
          </div>
          <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-3">
            <SeatHistogram label="House" sim={sims.house} total={TOTAL_SEATS_BY_TYPE.house} />
            <SeatHistogram label="Senate" sim={sims.senate} total={TOTAL_SEATS_BY_TYPE.senate} />
            <SeatHistogram label="Governors" sim={sims.governor} total={TOTAL_SEATS_BY_TYPE.governor} />
          </div>
        </section>

        {trend && trend.length > 1 && (
          <section className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 pb-2" style={{ borderColor: t.textPrimary }}>
              <div className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.12em]">Forecast Over Time</div>
              <div className="text-[11px]" style={{ color: t.textMuted }}>Today&rsquo;s model rerun on the polls available each day · <Link href="/analysis/internal-methodology#over-time" className="underline decoration-dotted underline-offset-2" prefetch={false}>how</Link></div>
            </div>
            <ForecastTrend days={trend} />
          </section>
        )}

        <section id="national-polling" className="mt-10 scroll-mt-20">
          <SectionHead theme={t}>National Polling</SectionHead>
          <div className="pt-3"><PollingAverageCard theme={t} data={pollingCard} /></div>
        </section>
      </main>
    </div>
  );
}

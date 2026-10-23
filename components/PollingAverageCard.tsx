"use client";

import { memo, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { NormalizedPoll, PollingCardData, PollSeries, TrendPoint } from "@/lib/pollingCardData";
import { CHART_MARGIN, X_AXIS_HEIGHT, Y_AXIS_WIDTH, fmtDate, marginColor, type Theme } from "./pollCardShared";

// Recharts is a large bundle and draws nothing on the server (it measures its box first), so the
// trend chart loads on its own after the page is interactive; the dots, headline and table don't wait.
const PollTrendChart = dynamic(() => import("./PollTrendChart"), { ssr: false });
type ModeKey = "generic-ballot" | "trump-approval";

const MS_PER_DAY = 86400000;
const CHANGE_WINDOW_DAYS = 30;
const LATEST_ROWS = 10;
// Fixed green/red regardless of theme (lib/trumpApprovalAverage's APPROVE_COLOR / DISAPPROVE_COLOR,
// copied so this client file does not pull in that module's poll data).
const APPROVE_COLOR = "#22c55e";
const DISAPPROVE_COLOR = "#ef4444";

type ScatterPoint = NormalizedPoll & { x: number };
const pollKey = (p: NormalizedPoll) => `${p.pollster}::${p.endDate}`;

export type ModeConfig = {
  key: ModeKey;
  title: string;
  seriesALabel: string;
  seriesBLabel: string;
  colorA: string;
  colorB: string;
  fmtDiff: (diff: number) => string;
  /** Headline form of the average — shorter than fmtDiff where the table/popup wording is long. */
  fmtHeadline: (diff: number) => string;
  headlineLabel: string;
  captionPrefixA: string;
  captionPrefixB: string;
  polls: NormalizedPoll[];
  average: { diff: number; a: number; b: number; includedKeys: Set<string> };
  trend: TrendPoint[];
};

function fmtGbDiff(diff: number): string {
  if (Math.abs(diff) < 0.05) return "EVEN";
  return diff < 0 ? `D+${Math.abs(diff).toFixed(1)}` : `R+${diff.toFixed(1)}`;
}

function fmtApprovalDiff(diff: number): string {
  if (Math.abs(diff) < 0.05) return "EVEN";
  return diff < 0 ? `Approve +${Math.abs(diff).toFixed(1)}` : `Disapprove +${diff.toFixed(1)}`;
}

// The series (polls, today's average, the daily trend) come from the server (lib/pollingCardData);
// this adds each mode's labels and formatting.
function modeConfig(key: ModeKey, series: PollSeries): ModeConfig {
  const average = { ...series.average, includedKeys: new Set(series.average.includedKeys) };
  if (key === "generic-ballot") {
    return {
      key, title: "Generic Ballot", seriesALabel: "Democrat", seriesBLabel: "Republican",
      colorA: "", colorB: "", // filled in per-theme at render time
      fmtDiff: fmtGbDiff, fmtHeadline: fmtGbDiff, headlineLabel: "Margin",
      captionPrefixA: "D", captionPrefixB: "R",
      polls: series.polls, average, trend: series.trend,
    };
  }
  return {
    key, title: "Trump Approval", seriesALabel: "Approve", seriesBLabel: "Disapprove",
    colorA: APPROVE_COLOR, colorB: DISAPPROVE_COLOR,
    fmtDiff: fmtApprovalDiff, fmtHeadline: (diff: number) => fmtNet(diff, 1), headlineLabel: "Net approval",
    captionPrefixA: "App", captionPrefixB: "Dis",
    polls: series.polls, average, trend: series.trend,
  };
}

// The poll dots are drawn outside Recharts. Recharts re-renders every series on each hover move, and
// with 400–650 scatter symbols per chart that was most of the hover lag. This layer sits behind the
// chart's (transparent) SVG, places each dot by percentage of the plot area — so it needs no
// measuring and stays aligned at any width — and is memoized, so hovering never touches it.
const PollDots = memo(function PollDots({ polls, xMin, xMax, yMin, yMax, colorA, colorB }: {
  polls: ScatterPoint[]; xMin: number; xMax: number; yMin: number; yMax: number; colorA: string; colorB: string;
}) {
  const xPct = (x: number) => `${(100 * (x - xMin)) / (xMax - xMin)}%`;
  const yPct = (v: number) => `${(100 * (yMax - v)) / (yMax - yMin)}%`;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: CHART_MARGIN.left + Y_AXIS_WIDTH, right: CHART_MARGIN.right, top: CHART_MARGIN.top, bottom: CHART_MARGIN.bottom + X_AXIS_HEIGHT, width: `calc(100% - ${CHART_MARGIN.left + Y_AXIS_WIDTH + CHART_MARGIN.right}px)`, height: `calc(100% - ${CHART_MARGIN.top + CHART_MARGIN.bottom + X_AXIS_HEIGHT}px)` }}
    >
      {polls.map((p, i) => <circle key={`a${i}`} cx={xPct(p.x)} cy={yPct(p.a)} r={2.4} fill={colorA} fillOpacity={0.22} />)}
      {polls.map((p, i) => <circle key={`b${i}`} cx={xPct(p.x)} cy={yPct(p.b)} r={2.4} fill={colorB} fillOpacity={0.22} />)}
    </svg>
  );
});

// One national series: headline average, its move over the last 30 days, and the trend chart.
function PollChart({ config, theme: t }: { config: ModeConfig; theme: Theme }) {
  const scatterData: ScatterPoint[] = useMemo(
    () => config.polls.map((p) => ({ ...p, x: new Date(p.endDate).getTime() })),
    [config.polls]
  );

  const shareVals = config.polls.flatMap((p) => [p.a, p.b]);
  const yMin = Math.floor(Math.min(...shareVals) - 2);
  const yMax = Math.ceil(Math.max(...shareVals) + 2);

  const headlineColor = marginColor(config.average.diff, config.colorA, config.colorB, t);
  const last = config.trend[config.trend.length - 1];
  const prior = last ? [...config.trend].reverse().find((p) => p.x <= last.x - CHANGE_WINDOW_DAYS * MS_PER_DAY) : undefined;

  return (
    <div className="min-w-0">
      <div className="flex items-end justify-between gap-3 border-b pb-2.5" style={{ borderColor: t.border }}>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.textPrimary }}>{config.title}</div>
          <div className="mt-1 text-xs font-semibold">
            <span style={{ color: config.colorA }}>{config.captionPrefixA}&nbsp;{config.average.a.toFixed(1)}%</span>
            <span className="px-1.5" style={{ color: t.textVeryMuted }}>·</span>
            <span style={{ color: config.colorB }}>{config.captionPrefixB}&nbsp;{config.average.b.toFixed(1)}%</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[9px] uppercase tracking-wider" style={{ color: t.textMuted }}>{config.headlineLabel}</div>
          <div className="text-xl font-bold tabular-nums sm:text-2xl" style={{ color: headlineColor }}>{config.fmtHeadline(config.average.diff)}</div>
          {prior && <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums" style={{ color: t.textMuted }}>
            {CHANGE_WINDOW_DAYS} days ago: <span style={{ color: marginColor(prior.diff, config.colorA, config.colorB, t) }}>{config.fmtHeadline(prior.diff)}</span>
          </div>}
        </div>
      </div>

      <div className="mb-1 mt-2.5 flex items-center gap-4 px-0.5">
        <span className="flex items-center gap-1 text-[10px]" style={{ color: t.textMuted }}>
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: config.colorA }} /> {config.seriesALabel}
        </span>
        <span className="flex items-center gap-1 text-[10px]" style={{ color: t.textMuted }}>
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: config.colorB }} /> {config.seriesBLabel}
        </span>
      </div>

      <div style={{ height: 210 }} className="relative [&_*:focus]:outline-none">
        {config.trend.length > 1 && <PollDots polls={scatterData} xMin={config.trend[0].x} xMax={config.trend[config.trend.length - 1].x} yMin={yMin} yMax={yMax} colorA={config.colorA} colorB={config.colorB} />}
        <PollTrendChart config={config} theme={t} yMin={yMin} yMax={yMax} />
      </div>

    </div>
  );
}

// ── Merged latest-polls table ─────────────────────────────────────────────────
// Most national pollsters ask both questions in the same survey, so the two files are joined
// on pollster + field dates and each survey is one row. RCP's footnote asterisks ("RMG Research*",
// "Echelon Insights**") differ between the two exports, so they are ignored when matching.
type LatestRow = {
  pollster: string;
  startDate: string;
  endDate: string;
  sample: number | null;
  population: string | null;
  ballot: NormalizedPoll | null;
  approval: NormalizedPoll | null;
  included: boolean;
};

const baseName = (pollster: string) => pollster.replace(/\*+$/, "").trim();

function latestRows(gb: ModeConfig, ap: ModeConfig): LatestRow[] {
  const rows = new Map<string, LatestRow>();
  const add = (p: NormalizedPoll, field: "ballot" | "approval", included: boolean) => {
    const key = `${baseName(p.pollster)}::${p.startDate}::${p.endDate}`;
    const row = rows.get(key) ?? { pollster: baseName(p.pollster), startDate: p.startDate, endDate: p.endDate, sample: p.sample, population: p.population, ballot: null, approval: null, included: false };
    row[field] = p;
    row.included ||= included;
    if (field === "ballot" && p.sample) { row.sample = p.sample; row.population = p.population; } // prefer the ballot question's base
    rows.set(key, row);
  };
  for (const p of gb.polls) add(p, "ballot", gb.average.includedKeys.has(pollKey(p)));
  for (const p of ap.polls) add(p, "approval", ap.average.includedKeys.has(pollKey(p)));
  return [...rows.values()]
    .sort((x, y) => y.endDate.localeCompare(x.endDate) || y.startDate.localeCompare(x.startDate));
}

function fmtNet(diff: number, digits = 0): string {
  // diff = disapprove − approve; show net approval (approve − disapprove)
  const net = -diff;
  if (Math.abs(net) < 0.5 * 10 ** -digits) return "EVEN";
  return `${net > 0 ? "+" : "−"}${Math.abs(net).toFixed(digits)}`;
}

function LatestPollsTable({ gb, ap, theme: t }: { gb: ModeConfig; ap: ModeConfig; theme: Theme }) {
  const [showAll, setShowAll] = useState(false);
  // "Show all" keeps the box at its collapsed (10-row) height and scrolls the full list inside it.
  const boxRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const toggleShowAll = () => {
    if (!showAll && boxRef.current) setCollapsedHeight(boxRef.current.offsetHeight);
    setShowAll((current) => !current);
  };
  const allRows = useMemo(() => latestRows(gb, ap), [gb, ap]);
  const rows = showAll ? allRows : allRows.slice(0, LATEST_ROWS);
  // Rows left out of both averages (a pollster's older surveys) take the tab gray. The header matches
  // the unshaded rows, which show the page background — set solid so scrolled rows don't show through it.
  const excludedRowBg = t.tabBg;
  const headerBg = t.bg;
  const th = "px-2.5 py-1.5 font-semibold uppercase tracking-wider";
  return (
    <div className="mt-8">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: t.textPrimary }}>Latest Polls</div>
      {/* Fixed column widths + a reserved scrollbar gutter: expanding to every poll must not move the columns. */}
      <div ref={boxRef} className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${t.border}`, scrollbarGutter: "stable", ...(showAll && collapsedHeight ? { height: collapsedHeight, overflowY: "auto" } : {}) }}>
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead className="sticky top-0 z-10" style={{ background: headerBg }}>
            <tr style={{ color: t.textMuted, fontSize: 9 }}>
              <th className={`${th} w-[22%] text-left sm:w-[12%]`}>Dates</th>
              <th className={`${th} text-left`}>Pollster</th>
              <th className={`${th} hidden w-[13%] text-right sm:table-cell`}>Sample</th>
              <th className={`${th} w-[23%] text-right sm:w-[18%]`}>Generic Ballot</th>
              <th className={`${th} w-[24%] text-right sm:w-[20%]`}>Trump Net Approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.pollster}-${r.startDate}-${r.endDate}`} style={{ borderTop: `1px solid ${t.border}`, background: r.included ? "transparent" : excludedRowBg }}>
                <td className="whitespace-nowrap px-2.5 py-1.5" style={{ color: t.textMuted }}>{fmtDate(r.startDate)}–{fmtDate(r.endDate)}</td>
                <td className="px-2.5 py-1.5" style={{ color: t.textPrimary }}>{r.pollster}</td>
                <td className="hidden whitespace-nowrap px-2.5 py-1.5 text-right sm:table-cell" style={{ color: t.textMuted }}>
                  {r.sample ? `${r.sample.toLocaleString()}${r.population ? ` ${r.population}` : ""}` : r.population ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums">
                  {r.ballot
                    ? <><span className="mr-2 hidden font-normal md:inline" style={{ color: t.textMuted }}>{r.ballot.a}–{r.ballot.b}</span><span style={{ color: marginColor(r.ballot.diff, gb.colorA, gb.colorB, t) }}>{gb.fmtDiff(r.ballot.diff)}</span></>
                    : <span style={{ color: t.textVeryMuted }}>—</span>}
                </td>
                <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums">
                  {r.approval
                    ? <><span className="mr-2 hidden font-normal md:inline" style={{ color: t.textMuted }}>{r.approval.a}–{r.approval.b}</span><span style={{ color: marginColor(r.approval.diff, ap.colorA, ap.colorB, t) }}>{fmtNet(r.approval.diff)}</span></>
                    : <span style={{ color: t.textVeryMuted }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allRows.length > LATEST_ROWS && <button
        type="button"
        onClick={toggleShowAll}
        className="mt-2 w-full py-2 text-[11px] font-semibold transition-opacity hover:opacity-65"
        style={{ color: t.textMuted, borderBottom: `1px solid ${t.border}` }}
      >
        {showAll ? `Show ${LATEST_ROWS} most recent polls` : `Show all ${allRows.length} polls`}
      </button>}
      <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: excludedRowBg, border: `1px solid ${t.border}` }} />
        <span className="text-[10px]" style={{ color: t.textVeryMuted }}>Shaded rows are older surveys left out of the averages above, which use each pollster&apos;s most recent survey. A dash means that survey didn&apos;t ask the question.</span>
      </div>
    </div>
  );
}

/** `data` is computed by the server page as of one moment (lib/pollingCardData). */
export default function PollingAverageCard({ theme: t, data }: { theme: Theme; data: PollingCardData }) {
  const gbBase = useMemo(() => modeConfig("generic-ballot", data.genericBallot), [data.genericBallot]);
  // Generic ballot's colors follow the theme (dem/rep blue-red shift between light/dark);
  // Trump approval's colors are fixed green/red regardless of theme.
  const gb = useMemo(() => ({ ...gbBase, colorA: t.demText, colorB: t.repText }), [gbBase, t.demText, t.repText]);
  const ap = useMemo(() => modeConfig("trump-approval", data.approval), [data.approval]);

  return (
    <div className="w-full">
      <div className="grid gap-8 md:grid-cols-2 md:gap-10">
        <PollChart config={gb} theme={t} />
        <PollChart config={ap} theme={t} />
      </div>
      <LatestPollsTable gb={gb} ap={ap} theme={t} />
    </div>
  );
}

"use client";

import { RaceForecast, RaceType } from "@/data/forecastData";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import { Theme } from "./ForecastMap";

type Props = {
  selected: RaceForecast | null;
  raceType: RaceType;
  onClose: () => void;
  theme: Theme;
};

export default function Sidebar({ selected, raceType, onClose, theme: t }: Props) {
  if (!selected) return null;

  const demVoteShare = (100 - selected.margin) / 2;
  const repVoteShare = (100 + selected.margin) / 2;
  const forecastRating = marginToRating(selected.margin);
  const { bg, text } = getRatingColors(forecastRating);
  const marginIsD = selected.margin <= 0;
  const panelSurface = t.legendBg;
  const cardSurface = t.tabBg;

  return (
    <>
      {/* ── Desktop: floating selected-race panel ── */}
      <div
        className="absolute z-30 hidden flex-col overflow-hidden rounded-xl backdrop-blur-sm md:flex"
        style={{
          right: "1.25rem",
          bottom: "12px",
          width: 172,
          maxHeight: 260,
          background: panelSurface,
          border: `1px solid ${t.border}`,
          boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
          color: t.textPrimary,
        }}
      >
        {/* Header */}
        <div className="shrink-0 p-2 pb-1.5" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div className="flex items-center justify-between gap-1.5">
            <h2 className="min-w-0 flex-1 truncate text-sm font-bold leading-tight" style={{ color: t.textPrimary }}>
              {selected.name}
            </h2>
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0"
              style={{ background: bg, color: text }}
            >
              {forecastRating}
            </span>
            <button
              onClick={onClose}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors"
              style={{ color: t.textVeryMuted, background: cardSurface }}
              aria-label="Close selected race"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-2" style={{ scrollbarWidth: "thin" }}>
          {/* Candidates */}
          {selected.candidates && (
            <div className="rounded-md p-2" style={{ background: cardSurface }}>
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-bold leading-tight" style={{ color: t.textPrimary }}>
                    {selected.candidates.dem.name}
                  </div>
                  <div className="text-[8px] font-medium leading-tight" style={{ color: t.demText }}>
                    Democrat{selected.candidates.dem.incumbent ? " · Inc." : ""}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] font-bold tabular-nums leading-tight" style={{ color: t.demText }}>
                  {demVoteShare.toFixed(1)}%
                </div>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-bold leading-tight" style={{ color: t.textPrimary }}>
                    {selected.candidates.rep.name}
                  </div>
                  <div className="text-[8px] font-medium leading-tight" style={{ color: t.repText }}>
                    Republican{selected.candidates.rep.incumbent ? " · Inc." : ""}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] font-bold tabular-nums leading-tight" style={{ color: t.repText }}>
                  {repVoteShare.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* Projected Margin */}
          <div className="mt-1.5 rounded-md p-2" style={{ background: cardSurface }}>
            <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>
              Projected Margin
            </div>
            <div
              className="text-base font-bold leading-none tabular-nums"
              style={{ color: marginIsD ? t.demText : t.repText }}
            >
              {marginIsD ? "D+" : "R+"}
              {Math.abs(selected.margin).toFixed(1)}
            </div>
          </div>

          {/* More Info */}
          <a
            href={`/${raceType}/${(raceType === "house" ? selected.name : selected.id).toLowerCase().replace(/-2$/, "2")}`}
            className="mt-1.5 flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold transition-colors"
            style={{ background: cardSurface, color: t.textMuted }}
          >
            More Info
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

        </div>
      </div>

    </>
  );
}

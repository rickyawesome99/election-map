"use client";

import { Candidate, RaceForecast, RaceType } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import Link from "next/link";
import { Theme } from "./ForecastMap";

type Props = {
  selected: RaceForecast | null;
  raceType: RaceType;
  onClose: () => void;
  theme: Theme;
};

export default function Sidebar({ selected, raceType, onClose, theme: t }: Props) {
  if (!selected) return null;

  const demWinPct = Math.round(selected.probability * 100);
  const repWinPct = 100 - demWinPct;
  const demVoteShare = (100 + selected.margin) / 2;
  const repVoteShare = (100 - selected.margin) / 2;
  const { bg, text } = getRatingColors(selected.rating);
  const marginIsD = selected.margin >= 0;
  const panelSurface = t.legendBg;
  const cardSurface = t.tabBg;

  return (
    <>
      {/* ── Desktop: floating selected-race panel ── */}
      <div
        className="absolute z-30 hidden flex-col overflow-hidden rounded-xl backdrop-blur-sm md:flex"
        style={{
          right: "1.25rem",
          bottom: "73px",
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
          <div className="mb-1 flex items-start justify-between gap-1.5">
            <h2 className="min-w-0 flex-1 truncate text-[11px] font-bold leading-tight" style={{ color: t.textPrimary }}>
              {selected.name}
            </h2>
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
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
              style={{ background: bg, color: text }}
            >
              {selected.rating}
            </span>
            <Link
              href={`/${raceType}/${selected.id.toLowerCase()}`}
              className="flex items-center gap-0.5 text-[9px] font-medium transition-colors"
              style={{ color: t.textMuted }}
            >
              View details
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
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
              <div className="mb-1.5 flex h-2 overflow-hidden rounded-full">
                <div style={{ width: `${demVoteShare}%`, background: "#1b408c" }} />
                <div style={{ width: `${repVoteShare}%`, background: "#be1c29" }} />
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

          {/* Win Probability + Margin */}
          <div className="mt-1.5 grid grid-cols-1 gap-1.5">
            <div className="rounded-md p-2" style={{ background: cardSurface }}>
              <div className="mb-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>
                Win Probability
              </div>
              <div className="mb-1 flex justify-between text-[9px] font-bold tabular-nums">
                <span style={{ color: t.demText }}>D {demWinPct}%</span>
                <span style={{ color: t.repText }}>R {repWinPct}%</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full">
                <div style={{ width: `${demWinPct}%`, background: "#1b408c" }} />
                <div style={{ width: `${repWinPct}%`, background: "#be1c29" }} />
              </div>
            </div>
            <div className="rounded-md p-2" style={{ background: cardSurface }}>
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
              <div className="mt-0.5 text-[9px] font-medium" style={{ color: t.textMuted }}>
                {marginIsD ? "Dem" : "Rep"} adv.
              </div>
            </div>
          </div>

          {/* Past Results */}
          {selected.pastResults && selected.pastResults.length > 0 && (
            <div className="mt-2">
              <div className="mb-1.5 text-[8px] font-bold uppercase tracking-wider" style={{ color: t.textMuted }}>
                Past Results
              </div>
              <div className="flex flex-col gap-1.5">
                {selected.pastResults.map((res) => {
                  const winner = res.demPct > res.repPct ? "D" : "R";
                  const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
                  const total = res.demPct + res.repPct;
                  const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
                  return (
                    <div key={res.year} className="rounded-md p-1.5" style={{ background: cardSurface }}>
                      <div className="mb-1 flex items-center justify-between gap-1.5">
                        <div className="flex min-w-0 items-baseline gap-1.5">
                          <span className="text-[10px] font-bold leading-none" style={{ color: t.textPrimary }}>
                            {res.year}
                          </span>
                          {res.electionType && (
                            <span className="truncate text-[8px] font-semibold" style={{ color: t.textMuted }}>
                              {res.electionType}
                            </span>
                          )}
                        </div>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[8px] font-bold"
                          style={{
                            background: winner === "D" ? t.candidateDemBg : t.candidateRepBg,
                            color: winner === "D" ? t.demText : t.repText,
                          }}
                        >
                          {winner}+{margin}
                        </span>
                      </div>
                      <div className="mb-1 flex h-1.5 overflow-hidden rounded-full">
                        <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                        <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                      </div>
                      <div className="flex justify-between text-[8px] font-bold tabular-nums">
                        <span style={{ color: t.demText }}>{res.demPct}%</span>
                        <span style={{ color: t.repText }}>{res.repPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile: single-row strip, h-14, above controls bar ── */}
      <div
        className="md:hidden fixed bottom-14 left-0 right-0 z-30 flex items-center h-14 px-3 gap-0"
        style={{ background: t.panel, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}
      >
        {/* Name + rating stacked — 1/5 */}
        <div className="flex flex-col justify-center min-w-0 pr-2" style={{ width: "25%" }}>
          <span className="text-xs font-bold leading-tight truncate" style={{ color: t.textPrimary }}>
            {selected.name}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: bg, color: text }}
            >
              {selected.rating}
            </span>
            <Link
              href={`/${raceType}/${selected.id.toLowerCase()}`}
              className="text-[9px] shrink-0"
              style={{ color: t.textMuted }}
            >
              Details ↗
            </Link>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch shrink-0 mx-2" style={{ background: t.border }} />

        {/* Candidates OR past results — 3/5 */}
        <div className="flex flex-col justify-center gap-0.5 min-w-0" style={{ width: "50%" }}>
          {selected.candidates ? (
            (
              [
                { c: selected.candidates.dem, pct: demVoteShare, isD: true },
                { c: selected.candidates.rep, pct: repVoteShare, isD: false },
              ] as { c: Candidate; pct: number; isD: boolean }[]
            ).map(({ c, pct, isD }) => {
              const color = isD ? t.demText : t.repText;
              return (
                <div key={c.name} className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-medium truncate" style={{ color: t.textPrimary }}>{c.name}{c.incumbent && <span style={{ opacity: 0.7 }}> (inc)</span>}</span>
                  <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })
          ) : selected.pastResults && selected.pastResults.length > 0 ? (
            selected.pastResults.slice(0, 2).map((res) => {
              const winner = res.demPct > res.repPct ? "D" : "R";
              const m = Math.abs(res.demPct - res.repPct).toFixed(1);
              const total = res.demPct + res.repPct;
              const dW = total > 0 ? (res.demPct / total) * 100 : 50;
              return (
                <div key={res.year} className="flex items-center gap-1">
                  <span className="text-[9px] font-semibold shrink-0" style={{ color: t.textMuted }}>{res.year}</span>
                  <div className="flex h-1.5 rounded-full overflow-hidden flex-1">
                    <div style={{ width: `${dW}%`, background: "#1b408c" }} />
                    <div style={{ width: `${100 - dW}%`, background: "#be1c29" }} />
                  </div>
                  <span className="text-[9px] font-bold shrink-0" style={{ color: winner === "D" ? t.demText : t.repText }}>{winner}+{m}</span>
                </div>
              );
            })
          ) : null}
        </div>

        {/* Divider */}
        <div className="w-px self-stretch shrink-0 mx-2" style={{ background: t.border }} />

        {/* Margin — 1/5 */}
        <div className="flex flex-col justify-center text-center" style={{ width: "25%" }}>
          <div className="text-[8px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: t.textMuted }}>
            Margin
          </div>
          <div
            className="text-base font-bold leading-none tabular-nums"
            style={{ color: marginIsD ? t.demText : t.repText }}
          >
            {marginIsD ? "D+" : "R+"}
            {Math.abs(selected.margin).toFixed(1)}
          </div>
        </div>

        {/* Close button */}
        <button onClick={onClose} className="shrink-0 ml-2" style={{ color: t.textVeryMuted }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </>
  );
}

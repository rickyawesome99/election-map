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

  return (
    <>
      {/* ── Desktop: compact floating panel near Florida ── */}
      <div
        className="hidden md:flex flex-col absolute z-30 rounded-xl backdrop-blur-sm overflow-y-auto"
        style={{
          right: "1.25rem",
          bottom: "73px",
          width: 172,
          maxHeight: 260,
          background: t.legendBg,
          border: `1px solid ${t.border}`,
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          color: t.textPrimary,
          scrollbarWidth: "none",
        }}
      >
        {/* Header */}
        <div className="p-2 pb-1.5 shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div className="flex items-start justify-between gap-1 mb-1">
            <h2 className="text-[11px] font-bold leading-tight flex-1 min-w-0" style={{ color: t.textPrimary }}>
              {selected.name}
            </h2>
            <button onClick={onClose} className="shrink-0 mt-0.5" style={{ color: t.textVeryMuted }}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: bg, color: text }}
            >
              {selected.rating}
            </span>
            <Link
              href={`/${raceType}/${selected.id.toLowerCase()}`}
              className="text-[9px] flex items-center gap-0.5 transition-colors"
              style={{ color: t.textMuted }}
            >
              View details
              <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Candidates */}
        {selected.candidates && (
          <div className="px-2 pt-1.5 pb-1 flex flex-col gap-1 shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
            {(
              [
                { c: selected.candidates.dem, pct: demVoteShare, isD: true },
                { c: selected.candidates.rep, pct: repVoteShare, isD: false },
              ] as { c: Candidate; pct: number; isD: boolean }[]
            ).map(({ c, pct, isD }) => {
              const color = isD ? "#1b408c" : "#be1c29";
              const bgC = isD ? t.candidateDemBg : t.candidateRepBg;
              return (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded px-2 py-1"
                  style={{ background: bgC, borderLeft: `2px solid ${color}` }}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[10px] font-semibold leading-tight"
                      style={{ color: t.textPrimary, wordBreak: "break-word" }}
                    >
                      {c.name}
                    </div>
                    <div className="text-[8px]" style={{ color }}>
                      {isD ? "Democrat" : "Republican"}
                      {c.incumbent ? " · Inc." : ""}
                    </div>
                  </div>
                  <div className="text-[10px] font-bold tabular-nums ml-1 shrink-0" style={{ color }}>
                    {pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Win Probability + Margin */}
        <div className="px-2 pt-1.5 pb-2 shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div
            className="text-[8px] font-semibold uppercase tracking-wider mb-1"
            style={{ color: t.textMuted }}
          >
            Win Probability
          </div>
          <div className="flex justify-between text-[9px] font-semibold mb-1">
            <span style={{ color: "#1b408c" }}>D {demWinPct}%</span>
            <span style={{ color: "#be1c29" }}>R {repWinPct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex mb-2">
            <div style={{ width: `${demWinPct}%`, background: "#1b408c" }} />
            <div style={{ width: `${repWinPct}%`, background: "#be1c29" }} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[8px] font-semibold uppercase tracking-wider"
              style={{ color: t.textMuted }}
            >
              Projected Margin
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className="text-base font-bold leading-none"
              style={{ color: marginIsD ? "#1b408c" : "#be1c29" }}
            >
              {marginIsD ? "D+" : "R+"}
              {Math.abs(selected.margin).toFixed(1)}
            </span>
            <span className="text-[9px]" style={{ color: t.textMuted }}>
              {marginIsD ? "Dem" : "Rep"} adv.
            </span>
          </div>
        </div>

        {/* Past Results */}
        {selected.pastResults && selected.pastResults.length > 0 && (
          <div className="px-2 pt-1.5 pb-2">
            <div
              className="text-[8px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: t.textMuted }}
            >
              Past Results
            </div>
            <div className="flex flex-col gap-1.5">
              {selected.pastResults.map((res) => {
                const winner = res.demPct > res.repPct ? "D" : "R";
                const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
                const total = res.demPct + res.repPct;
                const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
                return (
                  <div key={res.year}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-[9px] font-semibold" style={{ color: t.textMuted }}>
                        {res.year}
                      </span>
                      <span
                        className="text-[9px] font-bold"
                        style={{ color: winner === "D" ? "#1b408c" : "#be1c29" }}
                      >
                        {winner}+{margin}
                      </span>
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden">
                      <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
                      <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[8px]" style={{ color: "#1b408c99" }}>
                        {res.demPct}%
                      </span>
                      <span className="text-[8px]" style={{ color: "#be1c2999" }}>
                        {res.repPct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile: single-row strip, h-14, above controls bar ── */}
      <div
        className="md:hidden fixed bottom-14 left-0 right-0 z-30 flex items-center h-14 px-3 gap-0"
        style={{ background: t.panel, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}
      >
        {/* Name + rating stacked */}
        <div className="flex flex-col justify-center min-w-0 flex-1 pr-2">
          <span className="text-xs font-bold leading-tight truncate" style={{ color: t.textPrimary }}>
            {selected.name}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
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

        {/* Candidates OR past results */}
        <div className="flex flex-col justify-center gap-0.5 shrink-0 pr-2" style={{ width: 130 }}>
          {selected.candidates ? (
            (
              [
                { c: selected.candidates.dem, pct: demVoteShare, isD: true },
                { c: selected.candidates.rep, pct: repVoteShare, isD: false },
              ] as { c: Candidate; pct: number; isD: boolean }[]
            ).map(({ c, pct, isD }) => {
              const color = isD ? "#1b408c" : "#be1c29";
              return (
                <div key={c.name} className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-medium truncate" style={{ color: t.textPrimary }}>{c.name}</span>
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
                  <span className="text-[9px] font-bold shrink-0" style={{ color: winner === "D" ? "#1b408c" : "#be1c29" }}>{winner}+{m}</span>
                </div>
              );
            })
          ) : null}
        </div>

        {/* Divider */}
        <div className="w-px self-stretch shrink-0 mx-2" style={{ background: t.border }} />

        {/* Win prob */}
        <div className="flex flex-col justify-center shrink-0 pr-2" style={{ width: 64 }}>
          <div className="flex justify-between text-[9px] font-bold mb-1">
            <span style={{ color: "#1b408c" }}>D {demWinPct}%</span>
            <span style={{ color: "#be1c29" }}>R {repWinPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex">
            <div style={{ width: `${demWinPct}%`, background: "#1b408c" }} />
            <div style={{ width: `${repWinPct}%`, background: "#be1c29" }} />
          </div>
          <div className="text-[8px] mt-0.5 text-center" style={{ color: t.textMuted }}>win prob</div>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch shrink-0 mx-2" style={{ background: t.border }} />

        {/* Margin */}
        <div className="shrink-0 flex flex-col justify-center text-center">
          <div className="text-[8px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: t.textMuted }}>
            Margin
          </div>
          <div
            className="text-base font-bold leading-none tabular-nums"
            style={{ color: marginIsD ? "#1b408c" : "#be1c29" }}
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

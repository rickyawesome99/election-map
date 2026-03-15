"use client";

import { Candidate, PastResult, RaceForecast, RaceType } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import TrendChart from "./TrendChart";
import Link from "next/link";
import { Theme } from "./ForecastMap";

type Props = {
  selected: RaceForecast | null;
  raceType: RaceType;
  onClose: () => void;
  theme: Theme;
};

export default function Sidebar({ selected, raceType, onClose, theme: t }: Props) {
  const unit = raceType === "house" ? "district" : "state";

  if (!selected) {
    return (
      <aside
        className="shrink-0 flex items-center justify-center gap-3 px-8"
        style={{ background: t.panel, borderTop: `1px solid ${t.border}`, height: "200px" }}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: t.tabBg }}>
          <svg className="w-5 h-5" style={{ color: t.textVeryMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: t.textMuted }}>
          Click a {unit} to view race details
        </p>
      </aside>
    );
  }

  const demPct = Math.round(selected.probability * 100);
  const repPct = 100 - demPct;
  const { bg, text } = getRatingColors(selected.rating);
  const marginIsD = selected.margin >= 0;

  return (
    <aside
      className="shrink-0 flex flex-row overflow-x-auto overflow-y-hidden"
      style={{ background: t.panel, borderTop: `1px solid ${t.border}`, height: "200px" }}
    >

      {/* ── Header ── */}
      <div
        className="shrink-0 p-4 flex flex-col justify-between"
        style={{ width: "200px", borderRight: `1px solid ${t.border}` }}
      >
        <div>
          <div className="flex items-start justify-between mb-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: t.textMuted }}>
              {raceType}
            </div>
            <button onClick={onClose} className="transition-colors" style={{ color: t.textVeryMuted }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <h2 className="text-lg font-bold leading-tight" style={{ color: t.textPrimary }}>{selected.name}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ background: bg, color: text }}
          >
            {selected.rating}
          </span>
          {(raceType === "senate" || raceType === "governor" || raceType === "house") && (
            <Link
              href={`/${raceType}/${selected.id.toLowerCase()}`}
              className="text-xs flex items-center gap-1 transition-colors"
              style={{ color: t.textMuted }}
            >
              View details
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* ── Candidates ── */}
      {selected.candidates && (
        <div
          className="shrink-0 p-4 flex flex-col"
          style={{ width: "220px", borderRight: `1px solid ${t.border}` }}
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold mb-2.5" style={{ color: t.textMuted }}>
            Candidates
          </div>
          <div className="flex flex-col gap-2">
            <CandidateCard candidate={selected.candidates.dem} pct={demPct} theme={t} />
            <CandidateCard candidate={selected.candidates.rep} pct={repPct} theme={t} />
          </div>
        </div>
      )}

      {/* ── Win Probability + Projected Margin ── */}
      <div
        className="shrink-0 p-4 flex flex-col gap-4"
        style={{ width: "190px", borderRight: `1px solid ${t.border}` }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: t.textMuted }}>
            Win Probability
          </div>
          <div className="flex justify-between text-xs font-semibold mb-1.5">
            <span style={{ color: "#1b408c" }}>D {demPct}%</span>
            <span style={{ color: "#be1c29" }}>R {repPct}%</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex">
            <div style={{ width: `${demPct}%`, background: "#1b408c" }} className="transition-all duration-300" />
            <div style={{ width: `${repPct}%`, background: "#be1c29" }} className="transition-all duration-300" />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: t.textMuted }}>
            Projected Margin
          </div>
          <div className="text-2xl font-bold" style={{ color: marginIsD ? "#1b408c" : "#be1c29" }}>
            {marginIsD ? "+" : ""}{selected.margin.toFixed(1)}
          </div>
          <div className="text-xs mt-0.5" style={{ color: t.textMuted }}>
            {marginIsD ? "Dem" : "Rep"} advantage
          </div>
        </div>
      </div>

      {/* ── Past Results ── */}
      {selected.pastResults && selected.pastResults.length > 0 && (
        <div
          className="shrink-0 p-4 overflow-y-auto"
          style={{ width: "210px", borderRight: `1px solid ${t.border}` }}
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold mb-2.5" style={{ color: t.textMuted }}>
            Past Results
          </div>
          <div className="flex flex-col gap-2">
            {selected.pastResults.map((res) => (
              <PastResultRow key={res.year} result={res} theme={t} />
            ))}
          </div>
        </div>
      )}

      {/* ── Probability Trend ── */}
      <div className="flex-1 min-w-[200px] p-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: t.textMuted }}>
          Probability Trend
        </div>
        <div style={{ height: "calc(100% - 20px)" }}>
          <TrendChart data={selected.history} />
        </div>
      </div>
    </aside>
  );
}

function CandidateCard({ candidate, pct, theme: t }: { candidate: Candidate; pct: number; theme: Theme }) {
  const isD = candidate.party === "D" || candidate.party === "I";
  const partyLabel = candidate.party === "I" ? "Independent" : candidate.party === "D" ? "Democrat" : "Republican";
  const borderColor = isD ? "#1b408c" : "#be1c29";
  const bgColor = isD ? t.candidateDemBg : t.candidateRepBg;
  const textColor = isD ? "#1b408c" : "#be1c29";

  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2"
      style={{ background: bgColor, borderLeft: `3px solid ${borderColor}` }}
    >
      <div>
        <div className="text-sm font-semibold leading-tight" style={{ color: t.textPrimary }}>{candidate.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span style={{ color: textColor }} className="text-[10px] font-medium">{partyLabel}</span>
          {candidate.incumbent && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${borderColor}20`, color: textColor }}>
              Incumbent
            </span>
          )}
        </div>
      </div>
      <div style={{ color: textColor }} className="text-lg font-bold tabular-nums">
        {pct}%
      </div>
    </div>
  );
}

function PastResultRow({ result, theme: t }: { result: PastResult; theme: Theme }) {
  const { year, demPct, repPct } = result;
  const winner = demPct > repPct ? "D" : "R";
  const margin = Math.abs(demPct - repPct).toFixed(1);
  const total = demPct + repPct;
  const dWidth = total > 0 ? (demPct / total) * 100 : 50;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold" style={{ color: t.textMuted }}>{year}</span>
        <span className="text-[10px] font-bold" style={{ color: winner === "D" ? "#1b408c" : "#be1c29" }}>
          {winner}+{margin}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden">
        <div style={{ width: `${dWidth}%`, background: "#1b408c" }} />
        <div style={{ width: `${100 - dWidth}%`, background: "#be1c29" }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px]" style={{ color: "#1b408c99" }}>{demPct}%</span>
        <span className="text-[9px]" style={{ color: "#be1c2999" }}>{repPct}%</span>
      </div>
    </div>
  );
}

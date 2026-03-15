"use client";

import { Candidate, PastResult, RaceForecast, RaceType } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import TrendChart from "./TrendChart";
import Link from "next/link";

type Props = {
  selected: RaceForecast | null;
  raceType: RaceType;
  onClose: () => void;
};

export default function Sidebar({ selected, raceType, onClose }: Props) {
  const unit = raceType === "house" ? "district" : "state";

  if (!selected) {
    return (
      <aside className="w-72 shrink-0 bg-[#161b22] border-l border-[#30363d] flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[#21262d] flex items-center justify-center">
          <svg className="w-6 h-6 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </div>
        <p className="text-[#8b949e] text-sm">
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
    <aside className="w-72 shrink-0 bg-[#161b22] border-l border-[#30363d] flex flex-col overflow-y-auto">

      {/* ── Header ── */}
      <div className="p-5 border-b border-[#30363d]">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-1">
              {raceType}
            </div>
            <h2 className="text-white text-xl font-bold leading-tight">{selected.name}</h2>
          </div>
          <button onClick={onClose} className="text-[#484f58] hover:text-white transition-colors mt-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ background: bg, color: text }}
          >
            {selected.rating}
          </span>
          {raceType === "senate" && (
            <Link
              href={`/senate/${selected.id.toLowerCase()}`}
              className="text-xs text-[#8b949e] hover:text-white transition-colors flex items-center gap-1"
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
        <div className="p-5 border-b border-[#30363d]">
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-3">
            Candidates
          </div>
          <div className="flex flex-col gap-2">
            <CandidateCard candidate={selected.candidates.dem} pct={demPct} />
            <CandidateCard candidate={selected.candidates.rep} pct={repPct} />
          </div>
        </div>
      )}

      {/* ── Win Probability ── */}
      <div className="p-5 border-b border-[#30363d]">
        <div className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-3">
          Win Probability
        </div>
        <div className="flex justify-between text-sm font-semibold mb-2">
          <span className="text-blue-400">Dem {demPct}%</span>
          <span className="text-red-400">Rep {repPct}%</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden flex">
          <div style={{ width: `${demPct}%` }} className="bg-blue-500 transition-all duration-300" />
          <div style={{ width: `${repPct}%` }} className="bg-red-500 transition-all duration-300" />
        </div>
      </div>

      {/* ── Projected Margin ── */}
      <div className="p-5 border-b border-[#30363d]">
        <div className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-2">
          Projected Margin
        </div>
        <div className={`text-3xl font-bold ${marginIsD ? "text-blue-400" : "text-red-400"}`}>
          {marginIsD ? "+" : ""}{selected.margin.toFixed(1)}
        </div>
        <div className="text-xs text-[#8b949e] mt-1">
          {marginIsD ? "Democratic" : "Republican"} advantage
        </div>
      </div>

      {/* ── Past Results ── */}
      {selected.pastResults && selected.pastResults.length > 0 && (
        <div className="p-5 border-b border-[#30363d]">
          <div className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-3">
            Past Election Results
          </div>
          <div className="flex flex-col gap-2.5">
            {selected.pastResults.map((res) => (
              <PastResultRow key={res.year} result={res} />
            ))}
          </div>
        </div>
      )}

      {/* ── Probability Trend ── */}
      <div className="p-5">
        <div className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-3">
          Probability Trend
        </div>
        <TrendChart data={selected.history} />
      </div>
    </aside>
  );
}

function CandidateCard({ candidate, pct }: { candidate: Candidate; pct: number }) {
  const isD = candidate.party === "D" || candidate.party === "I";
  const partyLabel = candidate.party === "I" ? "Independent" : candidate.party === "D" ? "Democrat" : "Republican";
  const borderColor = isD ? "#388bfd" : "#f85149";
  const bgColor = isD ? "#1b3a5c" : "#5c1b1b";
  const textColor = isD ? "#93c5fd" : "#fca5a5";

  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2.5"
      style={{ background: bgColor, borderLeft: `3px solid ${borderColor}` }}
    >
      <div>
        <div className="text-white text-sm font-semibold leading-tight">{candidate.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span style={{ color: textColor }} className="text-[10px] font-medium">{partyLabel}</span>
          {candidate.incumbent && (
            <span className="text-[9px] bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full font-medium">
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

function PastResultRow({ result }: { result: PastResult }) {
  const { year, demPct, repPct } = result;
  const winner = demPct > repPct ? "D" : "R";
  const margin = Math.abs(demPct - repPct).toFixed(1);
  const total = demPct + repPct;
  const dWidth = total > 0 ? (demPct / total) * 100 : 50;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold text-[#8b949e]">{year}</span>
        <span className={`text-[10px] font-bold ${winner === "D" ? "text-blue-400" : "text-red-400"}`}>
          {winner}+{margin}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden">
        <div style={{ width: `${dWidth}%` }} className="bg-blue-500" />
        <div style={{ width: `${100 - dWidth}%` }} className="bg-red-500" />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-blue-400/70">{demPct}%</span>
        <span className="text-[9px] text-red-400/70">{repPct}%</span>
      </div>
    </div>
  );
}

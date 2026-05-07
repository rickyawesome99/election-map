"use client";

import { useMemo } from "react";
import {
  ohioTreasurerData,
  roegnerPct,
  roegnerVotes,
  edwardsVotes,
  type OhioCountyResult,
} from "@/data/ohioTreasurerData";

// biasInPP: how many pp to shift the remaining-vote margin toward Roegner (+) or Edwards (−).
// At 0, each county's remaining votes split identically to its current reported split,
// so the final projected margin equals the current reported margin exactly.
// +1 → remaining votes go 1pp more to Roegner than the county's current split; −1 → 1pp more to Edwards.
// Relationship: remaining_roeShare = currentRoeShare + biasInPP / 200
//   (dividing by 200 because margin = 2·roeShare − 1, so a 1pp margin shift = 0.5pp share shift)

function countyProjection(r: OhioCountyResult, biasInPP: number) {
  if (r.voteTotal === 0 || r.margin === null) {
    return { estRoegner: 0, estEdwards: 0, estTotal: 0 };
  }
  const rp = r.reportingPct / 100;
  const estTotal = rp > 0 ? r.voteTotal / rp : r.voteTotal;
  const reportedR = roegnerVotes(r);
  const reportedE = edwardsVotes(r);
  const remaining = Math.max(0, estTotal - r.voteTotal);

  const currentRoeShare = roegnerPct(r) / 100;
  const adjRoeShare = Math.max(0, Math.min(1, currentRoeShare + biasInPP / 200));

  return {
    estRoegner: reportedR + remaining * adjRoeShare,
    estEdwards: reportedE + remaining * (1 - adjRoeShare),
    estTotal,
  };
}

function fmtPct(n: number) { return `${n.toFixed(2)}%`; }
function fmtVotes(n: number) { return Math.round(n).toLocaleString(); }

export default function OhioTreasurerExtrapolator({
  biasInPP,
  onBiasChange,
}: {
  biasInPP: number;
  onBiasChange: (v: number) => void;
}) {

  // ── Current statewide totals ──────────────────────────────────────────────
  const current = useMemo(() => {
    let totalR = 0, totalE = 0, totalVotes = 0, countiesReporting = 0;
    for (const r of ohioTreasurerData) {
      if (r.winner !== null) {
        totalR += roegnerVotes(r);
        totalE += edwardsVotes(r);
        totalVotes += r.voteTotal;
        countiesReporting++;
      }
    }
    const total = totalR + totalE;
    return {
      roegnerVotes: totalR, edwardsVotes: totalE, totalVotes,
      roegnerPct: total > 0 ? (totalR / total) * 100 : 50,
      edwardsPct: total > 0 ? (totalE / total) * 100 : 50,
      countiesReporting,
    };
  }, []);

  const avgReporting = useMemo(() => {
    const rep = ohioTreasurerData.filter(r => r.voteTotal > 0);
    if (!rep.length) return 0;
    const wSum = rep.reduce((s, r) => s + r.voteTotal * r.reportingPct, 0);
    const wTot = rep.reduce((s, r) => s + r.voteTotal, 0);
    return wTot > 0 ? wSum / wTot : 0;
  }, []);

  // ── Projected statewide totals ────────────────────────────────────────────
  const projected = useMemo(() => {
    let estR = 0, estE = 0, estTotal = 0;
    for (const r of ohioTreasurerData) {
      if (r.winner !== null) {
        const p = countyProjection(r, biasInPP);
        estR += p.estRoegner; estE += p.estEdwards; estTotal += p.estTotal;
      }
    }
    const total = estR + estE;
    return {
      roegnerVotes: estR, edwardsVotes: estE, estTotal,
      roegnerPct: total > 0 ? (estR / total) * 100 : 50,
      edwardsPct: total > 0 ? (estE / total) * 100 : 50,
    };
  }, [biasInPP]);

  // ── Statewide remaining-vote split (weighted by remaining vote count) ─────
  const remainingStats = useMemo(() => {
    let totalRemaining = 0, remRoe = 0;
    for (const r of ohioTreasurerData) {
      if (r.winner !== null && r.voteTotal > 0) {
        const rp = r.reportingPct / 100;
        const estTotal = r.voteTotal / rp;
        const remaining = Math.max(0, estTotal - r.voteTotal);
        const adjShare = Math.max(0, Math.min(1, roegnerPct(r) / 100 + biasInPP / 200));
        remRoe += remaining * adjShare;
        totalRemaining += remaining;
      }
    }
    const roeRem = totalRemaining > 0 ? (remRoe / totalRemaining) * 100 : 50;
    const edwRem = 100 - roeRem;
    return { roeRem, edwRem, margin: roeRem - edwRem, totalRemaining };
  }, [biasInPP]);

  const currLeader = current.roegnerPct > current.edwardsPct ? "Roegner" : "Edwards";
  const currMargin = Math.abs(current.roegnerPct - current.edwardsPct);
  const projLeader = projected.roegnerPct > projected.edwardsPct ? "Roegner" : "Edwards";
  const projMargin = Math.abs(projected.roegnerPct - projected.edwardsPct);
  const remLeader  = remainingStats.margin > 0 ? "Roegner" : remainingStats.margin < 0 ? "Edwards" : null;
  const remMargin  = Math.abs(remainingStats.margin);

  function VoteBar({ rPct, ePct }: { rPct: number; ePct: number }) {
    return (
      <div className="h-3 flex rounded-full overflow-hidden" style={{ background: "var(--app-border)" }}>
        <div style={{ width: `${rPct}%`, background: "var(--party-rep, #be1c29)", transition: "width 0.3s" }} />
        <div style={{ width: `${ePct}%`, background: "var(--party-dem, #1b408c)", transition: "width 0.3s" }} />
      </div>
    );
  }

  function Panel({ label, rPct, ePct, rVotes, eVotes, leader, margin, totalVotes, est }: {
    label: string; rPct: number; ePct: number; rVotes: number; eVotes: number;
    leader: string; margin: number; totalVotes: number; est: boolean;
  }) {
    const leaderColor = leader === "Roegner" ? "var(--party-rep, #be1c29)" : "var(--party-dem, #1b408c)";
    return (
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--app-text-muted)" }}>
          {label}
        </div>
        <div className="flex justify-between items-end mb-2">
          <div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--party-rep, #be1c29)" }}>
              {fmtPct(rPct)}
            </div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "var(--party-rep, #be1c29)" }}>
              Roegner · {est ? "~" : ""}{fmtVotes(rVotes)} votes
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--party-dem, #1b408c)" }}>
              {fmtPct(ePct)}
            </div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "var(--party-dem, #1b408c)" }}>
              Edwards · {est ? "~" : ""}{fmtVotes(eVotes)} votes
            </div>
          </div>
        </div>
        <VoteBar rPct={rPct} ePct={ePct} />
        <div className="mt-2 text-xs font-semibold" style={{ color: leaderColor }}>
          {leader} +{margin.toFixed(2)}pp · {est ? "~" : ""}{fmtVotes(totalVotes)} total votes
        </div>
      </div>
    );
  }

  const remLeaderColor = remLeader === "Roegner"
    ? "var(--party-rep, #be1c29)"
    : remLeader === "Edwards"
    ? "var(--party-dem, #1b408c)"
    : "var(--app-text-muted)";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
      {/* Header */}
      <div className="px-5 py-4" style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
        <h3 className="font-semibold text-base" style={{ color: "var(--app-text-primary)" }}>
          Result Extrapolator
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>
          Each county's remaining votes are projected using its current margin · {current.countiesReporting}/88 counties reporting · statewide avg {avgReporting.toFixed(0)}% in
        </p>
      </div>

      {/* Current vs Projected panels */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ background: "var(--app-bg)" }}>
        <div style={{ borderRight: "1px solid var(--app-border)" }}>
          <Panel
            label="Current (reported votes)"
            rPct={current.roegnerPct} ePct={current.edwardsPct}
            rVotes={current.roegnerVotes} eVotes={current.edwardsVotes}
            leader={currLeader} margin={currMargin}
            totalVotes={current.totalVotes} est={false}
          />
        </div>
        <div>
          <Panel
            label="Projected (100% reporting)"
            rPct={projected.roegnerPct} ePct={projected.edwardsPct}
            rVotes={projected.roegnerVotes} eVotes={projected.edwardsVotes}
            leader={projLeader} margin={projMargin}
            totalVotes={projected.estTotal} est
          />
        </div>
      </div>

      {/* Slider control */}
      <div className="px-5 py-4" style={{ background: "var(--app-panel)", borderTop: "1px solid var(--app-border)" }}>
        <div className="text-xs font-semibold mb-3" style={{ color: "var(--app-text-primary)" }}>
          Remaining vote assumption
        </div>

        {/* Remaining-vote readout */}
        <div
          className="rounded-lg px-4 py-3 mb-3 grid grid-cols-3 items-center gap-2"
          style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
        >
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Roegner (remaining)
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: "var(--party-rep, #be1c29)" }}>
              {remainingStats.roeRem.toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Remaining margin
            </div>
            <div className="text-base font-bold" style={{ color: remLeaderColor }}>
              {remLeader ? `${remLeader} +${remMargin.toFixed(1)}pp` : "Even"}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--app-text-muted)" }}>
              {biasInPP === 0
                ? "mirrors reported"
                : `${Math.abs(biasInPP).toFixed(1)}pp shift toward ${biasInPP > 0 ? "Roegner" : "Edwards"}`}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Edwards (remaining)
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: "var(--party-dem, #1b408c)" }}>
              {remainingStats.edwRem.toFixed(1)}%
            </div>
          </div>
        </div>

        <input
          type="range" min={-20} max={20} step={0.1}
          value={biasInPP}
          onChange={(e) => onBiasChange(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: biasInPP > 0 ? "var(--party-rep, #be1c29)" : biasInPP < 0 ? "var(--party-dem, #1b408c)" : "var(--app-text-muted)" }}
        />
        <div className="flex justify-between text-[10px] mt-1 mb-4">
          <span style={{ color: "var(--party-dem, #1b408c)" }}>← Edwards +20pp</span>
          <span style={{ color: "var(--app-text-muted)" }}>Even (mirrors reported)</span>
          <span style={{ color: "var(--party-rep, #be1c29)" }}>Roegner +20pp →</span>
        </div>

        <div className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Methodology: </span>
          Each county's final turnout is estimated by dividing its current vote total by its reporting %.
          At center (0), the remaining votes in every county split at that county's exact current margin —
          so the projected final margin equals the reported margin. Each pp on the slider shifts the
          remaining-vote margin in every county by that many pp toward the selected candidate.
        </div>
      </div>
    </div>
  );
}

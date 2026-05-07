"use client";

import { useState, useEffect } from "react";
import OhioCountyMap from "@/components/OhioCountyMap";
import OhioTreasurerTable from "@/components/OhioTreasurerTable";
import OhioTreasurerExtrapolator from "@/components/OhioTreasurerExtrapolator";
import { ohioTreasurerData, roegnerVotes, edwardsVotes } from "@/data/ohioTreasurerData";

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export default function OhioTreasurerContent() {
  const darkMode = useDarkMode();
  const [biasInPP, setBiasInPP] = useState(0);

  const reporting = ohioTreasurerData.filter(r => r.winner !== null);
  const totalVotes  = reporting.reduce((s, r) => s + r.voteTotal, 0);
  const totalR = reporting.reduce((s, r) => s + roegnerVotes(r), 0);
  const totalE = reporting.reduce((s, r) => s + edwardsVotes(r), 0);
  const total  = totalR + totalE;
  const rPct   = total > 0 ? (totalR / total) * 100 : 0;
  const ePct   = total > 0 ? (totalE / total) * 100 : 0;
  const leader = totalR > totalE ? "Roegner" : totalE > totalR ? "Edwards" : null;
  const leaderMargin = Math.abs(rPct - ePct);
  const countiesReporting = reporting.length;

  const leaderColor = leader === "Roegner"
    ? "var(--party-rep, #be1c29)"
    : leader === "Edwards"
    ? "var(--party-dem, #1b408c)"
    : "var(--app-text-primary)";

  return (
    <>
      {/* Summary stat tiles — mirrors OH31AnalysisContent vote-total card style */}
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--app-border)", background: "var(--app-bg)" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4">
          {[
            {
              label: "Leader",
              value: leader ?? "Tied",
              sub: leader ? `+${leaderMargin.toFixed(2)}pp` : "—",
              valueStyle: { color: leaderColor },
            },
            {
              label: "Roegner",
              value: `${rPct.toFixed(2)}%`,
              sub: `${totalR.toLocaleString()} votes`,
              valueStyle: { color: "var(--party-rep, #be1c29)" },
            },
            {
              label: "Edwards",
              value: `${ePct.toFixed(2)}%`,
              sub: `${totalE.toLocaleString()} votes`,
              valueStyle: { color: "var(--party-dem, #1b408c)" },
            },
            {
              label: "Counties Reporting",
              value: `${countiesReporting}/88`,
              sub: `${totalVotes.toLocaleString()} votes in`,
              valueStyle: { color: "var(--app-text-primary)" },
            },
          ].map(({ label, value, sub, valueStyle }, i) => (
            <div
              key={label}
              className="px-4 md:px-5 py-3 md:py-4"
              style={{ borderRight: i < 3 ? "1px solid var(--app-border)" : undefined }}
            >
              <div className="text-[10px] md:text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
                {label}
              </div>
              <div className="text-lg md:text-2xl font-bold tabular-nums leading-none" style={valueStyle}>
                {value}
              </div>
              <div className="text-[11px] mt-1 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                {sub}
              </div>
            </div>
          ))}
        </div>

        {/* Vote bar */}
        <div className="px-5 pb-4 pt-2" style={{ borderTop: "1px solid var(--app-border)" }}>
          <div className="flex h-2 rounded-full overflow-hidden" style={{ background: "var(--app-border)" }}>
            <div style={{ width: `${rPct}%`, background: "var(--party-rep, #be1c29)", transition: "width 0.4s" }} />
            <div style={{ width: `${ePct}%`, background: "var(--party-dem, #1b408c)", transition: "width 0.4s" }} />
          </div>
          <div className="flex justify-between text-xs mt-1.5 font-medium tabular-nums">
            <span style={{ color: "var(--party-rep, #be1c29)" }}>Roegner {rPct.toFixed(1)}%</span>
            <span style={{ color: "var(--party-dem, #1b408c)" }}>Edwards {ePct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
          County Map
        </h2>
        <OhioCountyMap darkMode={darkMode} biasInPP={biasInPP} />
        <div
          className="mt-4 mb-4 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
        >
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Showing
            </div>
            <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
              Treasurer Primary County Results
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Statewide Margin
            </div>
            <div
              className="text-sm font-semibold tabular-nums"
              style={{ color: leaderColor }}
            >
              {leader ? `${leader}+${leaderMargin.toFixed(1)}%` : "Tied"}
            </div>
          </div>
        </div>
      </section>

      {/* Extrapolator */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
          Result Extrapolator
        </h2>
        <OhioTreasurerExtrapolator biasInPP={biasInPP} onBiasChange={setBiasInPP} />
      </section>

      {/* County Results Table */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
          County Results
        </h2>
        <OhioTreasurerTable />
      </section>
    </>
  );
}

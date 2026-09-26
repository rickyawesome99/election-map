// Page header for a precinct-district page: name, where it is, the 2026 status line, and the
// four numbers a reader wants first. Server component; everything is precomputed by the page.

import BackButton from "@/components/BackButton";
import { fmtMargin } from "@/lib/colorScale";
import type { DistrictConfig } from "@/lib/precinctDistrict/types";

export interface HeaderStats {
  latestYear: number;
  presYear: number | null;
  presMargin: number | null;          // R-positive
  leanVsState: number | null;         // district pres margin − state pres margin (R-positive)
  stateName: string;
  legMargin: number | null;           // latest State House margin, R-positive
  legLabel: string;                   // "2024 State Rep"
  legCandidates: string | null;       // "Roemer (R) over Harris (D)"
  registered: number;
  ballots: number;
  turnout: number | null;
  precincts: number;
}

function marginColor(v: number | null): string {
  if (v == null || Math.abs(v) < 0.05) return "var(--app-text-primary)";
  return v > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

export default function DistrictHeader({ config, stats }: { config: DistrictConfig; stats: HeaderStats }) {
  const heroMargin = stats.legMargin ?? stats.presMargin;
  const heroIsD = heroMargin != null && heroMargin <= 0;
  const e = config.election2026;
  const dName = e?.candidates?.d?.name;
  const rName = e?.candidates?.r?.name;

  return (
    <div style={{ background: heroMargin != null ? `linear-gradient(135deg, color-mix(in srgb, ${heroIsD ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)` : "var(--app-bg)" }}>
      <div className="mx-auto max-w-7xl px-4 pb-6 pt-3 sm:px-6 sm:pb-8">
        <div className="mb-5 -ml-2"><BackButton /></div>

        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{config.state}</span>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}>
              {config.chamber === "house" ? "House" : "Senate"} District {config.number}
            </h1>
          </div>
          {e && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
                {e.status === "open" ? "Open seat" : "Incumbent"} · {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              {dName && rName && (
                <span style={{ color: "var(--app-text-primary)" }}>
                  <b style={{ color: "var(--party-dem)" }}>{dName}</b> (D) vs <b style={{ color: "var(--party-rep)" }}>{rName}</b> (R)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
          <Stat value={stats.presMargin == null ? "—" : fmtMargin(stats.presMargin)} color={marginColor(stats.presMargin)} label={`${stats.presYear ?? ""} President`} />
          <Stat value={stats.leanVsState == null ? "—" : `${fmtMargin(stats.leanVsState)}`} color={marginColor(stats.leanVsState)} label={`vs ${stats.stateName}, ${stats.presYear ?? ""} President`} />
          <Stat value={stats.ballots.toLocaleString()} label={`Ballots, ${stats.latestYear}`} />
          <Stat value={stats.turnout == null ? "—" : `${stats.turnout.toFixed(1)}%`} label="Turnout" />
          <Stat value={stats.registered.toLocaleString()} label="Registered" last />
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, color, last }: { value: string; label: string; color?: string; last?: boolean }) {
  return (
    <div className={last ? "" : "pr-8"} style={last ? undefined : { borderRight: "1px solid var(--app-border)" }}>
      <div className="text-2xl font-extrabold tabular-nums" style={{ color: color ?? "var(--app-text-primary)" }}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{label}</div>
    </div>
  );
}

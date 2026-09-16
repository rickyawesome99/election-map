"use client";

import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { computeTrumpApprovalAverage, APPROVE_COLOR, DISAPPROVE_COLOR } from "@/lib/trumpApprovalAverage";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "./ForecastMap";
import { houseForecasts, senateForecasts, governorForecasts, seatTotals, getChamberSimulations } from "@/lib/forecast";
import type { DARK_THEME } from "./ForecastMap";

type Theme = typeof DARK_THEME;

function fmtGbDiff(diff: number): string {
  if (Math.abs(diff) < 0.05) return "EVEN";
  return diff < 0 ? `D+${Math.abs(diff).toFixed(1)}` : `R+${diff.toFixed(1)}`;
}

function fmtApprovalDiff(diff: number): string {
  if (Math.abs(diff) < 0.05) return "EVEN";
  return diff < 0 ? `Approve +${Math.abs(diff).toFixed(1)}` : `Disapprove +${diff.toFixed(1)}`;
}

function ChevronIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function TileShell({ href, children }: { href?: string; children: React.ReactNode }) {
  const inner = (
    <div className="h-full min-w-0 px-3 py-4 flex flex-col sm:px-4">
      {children}
    </div>
  );
  if (!href) return <div className="min-w-0 h-full">{inner}</div>;
  return (
    <a href={href} className="block h-full min-w-0 transition-opacity hover:opacity-70">
      {inner}
    </a>
  );
}

function MarginTile({ theme: t, label, value, color, caption }: { theme: Theme; label: string; value: string; color: string; caption: string }) {
  return (
    <TileShell>
      <div className="min-h-[2.2em] text-[10px] uppercase tracking-[0.1em] font-bold" style={{ color: t.textMuted }}>{label}</div>
      <div className="flex-1 flex flex-col justify-end">
        <div className="text-2xl sm:text-3xl font-bold leading-[1.05] tracking-tight break-words" style={{ color }}>{value}</div>
        <div className="mt-1.5 text-[11px] font-medium" style={{ color: t.textMuted }}>{caption}</div>
      </div>
    </TileShell>
  );
}

function SeatTile({
  theme: t, label, href, dem, rep, expectedDem, lo80, hi80, pDemControl, total,
}: { theme: Theme; label: string; href: string; dem: number; rep: number; expectedDem: number; lo80: number; hi80: number; pDemControl: number | null; total: number }) {
  return (
    <TileShell href={href}>
      <div className="min-h-[2.2em] flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-[0.1em] font-bold" style={{ color: t.textMuted }}>{label}</div>
        <span style={{ color: t.textVeryMuted }}><ChevronIcon /></span>
      </div>
      <div className="flex-1 flex flex-col justify-end">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-2xl sm:text-3xl font-bold leading-none tracking-tight" style={{ color: t.demText }}>{dem}</span>
            <span className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: t.demText }}>Dem</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-2xl sm:text-3xl font-bold leading-none tracking-tight" style={{ color: t.repText }}>{rep}</span>
            <span className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: t.repText }}>Rep</span>
          </div>
        </div>
        <div className="mt-3 flex h-1 w-full overflow-hidden rounded-full" style={{ background: t.tabBg }} aria-hidden="true">
          <span style={{ width: `${(dem / total) * 100}%`, background: t.demText }} />
          <span style={{ width: `${(rep / total) * 100}%`, background: t.repText }} />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] font-medium" style={{ color: t.textVeryMuted }}>
          <span title="Simulated Democratic seats: mean and 80% interval">Expected {expectedDem.toFixed(1)} D · 80% {lo80}–{hi80}</span>
          <span>{total} total seats</span>
        </div>
        {pDemControl != null && (
          <div className="mt-1 text-[10px] font-semibold" style={{ color: pDemControl >= 0.5 ? t.demText : t.repText }} title="Share of simulations in which each party controls the chamber">
            {pDemControl >= 0.5 ? `D control ${Math.round(pDemControl * 100)}%` : `R control ${Math.round((1 - pDemControl) * 100)}%`}
          </div>
        )}
      </div>
    </TileShell>
  );
}

export default function OverviewDashboard({ theme: t }: { theme: Theme }) {
  const gb = computeGenericBallotAverage(new Date());
  const approval = computeTrumpApprovalAverage(new Date());

  const house = seatTotals(houseForecasts, SEAT_HOLDOVERS.house);
  const senate = seatTotals(senateForecasts, SEAT_HOLDOVERS.senate);
  const governor = seatTotals(governorForecasts, SEAT_HOLDOVERS.governor);
  const sims = getChamberSimulations();

  const gbColor = gb.diff < 0 ? "var(--party-dem)" : gb.diff > 0 ? "var(--party-rep)" : t.textPrimary;
  const approvalColor = approval.diff < 0 ? APPROVE_COLOR : approval.diff > 0 ? DISAPPROVE_COLOR : t.textPrimary;

  return (
    <section className="rounded-2xl px-4 py-5 w-full sm:px-6 sm:py-6" style={{ border: `1px solid ${t.border}`, background: t.panel }}>
      <div className="mb-4">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl" style={{ color: t.textPrimary }}>
          2026 Dashboard
        </h2>
        <p className="mt-1 text-xs sm:text-sm" style={{ color: t.textMuted }}>
          National polling and projected balance of power
        </p>
      </div>

      <div
        className="grid grid-cols-2 [&>*+*]:border-l"
        style={{ borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`, color: t.border }}
      >
        <MarginTile
          theme={t}
          label="Generic Ballot"
          value={fmtGbDiff(gb.diff)}
          color={gbColor}
          caption={`D ${gb.dem.toFixed(1)}% · R ${gb.rep.toFixed(1)}%`}
        />
        <MarginTile
          theme={t}
          label="President Approval"
          value={fmtApprovalDiff(approval.diff)}
          color={approvalColor}
          caption={`App ${approval.approve.toFixed(1)}% · Dis ${approval.disapprove.toFixed(1)}%`}
        />
      </div>

      <div
        className="grid grid-cols-3 [&>*+*]:border-l"
        style={{ borderBottom: `1px solid ${t.border}`, color: t.border }}
      >
        <SeatTile theme={t} label="House" href="/house" dem={house.called.dem} rep={house.called.rep} expectedDem={sims.house.meanDem} lo80={sims.house.lo80} hi80={sims.house.hi80} pDemControl={sims.house.pDemControl} total={TOTAL_SEATS_BY_TYPE.house} />
        <SeatTile theme={t} label="Senate" href="/senate" dem={senate.called.dem} rep={senate.called.rep} expectedDem={sims.senate.meanDem} lo80={sims.senate.lo80} hi80={sims.senate.hi80} pDemControl={sims.senate.pDemControl} total={TOTAL_SEATS_BY_TYPE.senate} />
        <SeatTile theme={t} label="Governor" href="/governor" dem={governor.called.dem} rep={governor.called.rep} expectedDem={sims.governor.meanDem} lo80={sims.governor.lo80} hi80={sims.governor.hi80} pDemControl={sims.governor.pDemControl} total={TOTAL_SEATS_BY_TYPE.governor} />
      </div>
    </section>
  );
}

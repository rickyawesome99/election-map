"use client";

import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { computeTrumpApprovalAverage, APPROVE_COLOR, DISAPPROVE_COLOR } from "@/lib/trumpApprovalAverage";
import {
  projectedHouseData, projectedSenateData, projectedGovernorData,
  SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE,
} from "./ForecastMap";
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

function seatTotals(data: { margin: number }[], holdover: { dem: number; rep: number }) {
  const dem = holdover.dem + data.filter((r) => r.margin <= 0).length;
  const rep = holdover.rep + data.filter((r) => r.margin > 0).length;
  return { dem, rep };
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
  theme: t, label, href, dem, rep, total,
}: { theme: Theme; label: string; href: string; dem: number; rep: number; total: number }) {
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
        <div className="mt-1.5 text-right text-[10px] font-medium" style={{ color: t.textVeryMuted }}>{total} total seats</div>
      </div>
    </TileShell>
  );
}

export default function OverviewDashboard({ theme: t }: { theme: Theme }) {
  const gb = computeGenericBallotAverage(new Date());
  const approval = computeTrumpApprovalAverage(new Date());

  const house = seatTotals(projectedHouseData, SEAT_HOLDOVERS.house);
  const senate = seatTotals(projectedSenateData, SEAT_HOLDOVERS.senate);
  const governor = seatTotals(projectedGovernorData, SEAT_HOLDOVERS.governor);

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
        <SeatTile theme={t} label="House" href="/house" dem={house.dem} rep={house.rep} total={TOTAL_SEATS_BY_TYPE.house} />
        <SeatTile theme={t} label="Senate" href="/senate" dem={senate.dem} rep={senate.rep} total={TOTAL_SEATS_BY_TYPE.senate} />
        <SeatTile theme={t} label="Governor" href="/governor" dem={governor.dem} rep={governor.rep} total={TOTAL_SEATS_BY_TYPE.governor} />
      </div>
    </section>
  );
}

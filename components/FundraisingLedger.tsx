import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import type { RaceFinanceDetail } from "@/data/fundraisingData";

// The race pages' Fundraising section, in its own file so client components (the state-legislature
// district view) can use it without pulling RaceDetailSections.tsx and the compute hub into the bundle.

const LEDGER_ROW_STYLE = { borderBottom: "1px solid var(--app-border)" } as const;

export function partyAccent(party: "D" | "R" | "I") {
  if (party === "R") return "var(--party-rep)";
  if (party === "I") return "var(--party-ind)";
  return "var(--party-dem)";
}

// A figure inside the Forecast Calculation's serif sentence: set in the sans, in its party color.
export function LedgerFig({ color, children }: { color: string; children: ReactNode }) {
  return <b className="font-bold tabular-nums" style={{ color }}>{children}</b>;
}

// ── Fundraising ───────────────────────────────────────────────────────────────
// Cycle-to-date receipts for the two general-election candidates, shown as a share
// split. Numbers come from data/fundraisingData.ts (FEC filings for House/Senate,
// state filings for governors — see the source line). A null side means the race
// isn't sourced yet, and the section says so rather than showing a one-sided total.

export function formatReceipts(v: number): string {
  if (v >= 100_000_000) return `$${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `$${Math.round(v / 1_000)}K`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

export function FundraisingLedgerSection({
  dem,
  rep,
  demName,
  repName,
  source,
  pendingNote,
  fundraisingPts,
  typicalGapPct,
  detail,
  footnote,
  animateBar = false,
  summaryExtra,
}: {
  // Whole dollars raised; null on either side = not yet sourced.
  dem: number | null;
  rep: number | null;
  demName?: string;
  repName?: string;
  source?: string | null;
  // Replaces the default House/Senate source line (state-legislature pages cite a state portal).
  footnote?: ReactNode;
  // State-legislature extras: bar segments grow in (the race pages' vote-bar motion) and name
  // their candidate on hover, and a sentence appended to the summary (the two-party money gap).
  animateBar?: boolean;
  summaryExtra?: ReactNode;
  // Why the numbers are missing, e.g. governors filing with the state, not the FEC.
  pendingNote?: string;
  // The race's FF points in the forecast, R-positive (see raceMoneyTerm).
  fundraisingPts?: number | null;
  // The receipts gap a generic pair of nominees in this situation would have (R-positive %);
  // the forecast pays points only on the gap beyond it (see raceMoneyTerm).
  typicalGapPct?: number | null;
  // FEC cash on hand / spending / outside spending / small-dollar share (House/Senate only).
  detail?: RaceFinanceDetail | null;
}) {
  const typical = typicalGapPct == null ? null : Math.abs(typicalGapPct) < 0.5 ? "an even split" : `${typicalGapPct > 0 ? "R" : "D"}+${Math.abs(typicalGapPct).toFixed(0)}%`;
  if (dem == null || rep == null) {
    return (
      <div>
        <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>
          Fundraising TBD{pendingNote ? ` — ${pendingNote}` : ""}.
        </p>
        {typical && (
          <p className="text-sm mt-2" style={{ color: "var(--app-text-muted)" }}>
            Until receipts are on file the forecast assumes the typical money gap for a race like this ({typical} of
            receipts), which adds no points either way.
          </p>
        )}
      </div>
    );
  }

  const total = dem + rep;
  const demShare = total > 0 ? (dem / total) * 100 : 50;
  const leader = dem === rep ? null : dem > rep ? "D" : "R";
  const gap = Math.abs(dem - rep);
  const ffPts = fundraisingPts ?? null;
  const ffDisplay = ffPts == null ? null
    : Math.abs(ffPts) < 0.05 ? null
    : `${ffPts > 0 ? "R" : "D"}+${Math.abs(ffPts).toFixed(1)}`;
  // The typical gap (R share − D share) as a D-share position on the split bar.
  const typicalDemShare = typicalGapPct == null ? null : Math.min(100, Math.max(0, 50 - typicalGapPct / 2));
  const surname = (n: string | undefined, fallback: string) => (n ? n.replace(/\s*\(.*\)\s*$/, "").trim().split(/\s+/).slice(-1)[0] : fallback);
  const sides = [
    { party: "D" as const, name: demName ?? "Democrat", short: surname(demName, "the Democrat"), amount: dem, share: demShare },
    { party: "R" as const, name: repName ?? "Republican", short: surname(repName, "the Republican"), amount: rep, share: 100 - demShare },
  ];
  const [lead, trail] = leader === "R" ? [sides[1], sides[0]] : [sides[0], sides[1]];
  const reportNote = detail ? financeReportNote(detail) : null;

  return (
    <div>
      {/* One split bar instead of a row per candidate, so it doesn't read like the candidates section. */}
      <div className="flex items-end justify-between gap-6">
        {sides.map((side) => (
          <div key={side.party} className={`min-w-0 ${side.party === "R" ? "text-right" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: "var(--app-text-muted)" }}>
              {side.name} ({side.party})
            </div>
            <div className="mt-1 flex items-baseline gap-2 tabular-nums" style={{ justifyContent: side.party === "R" ? "flex-end" : "flex-start" }}>
              <span
                style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(1.6rem, 4vw, 1.9rem)", lineHeight: 1, color: partyAccent(side.party) }}
                title={`$${side.amount.toLocaleString()}`}
              >
                {formatReceipts(side.amount)}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{side.share.toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-4" style={{ height: 22 }}>
        <div className="absolute inset-x-0 flex overflow-hidden rounded-full" style={{ top: 7, height: 8 }}>
          <div className={animateBar ? "vh-bar-d" : undefined} title={animateBar ? `${sides[0].name}: ${formatReceipts(dem)}` : undefined} style={{ width: `${demShare}%`, background: partyAccent("D"), animationDelay: animateBar ? "120ms" : undefined }} />
          <div className={animateBar ? "vh-bar-r" : undefined} title={animateBar ? `${sides[1].name}: ${formatReceipts(rep)}` : undefined} style={{ width: `${100 - demShare}%`, background: partyAccent("R"), animationDelay: animateBar ? "120ms" : undefined }} />
        </div>
        {/* 50% mark, dashed like the Forecast Calculation's even line */}
        <div className="absolute" style={{ left: "50%", top: 0, height: 22, borderLeft: "1px dashed var(--app-text-very-muted)" }} />
        {typicalDemShare != null && (
          <div
            className="absolute rounded-sm"
            style={{ left: `${typicalDemShare}%`, top: 1, height: 20, width: 4, transform: "translateX(-50%)", background: "var(--app-text-primary)", border: "1px solid var(--app-bg)" }}
            title={`Typical split for a race like this: ${typical}`}
          />
        )}
      </div>
      {typicalDemShare != null && (
        <div className="relative h-4 mt-1">
          <span
            className="absolute text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap tabular-nums"
            style={{
              left: `${typicalDemShare}%`,
              transform: `translateX(${typicalDemShare < 15 ? "0" : typicalDemShare > 85 ? "-100%" : "-50%"})`,
              color: "var(--app-text-muted)",
            }}
          >
            Typical · {typical}
          </span>
        </div>
      )}

      <p className="mt-3 text-sm" style={{ lineHeight: 1.5, color: "var(--app-text-muted)", textWrap: "pretty" }}>
        {leader ? (
          <>{lead.short} has out-raised {trail.short} by <LedgerFig color={partyAccent(lead.party)}>{formatReceipts(gap)}</LedgerFig>, of <LedgerFig color="var(--app-text-primary)">{formatReceipts(total)}</LedgerFig> raised in all.</>
        ) : (
          <>The two campaigns have raised the same amount, <LedgerFig color="var(--app-text-primary)">{formatReceipts(total)}</LedgerFig> in all.</>
        )}
        {summaryExtra}
        {fundraisingPts != null && (
          <>
            {" "}{typical ? <>Measured against the typical split for a race like this, </> : null}
            {ffDisplay
              ? <>{typical ? "the" : "The"} forecast counts it as <LedgerFig color={partyAccent(ffPts! > 0 ? "R" : "D")}>{ffDisplay}</LedgerFig>.</>
              : <>{typical ? "it" : "It"} moves the forecast by no points.</>}
          </>
        )}
      </p>

      {detail && <FinanceDetailCells detail={detail} />}

      <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
        {footnote ?? <>Candidate-committee receipts, cycle to date{source ? ` · ${source}` : ""}.</>}
        {reportNote && ` ${reportNote}.`}
        {(dem === 0 || rep === 0) && " $0 means no filings on record."}
      </p>
    </div>
  );
}

function formatAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Campaigns file on their own schedules, so the two sides' reports can end on different dates.
function financeReportNote(detail: RaceFinanceDetail): string | null {
  const dEnd = formatAsOf(detail.dem?.coverageEnd ?? null), rEnd = formatAsOf(detail.rep?.coverageEnd ?? null);
  const reportThrough = dEnd && rEnd && dEnd !== rEnd ? `${dEnd} (D) and ${rEnd} (R)` : dEnd ?? rEnd;
  const ieThrough = formatAsOf(detail.ieThrough);
  const parts = [reportThrough && `Campaign reports through ${reportThrough}`, ieThrough && `outside spending filed through ${ieThrough}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// Cash on hand, spending, outside spending and small-dollar share, D · R per cell, laid out (and
// tinted on hover) like the Forecast Calculation's term cells. Outside spending on a side = independent expenditures supporting
// that candidate plus those opposing the opponent, so the two figures read as "help" for each side.
function FinanceDetailCells({ detail }: { detail: RaceFinanceDetail }) {
  const d = detail.dem, r = detail.rep;
  const help = (own?: RaceFinanceDetail["dem"], opp?: RaceFinanceDetail["dem"]) =>
    own || opp ? (own?.ieFor ?? 0) + (opp?.ieAgainst ?? 0) : null;
  const pct = (v: number | null | undefined) => (v == null ? null : `${Math.round(v * 100)}%`);
  const money = (v: number | null | undefined) => (v == null ? null : formatReceipts(v));
  const rows: { label: string; tip: string; dem: string | null; rep: string | null }[] = [
    { label: "Cash on hand", tip: "Cash in the bank at the end of each campaign's latest FEC report.", dem: money(d?.cashOnHand), rep: money(r?.cashOnHand) },
    { label: "Spent", tip: "Campaign disbursements this cycle to date.", dem: money(d?.spent), rep: money(r?.spent) },
    {
      label: "Outside spending",
      tip: "Independent expenditures by super PACs, parties and other groups that support the candidate or oppose their opponent, from 24/48-hour FEC reports (whole cycle, primaries included).",
      dem: money(help(d, r)), rep: money(help(r, d)),
    },
    { label: "Small-dollar share", tip: "Share of individual contributions given in amounts under $200 (unitemized).", dem: pct(d?.smallDollarShare), rep: pct(r?.smallDollarShare) },
  ];
  const visible = rows.filter((row) => row.dem != null || row.rep != null);
  if (!visible.length) return null;
  return (
    <div className="mt-1.5" style={LEDGER_ROW_STYLE}>
    <div className="-mx-2 grid grid-cols-2 md:grid-flow-col md:auto-cols-fr md:grid-cols-none">
      {visible.map((row) => (
        <div key={row.label} className="vh-row vh-row-boxed flex flex-col gap-1 px-2 py-2.5 hover:z-10 focus-within:z-10">
          <InfoTooltip label={row.label}>{row.tip}</InfoTooltip>
          <span className="text-xl font-bold leading-tight tabular-nums whitespace-nowrap" style={{ fontFamily: "var(--font-serif)" }}>
            <span style={{ color: partyAccent("D") }}>{row.dem ?? "—"}</span>
            <span className="mx-1.5 text-base" style={{ color: "var(--app-text-very-muted)" }}>·</span>
            <span style={{ color: partyAccent("R") }}>{row.rep ?? "—"}</span>
          </span>
        </div>
      ))}
    </div>
    </div>
  );
}

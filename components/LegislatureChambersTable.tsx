"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Segmented from "@/components/MarketSegmented";
import { CHAMBER_OUTCOMES, OUTCOME_LABEL, outcomeColor, type ChamberOutcome } from "@/lib/chamberOutcome";

// The /legislatures Chambers table. The page builds these slim rows on the server (the full
// projections carry every district), and the table only sorts and draws them.

export type ChamberRow = {
  key: string;
  stateName: string;
  href: string;
  label: string;
  /** "house" / "senate": the A–Z tiebreak inside a state. */
  chamber: string;
  seatsUp: number;
  totalSeats: number | null;
  now: { dem: number; rep: number; oth: number } | null;
  expectedDem: number;
  expectedRep: number;
  expectedOth: number;
  lo80: number;
  hi80: number;
  majority: number | null;
  pDem: number | null;
  pRep: number | null;
  supermajority: number | null;
  /** Majority status of the "Now" seats. */
  nowStatus: ChamberOutcome | null;
  /** Share of simulations ending in each status; null where control odds are withheld. */
  outcomes: Record<ChamberOutcome, number> | null;
  unopposed: number;
  unprojected: number;
};

type Sort = "competitive" | "dem" | "rep" | "alpha";

const SORTS: [Sort, string][] = [["competitive", "Competitive"], ["dem", "Most D"], ["rep", "Most R"], ["alpha", "A–Z"]];

export const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);

const totalOf = (r: ChamberRow) => r.totalSeats ?? r.expectedDem + r.expectedRep + r.expectedOth;

/** A 100% bar split into parts, 2px surface gaps between them and rounded outer ends. */
export function SplitBar({ parts, height }: { parts: { value: number; color: string; title: string }[]; height: number }) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="flex gap-[2px] overflow-hidden rounded" style={{ height }}>
      {shown.map((p) => <span key={p.title} title={p.title} style={{ flexGrow: p.value, flexBasis: 0, minWidth: 2, background: p.color }} />)}
    </div>
  );
}

/** Projected composition of the whole chamber (holdovers included): D | other | R on one bar, the
 *  majority line as a tick, and the 80% range of Democratic seats as a whisker above it. */
function SeatsCell({ r }: { r: ChamberRow }) {
  const total = totalOf(r);
  const at = (n: number) => `${Math.min(100, Math.max(0, (n / total) * 100))}%`;
  return (
    <div title={`Projected ${r.expectedDem.toFixed(1)} D – ${r.expectedRep.toFixed(1)} R${r.expectedOth >= 0.05 ? ` – ${r.expectedOth.toFixed(1)} other` : ""} of ${total}; 80% of simulations give Democrats ${r.lo80}–${r.hi80}${r.majority ? `; majority ${r.majority}` : ""}`}>
      <div className="flex items-baseline justify-between gap-2 whitespace-nowrap text-xs tabular-nums">
        <span style={{ color: "var(--party-dem)" }}><b className="text-sm">{r.expectedDem.toFixed(1)}</b> <span style={{ color: "var(--app-text-very-muted)" }}>({r.lo80}–{r.hi80})</span></span>
        <b className="text-sm" style={{ color: "var(--party-rep)" }}>{r.expectedRep.toFixed(1)}</b>
      </div>
      <div className="relative mt-1.5">
        <span aria-hidden className="absolute -top-[5px] h-[3px] rounded-full" style={{ left: at(r.lo80), width: `calc(${at(r.hi80)} - ${at(r.lo80)})`, background: "var(--app-text-muted)" }} />
        <SplitBar height={8} parts={[
          { value: r.expectedDem, color: "var(--party-dem)", title: "Democratic" },
          { value: r.expectedOth, color: "var(--party-ind)", title: "Other" },
          { value: r.expectedRep, color: "var(--party-rep)", title: "Republican" },
          // Seats with no projection (no listed field, no lean) keep the bar on the full chamber.
          { value: Math.max(0, total - r.expectedDem - r.expectedOth - r.expectedRep), color: "var(--app-border)", title: "No projection" },
        ]} />
        {r.majority != null && <span aria-hidden className="absolute -bottom-[3px] -top-[7px] w-px" style={{ left: at(r.majority), background: "var(--app-text-primary)" }} />}
      </div>
    </div>
  );
}

/** The favored party's chance of control; the hover adds the other side and any chance of a tie. */
function OddsCell({ d, r, className = "font-semibold" }: { d: number | null; r: number | null; className?: string }) {
  if (d == null || r == null) return <span style={{ color: "var(--app-text-muted)" }}>—</span>;
  const none = Math.max(0, 1 - d - r);
  return (
    <span className={`tabular-nums ${className}`} title={`P(D control) ${pct(d)} · P(R control) ${pct(r)}${none >= 0.005 ? ` · neither ${pct(none)}` : ""}`}
      style={{ color: d === r ? "var(--app-text-muted)" : d > r ? "var(--party-dem)" : "var(--party-rep)" }}>
      {d === r ? `Even · ${pct(d)}` : d > r ? `${pct(d)} D` : `${pct(r)} R`}
    </span>
  );
}

/** Projected net seat change against "Now", in whole seats, credited to the party that gains:
 *  the side whose projected seats rise more than the other's (a D→R swap moves both). */
function NetCell({ r }: { r: ChamberRow }) {
  if (!r.now) return <span style={{ color: "var(--app-text-muted)" }}>—</span>;
  const dDelta = r.expectedDem - r.now.dem;
  const rDelta = r.expectedRep - r.now.rep;
  const demGains = dDelta - rDelta > 0;
  const seats = Math.round(demGains ? dDelta : rDelta);
  const title = `Projected ${r.expectedDem.toFixed(1)} D – ${r.expectedRep.toFixed(1)} R vs ${r.now.dem} D – ${r.now.rep} R now`;
  if (seats <= 0) return <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }} title={title}>0</span>;
  return <span className="font-semibold tabular-nums" style={{ color: demGains ? "var(--party-dem)" : "var(--party-rep)" }} title={title}>+{seats} {demGains ? "D" : "R"}</span>;
}

/** Hold or flip: who controls the chamber now (more seats in "Now") against the party favored to
 *  control it after the election. A chamber tied now has no holder, so either favorite is a flip. */
function outlookOf(r: ChamberRow): { party: "D" | "R"; flip: boolean } | null {
  if (r.pDem == null || r.pRep == null || !r.now || r.pDem === r.pRep) return null;
  const party = r.pDem > r.pRep ? "D" : "R";
  const holder = r.now.dem > r.now.rep ? "D" : r.now.rep > r.now.dem ? "R" : null;
  return { party, flip: holder !== party };
}

const partyColor = (p: "D" | "R") => (p === "D" ? "var(--party-dem)" : "var(--party-rep)");

/** Flips are a solid pill; holds are party-colored text, or a tinted pill on the phone cards. */
function OutlookCell({ r, pill = false }: { r: ChamberRow; pill?: boolean }) {
  const o = outlookOf(r);
  if (!o) return <span style={{ color: "var(--app-text-muted)" }}>—</span>;
  const color = partyColor(o.party);
  const label = `${o.party} ${o.flip ? "Flip" : "Hold"}`;
  // Sized like the forecast's RatingPill (10px semibold).
  if (o.flip) return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: color, color: "#fff" }}>{label}</span>;
  if (pill) return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${color} 14%, var(--app-bg))`, color }}>{label}</span>;
  return <span className="whitespace-nowrap font-semibold" style={{ color }}>{label}</span>;
}

/** The status the chamber is likeliest to end in, with its chance; the hover lists every status. */
function ProjectedStatusCell({ r }: { r: ChamberRow }) {
  if (!r.outcomes) return <span style={{ color: "var(--app-text-muted)" }}>—</span>;
  const o = r.outcomes;
  const top = CHAMBER_OUTCOMES.reduce((a, b) => (o[b] > o[a] ? b : a));
  const title = CHAMBER_OUTCOMES.filter((x) => o[x] >= 0.0005).map((x) => `${OUTCOME_LABEL[x]} ${o[x] < 0.005 ? "<1%" : pct(o[x])}`).join(" · ")
    + (r.supermajority != null ? ` (supermajority ${r.supermajority}${r.majority ? `, majority ${r.majority}` : ""})` : "");
  return (
    <span className="whitespace-nowrap tabular-nums" title={title}>
      <span className="font-semibold" style={{ color: outcomeColor(top) ?? "var(--app-text-muted)" }}>{OUTCOME_LABEL[top]}</span>
      <span style={{ color: "var(--app-text-muted)" }}> {o[top] > 0.995 ? ">99%" : pct(o[top])}</span>
    </span>
  );
}

function NowStatus({ s }: { s: ChamberOutcome | null }) {
  if (!s) return null;
  return <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: outcomeColor(s) ?? "var(--app-text-muted)" }}>{OUTCOME_LABEL[s]}</div>;
}

/** The chamber today: D–R(–other). */
function NowSplit({ now }: { now: ChamberRow["now"] }) {
  if (!now) return <>—</>;
  return <><span style={{ color: "var(--party-dem)" }}>{now.dem}</span>–<span style={{ color: "var(--party-rep)" }}>{now.rep}</span>{now.oth ? <span style={{ color: "var(--party-ind)" }}>–{now.oth}</span> : null}</>;
}

function MiniLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[10px] font-semibold uppercase tracking-wider ${className}`} style={{ color: "var(--app-text-very-muted)" }}>{children}</div>;
}

export default function LegislatureChambersTable({ rows }: { rows: ChamberRow[] }) {
  const [sort, setSort] = useState<Sort>("competitive");
  // Every party sort reads the projected composition as a share of the whole chamber.
  const sorted = useMemo(() => {
    const dShare = (r: ChamberRow) => r.expectedDem / totalOf(r);
    const rShare = (r: ChamberRow) => r.expectedRep / totalOf(r);
    const alpha = (a: ChamberRow, b: ChamberRow) => a.stateName.localeCompare(b.stateName) || a.chamber.localeCompare(b.chamber);
    const list = [...rows];
    if (sort === "alpha") list.sort(alpha);
    else if (sort === "dem") list.sort((a, b) => dShare(b) - dShare(a) || alpha(a, b));
    else if (sort === "rep") list.sort((a, b) => rShare(b) - rShare(a) || alpha(a, b));
    else list.sort((a, b) => Math.abs(dShare(a) - rShare(a)) - Math.abs(dShare(b) - rShare(b)) || alpha(a, b));
    return list;
  }, [rows, sort]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Chambers</h2>
        <span className="sm:ml-auto"><Segmented label="Sort chambers" value={sort} onChange={setSort} options={SORTS} /></span>
      </div>
      {/* Phones: one card per chamber with every column, the bars at full width. */}
      {/* Phones: one card per chamber, flat on the page like the site's ledger rows: a kicker, the
          state in the serif, odds + outlook at right, and a rule down the left edge in the favored
          party's color (full strength for a flip) to set each card off from the next. */}
      <div className="flex flex-col gap-2 sm:hidden">
        {sorted.map((r) => {
          const o = outlookOf(r);
          const rule = !o ? "var(--app-border)" : o.flip ? partyColor(o.party) : `color-mix(in srgb, ${partyColor(o.party)} 40%, var(--app-bg))`;
          return (
            <div key={r.key} className="py-3.5 pl-3" style={{ borderLeft: `3px solid ${rule}`, borderBottom: "1px solid var(--app-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <MiniLabel>{r.label} · {r.seatsUp} of {r.totalSeats ?? "—"} up</MiniLabel>
                  <Link href={r.href} className="mt-0.5 block truncate text-xl font-bold leading-tight hover:underline" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}>{r.stateName}</Link>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg leading-tight"><OddsCell d={r.pDem} r={r.pRep} className="font-extrabold" /></div>
                  <div className="mt-1"><OutlookCell r={r} pill /></div>
                </div>
              </div>
              <div className="mt-3"><SeatsCell r={r} /></div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-sm tabular-nums">
                <div><MiniLabel>Now</MiniLabel><div className="mt-0.5 whitespace-nowrap font-semibold"><NowSplit now={r.now} /></div><NowStatus s={r.nowStatus} /></div>
                <div><MiniLabel>Net</MiniLabel><div className="mt-0.5"><NetCell r={r} /></div></div>
                <div><MiniLabel>Projected</MiniLabel><div className="mt-0.5 text-xs"><ProjectedStatusCell r={r} /></div></div>
                <div><MiniLabel>Unopp.</MiniLabel><div className="mt-0.5" style={{ color: "var(--app-text-muted)" }}>{r.unopposed}{r.unprojected ? <span className="text-xs"> · {r.unprojected} n/p</span> : null}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
              {[["Chamber", "left", ""], ["Seats up", "right", ""], ["Now", "right", ""], ["Projected seats · 80% range", "left", "min-w-[13rem]"], ["Outlook", "left", ""], ["Control odds", "right", ""], ["Net", "right", ""], ["Projected status", "right", ""], ["Unopp.", "right", ""]].map(([h, a, w]) => (
                <th key={h} className={`whitespace-nowrap py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-wider text-${a} ${w}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="whitespace-nowrap py-2 pr-3 font-semibold"><Link href={r.href} className="hover:underline">{r.stateName} {r.label}</Link></td>
                <td className="whitespace-nowrap py-2 pr-3 text-right">{r.seatsUp}<span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}> / {r.totalSeats ?? "—"}</span></td>
                <td className="whitespace-nowrap py-2 pr-3 text-right"><NowSplit now={r.now} /><NowStatus s={r.nowStatus} /></td>
                <td className="py-2 pr-3"><SeatsCell r={r} /></td>
                <td className="py-2 pr-3"><OutlookCell r={r} /></td>
                <td className="whitespace-nowrap py-2 pr-3 text-right"><OddsCell d={r.pDem} r={r.pRep} /></td>
                <td className="whitespace-nowrap py-2 pr-3 text-right"><NetCell r={r} /></td>
                <td className="py-2 pr-3 text-right"><ProjectedStatusCell r={r} /></td>
                <td className="py-2 pr-0 text-right" style={{ color: "var(--app-text-muted)" }}>{r.unopposed}{r.unprojected ? <span title="seats with no projection"> · {r.unprojected} n/p</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

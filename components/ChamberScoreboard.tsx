import type { ReactNode } from "react";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { flipBackground } from "@/components/FlipStripes";

// The header of /house, /senate, /governor and /legislatures (user, 2026-11-25): each figure once.
// The two serif totals are the result; the change from before the election sits under each; one bar
// carries the split, the seats that changed party (striped) and where the line stood before (the
// caret); and a row of figures below holds the flips and the popular vote, raw and adjusted.

export type ScoreSplit = { dem: number; rep: number; oth: number };
export type ScoreStat = { label: string; value: ReactNode; sub?: ReactNode };

const DEM = "var(--party-dem)", REP = "var(--party-rep)", IND = "var(--party-ind)";
const SERIF = "var(--font-serif)";
// The bar is a filled mark, so it takes the map's Safe D / Safe R fills in both themes; --party-dem
// and --party-rep lighten in dark mode to stay readable as text.
const DEM_FILL = "#1b408c", REP_FILL = "#be1c29";
const n = (v: number) => Math.round(v).toLocaleString();

/** A figure in the stat row, set in the serif. */
export function StatFigure({ children, color }: { children: ReactNode; color?: string }) {
  return <span className="tabular-nums" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(1.3rem, 2.8vw, 1.55rem)", lineHeight: 1, letterSpacing: "-0.01em", color }}>{children}</span>;
}

/** A national vote margin as a stat: the margin named for the party ahead, one line of context under it. */
export function voteStat(label: string, margin: number | null, note?: ReactNode): ScoreStat {
  return { label, value: <StatFigure color={marginColor(margin)}>{fmtMargin(margin)}</StatFigure>, sub: note };
}

/** The flips as a stat: seats gained by each party, the net under them. */
export function flipsStat(label: string, toD: number, toR: number, extra?: ReactNode): ScoreStat {
  const net = toD - toR;
  return {
    label,
    value: (
      <span className="inline-flex items-baseline gap-x-2.5 whitespace-nowrap">
        <span><StatFigure color={DEM}>{toD}</StatFigure> <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>to D</span></span>
        <span><StatFigure color={REP}>{toR}</StatFigure> <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>to R</span></span>
      </span>
    ),
    sub: <>{net === 0 ? "no net change" : <>net <b style={{ color: net > 0 ? DEM : REP }}>{net > 0 ? "D" : "R"}+{Math.abs(net)}</b></>}{extra}</>,
  };
}

function Total({ value, label, color, was, align }: { value: number; label: string; color: string; was: number | null; align: "left" | "right" }) {
  const delta = was == null ? null : Math.round(value) - Math.round(was);
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <div className="tabular-nums" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "clamp(2rem, 5vw, 2.75rem)", lineHeight: 0.95, letterSpacing: "-0.02em", color }}>{n(value)}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color }}>{label}</div>
      {delta != null && was != null && (
        <div className="whitespace-nowrap text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {delta === 0 ? "no change" : <b style={{ color: "var(--app-text-primary)" }}>{delta > 0 ? "+" : "−"}{n(Math.abs(delta))}</b>} · was {n(was)}
        </div>
      )}
    </div>
  );
}

export default function ChamberScoreboard({ status, kicker, note, after, before, total, flips, mark, stats }: {
  /** One serif line under the title: what the result means for control. */
  status: ReactNode;
  kicker: string;
  /** A caveat on the count ("4 races not yet called"). */
  note?: string;
  after: ScoreSplit;
  /** The same seats before the election; null leaves out the change lines and the caret. */
  before: ScoreSplit | null;
  total: number;
  flips: { toD: number; toR: number };
  /** The line on the bar: its position as a share of the seats, and what it marks. */
  mark: { at: number; label: string };
  stats: ScoreStat[];
}) {
  const share = (v: number) => `${Math.min(100, Math.max(0, (v / total) * 100))}%`;
  // Left to right: Democratic seats kept, seats gained (striped), independents, Republican gains (striped), seats kept.
  const segments = [
    { key: "d", value: after.dem - flips.toD, background: DEM_FILL, title: `${n(after.dem - flips.toD)} Democratic, held` },
    { key: "dg", value: flips.toD, background: flipBackground(DEM_FILL, 1.4), title: `${n(flips.toD)} gained by Democrats` },
    { key: "i", value: after.oth, background: IND, title: `${n(after.oth)} independent or other` },
    { key: "rg", value: flips.toR, background: flipBackground(REP_FILL, 1.4), title: `${n(flips.toR)} gained by Republicans` },
    { key: "r", value: after.rep - flips.toR, background: REP_FILL, title: `${n(after.rep - flips.toR)} Republican, held` },
  ].filter((s) => s.value > 0);

  return (
    <>
      <p className="mt-2" style={{ maxWidth: "52ch", fontFamily: SERIF, fontSize: "clamp(1rem, 1.8vw, 1.15rem)", lineHeight: 1.35, textWrap: "balance" }}>{status}</p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-2.5" style={{ borderTop: "1px solid var(--app-text-primary)" }}>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)" }}>{kicker}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
          {note && <span>{note}</span>}
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3.5 rounded-sm" style={{ background: flipBackground("var(--app-text-muted)", 1.2) }} />changed party</span>
          {before && <span className="inline-flex items-center gap-1"><span className="inline-block" style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid var(--app-text-muted)" }} />split before</span>}
        </span>
      </div>

      {/* One row from sm up: the Democratic total, the bar, the Republican total. Phones put the bar under the two totals. */}
      <div className="mt-2.5 grid grid-cols-2 items-start gap-x-5 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6">
        <Total value={after.dem} label="Democrats" color={DEM} was={before?.dem ?? null} align="left" />
        <div className="order-last col-span-2 sm:order-none sm:col-span-1 sm:pt-2">
          <div className="relative pt-2.5">
            {before && (
              // Where the Democratic side ended before the election.
              <span aria-hidden title={`Before the election: ${n(before.dem)} Democratic`} className="absolute top-0 -translate-x-1/2" style={{ left: share(before.dem), borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid var(--app-text-primary)" }} />
            )}
            <div className="seatbar-open flex gap-[2px] overflow-hidden rounded" style={{ height: 14 }} role="img" aria-label={`${n(after.dem)} Democratic, ${n(after.rep)} Republican${after.oth ? `, ${n(after.oth)} independent` : ""} of ${n(total)}`}>
              {segments.map((s) => <span key={s.key} title={s.title} style={{ flexGrow: s.value, flexBasis: 0, minWidth: 2, background: s.background }} />)}
            </div>
            <span aria-hidden className="absolute bottom-[-4px] top-[6px] w-[2px] -translate-x-1/2" style={{ left: `${mark.at * 100}%`, background: "var(--app-text-primary)" }} />
          </div>
          <div className="relative mt-1.5 h-3.5 text-[10px]" style={{ color: "var(--app-text-muted)" }}>
            <span className="absolute -translate-x-1/2 whitespace-nowrap font-semibold" style={{ left: `${mark.at * 100}%` }}>
              {mark.label}{Math.round(after.oth) > 0 && <span style={{ color: IND }}> · {n(after.oth)} independent</span>}
            </span>
          </div>
        </div>
        <Total value={after.rep} label="Republicans" color={REP} was={before?.rep ?? null} align="right" />
      </div>

      <dl className={`mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:gap-x-8 ${stats.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {stats.map((s, i) => (
          <div key={s.label} className={`pt-2 ${stats.length % 2 === 1 && i === 0 ? "col-span-2 sm:col-span-1" : ""}`} style={{ borderTop: "1px solid var(--app-border)", animation: "vh-rise 460ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: `${250 + i * 90}ms` }}>
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)" }}>{s.label}</dt>
            <dd className="mt-1">{s.value}</dd>
            {s.sub && <dd className="mt-1 text-xs leading-snug" style={{ color: "var(--app-text-muted)" }}>{s.sub}</dd>}
          </div>
        ))}
      </dl>
    </>
  );
}

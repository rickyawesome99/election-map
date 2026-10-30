import Link from "next/link";
import type { ReactNode } from "react";
import { fmtLean } from "@/lib/colorScale";

// Pieces for the public /methodology page: the plain-language version of Internal Methodology
// (/analysis/internal-methodology). Same flat house style as the rest of the site — headings over
// rules, everything on the page background, no panels — but written and laid out for a reader, not
// for whoever is changing the model: few numbers, each one live, and small pictures instead of
// formulas.

export const MUTED = { color: "var(--app-text-muted)" } as const;
export const VERY_MUTED = { color: "var(--app-text-very-muted)" } as const;
const RULE = "1px solid var(--app-border)";
const SERIF = { fontFamily: "var(--font-serif)" } as const;

const partyColor = (v: number) => (v > 0 ? "var(--party-rep)" : "var(--party-dem)");
const partyMuted = (v: number) => (v > 0 ? "var(--party-rep-muted)" : "var(--party-dem-muted)");

/** A margin in words-friendly form, colored by the party it favors: D+5.3 / R+2.0 / EVEN. */
export function Margin({ v }: { v: number | null | undefined }) {
  if (v == null || !Number.isFinite(v)) return <span style={VERY_MUTED}>—</span>;
  return <span className="font-bold tabular-nums whitespace-nowrap" style={{ color: Math.abs(v) < 0.05 ? "var(--app-text-primary)" : partyColor(v) }}>{fmtLean(v)}</span>;
}

/** An emphasized live number inside running text. */
export const Num = ({ children }: { children: ReactNode }) => <span className="font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{children}</span>;

export const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} prefetch={false} className="font-semibold underline decoration-dotted underline-offset-2 hover:decoration-solid" style={{ color: "var(--app-text-primary)" }}>{children}</Link>
);

/** A chapter: a large serif heading over a 2px rule, an optional one-paragraph intro in the serif. */
export function Chapter({ id, kicker, title, intro, children }: { id: string; kicker?: string; title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 pt-14 first:pt-8">
      <div className="pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        {kicker && <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={MUTED}>{kicker}</div>}
        <h2 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight sm:text-[2.125rem]" style={SERIF}>{title}</h2>
      </div>
      {intro && <p className="mt-5 max-w-[62ch] text-[17px] leading-[1.6]" style={{ ...SERIF, color: "var(--app-text-primary)", textWrap: "pretty" }}>{intro}</p>}
      {children && <div className="mt-7 space-y-8">{children}</div>}
    </section>
  );
}

/** Body text: comfortable measure, primary ink. */
export const Para = ({ children }: { children: ReactNode }) => <p className="max-w-[66ch] text-[15px] leading-[1.65]" style={{ color: "var(--app-text-primary)", textWrap: "pretty" }}>{children}</p>;

/** A small-caps label over a hairline, for a figure or list inside a chapter. */
export function Label({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 pb-2" style={{ borderBottom: RULE }}>
      <h3 className="text-[11px] font-bold uppercase tracking-wider" style={MUTED}>{children}</h3>
      {meta && <span className="text-xs" style={VERY_MUTED}>{meta}</span>}
    </div>
  );
}

/** Numbered steps: a large serif numeral, a short title, a sentence or two, and an optional live figure. */
export function Steps({ items }: { items: { title: string; body: ReactNode; figure?: ReactNode; figureLabel?: string; more?: ReactNode }[] }) {
  return (
    <ol>
      {items.map((it, i) => (
        <li key={it.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 py-5 sm:grid-cols-[3.25rem_minmax(0,1fr)_11rem] sm:gap-x-6" style={{ borderBottom: RULE }}>
          <div className="text-[2rem] font-bold leading-none tabular-nums sm:text-[2.5rem]" style={{ ...SERIF, color: "var(--app-text-very-muted)" }}>{i + 1}</div>
          <div className="min-w-0">
            <h3 className="text-[19px] font-bold leading-snug" style={SERIF}>{it.title}</h3>
            <div className="mt-1.5 max-w-[60ch] text-[15px] leading-[1.6]" style={MUTED}>{it.body}</div>
            {it.more && <div className="mt-2 text-[13px]">{it.more}</div>}
          </div>
          {it.figure != null && (
            <div className="col-start-2 mt-3 sm:col-start-3 sm:mt-0 sm:text-right">
              <div className="text-[22px] font-extrabold leading-tight tabular-nums">{it.figure}</div>
              {it.figureLabel && <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={VERY_MUTED}>{it.figureLabel}</div>}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A row of headline numbers, divided by hairlines. */
export function KeyFigures({ items }: { items: { value: ReactNode; label: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-y-5 sm:flex sm:flex-wrap sm:gap-y-4">
      {items.map((s, i) => (
        <div key={i} className={`pr-4 sm:pr-8 ${i < items.length - 1 ? "sm:mr-8 sm:[border-right:1px_solid_var(--app-border)]" : ""}`}>
          <div className="text-[1.75rem] font-extrabold leading-none tabular-nums">{s.value}</div>
          <div className="mt-1.5 max-w-[16rem] text-[12px] leading-snug" style={MUTED}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Plain question-and-answer rows. */
export function QA({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div>
      {items.map((it) => (
        <div key={it.q} className="grid grid-cols-1 gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[16rem_minmax(0,1fr)]" style={{ borderBottom: RULE }}>
          <div className="text-[15px] font-bold leading-snug" style={SERIF}>{it.q}</div>
          <div className="max-w-[62ch] text-[14px] leading-[1.6]" style={MUTED}>{it.a}</div>
        </div>
      ))}
    </div>
  );
}

/** A simple table on the page background. `align` per column: l / r. */
export function SimpleTable({ head, rows, align, caption }: { head: ReactNode[]; rows: ReactNode[][]; align?: string; caption?: ReactNode }) {
  const a = (i: number) => (align?.[i] === "r" ? "text-right" : "text-left");
  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-3xl border-collapse text-sm">
        <thead><tr>{head.map((h, i) => <th key={i} scope="col" className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider first:pl-0 ${a(i)}`} style={{ ...MUTED, borderBottom: RULE }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri} style={{ borderBottom: RULE }}>{r.map((c, i) => <td key={i} className={`px-2 py-2 tabular-nums first:pl-0 ${a(i)} ${i === 0 ? "font-semibold" : ""}`}>{c}</td>)}</tr>)}</tbody>
      </table>
      {caption && <div className="mt-2 max-w-3xl text-xs leading-relaxed" style={VERY_MUTED}>{caption}</div>}
    </div>
  );
}

/** A margin "build-up": each step moves the running margin toward one party, totals are drawn from
 *  even. R-positive values; bars toward the Republican side are red, toward the Democratic side blue. */
export interface BuildStep { label: string; note?: ReactNode; value: number; total?: boolean }
export function BuildUp({ steps }: { steps: BuildStep[] }) {
  const rows: Array<BuildStep & { from: number; to: number }> = [];
  let run = 0;
  for (const s of steps) {
    const from = s.total ? 0 : run;
    const to = s.total ? s.value : run + s.value;
    run = to;
    rows.push({ ...s, from, to });
  }
  const extent = Math.max(10, ...rows.flatMap((r) => [Math.abs(r.from), Math.abs(r.to)]));
  const D = Math.ceil(extent / 5) * 5;
  const x = (v: number) => ((v + D) / (2 * D)) * 100;
  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_4.5rem] gap-x-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider sm:grid-cols-[13rem_minmax(0,1fr)_5rem]" style={VERY_MUTED}>
        <span />
        <span className="flex justify-between"><span style={{ color: "var(--party-dem)" }}>← <span className="hidden sm:inline">More Democratic</span><span className="sm:hidden">Dem.</span></span><span style={{ color: "var(--party-rep)" }}><span className="hidden sm:inline">More Republican</span><span className="sm:hidden">Rep.</span> →</span></span>
        <span />
      </div>
      {rows.map((r, i) => {
        const lo = Math.min(r.from, r.to), hi = Math.max(r.from, r.to);
        const delta = r.to - r.from;
        const color = r.total ? partyColor(r.to) : partyMuted(delta);
        return (
          <div key={i} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_4.5rem] items-center gap-x-3 py-2 sm:grid-cols-[13rem_minmax(0,1fr)_5rem]" style={{ borderTop: r.total ? "2px solid var(--app-text-primary)" : RULE }}>
            <div className="min-w-0">
              <div className={`text-[13px] leading-tight ${r.total ? "font-extrabold" : "font-semibold"}`}>{r.label}</div>
              {r.note && <div className="mt-0.5 text-[11px] leading-snug" style={VERY_MUTED}>{r.note}</div>}
            </div>
            <div className="relative h-5" title={`${r.label}: ${r.total ? fmtLean(r.to) : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} toward ${delta >= 0 ? "Republicans" : "Democrats"}`}`}>
              <div className="absolute inset-y-[-6px] w-px" style={{ left: "50%", background: "var(--app-text-very-muted)" }} aria-hidden />
              {Math.abs(delta) > 0.04 || r.total
                ? <div className="absolute inset-y-0 rounded-[3px]" style={{ left: `${x(lo)}%`, width: `max(2px, ${x(hi) - x(lo)}%)`, background: color }} />
                : <div className="absolute inset-y-1 w-[2px]" style={{ left: `${x(r.from)}%`, background: "var(--app-text-very-muted)" }} />}
            </div>
            <div className="text-right text-[13px] font-bold tabular-nums">
              {r.total ? <Margin v={r.to} /> : Math.abs(delta) < 0.05 ? <span style={VERY_MUTED}>0</span> : <span style={{ color: partyColor(delta) }}>{delta > 0 ? "R" : "D"} +{Math.abs(delta).toFixed(1)}</span>}
            </div>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_4.5rem] gap-x-3 pt-1 text-[10px] tabular-nums sm:grid-cols-[13rem_minmax(0,1fr)_5rem]" style={VERY_MUTED}>
        <span />
        <span className="flex justify-between"><span>D+{D}</span><span>Even</span><span>R+{D}</span></span>
        <span />
      </div>
    </div>
  );
}

/** Horizontal bars for shares (0–1), one row each, with the value printed at the end. */
export function ShareBars({ rows, max = 1, format = (v: number) => `${Math.round(v * 100)}%` }: { rows: { label: ReactNode; value: number; note?: ReactNode }[]; max?: number; format?: (v: number) => string }) {
  return (
    <div className="max-w-2xl">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_3.5rem] items-center gap-x-3 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_4rem]" style={{ borderBottom: RULE }}>
          <div className="text-[13px] font-semibold leading-tight">{r.label}{r.note && <div className="text-[11px] font-normal" style={VERY_MUTED}>{r.note}</div>}</div>
          <div className="relative h-3.5" title={`${typeof r.label === "string" ? r.label : ""} ${format(r.value)}`}>
            <div className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${Math.max(0.5, (r.value / max) * 100)}%`, background: "var(--app-text-muted)" }} />
          </div>
          <div className="text-right text-[13px] font-bold tabular-nums">{format(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

/** The rating scale: Safe / Likely / Lean / Tilt on each side of even, drawn to scale out to ±20,
 *  with an optional marker at a projected margin. */
export function RatingScale({ marker, markerLabel }: { marker?: number; markerLabel?: string }) {
  const D = 20;
  const x = (v: number) => ((Math.max(-D, Math.min(D, v)) + D) / (2 * D)) * 100;
  const bands = [
    { lo: -20, hi: -15, label: "Safe", side: -1, op: 1 }, { lo: -15, hi: -5, label: "Likely", side: -1, op: 0.7 }, { lo: -5, hi: -1, label: "Lean", side: -1, op: 0.45 }, { lo: -1, hi: 0, label: "Tilt", side: -1, op: 0.25 },
    { lo: 0, hi: 1, label: "Tilt", side: 1, op: 0.25 }, { lo: 1, hi: 5, label: "Lean", side: 1, op: 0.45 }, { lo: 5, hi: 15, label: "Likely", side: 1, op: 0.7 }, { lo: 15, hi: 20, label: "Safe", side: 1, op: 1 },
  ];
  return (
    <div className="max-w-3xl">
      <div className="relative h-7">
        {bands.map((b, i) => (
          <div key={i} className="absolute inset-y-0" title={`${b.label} ${b.side < 0 ? "D" : "R"}: ${Math.abs(b.side < 0 ? b.hi : b.lo)}–${Math.abs(b.side < 0 ? b.lo : b.hi)}${b.label === "Safe" ? "+" : ""} pts`}
            style={{ left: `${x(b.lo)}%`, width: `calc(${x(b.hi) - x(b.lo)}% - 2px)`, marginLeft: 1, background: b.side < 0 ? "var(--party-dem)" : "var(--party-rep)", opacity: b.op, borderRadius: 3 }} />
        ))}
        {marker != null && <div className="absolute -inset-y-1.5 w-[3px] rounded-full" style={{ left: `calc(${x(marker)}% - 1.5px)`, background: "var(--app-text-primary)", boxShadow: "0 0 0 2px var(--app-bg)" }} aria-hidden />}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] font-semibold" style={MUTED}>
        {bands.filter((b) => b.label !== "Tilt").map((b, i) => <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(b.lo) + x(b.hi)) / 2}%` }}>{b.label}</span>)}
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: "50%" }}>Tilt</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums" style={VERY_MUTED}><span>D+20</span><span>D+10</span><span>Even</span><span>R+10</span><span>R+20</span></div>
      {marker != null && markerLabel && <div className="mt-2 text-xs" style={MUTED}><span className="mr-1.5 inline-block h-3 w-[3px] translate-y-0.5 rounded-full" style={{ background: "var(--app-text-primary)" }} />{markerLabel}</div>}
    </div>
  );
}

/** A closing line pointing to where the numbers live on the site. */
export function SeeIt({ children }: { children: ReactNode }) {
  return <p className="max-w-[66ch] pt-1 text-[14px] leading-relaxed" style={MUTED}><span className="mr-2 text-[11px] font-bold uppercase tracking-wider" style={VERY_MUTED}>See it</span>{children}</p>;
}

import type { ReactNode } from "react";
import { fmtMargin, marginColor } from "@/lib/colorScale";

// Presentational pieces shared by every /methodology tab. Flat by design: a section is a
// large serif heading over a 2px rule, sub-blocks are small-caps labels over a 1px rule, and
// every table sits directly on the page background — no panels, no cards.

export const MUTED = { color: "var(--app-text-muted)" } as const;
export const VERY_MUTED = { color: "var(--app-text-very-muted)" } as const;
const RULE = "1px solid var(--app-border)";

/** How a number came to be what it is — the first thing to know before changing it. */
export type Basis = "fitted" | "measured" | "calibrated" | "fixed" | "decision" | "designed" | "data" | "off";
const BASIS_LABEL: Record<Basis, string> = {
  fitted: "Fitted live",
  measured: "Set from a measurement",
  calibrated: "Backtest-calibrated",
  fixed: "Fixed prior",
  decision: "Judgment call",
  designed: "Designed, not calibrated",
  data: "From data",
  off: "Tested, switched off",
};
const BASIS_TITLE: Record<Basis, string> = {
  fitted: "Re-estimated from the data every time the model runs; changes whenever the data does.",
  measured: "A constant set once from a measured statistic; it does not re-estimate itself, so re-measure before changing it.",
  calibrated: "A constant chosen by a backtest sweep; re-run the named harness before changing it.",
  fixed: "A constant held at a set value, with the evidence noted.",
  decision: "A value chosen on principle or preference where the data did not decide.",
  designed: "A reasoned value with no target to fit it against yet.",
  data: "An input read from a data file, not a model parameter.",
  off: "Built and tested, found not to help, and left disabled.",
};
export function BasisTag({ basis }: { basis: Basis }) {
  const color = basis === "fitted" || basis === "measured" || basis === "calibrated" ? "var(--app-text-primary)" : basis === "off" ? "var(--app-text-very-muted)" : "var(--app-text-muted)";
  return <span title={BASIS_TITLE[basis]} className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{BASIS_LABEL[basis]}</span>;
}

/** An R-positive margin, colored by party: D+5.3 / R+2.0 / EVEN. */
export function M({ v, digits = 1 }: { v: number | null | undefined; digits?: number }) {
  if (v == null || !Number.isFinite(v)) return <span style={VERY_MUTED}>—</span>;
  const text = digits === 1 ? fmtMargin(v) : Math.abs(v) < 0.5 * 10 ** -digits ? "EVEN" : `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(digits)}`;
  return <span className="font-bold tabular-nums" style={{ color: marginColor(v) }}>{text}</span>;
}
export const D = ({ children }: { children: ReactNode }) => <span className="font-semibold" style={{ color: "var(--party-dem)" }}>{children}</span>;
export const R = ({ children }: { children: ReactNode }) => <span className="font-semibold" style={{ color: "var(--party-rep)" }}>{children}</span>;
/** A plain emphasized number. */
export const N = ({ children }: { children: ReactNode }) => <span className="font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{children}</span>;
export const Code = ({ children }: { children: ReactNode }) => <code className="text-[0.85em]" style={{ fontFamily: "var(--font-ibm-plex-mono), ui-monospace, monospace", color: "var(--app-text-primary)" }}>{children}</code>;

export function Section({ id, kicker, title, lede, children }: { id: string; kicker?: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 pt-12 first:pt-8">
      <div className="pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        {kicker && <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={MUTED}>{kicker}</div>}
        <h2 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight sm:text-[2.125rem]" style={{ fontFamily: "var(--font-serif)" }}>{title}</h2>
      </div>
      {lede && <p className="mt-4 max-w-3xl text-[15px] leading-relaxed" style={{ color: "var(--app-text-primary)" }}>{lede}</p>}
      <div className="mt-5 space-y-7">{children}</div>
    </section>
  );
}

/** A labelled block inside a section: small-caps label over a hairline. */
export function Block({ label, meta, children }: { label: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-2" style={{ borderBottom: RULE }}>
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={MUTED}>{label}</h3>
        {meta && <span className="text-xs" style={VERY_MUTED}>{meta}</span>}
      </div>
      <div className="space-y-4 pt-1">{children}</div>
    </div>
  );
}

export const P = ({ children }: { children: ReactNode }) => <p className="max-w-3xl text-sm leading-relaxed" style={MUTED}>{children}</p>;

/** Formula lines: monospace on the page background, marked by a single rule down the left. */
export function Formula({ lines, note }: { lines: ReactNode[]; note?: ReactNode }) {
  return (
    <div className="overflow-x-auto pl-4" style={{ borderLeft: "2px solid var(--app-text-primary)" }}>
      <div className="space-y-1 whitespace-pre text-[13px] leading-relaxed" style={{ fontFamily: "var(--font-ibm-plex-mono), ui-monospace, monospace", color: "var(--app-text-primary)" }}>
        {lines.map((line, i) => <div key={i}>{line}</div>)}
      </div>
      {note && <div className="mt-2 max-w-3xl whitespace-normal text-xs leading-relaxed" style={VERY_MUTED}>{note}</div>}
    </div>
  );
}

/** A chain of quantities, each with its formula and the value it takes right now. */
export function Derivation({ rows, note }: { rows: { name: ReactNode; formula: ReactNode; now?: ReactNode }[]; note?: ReactNode }) {
  const mono = { fontFamily: "var(--font-ibm-plex-mono), ui-monospace, monospace" };
  return (
    <div className="pl-4" style={{ borderLeft: "2px solid var(--app-text-primary)" }}>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 items-baseline gap-x-4 py-1 text-[13px] leading-relaxed sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]">
          <span className="font-semibold" style={mono}>{r.name}</span>
          <span style={mono}>{r.formula}</span>
          <span className="text-sm sm:text-right">{r.now}</span>
        </div>
      ))}
      {note && <div className="mt-2 max-w-3xl text-xs leading-relaxed" style={VERY_MUTED}>{note}</div>}
    </div>
  );
}

/** Name → value → what it does → how it was set. The rows to look at before changing the model. */
export interface ConstantRow { name: string; value: ReactNode; meaning: ReactNode; basis: Basis; source?: ReactNode }
export function Constants({ rows }: { rows: ConstantRow[] }) {
  return (
    <div>
      {rows.map((c) => (
        <div key={c.name} className="grid grid-cols-1 gap-x-5 gap-y-1 py-3 sm:grid-cols-[15.5rem_minmax(0,1fr)]" style={{ borderBottom: RULE }}>
          <div>
            <div className="break-words text-[11px] font-semibold" style={{ fontFamily: "var(--font-ibm-plex-mono), ui-monospace, monospace" }}>{c.name}</div>
            <div className="mt-1 text-base font-extrabold tabular-nums leading-tight">{c.value}</div>
          </div>
          <div>
            <div className="text-sm leading-relaxed" style={MUTED}>{c.meaning}</div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-relaxed" style={VERY_MUTED}>
              <BasisTag basis={c.basis} />
              {c.source && <span>{c.source}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A ledger of terms that add up — the same shape as the Forecast Calculation on a race page. */
export interface LedgerLine { op?: "+" | "=" | "×" | ""; label: ReactNode; note?: ReactNode; value: ReactNode; total?: boolean }
export function Ledger({ lines }: { lines: LedgerLine[] }) {
  return (
    <div className="max-w-2xl">
      {lines.map((l, i) => (
        <div key={i} className={`grid grid-cols-[1rem_minmax(0,1fr)_auto] items-baseline gap-x-2 ${l.total ? "py-3" : "py-2.5"}`}
          style={l.total ? { borderTop: "2px solid var(--app-text-primary)", borderBottom: RULE, marginTop: "-1px" } : { borderBottom: RULE }}>
          <span className="text-center text-[11px] font-semibold" style={VERY_MUTED} aria-hidden>{l.op ?? ""}</span>
          <span className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: l.total ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{l.label}</span>
            {l.note && <span className="ml-2 text-xs" style={VERY_MUTED}>{l.note}</span>}
          </span>
          <span className={l.total ? "text-lg font-extrabold leading-none" : "text-sm font-bold"}>{l.value}</span>
        </div>
      ))}
    </div>
  );
}

/** A plain data table on the page background. `align` per column: l / r / c. */
export function DataTable({ head, rows, align, caption, maxWidth = "max-w-3xl" }: { head: ReactNode[]; rows: ReactNode[][]; align?: string; caption?: ReactNode; maxWidth?: string }) {
  const a = (i: number) => (align?.[i] === "r" ? "text-right" : align?.[i] === "c" ? "text-center" : "text-left");
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${maxWidth} border-collapse text-sm`}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope="col" className={`whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider first:pl-0 ${a(i)}`} style={{ ...MUTED, borderBottom: RULE }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} style={{ borderBottom: RULE }}>
              {row.map((cell, i) => <td key={i} className={`px-2 py-1.5 tabular-nums first:pl-0 ${a(i)} ${i === 0 ? "font-semibold" : ""}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && <div className="mt-2 max-w-3xl text-xs leading-relaxed" style={VERY_MUTED}>{caption}</div>}
    </div>
  );
}

/** Term → definition rows (rules, edge cases, glossary). */
export function Defs({ items }: { items: { term: ReactNode; def: ReactNode }[] }) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-1 gap-x-5 gap-y-0.5 py-2.5 sm:grid-cols-[13rem_minmax(0,1fr)]" style={{ borderBottom: RULE }}>
          <div className="text-sm font-semibold">{it.term}</div>
          <div className="text-sm leading-relaxed" style={MUTED}>{it.def}</div>
        </div>
      ))}
    </div>
  );
}

/** The headline stat row used in page heroes. */
export function StatRow({ stats }: { stats: { value: ReactNode; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4 pt-5" style={{ borderTop: RULE }}>
      {stats.map((s, i) => (
        <div key={s.label} className={i < stats.length - 1 ? "pr-8" : ""} style={i < stats.length - 1 ? { borderRight: RULE } : undefined}>
          <div className="text-2xl font-extrabold tabular-nums">{s.value}</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={VERY_MUTED}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Where the code lives and what to re-run — closes every tab. */
export function FilesAndCommands({ files, commands }: { files: { path: string; role: ReactNode }[]; commands: { cmd: string; does: ReactNode }[] }) {
  return (
    <>
      <Block label="Where it lives">
        <Defs items={files.map((f) => ({ term: <Code>{f.path}</Code>, def: f.role }))} />
      </Block>
      <Block label="Re-run after a change">
        <Defs items={commands.map((c) => ({ term: <Code>{c.cmd}</Code>, def: c.does }))} />
      </Block>
    </>
  );
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const signed = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

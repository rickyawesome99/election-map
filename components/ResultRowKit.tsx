import type { ReactNode } from "react";

/**
 * The state page's result rows (statewide races and each body's cycles), drawn as a head-to-head
 * rather than a table row: the year and its details stacked on the left, the two sides facing each
 * other over a split bar in the middle, the margin on the right in the site serif. Phones keep the
 * year and margin on one line and put the head-to-head under it.
 * Hover tint, rise-in and margin swell are the race pages' .vh-row / .vh-margin (globals.css).
 */

// Never "Even": margin <= 0 is D, as everywhere on the site.
export const partyVar = (p: "D" | "R") => (p === "D" ? "var(--party-dem)" : "var(--party-rep)");
const FIG = { fontFamily: "var(--font-serif)", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 } as const;

/**
 * `net` adds a column between the year and the head-to-head (a body's seats netted that cycle);
 * pass it, even as null, on every row of a list so the columns line up.
 */
export function ResultRowFrame({ left, middle, margin, net, delay = 0, link }: { left: ReactNode; middle: ReactNode; margin: ReactNode; net?: ReactNode; delay?: number; link?: ReactNode }) {
  const withNet = net !== undefined;
  return (
    <div
      className={`vh-row grid items-center gap-x-6 gap-y-3 border-b border-[var(--app-border)] py-4 last:border-b-0 sm:gap-x-10 ${withNet ? "grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[8rem_4.5rem_minmax(0,1fr)_6rem]" : "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[8rem_minmax(0,1fr)_6rem]"}`}
      // The list's last row leaves its rule to whatever follows (the map footer's).
      style={{ animationDelay: `${delay}ms` }}
    >
      {link}
      <div className="pointer-events-none relative col-start-1 row-start-1 min-w-0">{left}</div>
      <div className={`pointer-events-none relative col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:row-start-1 ${withNet ? "col-span-3 sm:col-start-3" : "col-span-2 sm:col-start-2"}`}>{middle}</div>
      {withNet && <div className="pointer-events-none relative col-start-2 row-start-1 text-right sm:col-start-2 sm:text-left">{net}</div>}
      <div className={`pointer-events-none relative row-start-1 text-right ${withNet ? "col-start-3 sm:col-start-4" : "col-start-2 sm:col-start-3"}`}>{margin}</div>
    </div>
  );
}

/** A body's seats netted that cycle, in the party's color: "+3 R" over "net seats". */
export function RowNet({ net }: { net: { party: "D" | "R"; seats: number } | null }) {
  if (!net) return null;
  return (
    <span className="inline-grid justify-items-end gap-1 sm:justify-items-start">
      <span className="whitespace-nowrap tabular-nums" style={{ ...FIG, fontSize: "1.15rem", color: partyVar(net.party) }}>+{net.seats} {net.party}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--app-text-very-muted)" }}>net seats</span>
    </span>
  );
}

export function RowYear({ year, children }: { year: number; children?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="tabular-nums" style={{ ...FIG, fontSize: "1.4rem", color: "var(--app-text-primary)" }}>{year}</span>
      {children}
    </div>
  );
}

export function RowEyebrow({ children }: { children: ReactNode }) {
  return <span className="truncate text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{children}</span>;
}

export function RowMargin({ party, value, caption }: { party: "D" | "R" | null; value: string; caption?: string }) {
  return (
    <span className="inline-grid justify-items-end gap-1">
      <span className="vh-margin inline-block whitespace-nowrap tabular-nums" style={{ ...FIG, fontSize: "1.3rem", color: party ? partyVar(party) : "var(--app-text-very-muted)" }}>{value}</span>
      {caption && <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{caption}</span>}
    </span>
  );
}

/**
 * Two sides facing each other: the Democratic side reads from the left edge, the Republican from
 * the right, with a split bar under both. `split` is the Democratic share of the bar (0–100);
 * `tick` marks a threshold on it (a chamber's majority line).
 */
export function HeadToHead({ dem, rep, split, tick }: { dem: ReactNode; rep: ReactNode; split: number | null; tick?: number | null }) {
  const d = split == null ? null : Math.max(0, Math.min(100, split));
  return (
    <div className="grid gap-2">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">{dem}</div>
        <div className="min-w-0 text-right">{rep}</div>
      </div>
      {d != null ? (
        <div className="relative">
          <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
            <i className="vh-bar-d block h-full" style={{ width: `${d}%`, background: "var(--party-dem)" }} />
            <i className="vh-bar-r block h-full" style={{ width: `${100 - d}%`, background: "var(--party-rep)" }} />
          </div>
          {tick != null && <span className="absolute -top-1 -bottom-1 w-[2px]" style={{ left: `calc(${tick}% - 1px)`, background: "var(--app-text-primary)" }} aria-hidden />}
        </div>
      ) : (
        <span className="block h-[2px] my-[2px]" style={{ background: "repeating-linear-gradient(90deg, var(--app-border) 0 6px, transparent 6px 10px)" }} />
      )}
    </div>
  );
}

/** One side's figures: a headline (a share or a seat count) over the smaller detail beneath it. */
export function Side({ party, top, headline, detail, align = "left" }: { party: "D" | "R"; top?: ReactNode; headline: ReactNode; detail?: ReactNode; align?: "left" | "right" }) {
  return (
    <div className={`grid min-w-0 gap-0.5 ${align === "right" ? "justify-items-end" : ""}`}>
      {top && <span className="max-w-full truncate text-sm font-semibold" style={{ color: partyVar(party) }}>{top}</span>}
      <span className={`flex items-baseline gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="tabular-nums" style={{ ...FIG, fontSize: "1.15rem", color: partyVar(party) }}>{headline}</span>
        {detail && <span className="text-xs tabular-nums" style={{ color: "var(--app-text-primary)" }}>{detail}</span>}
      </span>
    </div>
  );
}

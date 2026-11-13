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
export const FIG = { fontFamily: "var(--font-serif)", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 } as const;

/**
 * `net` adds a column between the year and the head-to-head (a body's seats netted that cycle);
 * `adjusted` adds one after the margin (a legislature's corrected margin). Pass either, even as
 * null, on every row of a list so the columns line up.
 */
export function ResultRowFrame({ left, middle, margin, net, adjusted, delay = 0, link }: { left: ReactNode; middle: ReactNode; margin: ReactNode; net?: ReactNode; adjusted?: ReactNode; delay?: number; link?: ReactNode }) {
  const withNet = net !== undefined;
  const withAdj = adjusted !== undefined;
  // `adjusted` shares the margin's cell, a tighter pair than two columns a full gap apart.
  // Literal class strings per shape, for Tailwind's scanner.
  const shape = withNet
    ? withAdj
      ? { grid: "gap-x-4 sm:gap-x-8 grid-cols-[minmax(min-content,1fr)_auto_auto] sm:grid-cols-[8rem_4.5rem_minmax(0,1fr)_10.5rem]", middle: "col-span-3 sm:col-start-3", margin: "col-start-3 sm:col-start-4" }
      : { grid: "gap-x-6 sm:gap-x-10 grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[8rem_4.5rem_minmax(0,1fr)_6rem]", middle: "col-span-3 sm:col-start-3", margin: "col-start-3 sm:col-start-4" }
    : withAdj
      ? { grid: "gap-x-4 sm:gap-x-8 grid-cols-[minmax(min-content,1fr)_auto] sm:grid-cols-[8rem_minmax(0,1fr)_10.5rem]", middle: "col-span-2 sm:col-start-2", margin: "col-start-2 sm:col-start-3" }
      : { grid: "gap-x-6 sm:gap-x-10 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[8rem_minmax(0,1fr)_6rem]", middle: "col-span-2 sm:col-start-2", margin: "col-start-2 sm:col-start-3" };
  return (
    <div
      className={`vh-row grid items-center gap-y-3 border-b border-[var(--app-border)] py-4 last:border-b-0 ${shape.grid}`}
      // The list's last row leaves its rule to whatever follows (the map footer's).
      style={{ animationDelay: `${delay}ms` }}
    >
      {link}
      <div className="pointer-events-none relative col-start-1 row-start-1 min-w-0">{left}</div>
      <div className={`pointer-events-none relative col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:row-start-1 ${shape.middle}`}>{middle}</div>
      {withNet && <div className="pointer-events-none relative col-start-2 row-start-1 text-right sm:col-start-2 sm:text-left">{net}</div>}
      <div className={`pointer-events-none relative row-start-1 text-right ${shape.margin}`}>
        {withAdj ? <div className="grid grid-cols-2 justify-items-end gap-x-3 sm:gap-x-4">{margin ?? <span />}{adjusted ?? <span />}</div> : margin}
      </div>
    </div>
  );
}

/** One side's seats gained that cycle; "O" is the independent and third-party group, shown as "I". */
export type SeatGain = { party: "D" | "R" | "O"; seats: number };

/**
 * A body's seats netted that cycle, in each gainer's color: "+3 R" over "net seats", or, where a
 * seat moved to or from an independent or third party ("I"), over where the seats came from.
 */
export function RowNet({ net }: { net: { gains: SeatGain[]; caption: string } | null }) {
  if (!net || net.gains.length === 0) return null;
  return (
    <span className="inline-grid justify-items-end gap-1 sm:justify-items-start">
      {net.gains.map((g) => (
        <span key={g.party} className="whitespace-nowrap tabular-nums" style={{ ...FIG, fontSize: "1.15rem", color: g.party === "O" ? "var(--party-ind)" : partyVar(g.party) }}>
          +{g.seats} {g.party === "O" ? "I" : g.party}
        </span>
      ))}
      <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--app-text-very-muted)" }}>{net.caption}</span>
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
 * `tick` marks a threshold on it (a chamber's majority line). `mid` and `other` put a third
 * group (a chamber's independent and third-party seats) centered between them and grey on the bar
 * between the two sides.
 */
export function HeadToHead({ dem, rep, mid, split, other = 0, tick }: { dem: ReactNode; rep: ReactNode; mid?: ReactNode; split: number | null; other?: number; tick?: number | null }) {
  const d = split == null ? null : Math.max(0, Math.min(100, split));
  const o = d == null ? 0 : Math.max(0, Math.min(100 - d, other));
  return (
    <div className="grid gap-2">
      {mid ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-4">
          <div className="min-w-0">{dem}</div>
          <div className="text-center">{mid}</div>
          <div className="min-w-0 text-right">{rep}</div>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">{dem}</div>
          <div className="min-w-0 text-right">{rep}</div>
        </div>
      )}
      {d != null ? (
        <div className="relative">
          <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
            <i className="vh-bar-d block h-full" style={{ width: `${d}%`, background: "var(--party-dem)" }} />
            {o > 0 && <i className="vh-bar-d block h-full" style={{ width: `${o}%`, background: "var(--party-ind)", transformOrigin: "center" }} />}
            <i className="vh-bar-r block h-full" style={{ width: `${100 - d - o}%`, background: "var(--party-rep)" }} />
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

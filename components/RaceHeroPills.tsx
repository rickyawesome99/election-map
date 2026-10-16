// The pill row above a race page's title: state · office · rating · who holds the seat.
// The rating pill and any special-election badge are passed in by the page.

const NEUTRAL = { background: "var(--app-tab-bg)", color: "var(--app-text-muted)" } as const;
// State and office pills are links, so they read in the primary text color.
const LINK_PILL = { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" } as const;
/** Every pill in the row shares this size: the page's rating pill and special badge use it too. */
export const PILL = "text-xs font-bold px-2.5 py-1 rounded-full shrink-0";

const OFFICE = {
  house: { label: "U.S. House", href: "/house" },
  senate: { label: "U.S. Senate", href: "/senate" },
  governor: { label: "Governor", href: "/governor" },
} as const;

export function StatePill({ name, abbr }: { name: string; abbr: string }) {
  return (
    <a href={`/states/${abbr.toLowerCase()}`} aria-label={`View ${name} state page`} className={`${PILL} hover:underline`} style={LINK_PILL}>
      {name}
    </a>
  );
}

/** Links to the office's tab under Forecast. */
export function OfficePill({ office }: { office: keyof typeof OFFICE }) {
  const o = OFFICE[office];
  return (
    <a href={o.href} aria-label={`${o.label} forecast`} className={`${PILL} hover:underline`} style={LINK_PILL}>
      {o.label}
    </a>
  );
}

/** Who holds the seat going in, in the party color. null = no holder on file (shown as an open seat). */
export function HeldPill({ party }: { party: "D" | "R" | "I" | null }) {
  const label = party === "R" ? "Republican-held" : party === "D" ? "Democratic-held" : party === "I" ? "Independent-held" : "Open Seat";
  const bg = party === "R" ? "var(--party-rep)" : party === "D" ? "var(--party-dem)" : party === "I" ? "var(--party-ind)" : null;
  return <span className={PILL} style={bg ? { background: bg, color: "#fff" } : NEUTRAL}>{label}</span>;
}

export type SeatNavLink = { href: string; label: string };

/** Quiet ‹ › arrows set beside the page title, stepping to the neighbouring seats: the state's
 *  previous/next district, or its other Senate seat. Each arrow names its destination on hover
 *  and to screen readers; a side with no seat stays as a faded placeholder so the pair keeps its
 *  shape. Renders nothing when neither side exists (at-large districts). */
export function SeatArrows({ prev, next, label = "Neighbouring seats" }: { prev?: SeatNavLink | null; next?: SeatNavLink | null; label?: string }) {
  if (!prev && !next) return null;
  const chevron = (dir: "prev" | "next") => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
  const btn = "inline-flex h-9 w-9 items-center justify-center rounded-full";
  const arrow = (l: SeatNavLink | null | undefined, dir: "prev" | "next") =>
    l ? (
      <a href={l.href} title={l.label} aria-label={`Go to ${l.label}`} className={`${btn} transition-colors hover:bg-[var(--app-tab-bg)]`} style={{ color: "var(--app-text-muted)" }}>
        {chevron(dir)}
      </a>
    ) : (
      <span aria-hidden className={btn} style={{ color: "var(--app-text-muted)", opacity: 0.3 }}>{chevron(dir)}</span>
    );
  return (
    // A span (not <nav>) so it can sit inside the <h1>, glued to the title's last word: the
    // arrows then wrap with that word instead of dropping onto a line of their own.
    <span role="navigation" aria-label={label} className="ml-2 inline-flex items-center align-middle sm:ml-3" style={{ verticalAlign: "0.3em", letterSpacing: 0 }}>
      {arrow(prev, "prev")}
      {arrow(next, "next")}
    </span>
  );
}

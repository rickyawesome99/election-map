import Link from "next/link";
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
    <Link prefetch={false} href={`/states/${abbr.toLowerCase()}`} aria-label={`View ${name} state page`} className={`${PILL} ix-lift hover:underline`} style={LINK_PILL}>
      {name}
    </Link>
  );
}

/** Links to the office's tab under Forecast. */
export function OfficePill({ office }: { office: keyof typeof OFFICE }) {
  const o = OFFICE[office];
  return (
    <Link prefetch={false} href={o.href} aria-label={`${o.label} forecast`} className={`${PILL} ix-lift hover:underline`} style={LINK_PILL}>
      {o.label}
    </Link>
  );
}

/** Who holds the seat going in, in the party color. null = no holder on file (shown as an open seat). */
export function HeldPill({ party }: { party: "D" | "R" | "I" | null }) {
  const label = party === "R" ? "Republican-held" : party === "D" ? "Democratic-held" : party === "I" ? "Independent-held" : "Open Seat";
  const bg = party === "R" ? "var(--party-rep)" : party === "D" ? "var(--party-dem)" : party === "I" ? "var(--party-ind)" : null;
  return <span className={PILL} style={bg ? { background: bg, color: "#fff" } : NEUTRAL}>{label}</span>;
}

export type SeatNavLink = { href: string; label: string };

/** Which of the state's two Senate seats this page is ("Seat 1" / "Seat 2"). A link to the other
 *  seat's page when it has one; otherwise a plain label. */
export function SeatPill({ seat, other }: { seat: 1 | 2; other: SeatNavLink | null }) {
  if (!other) return <span className={PILL} style={NEUTRAL}>Seat {seat}</span>;
  return (
    <Link prefetch={false} href={other.href} title={`Go to ${other.label}`} aria-label={`Seat ${seat}. Go to ${other.label}`} className={`${PILL} ix-lift hover:underline`} style={LINK_PILL}>
      Seat {seat}
    </Link>
  );
}

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

// The analysis-page header: a category pill back to the hub, a serif title, and (optionally) one
// standfirst sentence that carries the page's figures inline (wrap each in <Fig>). No background band,
// no stat tiles. CategoryPill and STANDFIRST_TITLE_STYLE are exported for headers that live inside
// another layout (the delegation page's header sits in ForecastMap).
export const STANDFIRST_TITLE_STYLE: CSSProperties = { fontFamily: "var(--font-serif)", fontSize: "clamp(1.75rem, 4.2vw, 2.6rem)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.015em", textWrap: "balance" };

export function CategoryPill({ label, href = "/analysis", hubLabel = "Analysis" }: { label: string; href?: string; hubLabel?: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label === hubLabel ? `Back to ${hubLabel}` : `${label}: back to ${hubLabel}`}
      className="mb-2 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-[var(--app-tab-bg)] text-[var(--app-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--app-text-primary)_10%,var(--app-tab-bg))] hover:text-[var(--app-text-primary)]"
      style={{ border: "1px solid var(--app-border)" }}
    >
      {label}
    </Link>
  );
}

// The site-level pages (Methodology, About) use the large title, the size of a state page's name.
export const STANDFIRST_TITLE_LARGE_STYLE: CSSProperties = { ...STANDFIRST_TITLE_STYLE, fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", lineHeight: 0.95, letterSpacing: "-0.02em" };

export function StandfirstHeader({ kicker, title, href = "/analysis", hubLabel = "Analysis", size = "default", bare = false, children }: {
  kicker?: string;              // the category pill; omit for no pill
  title: string;
  href?: string;
  hubLabel?: string;
  size?: "default" | "large";
  bare?: boolean;               // true when the caller already supplies the page container
  children?: ReactNode;
}) {
  const body = (
    <>
      {kicker && <CategoryPill label={kicker} href={href} hubLabel={hubLabel} />}
      <h1 style={size === "large" ? STANDFIRST_TITLE_LARGE_STYLE : STANDFIRST_TITLE_STYLE}>{title}</h1>
      {children && (
        <p className={size === "large" ? "mt-4" : "mt-3"} style={{ maxWidth: "58ch", fontFamily: "var(--font-serif)", fontSize: "clamp(1.02rem, 1.9vw, 1.18rem)", lineHeight: 1.55, textWrap: "pretty" }}>
          {children}
        </p>
      )}
    </>
  );
  return bare ? <header>{body}</header> : <header className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">{body}</header>;
}

// A figure inside the serif standfirst: set in the sans so the numbers stand out from the prose.
export function Fig({ children }: { children: ReactNode }) {
  return <b style={{ fontFamily: "var(--font-ibm-plex-sans), sans-serif", fontWeight: 700, fontSize: "0.92em", fontVariantNumeric: "tabular-nums" }}>{children}</b>;
}

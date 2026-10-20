import Link from "next/link";
import type { ReactNode } from "react";

// The analysis-page header: a category pill back to the hub, a serif title, and one standfirst
// sentence that carries the page's figures inline (wrap each in <Fig>). No background band, no stat tiles.
export function StandfirstHeader({ kicker, title, href = "/analysis", hubLabel = "Analysis", children }: {
  kicker: string;
  title: string;
  href?: string;
  hubLabel?: string;
  children: ReactNode;
}) {
  return (
    <header className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">
      <Link
        href={href}
        prefetch={false}
        aria-label={`${kicker}: back to ${hubLabel}`}
        className="mb-2 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-[var(--app-tab-bg)] text-[var(--app-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--app-text-primary)_10%,var(--app-tab-bg))] hover:text-[var(--app-text-primary)]"
        style={{ border: "1px solid var(--app-border)" }}
      >
        {kicker}
      </Link>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.75rem, 4.2vw, 2.6rem)", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.015em", textWrap: "balance" }}>{title}</h1>
      <p className="mt-3" style={{ maxWidth: "58ch", fontFamily: "var(--font-serif)", fontSize: "clamp(1.02rem, 1.9vw, 1.18rem)", lineHeight: 1.55, textWrap: "pretty" }}>
        {children}
      </p>
    </header>
  );
}

// A figure inside the serif standfirst: set in the sans so the numbers stand out from the prose.
export function Fig({ children }: { children: ReactNode }) {
  return <b style={{ fontFamily: "var(--font-ibm-plex-sans), sans-serif", fontWeight: 700, fontSize: "0.92em", fontVariantNumeric: "tabular-nums" }}>{children}</b>;
}

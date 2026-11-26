import type { ReactNode } from "react";
import OverviewEditorial from "@/components/OverviewEditorial";

// The Overview's shell. The page (app/overview/page.tsx for 2026, [year]/page.tsx for past years) is
// the title and post-election analysis; the election-night box below it lives here, so the year
// switcher swaps only the analysis and it stays mounted (user, 2026-11-17). The State TPL map that
// sat under it was removed (user, 2026-11-25).
export default function OverviewLayout({ children }: { children: ReactNode }) {
  return (
    // overflowAnchor none: Chrome's scroll anchoring otherwise shifts the page when a year switch replaces the analysis.
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", overflowAnchor: "none" }}>
      {children}
      <OverviewEditorial />
    </div>
  );
}

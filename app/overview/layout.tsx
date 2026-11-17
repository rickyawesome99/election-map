import type { ReactNode } from "react";
import OverviewEditorial from "@/components/OverviewEditorial";
import { statesData } from "@/data/statesData";
import { calculateStateTpl } from "@/lib/tplCompute";

// The Overview's shell. The page (app/overview/page.tsx for 2026, [year]/page.tsx for past years) is
// the title and post-election analysis; the results-page box and State TPL map below it live here, so
// the year switcher swaps only the analysis and they stay mounted (user, 2026-11-17).
export default function OverviewLayout({ children }: { children: ReactNode }) {
  const stateMargins = Object.fromEntries(statesData.map((state) => [state.name, calculateStateTpl(state.abbr, state.name)]));
  return (
    // overflowAnchor none: Chrome's scroll anchoring otherwise shifts the page when a year switch replaces the analysis.
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", overflowAnchor: "none" }}>
      {children}
      <OverviewEditorial data={{ stateMargins }} />
    </div>
  );
}

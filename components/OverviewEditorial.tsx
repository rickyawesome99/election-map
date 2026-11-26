"use client";

// The Overview's lower half, rendered by app/overview/layout.tsx so it stays put while the post-election
// analysis above it switches years (/overview ↔ /overview/[year], user 2026-11-17): the election-night
// box. The State TPL map that sat below it was removed (user, 2026-11-25). The forecast's national outlook
// moved to the Forecast tab (ForecastOutlook.tsx).

import Link from "next/link";
import { useSiteTheme } from "./ForecastMap";
import { PAGE_CONTAINER } from "@/lib/pageLayout";

export default function OverviewEditorial() {
  const t = useSiteTheme();
  return (
    <div className={`${PAGE_CONTAINER} pb-6 sm:pb-8`}>
      {/* The election-night replay (/enight; it was /results until 2026-11-25, when the Results page took that URL and a tab of its own), boxed at the top (user, 2026-10-25). */}
      <Link prefetch={false} href="/enight" className="group flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--app-text-primary)_5%,transparent)]" style={{ border: `2px solid ${t.textPrimary}` }}>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]">Election Night Results</div>
          <div className="mt-1 text-sm" style={{ color: t.textMuted }}>How the count came in for every Senate, governor and House race, 6 PM ET November 3 to November 16, against the forecast and the projected final margin.</div>
        </div>
        <span className="text-sm font-semibold underline decoration-dotted underline-offset-4 group-hover:decoration-solid">Open the election night page →</span>
      </Link>
    </div>
  );
}

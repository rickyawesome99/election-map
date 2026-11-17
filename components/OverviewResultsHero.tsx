import type { ReactNode } from "react";
import { PAGE_CONTAINER, PAGE_HERO_BG, PAGE_HERO_TOP, PAGE_TITLE_STYLE } from "@/lib/pageLayout";

/** The Overview's title band: "2026 Results" on /overview, "2022 Results" on /overview/[year]
 *  (the post-election analysis's past years, moved under the Overview 2026-11-17 by the user). */
export default function OverviewResultsHero({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ background: PAGE_HERO_BG }}>
      <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} pb-3 sm:pb-4`}>
        <h1 style={PAGE_TITLE_STYLE}>{title}</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>{children}</p>
      </div>
    </section>
  );
}

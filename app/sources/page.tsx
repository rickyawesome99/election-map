import { electionYear } from "@/data/forecastData";
import { SOURCE_GROUPS } from "@/data/methodologySources";
import SourcesMethodology from "@/components/methodology/SourcesMethodology";
import MethodologyToc from "@/components/methodology/MethodologyToc";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";

export const metadata = {
  title: `Sources — ${electionYear} Forecast`,
  description: "Every external source behind the data on this site, grouped by what it supplied, with the file or script it lands in.",
};

// Its own page since 2026-10-20 (it was a tab on /methodology, which now redirects here); laid out
// like the methodology tabs, with the same contents rail.
export default function SourcesPage() {
  const sources = new Set(SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => s.name.split(" — ")[0]))).size;
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        <StandfirstHeader title="Sources" size="large" bare>
          Every external source behind the site&rsquo;s data, <Fig>{sources}</Fig> in all, grouped by what it supplied and traced to the
          file it lands in, so any figure can be followed back to its publisher.
        </StandfirstHeader>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <main id="sources-content" className="min-w-0">
          <SourcesMethodology />
        </main>
        <aside className="hidden lg:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pt-8"><MethodologyToc contentId="sources-content" /></div>
        </aside>
      </div>
    </div>
  );
}

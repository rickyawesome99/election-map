import { electionYear } from "@/data/forecastData";
import SourcesPublic from "@/components/methodology-public/SourcesPublic";
import MethodologyToc from "@/components/methodology/MethodologyToc";
import { StandfirstHeader } from "@/components/StandfirstHeader";

export const metadata = {
  title: `Sources — ${electionYear} Forecast`,
  description: "Where the results, maps, polls and fundraising figures on this site come from.",
};

// The public Sources page: a plain-language list of every source, grouped by what it supplied. The full
// version (what each source feeds, the file it lands in, sources ruled out, unrecorded provenance) is
// the Sources tab of Internal Methodology. Both read data/methodologySources.ts.
export default function SourcesPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        <StandfirstHeader title="Sources" size="large" bare>
          The election offices, archives and data projects behind every number on this site.
        </StandfirstHeader>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <main id="sources-content" className="min-w-0">
          <SourcesPublic />
        </main>
        <aside className="hidden lg:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pt-8"><MethodologyToc contentId="sources-content" /></div>
        </aside>
      </div>
    </div>
  );
}

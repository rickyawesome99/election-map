import ResultsPage from "@/components/results/ResultsPage";
import { ELECTION_YEAR } from "@/lib/electionYear";

export const metadata = {
  title: `${ELECTION_YEAR} Election Results`,
  description: "Live election-night results for every Senate, governor and House race against the forecast, with a projected final margin for each race from the counties that have reported.",
};

// The page is static; everything live happens in the browser (components/results/ResultsPage),
// which also draws the header, since a race opened by its hash replaces the whole page.
export default function Page() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <ResultsPage />
    </div>
  );
}

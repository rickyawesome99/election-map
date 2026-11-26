import OverviewResultsHero from "@/components/OverviewResultsHero";
import PostElectionAnalysis from "@/components/post-election/PostElectionAnalysis";
import PostElectionSources from "@/components/post-election/PostElectionSources";
import { ELECTION_YEAR } from "@/lib/electionYear";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import { PAST_POST_ELECTION_YEARS } from "@/lib/postElectionTypes";
import { fmtDateTime } from "@/lib/resultsFormat";
import { houseNationalPopularVote, houseStatePopularVote, readResultsSnapshot } from "@/lib/resultsSnapshot";
import { readStateLegSnapshot } from "@/lib/stateLegResultsSnapshot";

// Since the election the Overview is the 2026 results: this page is the title and the post-election
// analysis (formerly /analysis/post-election, moved here 2026-11-17 by the user; that URL redirects
// here); the election-night box below it is in app/overview/layout.tsx, so it stays
// put when the year switcher moves to /overview/[year]. The forecast's national outlook moved to the
// Forecast tab (lib/outlookData.ts, user 2026-11-17).
export default function OverviewPage() {
  const { asOf, rows } = readResultsSnapshot();
  const legislature = readStateLegSnapshot();
  return (
    <>
      <OverviewResultsHero title={`${ELECTION_YEAR} Results`}>As of <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{fmtDateTime(asOf)}</span></OverviewResultsHero>
      <main className={`${PAGE_CONTAINER} pb-10 pt-2 sm:pt-0`}>
        <PostElectionAnalysis rows={rows} legislature={legislature.byState} year={ELECTION_YEAR} years={[ELECTION_YEAR, ...PAST_POST_ELECTION_YEARS]} housePvPrev={houseStatePopularVote(ELECTION_YEAR - 2)} nationalPvPrev={houseNationalPopularVote(ELECTION_YEAR - 2)} />
        <PostElectionSources legislatureAsOf={legislature.asOf} />
      </main>
    </>
  );
}

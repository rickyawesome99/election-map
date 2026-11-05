import Link from "next/link";
import PostElectionAnalysis from "@/components/post-election/PostElectionAnalysis";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { ELECTION_YEAR } from "@/lib/electionYear";
import { CIVIC_ATTRIBUTION } from "@/lib/resultsFeed";
import { fmtDateTime } from "@/lib/resultsFormat";
import { house2024PopularVote, readResultsSnapshot } from "@/lib/resultsSnapshot";
import { readStateLegSnapshot } from "@/lib/stateLegResultsSnapshot";

export const metadata = {
  title: `${ELECTION_YEAR} Post Election Analysis`,
  description: `The ${ELECTION_YEAR} Senate, governor and House results state by state, from a saved count of every race.`,
};

export default function PostElectionPage() {
  const { asOf, rows } = readResultsSnapshot();
  const legislature = readStateLegSnapshot();
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Analysis" title={`${ELECTION_YEAR} Post Election Analysis`}>
        As of <Fig>{fmtDateTime(asOf)}</Fig>
      </StandfirstHeader>
      <main className="mx-auto max-w-7xl px-4 pb-6 pt-6 sm:px-6 sm:pb-8">
        <PostElectionAnalysis rows={rows} legislature={legislature.byState} housePv24={house2024PopularVote()} />
        <details className="mt-10 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
          <summary className="cursor-pointer select-none font-semibold" style={{ color: "var(--app-text-muted)" }}>Sources and how to read this page</summary>
          <div className="mt-2 space-y-2">
          <p>
            <strong className="font-semibold">Sources.</strong> Vote counts and race calls come from <a href={CIVIC_ATTRIBUTION.href} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">civicAPI</a>. State legislature seats and calls come from The New York Times and The Associated Press, saved {fmtDateTime(legislature.asOf)}. This page doesn&rsquo;t update on its own; for the live count, see <Link href="/results" prefetch={false} className="underline underline-offset-2">Results</Link>.
          </p>
          <p>
            <strong className="font-semibold">Projected margin.</strong> Where the Results page expected the race to finish, at the time shown at the top of this page.
          </p>
          <p>
            <strong className="font-semibold">Vs. GB.</strong> A Senate or governor race&rsquo;s margin minus the state&rsquo;s House popular vote margin.
          </p>
          <p>
            <strong className="font-semibold">Vs. 24 GB.</strong> Beside Statewide: the state&rsquo;s House popular vote margin minus its 2024 House popular vote margin. Both years count every seat, including unopposed ones, as a share of all votes cast. An independent running in place of a major-party candidate counts with that party.
          </p>
          <p>
            <strong className="font-semibold">Swing.</strong> A House seat&rsquo;s margin minus its 2024 margin. It&rsquo;s blank if either year had no Democrat against a Republican.
          </p>
          <p>
            <strong className="font-semibold">Asterisk (*).</strong> The seat&rsquo;s lines changed for 2026, so its 2024 margin is our estimate, based on how the 2024 presidential vote shifted between the old and new lines. With no 2024 House race to start from, we use the presidential margin on the new lines.
          </p>
          <p>
            <strong className="font-semibold">Special cases.</strong> Alaska and Maine use ranked-choice voting: counts show first choices, while the projection is for the final round. Louisiana House results are from a single round with all candidates on one ballot. Nebraska&rsquo;s nonpartisan legislative candidates are shown by party affiliation.
          </p>
          <p>
            <strong className="font-semibold">Legislature seats.</strong> Solid seats are called or not up this year; a race with candidates from only one party counts as called. Striped seats flipped to a new party, and these make up the net change. Lighter seats aren&rsquo;t called yet and are shaded for the current leader. I means any seat held by neither major party, including independents and third parties like Vermont&rsquo;s Progressives.
          </p>
          <p>
            <strong className="font-semibold">Legislature chambers.</strong> A chamber takes a party&rsquo;s color once that party holds a majority of its seats. In an exact tie, it takes the party of the governor or governor-elect. It&rsquo;s striped if that party didn&rsquo;t run the chamber before the election, including a tied chamber or a bipartisan coalition. A chamber with only special elections counts as having no 2026 elections and shows its seats from before the election.
          </p>
          </div>
        </details>
      </main>
    </div>
  );
}

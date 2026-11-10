import { notFound } from "next/navigation";
import PostElectionAnalysis from "@/components/post-election/PostElectionAnalysis";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { ELECTION_YEAR } from "@/lib/electionYear";
import { readPastPostElection } from "@/lib/pastPostElection";
import { PAST_POST_ELECTION_YEARS } from "@/lib/postElectionTypes";

// A past year on the post-election page, in the 2026 page's layout, from the historical results files.

export const dynamicParams = false;

export function generateStaticParams() {
  return PAST_POST_ELECTION_YEARS.map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  return {
    title: `${year} Post Election Analysis`,
    description: `The ${year} president, Senate, governor, House and state legislature results state by state.`,
  };
}

export default async function PastPostElectionPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  if (!PAST_POST_ELECTION_YEARS.includes(year)) notFound();
  const { rows, legislature, housePvPrev, nationalPvPrev } = readPastPostElection(year);
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Analysis" title={`${year} Post Election Analysis`}>
        <Fig>Final results</Fig>
      </StandfirstHeader>
      <main className="mx-auto max-w-7xl px-4 pb-6 pt-2 sm:px-6 sm:pb-8">
        <PostElectionAnalysis rows={rows} legislature={legislature} year={year} years={[ELECTION_YEAR, ...PAST_POST_ELECTION_YEARS]} housePvPrev={housePvPrev} nationalPvPrev={nationalPvPrev} />
        <details className="mt-10 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
          <summary className="cursor-pointer select-none font-semibold" style={{ color: "var(--app-text-muted)" }}>Sources and how to read this page</summary>
          <div className="mt-2 space-y-2">
            <p>
              <strong className="font-semibold">Sources.</strong> Final results from the site&rsquo;s historical results, the same figures as the past election pages. A race card opens its past election page.
            </p>
            <p>
              <strong className="font-semibold">Vs. GB.</strong> A statewide race&rsquo;s margin minus the state&rsquo;s House popular vote margin. Beside Statewide, vs {String(year - 2).slice(2)} GB is the state&rsquo;s House popular vote margin minus its {year - 2} margin.
            </p>
            <p>
              <strong className="font-semibold">Swing.</strong> A House seat&rsquo;s margin minus its {year - 2} margin. An asterisk marks a seat whose lines changed for {year}: its {year - 2} margin is our estimate on the new lines, from how the latest presidential vote counted on both maps shifted between them.
            </p>
            <p>
              <strong className="font-semibold">Flips.</strong> A seat won by a different party than last time it was up, the same district number for the House. Below each margin is the seat&rsquo;s previous result. The historical results begin in 2016 for the House and president, 2012 for the Senate and 2014 for governors, so a seat whose last race came before that shows no previous result, flip or swing, and a legislature with no earlier election on file shows no net change.
            </p>
            <p>
              <strong className="font-semibold">Legislature seats.</strong> Each chamber&rsquo;s seats after the election. Net change is against the chamber&rsquo;s seats after its previous election, and the striped seats are each party&rsquo;s net gain, not every seat that changed hands. A chamber with no {year} election shows its seats from its last one.
            </p>
          </div>
        </details>
      </main>
    </div>
  );
}

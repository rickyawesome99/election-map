import Link from "next/link";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import CertificationSection from "@/components/results/CertificationSection";
import ClosestSection from "@/components/results/ClosestSection";
import CountySwingSection from "@/components/results/CountySwingSection";
import GenericBallotSection from "@/components/results/GenericBallotSection";
import LegacyHashRedirect from "@/components/results/LegacyHashRedirect";
import RawVoteSection from "@/components/results/RawVoteSection";
import ShiftsSection from "@/components/results/ShiftsSection";
import { TouchHover } from "@/components/results/ui";
import { fmtLean, fmtMargin, leanColor, marginColor } from "@/lib/colorScale";
import { ELECTION_YEAR } from "@/lib/electionYear";
import { fmtDateTime } from "@/lib/resultsFormat";
import { results2026Page } from "@/lib/results2026Page";

export const metadata = {
  title: `${ELECTION_YEAR} Results`,
  description: `The ${ELECTION_YEAR} election in detail: county swings from the 2024 presidential vote, which states have certified, each party's raw vote against 2024, the biggest shifts, the adjusted House popular vote, and the closest races for Congress, governor and the state legislatures.`,
};

const SECTIONS = [
  ["counties", "County swing"],
  ["certification", "Certification"],
  ["votes", "Raw votes"],
  ["shifts", "Biggest shifts"],
  ["house-vote", "House vote"],
  ["closest", "Closest races"],
] as const;

// The 2026 Results page (user, 2026-11-25): six sections over the saved results files
// (lib/results2026Page.ts). The election-night replay that used to live at this URL is /enight.
export default function ResultsPage() {
  const data = results2026Page();
  const gb = data.genericBallot;
  const shift = gb.y2026.imputed - gb.y2024.imputed;
  const certified = data.certification.filter((c) => c.status === "certified").length;
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <LegacyHashRedirect />
      <TouchHover />
      <StandfirstHeader kicker={String(ELECTION_YEAR)} title="Results" href="/overview" hubLabel="Overview">
        With every seat contested, the House vote came in at <Fig><span style={{ color: marginColor(gb.y2026.imputed) }}>{fmtMargin(gb.y2026.imputed)}</span></Fig>, a shift
        of <Fig><span style={{ color: leanColor(shift) }}>{fmtLean(shift)}</span></Fig> from 2024. <Fig>{certified}</Fig> of 50 states have certified their results.
      </StandfirstHeader>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-5 sm:px-6">
        <nav aria-label="Sections" className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className="ix-lift rounded-full px-2.5 py-1 font-semibold hover:text-[var(--app-text-primary)]" style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}>{label}</a>)}
          <span className="sm:ml-auto">Counts as of <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{fmtDateTime(data.asOf)}</span></span>
        </nav>

        <section id="counties" className="mb-14 scroll-mt-24">
          <LedgerSectionHead label="County swing from the 2024 presidential vote" meta="House, Senate and governor, by county" />
          <CountySwingSection />
        </section>

        <section id="certification" className="mb-14 scroll-mt-24">
          <LedgerSectionHead label="Certification and recounts" meta={`Checked ${data.certificationAsOf}`} />
          <CertificationSection states={data.certification} asOf={data.certificationAsOf} />
        </section>

        <section id="votes" className="mb-14 scroll-mt-24">
          <LedgerSectionHead label="Raw votes against 2024 and the seat's last election" meta="Each party's 2026 votes as a share of its earlier vote" />
          <RawVoteSection races={data.races} />
        </section>

        <section id="shifts" className="mb-14 scroll-mt-24">
          <LedgerSectionHead label="Biggest shifts" meta="Against President 2024, and House 2024 adjusted for redistricting" />
          <ShiftsSection races={data.races} states={data.states} />
        </section>

        <section id="house-vote" className="mb-14 scroll-mt-24">
          <LedgerSectionHead label="Adjusted House generic ballot, 2024 to 2026" meta="The House popular vote with every seat contested" />
          <GenericBallotSection national={gb} states={data.states} />
        </section>

        <section id="closest" className="mb-10 scroll-mt-24">
          <LedgerSectionHead label="Closest results" meta="Senate, governor, U.S. House and state legislatures" />
          <ClosestSection races={data.closest} />
        </section>

        <p className="text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
          <strong className="font-semibold">Sources.</strong> Senate, governor and U.S. House counts and calls come from civicAPI and state election offices, saved {fmtDateTime(data.asOf)}; state legislative counts from state election offices
          and, where a state publishes none, The Associated Press via The New York Times. These figures do not update on their own and are not final until a state certifies. For each state&rsquo;s races see
          the <Link href="/overview" prefetch={false} className="underline underline-offset-2">Overview</Link>; for how the count came in, hour by hour, see <Link href="/enight" prefetch={false} className="underline underline-offset-2">Election Night</Link>.
        </p>
      </main>
    </div>
  );
}

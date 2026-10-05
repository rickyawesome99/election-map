import type { Metadata } from "next";
import Link from "next/link";
import { electionYear } from "@/data/forecastData";
import { racePollsMeta } from "@/data/racePolls";
import { Section, P, Defs } from "@/components/methodology/kit";

export const metadata: Metadata = {
  title: `About — CT Strategies ${electionYear} Forecast`,
  description: "What this site is, who runs it, and where its data comes from.",
};

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-semibold underline decoration-dotted underline-offset-2" style={{ color: "var(--app-text-primary)" }}>{children}</Link>
);

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)" }}>CT Strategies</div>
        <h1 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6vw, 4.25rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>About</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          A forecast of the {electionYear} midterm elections, built on an atlas of past results — every House, Senate and governor
          race projected, and the history behind each seat one click away. Built and run by CT Strategies.
        </p>

        <Section id="whats-here" title="What's here">
          <Defs items={[
            { term: <A href="/overview">Overview</A>, def: "The national picture: projected control of the House and Senate, governorships, the generic ballot, and how the forecast has moved since January." },
            { term: <A href="/senate">Forecast</A>, def: `A projected margin, win probability and rating for all ${electionYear} House, Senate and governor races, each with its polls, fundraising, projected vote and county map.` },
            { term: <A href="/historical">Historical</A>, def: "Past results by state, county and congressional district from 2008, and state legislative results for every chamber from 2016." },
            { term: <A href="/model">TPL</A>, def: "True Partisan Lean: each state's, district's and county's lean once candidates, incumbency and money are accounted for, plus each candidate's record against it." },
            { term: <A href="/analysis">Analysis</A>, def: "Turnout, pollster ratings, the election calendar, and this forecast set against other forecasters." },
            { term: <A href="/methodology">Methodology</A>, def: "How every number is calculated, with backtests, a change log and the full list of sources." },
            { term: <A href="/district-finder">District Finder</A>, def: "Enter an address to see who represents it and which of those seats are on the ballot this year." },
          ]} />
        </Section>

        <Section id="how-it-works" title="How the forecast works">
          <P>
            Each race starts from the seat&rsquo;s partisan lean, adds the national environment from the generic ballot, and adjusts for
            incumbency, the candidates&rsquo; past performance and fundraising. Where a race has been polled, the result is blended with a
            polling average. Thousands of simulated elections, with shared national error, turn the races into chamber odds.
            The <A href="/methodology">Methodology</A> tab shows each step with the live numbers, and how the model performed when run on
            the 2018–2024 elections.
          </P>
          <P>
            The forecast is updated when new polls are added. Race polls currently run through {longDate(racePollsMeta.newestPollEnd)}.
          </P>
        </Section>

        <Section id="data" title="Data and credits">
          <P>
            Election results, polls, fundraising, district boundaries and demographics come from public sources — among them state election
            offices, the U.S. Census Bureau, the Federal Election Commission, the MIT Election Data and Science Lab and Wikipedia. Every
            dataset, and
            what it is used for, is listed on the <A href="/methodology/sources">Sources</A> tab.
          </P>
          <P>
            Candidate photos come from official government portraits, Wikimedia Commons and campaign materials, and belong to their
            respective owners. Maps use data © OpenStreetMap contributors.
          </P>
        </Section>
      </div>
    </div>
  );
}

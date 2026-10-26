import type { Metadata } from "next";
import Link from "next/link";
import { electionYear } from "@/data/forecastData";
import { racePollsMeta } from "@/data/racePolls";
import { forecastsFor, getChamberSimulations } from "@/lib/forecast";
import { Section, Block, P, Defs } from "@/components/methodology/kit";
import { Margin } from "@/components/methodology-public/kit";
import { StandfirstHeader } from "@/components/StandfirstHeader";

export const metadata: Metadata = {
  title: `About — CT Strategies ${electionYear} Forecast`,
  description: "What this site is, who runs it, and where its data comes from.",
};

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-semibold underline decoration-dotted underline-offset-2" style={{ color: "var(--app-text-primary)" }}>{children}</Link>
);

const pct = (p: number) => `${Math.round(p * 100)}%`;

export default function AboutPage() {
  // Live examples for "Reading the forecast": the House control odds, and the Lean Senate race whose
  // favorite has the best chance, to show that a Lean rating can still come with long odds.
  const house = getChamberSimulations().house;
  const houseDem = house.pDemControl ?? 0.5;
  const houseFav = houseDem >= 0.5 ? { party: "Democrats", other: "Republicans", p: houseDem } : { party: "Republicans", other: "Democrats", p: 1 - houseDem };
  const lean = forecastsFor("senate")
    .filter((r) => r.contest === "contested" && r.rating.startsWith("Lean"))
    .map((r) => ({ r, fav: Math.max(r.probability, 1 - r.probability) }))
    .sort((a, b) => b.fav - a.fav)[0];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <StandfirstHeader title="About" size="large" bare>
          A forecast of the {electionYear} midterm elections built on an atlas of past results with detailed history behind each seat,
          district, county, and state. Built and run by CT Strategies.
        </StandfirstHeader>

        <Section id="whats-here" title="What's here">
          <div className="max-w-3xl space-y-7">
            <Defs items={[
              { term: <A href="/overview">Overview</A>, def: "The national picture: projected control of the House and Senate, governorships, the generic ballot, and how the forecast has moved since January." },
              { term: <A href="/senate">Forecast</A>, def: `A projected margin, win probability and rating for all ${electionYear} House, Senate and governor races, each with its polls, fundraising, projected vote and county map.` },
              { term: <A href="/historical">Historical</A>, def: "Past results by state, county and congressional district from 2008, and state legislative results for every chamber from 2016." },
              { term: <A href="/model">TPL</A>, def: "True Partisan Lean: each state's, district's and county's lean once candidates, incumbency and money are accounted for, plus each candidate's record against it." },
              { term: <A href="/analysis">Analysis</A>, def: "Turnout, pollster ratings, the election calendar, and this forecast set against other forecasters." },
              { term: <A href="/methodology">Methodology</A>, def: "How every number is calculated, with backtests, a change log and the full list of sources." },
              { term: <A href="/district-finder">District Finder</A>, def: "Enter an address to see who represents it and which of those seats are on the ballot this year." },
            ]} />
          </div>
        </Section>

        <Section id="how-it-works" title="How the forecast works">
          <P>
            Each race starts from the seat&rsquo;s partisan lean, adds the national environment from the generic ballot, and adjusts for
            incumbency, the candidates&rsquo; past performance and fundraising. Where a race has been polled, the result is blended with a
            polling average. Thousands of simulated elections, with shared national error, turn the races into chamber odds.
            The <A href="/methodology">Methodology</A> page shows each step with the live numbers, and how the model performed when run on
            the 2018–2024 elections.
          </P>
          <P>
            The forecast is updated when new polls are added. Race polls currently run through {longDate(racePollsMeta.newestPollEnd)}.
          </P>
        </Section>

        <Section id="reading-the-forecast" title="Reading the forecast"
          lede="Every race on the site comes with the same three numbers: a margin, a chance of winning and a rating. Here is what each one means.">
          <div className="max-w-3xl space-y-7">
            <Defs items={[
              { term: "Margin", def: <>How far ahead the leading candidate is expected to finish, in percentage points. <Margin v={-3} /> means the Democrat is expected to win by 3 points, for example 51% to 48%. <Margin v={3} /> means the same for the Republican.</> },
              { term: "Chance of winning", def: <>How often a candidate wins when we run the election thousands of times with realistic polling errors. A candidate at 80% loses about 1 time in 5. So some 80% favorites should lose on election night. If none of them did, the numbers would have been too cautious.</> },
              { term: "Rating", def: <>A label for the margin: <strong>Tilt</strong> under 1 point, <strong>Lean</strong> 1 to 5, <strong>Likely</strong> 5 to 15, <strong>Safe</strong> 15 or more. On the House and Senate pages, Tilt races are grouped together as toss-ups.</> },
              { term: "80% range", def: "Where the result should land 8 times out of 10. It is shown for a race's margin and for each chamber's seat count." },
            ]} />
            <Block label="Why the rating follows the margin">
              <P>
                The margin is the forecast itself. The chance of winning also depends on how sure we are, so a well-polled race gets longer
                odds than an unpolled race with the same margin. Tying the rating to the margin keeps a &ldquo;Lean&rdquo; the same size of lead in
                every race.
                {lean && <> For example, <A href={`/senate/${lean.r.id.toLowerCase().replace(/-2$/, "2")}`}>{lean.r.state}&rsquo;s Senate race</A> is
                  rated {lean.r.rating} at <Margin v={lean.r.margin} />, but its favorite still wins {pct(lean.fav)} of the time.</>}
              </P>
            </Block>
            <Block label="A race page">
              <P>
                The top of the page shows the rating, the projected margin, the chance of winning, the polling average and the betting markets&rsquo; odds.
                Below that, in order: a short description of the race and the candidates, with the projected vote; fundraising; the polls,
                with how much of the forecast they make up; <strong>Forecast calculation</strong>, which shows each step from the seat&rsquo;s usual
                lean to the final margin; how the forecast has moved this year; a county map of the projected result; and past results for the seat.
              </P>
            </Block>
            <Block label="The House and Senate">
              <P>
                The <A href="/house">House</A> and <A href="/senate">Senate</A> pages show the projected seat count, the number needed for control,
                a map colored by rating, and every race grouped from toss-up to safe. The <A href="/overview">Overview</A> adds the chance
                of control. Today the {houseFav.party} win the House {pct(houseFav.p)} of the time. That means the {houseFav.other} win
                it in about {Math.max(1, Math.round((1 - houseFav.p) * 10))} of every 10 simulated elections, which is a real chance, not a long
                shot. The seat chart shows how many seats each party wins across all of those simulations.
              </P>
            </Block>
            <Block label="State legislatures">
              <P>
                The <A href="/legislatures">Legislatures</A> page lists every state chamber on the ballot with its projected seats and the chance
                that each party wins a majority. A chamber is marked &ldquo;in play&rdquo; when both parties have at least a 20% chance. Each
                chamber&rsquo;s own page shows the current seats next to the 2026 projection, the chance of control, the 80% range of seats, the
                projected statewide vote for the chamber, and a table and map of every district. Click a district to see its results,
                candidates and outlook.
              </P>
            </Block>
            <P>
              How each of these numbers is calculated is on the <A href="/methodology">Methodology</A> page.
            </P>
          </div>
        </Section>

        <Section id="data" title="Data and credits">
          <P>
            Election results, polls, fundraising, district boundaries and demographics come from public sources — among them state election
            offices, the U.S. Census Bureau, the Federal Election Commission, the MIT Election Data and Science Lab and Wikipedia. Every
            dataset, and
            what it is used for, is listed on the <A href="/sources">Sources</A> page.
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

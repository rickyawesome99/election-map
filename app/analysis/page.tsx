import Link from "next/link";
import type { ReactNode } from "react";
import HubGraphic, { type HubGraphicId } from "@/components/analysis/HubGraphics";
import { Fig } from "@/components/StandfirstHeader";
import { electionYear } from "@/data/forecastData";
import { analysisHubFigures } from "@/lib/analysisHub";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";

export const metadata = {
  title: `Analysis — ${electionYear} Forecast`,
  description: `${electionYear} U.S. election analysis`,
};

type Entry = { href: string; kicker: string; title: string; description: ReactNode; graphic?: HubGraphicId };

// The row's category pill, the same look as the page header's CategoryPill but inert: the whole
// row is already the link.
function Pill({ label }: { label: string }) {
  return (
    <span className="inline-flex self-start items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}>
      {label}
    </span>
  );
}

function Row({ e }: { e: Entry }) {
  return (
    <Link href={e.href} prefetch={false} className={`hub-row grid grid-cols-1 gap-3 py-5 sm:py-6 ${e.graphic ? "md:grid-cols-[minmax(0,1fr)_minmax(14rem,19rem)] md:gap-8 md:items-center" : ""}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
        <Pill label={e.kicker} />
        <h3 className="hub-title text-[21px] font-bold leading-[1.12] sm:text-[25px]" style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.015em" }}>{e.title}</h3>
        <p className="max-w-[60ch] text-[14px] leading-[1.5] sm:text-[15px]" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-muted)" }}>{e.description}</p>
      </div>
      {e.graphic && <HubGraphic id={e.graphic} />}
    </Link>
  );
}

// The Internal section keeps the plain list: these pages are working tools, not reports.
function PlainRow({ e }: { e: Entry }) {
  return (
    <Link href={e.href} prefetch={false} className="group grid grid-cols-1 gap-1 py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:items-baseline" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{e.kicker}</div>
      <div>
        <h3 className="text-[17px] font-bold leading-snug group-hover:underline" style={{ fontFamily: "var(--font-serif)" }}>{e.title}</h3>
        <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{e.description}</p>
      </div>
      <span className="hidden text-[13px] font-bold whitespace-nowrap sm:block" style={{ color: "var(--party-dem)" }}>Open →</span>
    </Link>
  );
}

export default function AnalysisPage() {
  const f = analysisHubFigures();
  const sections: { title: string; plain?: boolean; entries: Entry[] }[] = [
    {
      title: "Forecasting & Polling",
      entries: [
        { href: "/analysis/forecasts", kicker: "Forecasts", title: "Forecast Comparison", graphic: "forecasts",
          description: <>Every published forecast lined up against ours on all <Fig>{f.forecasts.races}</Fig> House, Senate and governor races: <Fig>{f.forecasts.models}</Fig> statistical models and <Fig>{f.forecasts.raters}</Fig> race raters, chamber toplines, and every race with every call.</> },
        { href: "/analysis/markets", kicker: "Markets", title: "Prediction Markets", graphic: "markets",
          description: <>Polymarket&rsquo;s price on all <Fig>{f.markets.races}</Fig> races this year, then every election-eve market since 2018: the favorite won <Fig>{f.markets.favoriteWon}</Fig> of the time, and a market backed the loser in <Fig>{f.markets.missed}</Fig> races.</> },
        { href: "/analysis/pollsters", kicker: "Polling", title: "Pollster Ratings", graphic: "pollsters",
          description: <><Fig>{f.pollsters.graded}</Fig> pollsters graded on <Fig>{f.pollsters.polls}</Fig> final-stretch polls since {f.pollsters.firstYear}, each scored against the result, and which way each of the <Fig>{f.pollsters.active}</Fig> active this cycle leans.</> },
        { href: "/analysis/polling-misses", kicker: "Polling", title: "Polling Misses by State", graphic: "misses",
          description: <><Fig>{f.misses.polls}</Fig> final polls of <Fig>{f.misses.races}</Fig> presidential, Senate and governor races in {f.misses.states} states since {f.misses.firstYear}. On average {f.misses.party} beat their polls by <Fig><span style={{ color: f.misses.missColor }}>{f.misses.miss}</span></Fig> points.</> },
        { href: "/analysis/popular-vote", kicker: "National", title: "Popular Vote", graphic: "popularVote",
          description: <>National margins since 2016, and whether approval, direction of country and party ID saw them coming.{f.popularVote && <> Read forward, they point to a House vote of <Fig><span style={{ color: f.popularVote.lowColor }}>{f.popularVote.low}</span></Fig> to <Fig><span style={{ color: f.popularVote.highColor }}>{f.popularVote.high}</span></Fig>.</>}</> },
      ],
    },
    {
      title: "Voters & Turnout",
      entries: [
        { href: "/analysis/turnout", kicker: "Turnout", title: "Turnout", graphic: "turnout",
          description: <>Who votes, where, and in which races since 2016: <Fig>{f.turnout.presRate}</Fig> of eligible citizens in {f.turnout.presYear}, <Fig>{f.turnout.midRate}</Fig> in the {f.turnout.midYear} midterm, and a county-by-county estimate of about <Fig>{f.turnout.votes}</Fig> House votes for every {electionYear} race.</> },
        { href: "/analysis/districts/oh-hd-31", kicker: "Precinct Analysis", title: "OH-31 Precinct Analysis", graphic: "precincts",
          description: <>Ohio House District 31 precinct by precinct: results and swings since 2016 on today&rsquo;s lines, demographics, targeting metrics, and the {electionYear} outlook.</> },
      ],
    },
    {
      title: "Reference",
      entries: [
        { href: "/analysis/delegation", kicker: "Seats", title: "Current Seat Delegation", graphic: "delegation",
          description: <>Which party holds each state&rsquo;s governorship, Senate seats, House seats and legislative chambers today, on a map or cartogram.</> },
        { href: "/analysis/calendar", kicker: "Calendar", title: "Election Calendar", graphic: "calendar",
          description: <>Which offices were on the ballot in each state and year from {f.calendar.firstYear} to {f.calendar.lastYear}: <Fig>{f.calendar.races}</Fig> races with every result, <Fig>{f.calendar.redraws}</Fig> redistrictings, and the <Fig>{f.calendar.seats}</Fig> seats up in {electionYear}.</> },
      ],
    },
    {
      title: "Internal",
      plain: true,
      entries: [
        { href: "/analysis/internal-methodology", kicker: "Models", title: "Internal Methodology", description: "The working specification of every model: each constant, formula and fitted value read live from the code, the backtests behind them, and the full change log." },
        { href: "/analysis/state-leg-models", kicker: "Models", title: "State Legislature Model Comparison", description: "Our state legislative forecast against State Navigate’s and ElectIndex’s: toplines, agreement, every chamber’s control odds and every district’s three calls." },
        { href: "/audit/state-leg-results", kicker: "Audit", title: "State Leg Results Audit", description: "Coverage and provenance of the 2016–2025 statewide chamber-year figures, plus the district-sum-vs-statewide reconciliation." },
        { href: "/audit/state-leg-pres2024", kicker: "Audit", title: "State Leg 2024 President Audit", description: "Temporary sanity check comparing aggregated state legislative district votes to official state totals." },
      ],
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <main>
        <section style={{ background: PAGE_HERO_BG }}>
          <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} pb-3`}>
            <h1 style={PAGE_TITLE_STYLE}>Analysis</h1>
          </div>
        </section>

        <div className={`${PAGE_CONTAINER} pb-14 pt-2`}>
          {sections.map((section) => (
            <section key={section.title} className="pt-8 first:pt-0 sm:pt-10">
              <h2 className="pb-3 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)", borderBottom: "2px solid var(--app-text-primary)" }}>{section.title}</h2>
              {section.entries.map((e) => section.plain ? <PlainRow key={e.href} e={e} /> : <Row key={e.href} e={e} />)}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

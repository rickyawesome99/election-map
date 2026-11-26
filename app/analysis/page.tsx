import Link from "next/link";
import type { ReactNode } from "react";
import HubGraphic, { type HubGraphicId } from "@/components/analysis/HubGraphics";
import { Fig } from "@/components/StandfirstHeader";
import { electionYear } from "@/data/forecastData";
import { analysisHubFigures } from "@/lib/analysisHub";
import { modelReview2026 } from "@/lib/modelReview2026";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";

export const metadata = {
  title: `Analysis — ${electionYear} Forecast`,
  description: `${electionYear} U.S. election analysis`,
};

type Entry = { href: string; title: string; description: ReactNode; graphic?: HubGraphicId };

// One compact row: title and a one-line description on the left, the page's small graphic on the
// right (sm and up). The whole row is the link; hover/press behavior comes from .hub-row.
function Row({ e }: { e: Entry }) {
  return (
    <Link href={e.href} prefetch={false} className={`hub-row grid grid-cols-1 gap-1 py-3.5 sm:items-center sm:gap-6 ${e.graphic ? "sm:grid-cols-[minmax(0,1fr)_11rem]" : "sm:grid-cols-[minmax(0,1fr)_auto]"}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="min-w-0">
        <h3 className="hub-title text-[17px] font-bold leading-snug sm:text-[18px]" style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.01em" }}>{e.title}</h3>
        <p className="mt-0.5 max-w-[68ch] text-[13px] leading-snug sm:text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>{e.description}</p>
      </div>
      {e.graphic
        ? <div className="hidden sm:block"><HubGraphic id={e.graphic} /></div>
        : <span className="hidden text-[13px] font-bold whitespace-nowrap sm:block" style={{ color: "var(--party-dem)" }}>Open →</span>}
    </Link>
  );
}

// Jump pills above the sections; each scrolls to its section.
function SectionPill({ id, label }: { id: string; label: string }) {
  return (
    <a href={`#${id}`} className="hub-pill inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}>
      {label}
    </a>
  );
}

export default function AnalysisPage() {
  const f = analysisHubFigures();
  const mr = modelReview2026();
  const review = { right: mr.all.right, n: mr.all.n, miss: Math.round(-mr.races.reduce((a, r) => a + r.err, 0) / mr.races.length) };
  const sections: { id: string; title: string; entries: Entry[] }[] = [
    {
      id: "2026", title: "2026",
      entries: [
        { href: "/forecast", title: `${electionYear} Forecast`, graphic: "forecast",
          description: <>The final forecast, locked before the election: margin, odds and rating for all <Fig>{f.forecasts.races}</Fig> House, Senate and governor races.</> },
        { href: "/results", title: `${electionYear} Results`, graphic: "results",
          description: <>County swings, certification, each party&rsquo;s raw vote, the adjusted House popular vote and the closest races.</> },
        { href: "/analysis/model-review", title: "2026 Model Review", graphic: "modelReview",
          description: <>How the forecast did: <Fig>{review.right}</Fig> of <Fig>{review.n}</Fig> contested races called, and where the missing <Fig><span style={{ color: "var(--party-dem)" }}>{review.miss}</span></Fig> points went.</> },
        { href: "/analysis/forecasts", title: "Forecast Comparison", graphic: "forecasts",
          description: <>Our calls against <Fig>{f.forecasts.models}</Fig> statistical models and <Fig>{f.forecasts.raters}</Fig> race raters, race by race.</> },
        { href: "/analysis/markets", title: "Prediction Markets", graphic: "markets",
          description: <>Polymarket on all <Fig>{f.markets.races}</Fig> races, and every election-eve market since 2018: the favorite won <Fig>{f.markets.favoriteWon}</Fig> of the time.</> },
      ],
    },
    {
      id: "polling", title: "Polling",
      entries: [
        { href: "/analysis/pollsters", title: "Pollster Ratings", graphic: "pollsters",
          description: <><Fig>{f.pollsters.graded}</Fig> pollsters graded on <Fig>{f.pollsters.polls}</Fig> final-stretch polls since {f.pollsters.firstYear}, and which way each leans.</> },
        { href: "/analysis/polling-misses", title: "Polling Misses by State", graphic: "misses",
          description: <><Fig>{f.misses.polls}</Fig> final polls since {f.misses.firstYear}: on average {f.misses.party} beat their polls by <Fig><span style={{ color: f.misses.missColor }}>{f.misses.miss}</span></Fig> points.</> },
      ],
    },
    {
      id: "voters", title: "Voters & Turnout",
      entries: [
        { href: "/analysis/generic-ballot", title: "Generic Ballot vs Popular Vote", graphic: "genericBallot",
          description: <>Since 2016 the contested House vote landed <Fig>{f.genericBallot.miss}</Fig> points more Republican than the final generic-ballot average.</> },
        { href: "/analysis/popular-vote", title: "Popular Vote", graphic: "popularVote",
          description: <>National margins since 2016, and whether approval, direction of country and party ID saw them coming.</> },
        { href: "/analysis/turnout", title: "Turnout", graphic: "turnout",
          description: <><Fig>{f.turnout.presRate}</Fig> of eligible citizens voted in {f.turnout.presYear}, <Fig>{f.turnout.midRate}</Fig> in {f.turnout.midYear}; who votes, where, and in which races.</> },
      ],
    },
    {
      id: "precincts", title: "Precinct Analysis",
      entries: [
        { href: "/analysis/districts/oh-hd-31", title: "OH-31 Precinct Analysis", graphic: "precincts",
          description: <>Ohio House District 31 precinct by precinct: results and swings since 2016, demographics and targeting.</> },
      ],
    },
    {
      id: "reference", title: "Reference",
      entries: [
        { href: "/historical", title: "Historical Results", graphic: "historical",
          description: <>Results by state, county and district from 2008, and every state legislative chamber from 2016.</> },
        { href: "/analysis/delegation", title: "Current Seat Delegation", graphic: "delegation",
          description: <>Which party holds each state&rsquo;s governorship, Senate and House seats and legislative chambers today.</> },
        { href: "/analysis/calendar", title: "Election Calendar", graphic: "calendar",
          description: <>Every office on the ballot by state and year, {f.calendar.firstYear}–{f.calendar.lastYear}: <Fig>{f.calendar.races}</Fig> races and <Fig>{f.calendar.redraws}</Fig> redistrictings.</> },
      ],
    },
    {
      id: "internal", title: "Internal",
      entries: [
        { href: "/analysis/internal-methodology", title: "Internal Methodology", description: "Every model constant, formula and fitted value read live from the code, with backtests and the change log." },
        { href: "/analysis/state-leg-models", title: "State Legislature Model Comparison", description: "Our state legislative forecast against State Navigate’s and ElectIndex’s, chamber by chamber and district by district." },
        { href: "/audit/precincts", title: "Precinct Data Tracker", description: "Every state, year and office in the precinct project: loaded, reconciled, or still missing." },
        { href: "/audit/state-leg-results", title: "State Leg Results Audit", description: "Coverage and provenance of the 2016–2025 chamber-year figures, with the district-sum reconciliation." },
        { href: "/audit/state-leg-pres2024", title: "State Leg 2024 President Audit", description: "Aggregated state legislative district votes compared with official state totals." },
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
          <nav aria-label="Analysis sections" className="flex flex-wrap gap-2 pb-6">
            {sections.map((section) => <SectionPill key={section.id} id={section.id} label={section.title} />)}
          </nav>
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28 sm:scroll-mt-20 pt-7 first-of-type:pt-0 sm:pt-9">
              <h2 className="pb-2.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)", borderBottom: "2px solid var(--app-text-primary)" }}>{section.title}</h2>
              {section.entries.map((e) => <Row key={e.href} e={e} />)}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

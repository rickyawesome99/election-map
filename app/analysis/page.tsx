import Link from "next/link";
import { electionYear } from "@/data/forecastData";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";

export const metadata = {
  title: `Analysis — ${electionYear} Forecast`,
  description: `${electionYear} U.S. election analysis`,
};

type Entry = { href: string; kicker: string; title: string; description: string };

const SECTIONS: { title: string; entries: Entry[] }[] = [
  {
    title: "Forecasting & Polling",
    entries: [
      { href: "/analysis/forecasts", kicker: "Forecasts", title: "Forecast Comparison", description: "How our House, Senate and governor forecasts line up against the major published models and race ratings: chamber toplines, how often each agrees with ours, and every race with every call." },
      { href: "/analysis/markets", kicker: "Markets", title: "Prediction Markets", description: `Polymarket\u2019s current price on every ${electionYear} Senate, governor and House race, bucketed and mapped, then what the markets were charging on election eve in 2018, 2020, 2022 and 2024, which favorites won, and every race they got wrong.` },
      { href: "/analysis/pollsters", kicker: "Polling", title: "Pollster Ratings", description: "How accurate each pollster has been since 2008, by cycle and by region, which way each one leans this cycle, and what a good record is worth." },
      { href: "/analysis/polling-misses", kicker: "Polling", title: "Polling Misses by State", description: "How far the final polls of every presidential, Senate and governor race since 2016 missed the result in each state, and which party kept beating its polls, on a map and race by race." },
      { href: "/analysis/popular-vote", kicker: "National", title: "Popular Vote", description: "National vote margins and seats by office since 2016, and how presidential approval, direction of country and Gallup\u2019s third-quarter party ID anticipated the House and presidential vote, read forward to 2026." },
    ],
  },
  {
    title: "Voters & Turnout",
    entries: [
      { href: "/analysis/turnout", kicker: "Turnout", title: "Turnout Analysis", description: `Who votes, where, and in which races: turnout in every general election since 2016 by state, House district and county, presidential against midterm electorates, drop-off down the ticket, and a county-by-county estimate of ${electionYear} turnout for every Senate, governor and House race.` },
      { href: "/analysis/districts/oh-hd-31", kicker: "Precinct Analysis", title: "OH-31 Precinct Analysis", description: "Ohio House District 31 precinct by precinct: results and swings since 2016 on today\u2019s lines, demographics, targeting metrics, and the 2026 outlook." },
    ],
  },
  {
    title: "Reference",
    entries: [
      { href: "/analysis/delegation", kicker: "Seats", title: "Current Seat Delegation", description: "Which party holds each state\u2019s governorship, Senate seats, House seats, and legislative chambers today, on a map or cartogram." },
      { href: "/analysis/calendar", kicker: "Calendar", title: "Election & Race Calendar", description: "Which offices were on the ballot in each state and year since 2012, and the candidates, votes, share, and margin behind every race." },
    ],
  },
  {
    title: "Internal",
    entries: [
      { href: "/analysis/state-leg-models", kicker: "Models", title: "State Legislature Model Comparison", description: "Our state legislative forecast against State Navigate\u2019s and ElectIndex\u2019s: toplines, agreement, every chamber\u2019s control odds and every district\u2019s three calls." },
      { href: "/audit/state-leg-results", kicker: "Audit", title: "State Leg Results Audit", description: "Coverage and provenance of the 2016\u20132025 statewide chamber-year figures, plus the district-sum-vs-statewide reconciliation." },
      { href: "/audit/state-leg-pres2024", kicker: "Audit", title: "State Leg 2024 President Audit", description: "Temporary sanity check comparing aggregated state legislative district votes to official state totals." },
    ],
  },
];

export default function AnalysisPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <main>
        <section
          style={{
            background: PAGE_HERO_BG,
          }}
        >
          <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} pb-2`}>
            <h1 style={PAGE_TITLE_STYLE}>Analysis</h1>
          </div>
        </section>

        <div className={`${PAGE_CONTAINER} pb-14`}>
          {SECTIONS.map((section) => (
            <section key={section.title} className="pt-8 sm:pt-10 first:pt-2 sm:first:pt-4">
              <h2 className="pb-3 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)", borderBottom: "2px solid var(--app-text-primary)" }}>{section.title}</h2>
              {section.entries.map((e) => (
                <Link key={e.href} href={e.href} prefetch={false} className="group grid grid-cols-1 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] gap-1 sm:gap-4 items-baseline py-3.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{e.kicker}</div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold leading-snug group-hover:underline" style={{ fontFamily: "var(--font-serif)" }}>{e.title}</h3>
                    <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{e.description}</p>
                  </div>
                  <span className="hidden sm:block text-sm font-bold whitespace-nowrap" style={{ color: "var(--party-dem)" }}>Read Analysis →</span>
                </Link>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

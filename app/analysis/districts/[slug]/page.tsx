import { notFound, permanentRedirect } from "next/navigation";
import { electionYear, presPastResults, senateData, governorData } from "@/data/forecastData";
import { forecastRace } from "@/lib/forecast";
import { getPrecinctDistrict, precinctDistrictSlugs, PRECINCT_DISTRICT_ALIASES } from "@/lib/precinctDistrict/registry";
import { marginOf, sumBallots, sumOffice, topOfTicket } from "@/lib/precinctDistrict/aggregate";
import { officeCandidates } from "@/lib/precinctDistrict/explorer";
import { projectDistrict } from "@/lib/precinctDistrict/project";
import DistrictHeader, { type HeaderStats } from "@/components/precinct-district/DistrictHeader";
import Outlook, { type StatewideContext } from "@/components/precinct-district/Outlook";
import PrecinctExplorer from "@/components/precinct-district/PrecinctExplorer";
import Trends from "@/components/precinct-district/Trends";
import DemoScatter from "@/components/precinct-district/DemoScatter";
import DataNotes from "@/components/precinct-district/DataNotes";
import { LedgerSectionHead } from "@/components/RaceDetailSections";

export async function generateStaticParams() {
  return precinctDistrictSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = getPrecinctDistrict(slug);
  if (!data) return { title: "District Not Found" };
  return {
    title: `${data.config.shortName} Precinct Analysis — ${electionYear}`,
    description: `Precinct-level results, swings, demographics, targeting and the ${electionYear} outlook for ${data.config.name}.`,
  };
}

export default async function PrecinctDistrictPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (PRECINCT_DISTRICT_ALIASES[slug]) permanentRedirect(`/analysis/districts/${PRECINCT_DISTRICT_ALIASES[slug]}`);
  const data = getPrecinctDistrict(slug);
  if (!data) notFound();

  const { config, results } = data;
  const years = [...config.years].sort((a, b) => b - a);
  const latestYear = years[0];
  const latest = results.years[String(latestYear)];
  const presYear = years.find((y) => results.years[String(y)]?.offices.pres) ?? null;
  const presYr = presYear != null ? results.years[String(presYear)] : null;
  const presMargin = presYr ? marginOf(sumOffice(presYr.precincts, "pres")) : null;
  const statePres = presYear != null ? presPastResults[config.state]?.find((r) => r.year === presYear)?.margin ?? null : null;
  const legOffice = latest.offices.sthouse ? "sthouse" : latest.offices.stsen ? "stsen" : topOfTicket(latest);
  const legTally = legOffice ? sumOffice(latest.precincts, legOffice) : null;
  const { ballots, reg, turnout } = sumBallots(latest.precincts);

  const stats: HeaderStats = {
    latestYear,
    presYear,
    presMargin,
    leanVsState: presMargin != null && statePres != null ? presMargin - statePres : null,
    stateName: config.stateName,
    legMargin: legTally ? marginOf(legTally) : null,
    legLabel: legOffice ? `${latestYear} ${latest.offices[legOffice].short}` : `${latestYear}`,
    legCandidates: legOffice ? officeCandidates(latest, legOffice) : null,
    registered: reg,
    ballots,
    turnout,
    precincts: latest.precincts.length,
  };

  const projection = projectDistrict(data);

  // The site's own statewide 2026 forecasts for this state, for context under the outlook.
  const statewide: StatewideContext[] = [
    ...senateData.filter((r) => r.state === config.stateName).map((r) => ({
      label: `Senate${r.electionType === "Special" ? " special" : ""} (${r.candidates?.dem?.name?.split(" ").pop() ?? "D"} vs ${r.candidates?.rep?.name?.split(" ").pop() ?? "R"})`,
      margin: forecastRace(r).margin, dem: r.candidates?.dem?.name ?? "", rep: r.candidates?.rep?.name ?? "",
      href: `/senate/${r.id.toLowerCase().replace(/-2$/, "2")}`,
    })),
    ...governorData.filter((r) => r.state === config.stateName).map((r) => ({
      label: `Governor (${r.candidates?.dem?.name?.split(" ").pop() ?? "D"} vs ${r.candidates?.rep?.name?.split(" ").pop() ?? "R"})`,
      margin: forecastRace(r).margin, dem: r.candidates?.dem?.name ?? "", rep: r.candidates?.rep?.name ?? "",
      href: `/governor/${config.state.toLowerCase()}`,
    })),
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <DistrictHeader config={config} stats={stats} />
      <main className="mx-auto max-w-7xl px-4 pb-12 pt-4 sm:px-6">
        <section id="outlook" className="scroll-mt-24">
          <LedgerSectionHead label={`${electionYear} outlook`} />
          <Outlook config={config} p={projection} statewide={statewide} finance={data.finance} />
        </section>

        <section id="explorer" className="mt-12 scroll-mt-24">
          <LedgerSectionHead label="Precinct explorer" meta="results · swing · demographics · targeting · 2026 projection" />
          <PrecinctExplorer data={data} projection={projection} />
        </section>

        <section id="trends" className="mt-12 scroll-mt-24">
          <LedgerSectionHead label="Trends" meta="two-party margin by year, as counted" />
          <Trends data={data} />
        </section>

        <section id="demographics" className="mt-12 scroll-mt-24">
          <LedgerSectionHead label="Demographics and the vote" meta="every precinct, one census metric against one result" />
          <DemoScatter data={data} />
        </section>

        <div className="mt-12">
          <DataNotes data={data} />
        </div>
      </main>
    </div>
  );
}

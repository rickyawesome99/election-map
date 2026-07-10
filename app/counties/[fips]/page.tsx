import { notFound } from "next/navigation";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { FIPS_TO_STATE } from "@/lib/fips";
import BackButton from "@/components/BackButton";
import StateCountyMap from "@/components/StateCountyMap";
import { AboutRaceCard, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";

const YEARS = [2008, 2012, 2016, 2020, 2024] as const;

const PRESIDENTIAL_CANDIDATES: Record<(typeof YEARS)[number], { dem: string; rep: string }> = {
  2008: { dem: "Barack Obama", rep: "John McCain" },
  2012: { dem: "Barack Obama", rep: "Mitt Romney" },
  2016: { dem: "Hillary Clinton", rep: "Donald Trump" },
  2020: { dem: "Joe Biden", rep: "Donald Trump" },
  2024: { dem: "Kamala Harris", rep: "Donald Trump" },
};

function getAreaLabel(abbr: string): string {
  if (abbr === "LA") return "Parish";
  if (abbr === "AK") return "Borough";
  return "County";
}

function stateSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export async function generateStaticParams() {
  return Object.keys(countyPresidentialData).map((fips) => ({ fips }));
}

export async function generateMetadata({ params }: { params: Promise<{ fips: string }> }) {
  const { fips } = await params;
  const county = countyPresidentialData[fips];
  if (!county) return { title: "County Not Found" };
  const stateName = FIPS_TO_STATE[fips.slice(0, 2)]?.name ?? county.state;
  const areaLabel = getAreaLabel(county.state);
  return {
    title: `${county.countyName} ${areaLabel}, ${stateName} — Past Election Results`,
    description: `2008-2024 presidential election results for ${county.countyName} ${areaLabel}, ${stateName}.`,
  };
}

export default async function CountyPage({ params }: { params: Promise<{ fips: string }> }) {
  const { fips } = await params;
  const county = countyPresidentialData[fips];
  if (!county) notFound();

  const stateName = FIPS_TO_STATE[fips.slice(0, 2)]?.name ?? county.state;
  const areaLabel = getAreaLabel(county.state);

  const results: DetailPastResult[] = YEARS
    .filter((y) => county.years[y])
    .map((y) => {
      const r = county.years[y]!;
      const candidates = PRESIDENTIAL_CANDIDATES[y];
      return {
        year: y,
        demPct: r.demPct,
        repPct: r.repPct,
        demVotes: r.demVotes,
        repVotes: r.repVotes,
        demCandidate: candidates.dem,
        repCandidate: candidates.rep,
      };
    })
    .sort((a, b) => b.year - a.year);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <main className="max-w-2xl mx-auto px-4 pt-0 pb-4 sm:px-6">
        <div className="mb-1">
          <BackButton />
        </div>

        <div className="mb-3 flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold leading-none" style={{ color: "var(--app-text-primary)" }}>
            {county.countyName} {areaLabel}
          </h1>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            <a href={`/states/${stateSlug(stateName)}?from=${encodeURIComponent(`/counties/${fips}?from=${encodeURIComponent("/?tab=counties")}`)}`} className="hover:underline">
              {stateName}
            </a>
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="order-1 overflow-hidden rounded-xl" style={{ border: "1px solid var(--app-border)" }}>
            <StateCountyMap stateAbbr={county.state} stateName={stateName} height={280} highlightFips={fips} />
          </div>

          <div className="order-2">
            <AboutRaceCard
              title="About this County"
              description={`${county.countyName} ${areaLabel} is located in ${stateName}.`}
              items={[
                { label: "State", value: stateName },
                { label: "Area type", value: areaLabel },
                { label: "FIPS", value: fips },
              ]}
            />
          </div>

          <div className="order-3">
            {results.length > 0 ? (
              <PastElectionResultsSection
                results={results}
                fallbackYears={[2024, 2020, 2016, 2012, 2008]}
                showElectionType={false}
                swingCycleYears={4}
              />
            ) : (
              <div className="rounded-xl p-4 text-sm" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}>
                No historical presidential results available for this {areaLabel.toLowerCase()}.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

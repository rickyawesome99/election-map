import { notFound } from "next/navigation";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { senateCandidatesByYear } from "@/data/senateCandidatesByYear";
import { countyGovernorData } from "@/data/countyGovernorData";
import { governorCandidatesByYear } from "@/data/governorCandidatesByYear";
import { countyHouseData } from "@/data/countyHouseData";
import { countyDemographics } from "@/data/countyDemographics";
import { FIPS_TO_STATE } from "@/lib/fips";
import BackButton from "@/components/BackButton";
import StateCountyMap from "@/components/StateCountyMap";
import { AboutRaceCard, CountyDemographicsCard, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";

const YEARS = [2008, 2012, 2016, 2020, 2024] as const;

const PRESIDENTIAL_CANDIDATES: Record<(typeof YEARS)[number], { dem: string; rep: string }> = {
  2008: { dem: "Barack Obama", rep: "John McCain" },
  2012: { dem: "Barack Obama", rep: "Mitt Romney" },
  2016: { dem: "Hillary Clinton", rep: "Donald Trump" },
  2020: { dem: "Joe Biden", rep: "Donald Trump" },
  2024: { dem: "Kamala Harris", rep: "Donald Trump" },
};

// Determines tie-break order when more than one race type shares a year (e.g. 2024
// President + 2024 Senate), matching the type order used in the Counties map toggle.
const RACE_TYPE_ORDER = ["President", "Governor", "Senate", "House"];

function getAreaLabel(abbr: string): string {
  if (abbr === "LA") return "Parish";
  if (abbr === "AK") return "Borough";
  return "County";
}

// A county's House number is the SUM of every congressional district touching it (see
// data/countyHouseData.ts), and which district(s) those are can change year to year via
// redistricting - so this is computed per year, not once for the county as a whole.
function formatDistrictLabel(stateAbbr: string, districts: number[]): string | undefined {
  if (districts.length === 0) return undefined;
  const labels = districts.map((d) => `${stateAbbr}-${String(d).padStart(2, "0")}`);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
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
    description: `Past presidential, Senate, and Governor election results for ${county.countyName} ${areaLabel}, ${stateName}.`,
  };
}

export default async function CountyPage({ params }: { params: Promise<{ fips: string }> }) {
  const { fips } = await params;
  const county = countyPresidentialData[fips];
  if (!county) notFound();

  const stateName = FIPS_TO_STATE[fips.slice(0, 2)]?.name ?? county.state;
  const areaLabel = getAreaLabel(county.state);

  const presidentResults: DetailPastResult[] = YEARS
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
        electionType: "President",
      };
    });

  const senateCounty = countySenateData[fips];
  const senateResults: DetailPastResult[] = senateCounty
    ? Object.entries(senateCounty.years)
        .filter(([, r]) => r)
        .map(([y, r]) => {
          const year = Number(y);
          const candidates = senateCandidatesByYear[county.state]?.[year];
          return {
            year,
            demPct: r!.demPct,
            repPct: r!.repPct,
            demVotes: r!.demVotes,
            repVotes: r!.repVotes,
            demCandidate: candidates?.dem,
            repCandidate: candidates?.rep,
            electionType: "Senate",
          };
        })
    : [];

  const governorCounty = countyGovernorData[fips];
  const governorResults: DetailPastResult[] = governorCounty
    ? Object.entries(governorCounty.years)
        .filter(([, r]) => r)
        .map(([y, r]) => {
          const year = Number(y);
          const candidates = governorCandidatesByYear[county.state]?.[year];
          return {
            year,
            demPct: r!.demPct,
            repPct: r!.repPct,
            demVotes: r!.demVotes,
            repVotes: r!.repVotes,
            demCandidate: candidates?.dem,
            repCandidate: candidates?.rep,
            electionType: "Governor",
          };
        })
    : [];

  const houseCounty = countyHouseData[fips];
  const houseResults: DetailPastResult[] = houseCounty
    ? Object.entries(houseCounty.years)
        .filter(([, r]) => r)
        .map(([y, r]) => {
          const year = Number(y);
          const votesKnown = r!.votesKnown !== false;
          return {
            year,
            demPct: r!.demPct,
            repPct: r!.repPct,
            demVotes: votesKnown ? r!.demVotes : undefined,
            repVotes: votesKnown ? r!.repVotes : undefined,
            electionType: "House",
            note: r!.samePartyNote ?? (votesKnown ? undefined : "Uncontested race - no vote count is available for this county."),
            districtLabel: formatDistrictLabel(county.state, r!.districts),
          };
        })
    : [];

  const merged: DetailPastResult[] = [...presidentResults, ...governorResults, ...senateResults, ...houseResults].sort(
    (a, b) =>
      b.year - a.year ||
      RACE_TYPE_ORDER.indexOf(a.electionType!) - RACE_TYPE_ORDER.indexOf(b.electionType!)
  );

  // Swing compares each race to the most recent prior result of the *same* race type -
  // computed here (rather than left to PastElectionResultsSection's built-in swingCycleYears
  // auto-calc) because that calc assumes one fixed cycle length and a single race type; with
  // President (4-year) and Senate (6-year) rows interleaved, a naive year-cycle match would
  // wrongly diff a Senate result against a President result from 4 years earlier.
  const results: DetailPastResult[] = merged.map((res) => {
    const prev = merged
      .filter((r) => r.electionType === res.electionType && r.year < res.year)
      .sort((a, b) => b.year - a.year)[0];
    const swing = prev ? parseFloat(((prev.demPct - prev.repPct) - (res.demPct - res.repPct)).toFixed(1)) : null;
    return { ...res, swing };
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <main className="max-w-7xl mx-auto px-4 pt-0 pb-4 sm:px-6">
        <div className="mb-1">
          <BackButton />
        </div>

        <div className="mb-3 flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold leading-none" style={{ color: "var(--app-text-primary)" }}>
            {county.countyName} {areaLabel}
          </h1>
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            <a href={`/states/${county.state.toLowerCase()}`} className="hover:underline">
              {stateName}
            </a>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
          {/* Left column — display:contents on mobile so children become direct grid items (enabling order-based reflow), flex-col on desktop */}
          <div className="contents md:flex md:flex-col md:gap-3">
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
                  showElectionType
                  scrollable
                  maxHeight="400px"
                />
              ) : (
                <div className="rounded-xl p-4 text-sm" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}>
                  No historical election results available for this {areaLabel.toLowerCase()}.
                </div>
              )}
            </div>
          </div>

          {/* Right column — display:contents on mobile, flex-col on desktop */}
          <div className="contents md:flex md:flex-col md:gap-3">
            <div className="order-4">
              <CountyDemographicsCard {...(countyDemographics[fips] ?? {})} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import { notFound } from "next/navigation";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { senateCandidatesByYear, specialSenateCandidatesByYear } from "@/data/senateCandidatesByYear";
import { countyGovernorData } from "@/data/countyGovernorData";
import { governorCandidatesByYear } from "@/data/governorCandidatesByYear";
import { countyHouseData } from "@/data/countyHouseData";
import { houseData, senateData, senateNoElection, senateHoldovers } from "@/data/forecastData";
import { countyDemographics } from "@/data/countyDemographics";
import { FIPS_TO_STATE } from "@/lib/fips";
import { calculateCountyModel } from "@/lib/tplCompute";
import { fmtMargin, marginColor, marginToRating, getRatingColors } from "@/lib/colorScale";
import BackButton from "@/components/BackButton";
import StateCountyMap from "@/components/StateCountyMap";
import CountyTplCard from "@/components/CountyTplCard";
import CountySpreadColumns from "@/components/CountySpreadColumns";
import CountyCompareCard from "@/components/CountyCompareCard";
import CountyDemographicsStrip from "@/components/CountyDemographicsStrip";
import CountyLeanTrendChart from "@/components/CountyLeanTrendChart";
import { AboutRaceCard, LedgerSectionHead, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";

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
// "Senate Special" sits right after "Senate" so a same-year regular+special pair (e.g.
// GA 2020) sorts predictably instead of the special row jumping ahead of President/
// Governor (RACE_TYPE_ORDER.indexOf returns -1 for any unlisted string, which sorts first).
const RACE_TYPE_ORDER = ["President", "Governor", "Senate", "Senate Special", "House"];

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

function senateSeatHref(
  stateAbbr: string,
  year: number,
  demCandidate: string | undefined,
  repCandidate: string | undefined,
  isSpecial: boolean,
): string {
  const seats = [
    ...senateData
      .filter((seat) => seat.id.replace(/-2$/, "") === stateAbbr)
      .map((seat) => ({ href: `/senate/${seat.id.toLowerCase().replace(/-2$/, "2")}`, pastResults: seat.pastResults ?? [] })),
    ...senateNoElection
      .filter((seat) => seat.abbr === stateAbbr)
      .map((seat) => ({ href: `/senate/${seat.abbr.toLowerCase()}`, pastResults: seat.pastResults ?? [] })),
    ...senateHoldovers
      .filter((seat) => seat.abbr === stateAbbr)
      .map((seat) => ({ href: `/senate/${seat.abbr.toLowerCase()}2`, pastResults: seat.pastResults ?? [] })),
  ];

  const candidateMatch = seats.find((seat) => seat.pastResults.some((result) =>
    result.year === year &&
    result.demCandidate === demCandidate &&
    result.repCandidate === repCandidate &&
    (result.electionType?.toLowerCase().includes("special") ?? false) === isSpecial
  ));
  if (candidateMatch) return candidateMatch.href;

  // Regular Senate classes recur every six years. This covers older county rows
  // that predate the history currently displayed on the corresponding seat page.
  const seatClass = year % 6 === 2 ? 1 : year % 6 === 4 ? 2 : 3;
  return seats.find((seat) => seat.pastResults.some((result) => result.seatClass === seatClass))?.href
    ?? `/senate/${stateAbbr.toLowerCase()}`;
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
        electionHref: `/states/${county.state.toLowerCase()}`,
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
            electionHref: senateSeatHref(county.state, year, candidates?.dem, candidates?.rep, false),
          };
        })
    : [];

  // A state can hold a SEPARATE special Senate election the same year as its regular one
  // (e.g. GA 2020, MN/MS 2018, OK 2022, NE 2024) - specialYears/specialSenateCandidatesByYear
  // are the sibling structures countySenateData.ts/senateCandidatesByYear.ts keep for that
  // second race (see [[project_county_election_scrape]] memory). electionType "Senate
  // Special" matches the convention PastElectionResultsSection already understands
  // (badges it, excludes it from swing calc) for the live /senate/[id] pages.
  const specialSenateResults: DetailPastResult[] = senateCounty
    ? Object.entries(senateCounty.specialYears)
        .filter(([, r]) => r)
        .map(([y, r]) => {
          const year = Number(y);
          const candidates = specialSenateCandidatesByYear[county.state]?.[year];
          return {
            year,
            demPct: r!.demPct,
            repPct: r!.repPct,
            demVotes: r!.demVotes,
            repVotes: r!.repVotes,
            demCandidate: candidates?.dem,
            repCandidate: candidates?.rep,
            electionType: "Senate Special",
            electionHref: senateSeatHref(county.state, year, candidates?.dem, candidates?.rep, true),
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
            electionHref: `/governor/${county.state.toLowerCase()}`,
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
          const soleDistrict = r!.districts.length === 1 ? r!.districts[0] : null;
          const districtId = soleDistrict == null
            ? null
            : `${county.state}-${String(soleDistrict).padStart(2, "0")}`;
          return {
            year,
            demPct: r!.demPct,
            repPct: r!.repPct,
            demVotes: votesKnown ? r!.demVotes : undefined,
            repVotes: votesKnown ? r!.repVotes : undefined,
            electionType: "House",
            electionHref: districtId == null || !houseData.some((race) => race.name === districtId)
              ? undefined
              : `/house/${districtId.toLowerCase()}`,
            note: r!.samePartyNote ?? (votesKnown ? undefined : "Uncontested race - no vote count is available for this county."),
            districtLabel: formatDistrictLabel(county.state, r!.districts),
          };
        })
    : [];

  const merged: DetailPastResult[] = [...presidentResults, ...governorResults, ...senateResults, ...specialSenateResults, ...houseResults].sort(
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

  // TPL figures are deliberately restricted to 2018+ (see G.YEARS / G.YEAR_WEIGHTS in
  // data/tplModelData.ts, which calculateCountyModel already keys off) — only the Past
  // Race Results ledger above reaches back to 2008.
  const calc = calculateCountyModel(fips);
  const hasCountyData = !!calc && calc.races.some((r) => r.NM != null);
  const tpl = hasCountyData ? calc!.tpl : null;
  const rating = tpl != null ? marginToRating(tpl) : null;
  const ratingColors = rating ? getRatingColors(rating) : null;
  const heroIsD = tpl != null && tpl <= 0;

  const sortedResults = results.slice().sort((a, b) => b.year - a.year);
  const latestWithVotes = sortedResults.find((r) => r.demVotes != null && r.repVotes != null);
  const turnout = latestWithVotes ? (latestWithVotes.demVotes ?? 0) + (latestWithVotes.repVotes ?? 0) : null;
  const latestHouse = sortedResults.find((r) => r.electionType === "House" && r.districtLabel);
  const districtCount = latestHouse?.districtLabel
    ? latestHouse.districtLabel.split(/,|&/).filter((s) => s.trim().length > 0).length
    : null;

  const knownYearAggs = hasCountyData
    ? calc!.yearAggregations.filter((agg) => agg.racesPresent.length > 0).sort((a, b) => a.year - b.year)
    : [];
  const swing =
    knownYearAggs.length >= 2
      ? parseFloat((knownYearAggs[knownYearAggs.length - 1].WRS - knownYearAggs[knownYearAggs.length - 2].WRS).toFixed(1))
      : null;
  const swingFromYear = knownYearAggs.length >= 2 ? knownYearAggs[knownYearAggs.length - 2].year : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero */}
      <div
        style={{
          background: tpl != null
            ? `linear-gradient(135deg, color-mix(in srgb, ${heroIsD ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`
            : "var(--app-bg)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-8 sm:pb-10">
          <div className="mb-5 -ml-2">
            <BackButton />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                  {county.state}
                </span>
                {rating && ratingColors && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0" style={{ background: ratingColors.bg, color: ratingColors.text }}>
                    {rating}
                  </span>
                )}
              </div>
              <h1
                className="mt-2 whitespace-nowrap"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
              >
                {county.countyName}
              </h1>
              <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
                {areaLabel} ·{" "}
                <a href={`/states/${county.state.toLowerCase()}`} className="hover:underline">
                  {stateName}
                </a>
              </div>
            </div>

            {tpl != null && (
              <div className="shrink-0 sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
                  County TPL
                </div>
                <div
                  className="tabular-nums"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)", fontWeight: 700, lineHeight: 1, marginTop: "0.35rem", color: marginColor(tpl) }}
                >
                  {fmtMargin(tpl)}
                </div>
              </div>
            )}
          </div>

          {/* Stat row */}
          {(turnout != null || swing != null || districtCount != null) && (
            <div className="mt-8 pt-5 flex flex-wrap gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
              {turnout != null && latestWithVotes && (
                <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
                  <div className="text-2xl font-extrabold tabular-nums">
                    {turnout >= 1_000_000 ? `${(turnout / 1_000_000).toFixed(2)}M` : turnout.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                    {latestWithVotes.year} Turnout
                  </div>
                </div>
              )}
              {swing != null && swingFromYear != null && (
                <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
                  <div
                    className="text-2xl font-extrabold tabular-nums"
                    style={{ color: swing === 0 ? "var(--app-text-primary)" : swing > 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                  >
                    {swing === 0 ? "=" : swing > 0 ? "→R" : "←D"}{Math.abs(swing).toFixed(1)}
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                    Swing Since {swingFromYear}
                  </div>
                </div>
              )}
              {districtCount != null && (
                <div>
                  <div className="text-2xl font-extrabold tabular-nums">{districtCount}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                    Congressional District{districtCount !== 1 ? "s" : ""}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 pb-10 sm:px-6">

        {/* County Map */}
        <section className="mb-10">
          <StateCountyMap stateAbbr={county.state} stateName={stateName} height={280} highlightFips={fips} showLabel={false} />
        </section>

        <CountySpreadColumns
          left={
            <>
              <section className="mb-8">
                <LedgerSectionHead label="About This County" />
                <AboutRaceCard
                  bare
                  title="About this County"
                  description={`${county.countyName} ${areaLabel} is located in ${stateName}.`}
                  items={[
                    { label: "State", value: stateName },
                    { label: "Area type", value: areaLabel },
                    { label: "FIPS", value: fips },
                    ...(latestHouse?.districtLabel
                      ? [{ label: `Congressional District${districtCount !== 1 ? "s" : ""}`, value: latestHouse.districtLabel }]
                      : []),
                  ]}
                />
              </section>

              {countyDemographics[fips] && (
                <section className="mb-8">
                  <LedgerSectionHead label="Demographics" />
                  <CountyDemographicsStrip {...countyDemographics[fips]} />
                </section>
              )}

              {hasCountyData && (
                <section>
                  <LedgerSectionHead label={`How ${county.countyName} Compares`} meta="True Partisan Lean vs. state and a national baseline" />
                  <CountyCompareCard
                    fips={fips}
                    stateAbbr={county.state}
                    stateName={stateName}
                    countyLabel={`${county.countyName} ${areaLabel}`}
                  />
                </section>
              )}
            </>
          }
          rightHead={<LedgerSectionHead label="Past Race Results" />}
          rightBody={
            results.length > 0 ? (
              <PastElectionResultsSection
                results={results}
                fallbackYears={[2024, 2020, 2016, 2012, 2008]}
                showElectionType
                showSpecialBadgeForSpecialElections
                cardStyle="ledger"
                bare
              />
            ) : (
              <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
                No historical election results available for this {areaLabel.toLowerCase()}.
              </p>
            )
          }
        />

        {hasCountyData && (
          <section className="mt-10">
            <LedgerSectionHead label="Partisan Lean by Cycle" meta="Weighted Racial Score (WRS), by election year" />
            <CountyLeanTrendChart yearAggregations={calc!.yearAggregations} />
          </section>
        )}

        <section className="mt-10">
          <LedgerSectionHead
            label="TPL Model Calculation"
            right={
              tpl != null ? (
                <span className="text-sm font-bold tabular-nums" style={{ color: marginColor(tpl) }}>
                  {fmtMargin(tpl)}
                </span>
              ) : undefined
            }
          />
          <CountyTplCard
            fips={fips}
            countyLabel={`${county.countyName} ${areaLabel}`}
            stateAbbr={county.state}
            stateName={stateName}
          />
        </section>
      </main>
    </div>
  );
}

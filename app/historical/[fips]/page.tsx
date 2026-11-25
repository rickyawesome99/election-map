import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { senateCandidatesByYear, specialSenateCandidatesByYear } from "@/data/senateCandidatesByYear";
import { countyGovernorData } from "@/data/countyGovernorData";
import { governorCandidatesByYear } from "@/data/governorCandidatesByYear";
import { countyHouseData } from "@/data/countyHouseData";
import { houseData, senateData, senateNoElection, senateHoldovers } from "@/data/forecastData";
import { countyDemographics } from "@/data/countyDemographics";
import { countyRaces2026 } from "@/lib/raceResults2026";
import { FIPS_TO_STATE } from "@/lib/fips";
import { calculateCountyModel } from "@/lib/tplCompute";
import { countyLeanTrend } from "@/lib/leanTrend";
import { marginToRating, getRatingColors, fmtLean, leanColor } from "@/lib/colorScale";
import { pastElectionHref } from "@/lib/pastElections";
import StateCountyMap from "@/components/StateCountyMap";
import { titleSize } from "@/components/RaceHero";
import CountyTplCard from "@/components/CountyTplCard";
import CountyCompareCard from "@/components/CountyCompareCard";
import DemographicsStrip from "@/components/DemographicsStrip";
import { AboutRaceCard, LedgerSectionHead, LedgerSubhead, PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import { StatePill, PILL } from "@/components/RaceHeroPills";

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
  return joinLabels(districts.map((d) => `${stateAbbr}-${String(d).padStart(2, "0")}`));
}

function joinLabels(labels: string[]): string {
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
  if (candidateMatch) return pastElectionHref("senate", candidateMatch.href.split("/").pop() ?? "", year) ?? candidateMatch.href;

  // Regular Senate classes recur every six years. This covers older county rows
  // that predate the history currently displayed on the corresponding seat page.
  const seatClass = year % 6 === 2 ? 1 : year % 6 === 4 ? 2 : 3;
  return seats.find((seat) => seat.pastResults.some((result) => result.seatClass === seatClass))?.href
    ?? `/senate/${stateAbbr.toLowerCase()}`;
}

// 3,100 county pages: rendered on first request and cached until the next deploy rather than
// prebuilt, which keeps the build to the ~700 race, state and legislature pages people open most.
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
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
        electionHref: pastElectionHref("president", county.state.toLowerCase(), y) ?? `/states/${county.state.toLowerCase()}`,
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
            electionHref: pastElectionHref("governor", county.state.toLowerCase(), year) ?? `/governor/${county.state.toLowerCase()}`,
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
              : pastElectionHref("house", districtId.toLowerCase(), year) ?? `/house/${districtId.toLowerCase()}`,
            note: r!.samePartyNote ?? (votesKnown ? undefined : "Uncontested race - no vote count is available for this county."),
            districtLabel: formatDistrictLabel(county.state, r!.districts),
          };
        })
    : [];

  // 2026: the saved results the race pages show (lib/raceResults2026.ts), until 2026 is merged into
  // the historical county files. Senate and governor are shares of every vote, like the race
  // pages; House is the two-party split of every district piece in the county, like the past
  // House rows above, so its swing compares like with like.
  const races2026 = countyRaces2026(fips);
  const statewide2026: DetailPastResult[] = races2026
    .filter((r) => r.office !== "house")
    .map((r) => ({
      year: 2026,
      demPct: (r.demVotes / r.total) * 100,
      repPct: (r.repVotes / r.total) * 100,
      demVotes: r.demVotes,
      repVotes: r.repVotes,
      demCandidate: r.demName,
      repCandidate: r.repName,
      demParty: r.demParty,
      repParty: r.repParty,
      electionType: r.office === "governor" ? "Governor" : r.special ? "Senate Special" : "Senate",
      electionHref: r.office === "governor"
        ? `/governor/${r.raceId.toLowerCase()}`
        : `/senate/${r.raceId.toLowerCase().replace(/-2$/, "2")}`,
    }));
  const housePieces = races2026.filter((r) => r.office === "house").sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const house2026: DetailPastResult[] = [];
  if (housePieces.length > 0) {
    const d = housePieces.reduce((a, r) => a + r.partyD, 0), rep = housePieces.reduce((a, r) => a + r.partyR, 0);
    const sole = housePieces.length === 1 ? housePieces[0] : null;
    const odd = housePieces.filter((r) => r.contest !== "contested");
    if (d + rep > 0) {
      house2026.push({
        year: 2026,
        demPct: (d / (d + rep)) * 100,
        repPct: (rep / (d + rep)) * 100,
        demVotes: d,
        repVotes: rep,
        // One contested district: its candidates by name; several, or an odd contest, the parties.
        ...(sole && sole.contest === "contested"
          ? { demCandidate: sole.demName, repCandidate: sole.repName, demParty: sole.demParty, repParty: sole.repParty }
          : {}),
        electionType: "House",
        electionHref: sole && houseData.some((race) => race.name === sole.label) ? `/house/${sole.label.toLowerCase()}` : undefined,
        districtLabel: joinLabels(housePieces.map((r) => r.label)),
        note: odd.length > 0
          ? `${joinLabels(odd.map((r) => r.label))} had ${odd.length === 1 ? "an " : ""}${odd.some((r) => r.contest.startsWith("uncontested")) ? "uncontested or single-party" : "single-party"} general election${odd.length === 1 ? "" : "s"}; the split counts every candidate by party.`
          : undefined,
      });
    }
  }

  const merged: DetailPastResult[] = [...presidentResults, ...governorResults, ...senateResults, ...specialSenateResults, ...houseResults, ...statewide2026, ...house2026].sort(
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

  // TPL aggregation covers 2016–2026 incl. odd years (a county's 2026 rows come from the overlay, lib/tpl2026Inputs.ts) (see G.YEARS / G.YEAR_WEIGHTS in
  // data/tplModelData.ts, which calculateCountyModel already keys off) — only the Past
  // Race Results ledger above reaches back to 2008.
  const calc = calculateCountyModel(fips);
  const trend = countyLeanTrend(fips);
  const hasCountyData = !!calc && calc.races.some((r) => r.NM != null);
  const tpl = hasCountyData ? calc!.tpl : null;
  const rating = tpl != null ? marginToRating(tpl) : null;
  const ratingColors = rating ? getRatingColors(rating) : null;
  const heroIsD = tpl != null && tpl <= 0;

  const sortedResults = results.slice().sort((a, b) => b.year - a.year);
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

  const soleDistrictHref = latestHouse?.districtLabel && districtCount === 1 && houseData.some((r) => r.name === latestHouse.districtLabel)
    ? `/house/${latestHouse.districtLabel.toLowerCase()}`
    : null;
  // FIPS and the swing first: both are short. The districts come last and may wrap, since a large
  // county's list (Cook: eleven districts) is wider than the page. Its hyphens are non-breaking, so
  // the list breaks between districts and never inside "IL-06".
  const facts = [
    { label: "FIPS", value: fips },
    ...(swing != null && swingFromYear != null
      ? [{
          label: `Swing Since ${swingFromYear}`,
          value: swing === 0 ? "EVEN" : `${swing > 0 ? "R" : "D"}+${Math.abs(swing).toFixed(1)}`,
          color: swing === 0 ? undefined : swing > 0 ? "var(--party-rep)" : "var(--party-dem)",
        }]
      : []),
    ...(latestHouse?.districtLabel
      ? [{ label: `District${districtCount !== 1 ? "s" : ""}`, value: latestHouse.districtLabel.replace(/-/g, "\u2011"), href: soleDistrictHref, wrap: true }]
      : []),
  ];
  const demographics = countyDemographics[fips];

  const checks = (label: string, value: ReactNode, title?: string) => (
    <span className="whitespace-nowrap" title={title}>{label} {value}</span>
  );
  const bold = (color: string, text: string) => <b className="font-bold tabular-nums" style={{ color }}>{text}</b>;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero — laid out like the House pages' (components/RaceHero.tsx): pills,
          the title with the model's checks under it, the state's county map at the right; the lean's tint fades out downward into the page. */}
      <div
        style={{
          background: tpl != null
            ? `linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(135deg, color-mix(in srgb, ${heroIsD ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`
            : "var(--app-bg)",
        }}
      >
        <div className={`${PAGE_CONTAINER} pt-6 pb-[21px]`}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <StatePill name={stateName} abbr={county.state} />
              <span className={PILL} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>{areaLabel}</span>
              {rating && ratingColors && (
                <span className={PILL} style={{ background: ratingColors.bg, color: ratingColors.text }}>
                  {rating}
                </span>
              )}
            </div>
          </div>

          {/* The map hangs at the right, out of the flow, so the header is only as tall as its text. */}
          <div className="mt-2 relative">
            <div className="min-w-0 pr-40 sm:pr-72">
              <h1
                className="min-w-0"
                style={{ fontFamily: "var(--font-serif)", fontSize: titleSize(), fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance", color: "var(--app-text-primary)" }}
              >
                {county.countyName}
              </h1>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                {checks("County TPL", tpl != null ? bold(leanColor(tpl), fmtLean(tpl)) : bold("var(--app-text-very-muted)", "—"))}
                {trend && checks(
                  "Trend 2020→24",
                  bold(leanColor(trend.last), fmtLean(trend.last)),
                  "The county's 2020 to 2024 presidential shift, minus the change in the national environment TPL removes (every state counting equally, not the popular vote). A companion to County TPL, not part of it.",
                )}
              </div>
            </div>
            {/* The state's counties with this one highlighted — zoomable, click a county for its card. */}
            <div className="absolute right-0 -top-8 sm:-top-10 w-36 sm:w-64">
              <StateCountyMap inset stateAbbr={county.state} stateName={stateName} height="clamp(130px, 32vw, 210px)" highlightFips={fips} showLabel={false} />
            </div>
          </div>
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} pb-10`}>
        <div className="flex flex-col gap-8">
          <section>
            <AboutRaceCard bare fitFacts title={`About this ${areaLabel}`} items={facts}>
              {demographics && (
                <>
                  <LedgerSubhead rule={false} label="Demographics" meta="ACS 2020–24 5-year estimates." />
                  <DemographicsStrip {...demographics} layout="grid" />
                </>
              )}
            </AboutRaceCard>
          </section>

          {hasCountyData && (
            <section>
              <LedgerSectionHead label={`How ${county.countyName} Compares`} />
              <CountyCompareCard
                fips={fips}
                stateAbbr={county.state}
                stateName={stateName}
                name={county.countyName}
                areaLabel={areaLabel}
              />
            </section>
          )}

          <section>
            <LedgerSectionHead label="Past Race Results" />
            {results.length > 0 ? (
              // Every race since 2008 runs long, so the list scrolls in a fixed height like the House pages' vote history.
              <div className="county-spread-fade" style={{ maxHeight: 560, overflowY: "auto", overflowX: "hidden", paddingRight: 6 }}>
              <PastElectionResultsSection
                results={results}
                fallbackYears={[2024, 2020, 2016, 2012, 2008]}
                showElectionType
                showSpecialBadgeForSpecialElections
                cardStyle="ledger"
                bare
              />
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
                No historical election results available for this {areaLabel.toLowerCase()}.
              </p>
            )}
          </section>

          <CountyTplCard fips={fips} countyLabel={`${county.countyName} ${areaLabel}`} />
        </div>
      </main>
    </div>
  );
}

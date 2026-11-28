import PostElectionAnalysis from "@/components/post-election/PostElectionAnalysis";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import YearEnvironmentSection from "@/components/years/YearEnvironment";
import YearSectionNav from "@/components/years/YearSectionNav";
import { YearOfficeSection } from "@/components/years/YearSections";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import { fmtDateTime } from "@/lib/resultsFormat";
import { buildYearPage } from "@/lib/yearPage";
import { YEAR_PAGE_YEARS } from "@/lib/yearPageTypes";

// One election year as a whole (/years for the newest, /years/[year] for the rest): the national
// environment, the Overview's state boxes, then a summary of each office on the ballot. The title
// and year switcher above it are app/years/layout.tsx.
export default function YearPage({ year }: { year: number }) {
  const data = buildYearPage(year);
  const { states } = data;
  return (
    <main className={`${PAGE_CONTAINER} pb-12 pt-3`}>
      <YearSectionNav status={data.asOf ? `As of ${fmtDateTime(data.asOf)}` : "Final results"}
        sections={[{ id: "environment", label: "Environment" }, { id: "states", label: "State by state" }, ...data.offices.map((o) => ({ id: o.key, label: o.title }))]} />
      <YearEnvironmentSection year={year} env={data.environment} />
      <section id="states" className="mt-12 scroll-mt-24">
        <LedgerSectionHead label="State by State" meta={`Pick a state for its ${year} races`} />
        <PostElectionAnalysis rows={states.rows} legislature={states.legislature} year={year} years={YEAR_PAGE_YEARS} housePvPrev={states.housePvPrev} nationalPvPrev={states.nationalPvPrev} basePath="/years" embedded stateNames={states.stateNames} />
      </section>
      {data.offices.map((o) => <YearOfficeSection key={o.key} o={o} year={year} />)}
    </main>
  );
}

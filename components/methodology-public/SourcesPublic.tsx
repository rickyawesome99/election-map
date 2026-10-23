import { SOURCE_GROUPS, SOURCE_KIND_LABEL, type Source } from "@/data/methodologySources";
import { A, Chapter, KeyFigures, Steps, VERY_MUTED } from "./kit";

// Public /sources: the plain-language version of the Sources tab on Internal Methodology
// (components/methodology/SourcesMethodology.tsx). Both read data/methodologySources.ts, so a source
// added there appears here with no other step. Only the one-line description of each group is written
// here (PLAIN); a group missing from it shows under its own title. File paths, the sources tried and
// ruled out, and the datasets with unrecorded provenance stay internal.

const PLAIN: Record<string, { title: string; intro: string }> = {
  results: { title: "Election results", intro: "Results for president, Senate, governor and House, statewide and by district. Every row was checked against the certified count." },
  county: { title: "County results", intro: "Results by county for president since 2008, and for Senate, governor and House since 2016. Each state's counties are checked to add up to its statewide total." },
  "by-district": { title: "Results by congressional district", intro: "How each House district voted for president and in statewide races, including on the district lines in place for 2026." },
  "state-leg": { title: "State legislatures", intro: "Results for every state legislative chamber since 2016, how each legislative district voted for president, and who holds each seat today." },
  boundaries: { title: "Maps", intro: "District, county and state boundaries, mostly from the Census Bureau. Past results are always drawn on the lines they were run on." },
  finance: { title: "Fundraising", intro: "Money raised by each candidate: federal filings for House and Senate, state filings for governors. Both candidates in a race always come from the same source." },
  polling: { title: "Polls", intro: "This year's polls, and an archive of past polls used to test how much a polling average should count." },
  people: { title: "Candidates", intro: "The offices candidates have held before, and their official portraits." },
  demographics: { title: "Demographics", intro: "Population, race and ethnicity, education and income, from the Census Bureau's American Community Survey." },
  services: { title: "Address lookup and maps", intro: "Services the District Finder calls while you search for an address." },
};

const baseName = (s: Source) => s.name.split(" — ")[0];

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      {sources.map((s) => (
        <li key={s.name} className="py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="text-[15px] font-semibold leading-snug">
            {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">{s.name}</a> : s.name}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider" style={VERY_MUTED}>{SOURCE_KIND_LABEL[s.kind]}</div>
        </li>
      ))}
    </ul>
  );
}

export default function SourcesPublic() {
  const distinct = new Map(SOURCE_GROUPS.flatMap((g) => g.sources).map((s) => [baseName(s), s.kind]));
  const count = (k: string) => [...distinct.values()].filter((v) => v === k).length;

  return (
    <>
      <Chapter id="overview" kicker="Sources" title="Where the data comes from"
        intro="Every result, map, poll and fundraising figure on this site comes from a published source. Official government records come first. Academic archives and volunteer data projects fill in what election offices don't publish in a usable form.">
        <KeyFigures items={[
          { value: distinct.size, label: "sources in all" },
          { value: count("official"), label: "official government sources" },
          { value: count("academic") + count("project"), label: "academic archives and data projects" },
        ]} />
        <Steps items={[
          { title: "Official records first", body: "A state canvass, a Census file or a federal filing is used wherever one exists in a usable form." },
          { title: "Then trusted compilations", body: "Academic archives such as the MIT Election Data and Science Lab, and volunteer projects such as OpenElections, fill the gaps, summed up from precinct returns where needed." },
          { title: "Wikipedia only when it checks out", body: "Wikipedia's tables of certified results are used only when they add up to the official totals already on file." },
          { title: "Never a guess", body: "If no source covers something, it stays blank on the site rather than being estimated." },
        ]} />
      </Chapter>

      {SOURCE_GROUPS.map((g) => {
        const plain = PLAIN[g.id];
        return (
          <Chapter key={g.id} id={g.id} title={plain?.title ?? g.title} intro={plain?.intro}>
            <SourceList sources={g.sources} />
          </Chapter>
        );
      })}

      <Chapter id="more" title="How the numbers are used">
        <p className="max-w-[66ch] text-[15px] leading-[1.65]">What the site does with this data, from partisan lean to the forecast, is explained on the <A href="/methodology">Methodology</A> page.</p>
      </Chapter>
    </>
  );
}

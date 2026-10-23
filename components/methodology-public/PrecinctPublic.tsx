import { getPrecinctDistrict, precinctDistrictSlugs } from "@/lib/precinctDistrict/registry";
import { projectDistrict } from "@/lib/precinctDistrict/project";
import { A, BuildUp, Chapter, Label, QA, SeeIt, Steps } from "./kit";

// Public Precinct districts tab: the plain-language version of
// components/methodology/PrecinctMethodology.tsx. Update alongside it when the outlook's or the
// targeting metrics' STRUCTURE changes.

export default function PrecinctPublic() {
  const slug = precinctDistrictSlugs()[0];
  const data = getPrecinctDistrict(slug)!;
  const p = projectDistrict(data);
  const name = data.config.shortName;

  return (
    <>
      <Chapter id="scope" kicker="Precinct districts" title="A district, precinct by precinct"
        intro={<>A precinct-district page, starting with <A href={`/analysis/districts/${slug}`}>{name}</A>, shows one state legislative district in fine detail: every precinct&rsquo;s results and swings since 2016, its demographics, measures for deciding where to campaign, and a {2026} outlook.</>} />

      <Chapter id="eras" kicker="Boundaries" title="Comparing years when the lines move"
        intro="Counties redraw precincts often, and new precincts frequently keep old names. So each set of precinct lines is treated as its own era. To show older results on today's precincts, each old precinct's votes are divided among the current precincts it overlaps, in proportion to the people who live in each overlapping piece (from the 2020 Census, block by block)." />

      <Chapter id="outlook" kicker={String(2026)} title="The district outlook"
        intro="The outlook uses the same recipe as the rest of the site, kept simple: the district's lean from its own precincts' results in every race, the national mood, incumbency, and fundraising where both nominees' reports are on file. It has no polls and no candidate-strength term.">
        <div>
          <Label meta="live">{name}</Label>
          <BuildUp steps={[
            { label: "The district's lean", note: "from its precincts' past results", value: p.lean, total: true },
            { label: "The national mood", value: p.envPts },
            { label: "Incumbency", note: "open seat", value: 0 },
            ...(p.money ? [{ label: "Fundraising", note: "the unusual part of the gap", value: p.money.pts }] : []),
            { label: "Projected margin", note: `${Math.round(Math.max(p.pD, 1 - p.pD) * 100)}% for the ${p.margin > 0 ? "Republican" : "Democrat"}`, value: p.margin, total: true },
          ]} />
        </div>
      </Chapter>

      <Chapter id="precincts" kicker="Precincts" title="Where to campaign">
        <Steps items={[
          { title: "A lean for every precinct",
            body: "Each precinct's lean is how it has voted compared with the district as a whole, with recent elections counting much more. Those differences are applied to the district's projection, so the precincts add up to it." },
          { title: "A turnout estimate for every precinct",
            body: "Each precinct's ballots per registered voter in recent midterms, applied to today's registration." },
          { title: "A priority ranking",
            body: "Precincts are ranked by the votes available there: ticket-splitters who could be persuaded, plus supporters who vote in presidential years but skip midterms. The rank comes with a category (base, turnout, contested, persuasion) that suggests the job to be done." },
        ]} />
        <QA items={[
          { q: "How does it compare with the statewide model?", a: <>Each page shows its outlook next to the site&rsquo;s general <A href="/methodology/state-leg">state legislature projection</A> for the same seat. The two share most of their parts. The precinct page also counts every statewide race in the lean and measures fundraising against the state&rsquo;s own legislative races.</> },
        ]} />
        <SeeIt><A href={`/analysis/districts/${slug}`}>{name}</A>, under Analysis.</SeeIt>
      </Chapter>
    </>
  );
}

import Link from "next/link";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegRedistricting } from "@/data/stateLegRedistricting";
import { stateLegCandidates2026, stateLegCandidates2026Fetched } from "@/data/stateLegCandidates2026";
import { stateLegOutgoing2026, stateLegOutgoing2026Fetched } from "@/data/stateLegOutgoing2026";
import { stateLegMoneyCoverage } from "@/lib/stateLegMoney";
import { contest2026 } from "@/lib/stateLegAtlas";
import { buildPresByEraAuditRows } from "@/lib/stateLegPresByEraAudit";
import { STATE_LEG_FORECAST_CONSTANTS as SC, projectAllChambers } from "@/lib/stateLegForecast";
import { STATE_LEG_VALIDATION } from "@/data/stateLegValidation";
import { STATE_LEG_POPVOTE_VALIDATION as PV } from "@/data/stateLegPopularVoteValidation";
import { STATE_LEG_POPVOTE_CONSTANTS as PC, projectAllChamberPopularVotes } from "@/lib/stateLegPopularVote";
import { MIDTERM_WEIGHTS } from "@/lib/turnoutModel";
import { STATE_LEG_INDEPENDENT_VALIDATION as IV } from "@/data/stateLegIndependentValidation";
import { STATE_LEG_TYPE_WEIGHT_SWEEP as SW } from "@/data/stateLegTypeWeightSweep";
import { STATE_LEG_MONEY_SWEEP as MS } from "@/data/stateLegMoneySweep";
import { STATE_LEG_ENV_SCALE_SWEEP as ES } from "@/data/stateLegEnvScaleSweep";
import { structuralMoneyModel } from "@/lib/stateLegMoneyModel";
import { getNationalEnvironment } from "@/lib/tplCompute";
import { Block, Code, Constants, DataTable, Defs, FilesAndCommands, Formula, N, P, Section, type ConstantRow } from "./kit";

// Every STATE_LEG_FORECAST_CONSTANTS key and where it is documented on this tab.
const DOCUMENTED_IN = {
  TYPE_WEIGHTS: "state-leg#projection", RECENT_SEAT_BOOST: "state-leg#projection", INCUMBENCY_PTS: "state-leg#projection", SIGMA: "state-leg#projection", STATE_SHOCK: "state-leg#projection",
  MIN_COVERAGE: "state-leg#projection", SIMS: "state-leg#projection",
  IND_RECORD_SHARE: "state-leg#projection", IND_PRIOR_PTS: "state-leg#projection", IND_SHRINK_K: "state-leg#projection", IND_SIGMA: "state-leg#projection",
  MONEY_K: "state-leg#projection", MONEY_CAP: "state-leg#projection", PARTIAL_CYCLE_GAP_SCALE: "state-leg#projection",
} satisfies Record<keyof typeof SC, string>;
void DOCUMENTED_IN;
const DOCUMENTED_IN_PV = {
  BASIS_WEIGHTS: "state-leg#popular-vote", DROPOFF_SHRINK_VOTES: "state-leg#popular-vote", UNOPPOSED_TURNOUT: "state-leg#popular-vote", OTHER_SHRINK_RACES: "state-leg#popular-vote",
} satisfies Record<keyof typeof PC, string>;
void DOCUMENTED_IN_PV;

const fmtM = (m: number | null) => (m == null ? "—" : Math.abs(m) < 0.05 ? "EVEN" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function coverage() {
  let districts = 0, named = 0, winners = 0, incumbents = 0, uncontested = 0, noCount = 0;
  for (const years of Object.values(stateLegResults)) {
    for (const chambers of Object.values(years)) {
      for (const block of Object.values(chambers)) {
        if (!block) continue;
        for (const r of Object.values(block.districts)) {
          districts += 1;
          if (r.candidates?.length) named += 1;
          if (r.candidates?.some((c) => c.winner)) winners += 1;
          if (r.candidates?.some((c) => c.incumbent)) incumbents += 1;
          if (r.uncontested) uncontested += 1;
          if (r.noCount) noCount += 1;
        }
      }
    }
  }
  return { districts, named, winners, incumbents, uncontested, noCount };
}

export default function StateLegMethodology() {
  const cov = coverage();
  const audit = buildPresByEraAuditRows();
  const holdouts = audit.filter((r) => r.holdout).map((r) => ({ ...r, mae: r.holdout!.mae, max: r.holdout!.max }));
  const sortedMae = [...holdouts].sort((a, b) => a.mae - b.mae);
  const medianMae = sortedMae.length ? sortedMae[Math.floor(sortedMae.length / 2)].mae : 0;
  const worst = [...holdouts].sort((a, b) => b.mae - a.mae).slice(0, 5);
  const eraCount = audit.length;
  const states = new Set(audit.map((r) => r.abbr)).size;
  let transitions = 0, redrawn = 0;
  for (const chambers of Object.values(stateLegRedistricting)) for (const eras of Object.values(chambers)) for (const block of Object.values(eras ?? {})) {
    for (const e of Object.values(block)) { transitions += 1; if (e.retainedPopPct < 99.5 || e.contributors.length > 1) redrawn += 1; }
  }

  return (
    <>
      <Section id="scope" kicker="Legislative atlas" title="One page per chamber, one record per district"
        lede={<>The <Link href="/states/oh/legislature/house" className="underline underline-offset-2">chamber pages</Link> (<Code>/states/[state]/legislature/house</Code> and <Code>/senate</Code>, Nebraska&apos;s single chamber under <Code>senate</Code>) show every state legislative district: its members, every general election since 2016 with named candidates, its presidential vote on each map it has existed on, its demographics and its redistricting history. A district is addressed by hash (<Code>#hd-31</Code>, <Code>#sd-5</Code>), so a link from search or the district finder opens the page on that seat. Nothing here is a model: this tab documents the three datasets the pages are built from and the measured error of the one that is estimated.</>}>
        <Defs items={[
          { term: "Scope", def: "General elections only. Special elections are not collected, and a seat whose only race in a year was a special concurrent with the general shows its votes without names." },
          { term: "District keys", def: <>The boundary data&apos;s own codes: numbers almost everywhere, letters for the Alaska Senate, county code plus number in New Hampshire (<Code>BE1</Code>), names in Vermont and Massachusetts. A past year&apos;s row is the race held under that key on that year&apos;s map, which can be a different place: Ohio renumbered its whole House in 2022, so HD-31&apos;s 2020 row is a Cincinnati seat and its 2022 row a Summit County one. The lines column and the redistricting section say so.</> },
          { term: "Downstream", def: <>The corrected chamber margin is live in the <Link href="/methodology/state-tpl" className="underline underline-offset-2">State TPL</Link>; the district projection and the <Link href="/legislatures" className="underline underline-offset-2">State Legislatures</Link> board are documented below.</> },
        ]} />
      </Section>

      <Section id="president-by-era" kicker="Dataset A" title="President 2016, 2020 and 2024 on every map era"
        lede={<>For every chamber, the presidential vote inside each district on the current map AND on each superseded map in <Code>public/state-leg-districts-historical/</Code>. <N>{states}</N> states, <N>{eraCount}</N> chamber-eras. The 2024 figure on the current map is the precinct-exact one from the legislature page; everything else is an overlay.</>}>
        <Block label="Method">
          <P>Dave&apos;s Redistricting publishes each state&apos;s 2016, 2020 and (for 38 states) 2024 presidential returns disaggregated to census blocks and re-aggregated to 2020 VTDs, with geometry. Each VTD is intersected with the era&apos;s district polygons in an equal-area projection and its votes split by the share of its area in each district; slivers under 0.2% are dropped and the rest renormalised so every VTD is allocated in full. Per-district rounding is largest-remainder per party, so a chamber&apos;s sum reproduces the state total exactly. The 2020 VTDs are used for the 2011-cycle maps too, since no 2010-VTD geometry is published.</P>
        </Block>
        <Block label="Measured error" meta="the overlay's 2024 margin vs the precinct-exact 2024 file, per district, current map only">
          <P>Median mean absolute error across the <N>{holdouts.length}</N> chambers with an independent 2024 answer: <N>{medianMae.toFixed(2)}</N> points of margin. The error is almost entirely where a district line cuts a large rural VTD unevenly in population, so the worst chambers are rural Houses. A state whose 2024 file was itself produced by the same overlay reads 0 by construction and is not evidence. Full table on the <Link href="/audit/state-leg-results" className="underline underline-offset-2">audit page</Link>, section 4.</P>
          <DataTable align="llrrr" head={["State", "Chamber", "Districts", "Mean error", "Worst district"]} rows={worst.map((r) => [r.abbr, r.chamberLabel, r.holdout!.n, r.mae.toFixed(2), r.max.toFixed(1)])} caption="The five chambers the overlay fits worst." maxWidth="max-w-xl" />
        </Block>
        <Block label="Known gaps">
          <Defs items={[
            { term: "No 2024 in DRA", def: "AK AR CT ID ME MI ND NJ OK OR PA SD have 2024 only on the current map (the precinct-exact file); cross-era comparisons there use 2020." },
            { term: "New Hampshire floterials", def: "Have no polygon in any boundary file. On the current map their presidential figures are the sum of the base districts they overlay (the roster's components), which gives them presidential rows, an imputation in the chamber margin and a projection; on the superseded 2020 map they are still absent." },
          ]} />
        </Block>
      </Section>

      <Section id="candidates" kicker="Dataset B" title="Candidates, incumbency and winners"
        lede={<>Names, party, votes and, where the source carries them, incumbency and the winner, attached to the per-district results. Live coverage: <N>{cov.named.toLocaleString()}</N> of <N>{cov.districts.toLocaleString()}</N> district-years named ({(100 * cov.named / cov.districts).toFixed(1)}%), <N>{cov.winners.toLocaleString()}</N> with a marked winner, <N>{cov.incumbents.toLocaleString()}</N> with a marked incumbent, <N>{cov.uncontested.toLocaleString()}</N> unopposed, <N>{cov.noCount.toLocaleString()}</N> with no published count.</>}>
        <Block label="Sources, in order of precedence">
          <Defs items={[
            { term: "2016–2022", def: "Klarner's State Legislative Election Returns candidate file: one row per candidate per contest, with exper = inc for the incumbent and outcome = w for the winner. Regular generals only (etype g; Louisiana's jungle rounds, with the runoff winning where one was held). Names: the file's surname field runs compound surnames together and sometimes glues on a middle name or another candidate's surname (\"Siffordthayn\" for Bill Sifford, who ran against Steven Thayn), so where it marks a surname as compound the name as filed and the file's own part types decide — a known hyphenated or compound surname is shown with its hyphen or space; a merely possible one only where another source spells the same person with one; an extra word glued on is dropped for the filed surname." },
            { term: "2024", def: "MEDSL precinct returns (names only) for 75 chamber-years; the Wikipedia chamber-election articles for Arizona, Iowa, Oregon, Nebraska and New Mexico; the New York State Board of Elections canvass, kept per fusion line so the list matches the party-line vote buckets." },
            { term: "Odd years", def: "Klarner through 2021; the Wikipedia articles for Louisiana, Mississippi, New Jersey and Virginia 2023 and New Jersey and Virginia 2025; the Mississippi recapitulation sheet and the Louisiana Secretary of State workbooks where the articles fell short." },
            { term: "Hand-transcribed years", def: "New Hampshire 2022 House (the state's election-database export, which also corrected the earlier county-PDF parse) and Vermont 2018 Senate (the election archive's town export)." },
            { term: "Derived flags", def: "Where a source marked no winners, incumbents or unopposed seats in a chamber-year, they are derived: winners by name-match to the sitting member elected that year (which resolves Idaho, Washington and West Virginia post races), then top-N by votes; incumbents by name-match to the chamber's winners in the previous four years; unopposed where no more real candidates than seats. A derived flag never sits beside a sourced one in the same chamber-year." },
          ]} />
        </Block>
        <Block label="Invariant">
          <P>A candidate list is written only when its votes sum to the district&apos;s recorded total (exactly for the official sources, within 0.6% for Wikipedia&apos;s transcriptions). No vote number was changed by any of these passes, with one exception recorded in the change log: New Hampshire&apos;s 2022 House, where the official export showed the earlier parse had double-counted 17 districts.</P>
        </Block>
      </Section>

      <Section id="redistricting" kicker="Dataset C" title="Redistricting history and the crosswalk"
        lede={<>For each pair of consecutive maps, what every new district is made of: <N>{transitions.toLocaleString()}</N> district-transitions, <N>{redrawn.toLocaleString()}</N> of them with changed lines.</>}>
        <Block label="Method">
          <P>The two maps&apos; polygons are intersected and each piece gets its 2020 Census population by area-apportioning the same VTD file&apos;s counts, so a new district&apos;s composition is measured in people rather than land. The record carries the previous-map districts it draws from with their population shares, its county composition on both maps, and its 2020 presidential margin on both sets of lines from dataset A. The description is generated from those numbers, geography first and the lean shift as a number, in the style of the House redistricting descriptions.</P>
          <P>The contributor shares are also the crosswalk the 2026 projection will use: a seat&apos;s pre-redraw results are relocated onto today&apos;s lines by population overlap and corrected by the presidential delta between the two polygons.</P>
        </Block>
      </Section>

      <Section id="candidates-2026" kicker="Dataset D" title="The 2026 field"
        lede={(() => {
          let districts = 0, contested = 0, open = 0, chambers = 0;
          for (const ch of Object.values(stateLegCandidates2026)) for (const block of Object.values(ch)) {
            if (!block) continue;
            chambers += 1;
            for (const c of Object.values(block)) { const x = contest2026(c)!; districts += 1; if (x.status === "contested") contested += 1; if (x.open) open += 1; }
          }
          return <>Every district on the 2026 ballot with its general-election candidates, from Ballotpedia&apos;s chamber election pages (fetched {stateLegCandidates2026Fetched}): <N>{chambers}</N> chambers, <N>{districts.toLocaleString()}</N> districts, <N>{contested.toLocaleString()}</N> with both major parties, <N>{open.toLocaleString()}</N> with no incumbent running. Ballotpedia&apos;s own caveat applies: the lists may be incomplete until every state certifies its ballot. Special elections on the same November ballot, which the chamber pages leave out, are added from data-entry/state-leg-specials-2026.csv (Ballotpedia&apos;s special-election list and each district page, checked against Wikipedia): the seat is up in 2026 — the whole district, or in a multi-member district the one member&apos;s seat, run as its own race — and a special for the weeks left of a term whose regular race is on the same ballot is skipped. Nebraska&apos;s candidates carry their party from data-entry/nebraska_2026_candidate_parties.csv.</>;
        })()}>
        <Block label="Method">
          <P>Each page&apos;s &ldquo;general election 2026&rdquo; candidate table is read: one row per district with Democratic, Republican and Other columns, &ldquo;(i)&rdquo; after an incumbent, &ldquo;(N seats)&rdquo; on a multi-member district and a party or write-in tag on the Other entries. District rows are matched to the boundary data&apos;s keys the same way the results are; unmatched rows are reported, never guessed. A seat counts as contested when both major parties have a non-write-in candidate, and as open when nobody in the field is marked an incumbent.</P>
        </Block>
        <Block label="Why a seat is open" meta={`Wikipedia chamber articles, fetched ${stateLegOutgoing2026Fetched}`}>
          {(() => {
            let members = 0, chambers = 0;
            const cats: Record<string, number> = {};
            for (const ch of Object.values(stateLegOutgoing2026)) for (const block of Object.values(ch)) {
              if (!block) continue;
              chambers += 1;
              for (const list of Object.values(block)) for (const o of list) { members += 1; cats[o.category] = (cats[o.category] ?? 0) + 1; }
            }
            const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(", ");
            return <P>The English Wikipedia article on each chamber&apos;s 2026 election keeps a list of members not seeking re-election with the reason (<Code>scripts/fetch-state-leg-outgoing-2026.py</Code>): <N>{members}</N> outgoing members across <N>{chambers}</N> chambers ({top}). The articles write these three ways (district first, ordinal first, or name first with &ldquo;representing district N&rdquo;); each line is parsed to a district key, a name, a party (from the subsection or inline) and the reason as written. Chambers whose article carries the status only in a results table (North Dakota, West Virginia Senate) or not at all are absent. Shown on the district header (&ldquo;Not running&rdquo;) and on the member&apos;s candidate page.</P>;
          })()}
        </Block>
      </Section>

      <Section id="money" kicker="Dataset E" title="Fundraising"
        lede={(() => {
          const c = stateLegMoneyCoverage();
          const cycles = Object.keys(c.byCycle).sort();
          return <>Each general-election candidate&apos;s total contributions for the cycle, per the state&apos;s own filings: <N>{c.states}</N> states, <N>{c.chamberCycles}</N> chamber-cycles ({cycles.join(", ")}), <N>{c.districts.toLocaleString()}</N> district-cycles, <N>{c.matched.toLocaleString()}</N> of <N>{c.candidates.toLocaleString()}</N> listed candidates matched to a filing. Shown on the district header (the current cycle, with its data-through date) and as a Raised column in the electoral history, and the input to the projection&apos;s money term (below).</>;
        })()}>
        <Block label="Sources">
          <Defs items={[
            { term: "Transparency USA", def: "Republishes 25 states' campaign-finance filings (AL AZ CA CO FL GA IA ID IL IN MI MN NC NH NM NV NY OH PA SC TX VA WA WI WY) with one page per race and cycle, 2018 through 2026 (Virginia 2017 through 2025). scripts/fetch-state-leg-finance-tu.py reads every legislative race page of a cycle: candidate, party, incumbency, total contributions, total expenditures and ballot status, general and primary. The current cycle's figures are to-date and grow with each report." },
            { term: "FollowTheMoney", def: "The other 25 states and 2016 everywhere, through the API used for the governor rows (scripts/fetch-state-leg-finance-ftm.py; one call per state, cycle and chamber). Its data stops at the 2024 election year, and the free tier's quota is small, so this half fills as keys allow." },
            { term: "State portals", def: "For the states Transparency USA does not cover, each state's own disclosure system, one script per state (scripts/fetch-state-leg-finance-{st}.py): race or committee totals where the portal publishes them (Oklahoma, Nebraska, Kentucky, Tennessee, Massachusetts, Vermont, Maine, North Dakota, New Jersey's post-election summary), the sum of itemized contributions elsewhere. Portals list every filer, so scripts/assign-state-leg-finance.ts keeps a record only when its name matches a general-election candidate of that cycle, within the district when the portal names one. Private contributions only: Connecticut's and Maine's public grants are left out. New Jersey's joint slate committees are split evenly among their members. Maryland's 2022 cycle starts in November 2020, so it undercounts; Hawaii and Missouri use report totals." },
            { term: "2016 and older cycles", def: "Transparency USA starts with 2018, so the 2016 cycle (Virginia's 2017) of its states comes from the same kind of state records, one script each, and so do Kansas's 2016 House (the Ethics Commission's published summary), North Dakota's 2016 (its statements then printed only contributions over $200, so that is the 2016 figure for every candidate), West Virginia's 2016 (paper filers stay blank) and South Dakota (filing PDFs; state law bars commercial use). Maine 2016, Maryland 2018 and Ohio 2016 come from The Accountability Project's public copies of the old state exports (Ohio's: contributions, fundraiser and other income and in-kind, Transparency USA's definition, which it reproduces within 1% for 174 of 202 candidates in 2018; its office and district columns are the candidate's current ones, so Ohio matches by name). Where candidates filed on paper the scanned reports were read by eye: West Virginia 2016 (the election-year-to-date box) and New Hampshire 2016 (the last report's campaign-to-date receipts less any surplus carried in; New Hampshire's e-filers come from its transaction export). Idaho's 2018–2022 come from the state instead of Transparency USA (whose files held the 2026 race pages, a crawl error, and which now refuses requests): 2018 from the Secretary of State's archived contribution file, which reproduces the reports' calendar-year-to-date totals; 2020 and 2022 from the Sunshine portal, every donation including unitemized and in-kind, less returns, without loans or credit-card line items (with loans it reproduces the year-end reports' totals for 61 of 65 candidates checked), plus 2019 from each committee's archived annual report. The portal records a candidate's latest office and district, not the race's, so a record is placed in a district only where the race's own map gives it one, and otherwise matched by full name. Arkansas's 2018–2022 legacy filings are listed by registration year, usually the odd year before the election, so both years are read. Mississippi (2019 and 2023, four-year terms) sums the term's four calendar years from the Secretary of State's portal: e-filers' typed reports, and for paper filers the calendar-year-to-date box, read by OCR or by eye and kept when the form's own arithmetic holds, or, where too many boxes are blank to check it, when nothing on the form contradicts the year-to-date figure (a part larger than the total, a balance that does not close); a candidate with any year unread is blank. Kansas 2016 Senate and 2018–2026 come from the Secretary of State's campaign finance viewer: each receipts-and-expenditures report's contributions plus in-kind, summed over the reports whose periods fall in the cycle's two years. Paper reports are read by OCR or by eye and count when the summary's own arithmetic holds. The filings' printed periods are often wrong (stale forms, an e-filing system that printed post-election reports as the whole year), so periods are checked against the cash on hand each report carries forward from the one before: a report is placed where its cash chain puts it, and a candidate with a report that cannot be placed, a hole between reports the cash does not bridge, or two same-date versions of one report more than 10% and $250 apart is blank." },
            { term: "Not used", def: "Stanford DIME's public recipients file lists state legislative candidates but withholds their receipt totals (the NIMSP-sourced figures), and its 2024 coverage is California and Ohio only. OpenSecrets' state profiles (the NIMSP data, from October 2026) cover every state but sit behind a Cloudflare check that needs a headed browser, under a non-commercial licence; declined." },
          ]} />
        </Block>
        <Block label="Join">
          <P>A filing is matched to the atlas&apos;s candidate for that district and year (the 2026 field, or the result&apos;s names) by name: the full name, then first and last name with nicknames canonicalised (&ldquo;Mike&rdquo; is &ldquo;Michael&rdquo;), then a first initial and surname within the same party, then the surname alone when it is unique on both sides. A state-portal record arrives already matched (scripts/assign-state-leg-finance.ts, which also reads committee names such as &ldquo;Parrish for NC House&rdquo;) and carries the candidate it was matched to, so it joins on that. A filing that matches nobody is kept as unmatched and shown; a candidate with no filing is null, never zero. The two-party money gap is (R &minus; D) / (R + D) over the matched Democratic and Republican candidates, undefined when either side is missing.</P>
        </Block>
      </Section>

      <Section id="projection" kicker="The model" title="The 2026 district projection"
        lede={(() => {
          const all = projectAllChambers();
          const up = all.reduce((s, c) => s + c.seatsUp, 0);
          const inPlay = all.filter((c) => c.pDemControl != null && c.pDemControl >= 0.2 && c.pDemControl <= 0.8).length;
          const env = getNationalEnvironment();
          return <>Every seat on the 2026 ballot (<N>{up.toLocaleString()}</N> seats, <N>{all.length}</N> chambers, <N>{inPlay}</N> in play) is projected from the atlas&apos;s own data and simulated chamber by chamber on the <Link href="/legislatures" className="underline underline-offset-2">State Legislatures</Link> board. The environment is the forecast&apos;s fitted E (today {env.eHat >= 0 ? "R" : "D"}+{Math.abs(env.eHat).toFixed(1)}, σ {env.sigmaE.toFixed(1)}).</>;
        })()}>
        <Block label="Lean">
          <Formula lines={[
            "row NM   = margin − INCUMBENCY_PTS × incumbent sign − β*(state) × E(year) − money(race)       seat rows: the district's general in each year it was contested",
            "           margin − β*(state) × E(year)                                           presidential rows on today's lines (2016, 2020, 2024)",
            "relocate = Σ share_i × margin_i / coverage  +  [pres(today) − Σ share_i × pres_i / coverage]   a race on a superseded map, through the crosswalk",
            "lean     = Σ_years YEAR_WEIGHT × coverage × [ Σ_types TYPE_WEIGHT × mean NM ] / Σ YEAR_WEIGHT × coverage     two-pass Huber on seat rows",
            "           in the latest year with a seat row, that row's TYPE_WEIGHT × RECENT_SEAT_BOOST (L 0.2 → 0.6: half of that year's lean)",
          ]} note="share_i is the population share of today's district that was in old district i (dataset C); coverage is the share covered by contested old districts, and a row below MIN_COVERAGE is dropped. The presidential delta is taken in the presidential year nearest the race. money(race) is the race's money term at its full-cycle receipts (below), averaged over a relocated row's old districts like its margin; taking it out keeps one cycle's lopsided fundraising from passing into the district's lean." />
        </Block>
        <Block label="Forward">
          <Formula lines={[
            "margin = lean + β*(state) × E(2026) + INCUMBENCY_PTS × incumbent sign + money(2026)      incumbent sign from the 2026 field's marked incumbent",
            "σ²     = SIGMA² + STATE_SHOCK² + (β* × σ_E)²        P(D) = Φ(−margin / σ)",
            "chamber: 5,000 draws of a shared national shock N(0, σ_E) × β*, a shared chamber shock N(0, STATE_SHOCK), and N(0, SIGMA) per seat; seats not up hold their member; a field with one major party is decided unless a credible independent is on it (below)",
            "headline seats = each seat's projected winner, summed (the chamber map's count); the 80% range and the control odds come from the draws",
            "decided seats: in a multi-member district a party keeps max(0, seats − the other party's nominees); a post (Idaho's A/B, Washington's 1/2) with one party's nominee is that party's; only the remaining seats are drawn",
          ]} note="Multi-member districts draw each seat left after the decided ones on the district's margin. A nominee on both major lines (Oregon and Vermont cross-nominate, New York fuses) is one person, in the party they sit for — or, for a newcomer, the party holding the seat — and a past race with one person on both lines is no D-vs-R contest and contributes no seat row. The chamber shock is what makes a chamber's seats move together beyond the national swing: a state-wide miss (a governor's race on the same ballot, a state issue, a redistricting the lean has not caught up with) lands on every seat at once, so chamber ranges are wider than independent seats would give. A seat with no listed field has no projection, and a chamber whose unprojected seats could decide control reports no control odds. Nebraska's ballot is nonpartisan: each candidate is placed in their party (registration, or a state party's endorsement where the two differ — data-entry/nebraska_2026_candidate_parties.csv), the caucus they would sit with, and its past races are read the same way; a candidate with neither stays an independent." />
          <Constants rows={[
            { name: "TYPE_WEIGHTS", value: `P ${SC.TYPE_WEIGHTS.P} / L ${SC.TYPE_WEIGHTS.L}`, meaning: "Presidential rows against the seat's own races, renormalised over the types present in a year — the District TPL's President/House ratio. The sweep below finds the holdout flat between a 0.25 and a 0.40 seat share once the latest race is boosted, so the designed ratio is kept.", basis: "designed" },
            { name: "RECENT_SEAT_BOOST", value: `×${SC.RECENT_SEAT_BOOST}`, meaning: "The seat row's type weight in the latest year that has one, so the seat's most recent race carries half of that year's lean. State Navigate's emphasis on the last legislative result, tested here: MAE after incumbency 5.85 → 5.74 (2022) and 5.39 → 5.18 (2024), better than any uniform reweighting, flat from ×2 to ×3, worse by ×5.", basis: "calibrated", source: "scripts/stateLegBacktest.ts --sweep" },
            { name: "INCUMBENCY_PTS", value: SC.INCUMBENCY_PTS, meaning: "Points a sitting state legislator is worth beyond the money they raise. The holdout fits 3.6 (2022) and 1.8 (2024) with the money term in; set at their rounded mean.", basis: "calibrated", source: "scripts/stateLegBacktest.ts" },
            { name: "SIGMA", value: SC.SIGMA, meaning: "Seat-level noise beyond the national and chamber shocks: the holdout residual spread after the chamber shock is taken out (7.2 in 2022, 6.8 in 2024 with the money term; the total spread is 8.0 and 7.6, robust 6.2 and 5.2, so the tails are heavy and the full spread is kept).", basis: "calibrated", source: "scripts/stateLegBacktest.ts" },
            { name: "STATE_SHOCK", value: SC.STATE_SHOCK, meaning: "Chamber-level shock shared by every seat of a chamber in a year: the spread of chamber-mean residuals less what independent seat noise alone would put there (method of moments over chambers with 10+ contested seats; 3.44 in 2022 and 3.37 in 2024 with the money term).", basis: "calibrated", source: "scripts/stateLegBacktest.ts" },
            { name: "MIN_COVERAGE", value: SC.MIN_COVERAGE, meaning: "A relocated row needs contested old districts covering this share of today's population.", basis: "designed" },
            { name: "SIMS", value: SC.SIMS, meaning: "Draws per chamber.", basis: "fixed" },
          ] satisfies ConstantRow[]} />
        </Block>
        <Block label="Money">
          {(() => {
            const m = structuralMoneyModel();
            const yrs = Object.keys(m.nByYear).map(Number).sort((a, b) => a - b);
            return <P>Fundraising enters the way it does in the federal forecast: as the part of a race&apos;s money gap that its situation does not already explain. An incumbent, or a party running in friendly territory, usually out-raises the other side, and the lean and incumbency terms already count that; only the money beyond the expected gap moves the margin. The expected gap is fitted on <N>{m.n.toLocaleString()}</N> contested races with both sides&apos; money on file ({yrs.map((y) => `${y} ${m.nByYear[y]}`).join(", ")}): an incumbent&apos;s side raises <N>{m.incSign.toFixed(1)}</N> points of gap more, each point of presidential margin adds <N>{m.pres.toFixed(2)}</N>, R² <N>{m.r2.toFixed(2)}</N>. It uses no election result, so the backtest fits it on every year without leaking an outcome, and it is refitted from whatever money is on file each time the site is built: a state or cycle added to dataset E joins the fit and the term with no other step.</P>;
          })()}
          <Formula lines={[
            "gap%        = (R − D) / (R + D) × 100      the two sides' cycle contributions (dataset E)",
            "expected%   = a(year) + b × incumbent sign + c × presidential margin on that year's lines      least squares, every chamber pooled",
            "money(race) = clamp(MONEY_K × (scale × gap% − expected%), ±MONEY_CAP)      scale = PARTIAL_CYCLE_GAP_SCALE for 2026, 1 for a past race",
            "either side's money missing → 0: the typical gap for the race's situation (the lean and incumbency already carry it), not \"no money\"",
          ]} note="A year's own intercept absorbs a cycle's party-wide money tilt (and 2026's partial level). Multi-member districts sum each party's nominees. The strip on past seat rows uses the same term at full-cycle receipts. Districts the money data does not reach yet carry no money term, so as coverage fills, more seats get one." />
          <Constants rows={[
            { name: "MONEY_K", value: SC.MONEY_K, meaning: "Points of margin per point of money gap beyond the expected one: the sweep's best cell in both holdout years.", basis: "calibrated", source: "scripts/stateLegBacktest.ts --money" },
            { name: "MONEY_CAP", value: SC.MONEY_CAP, meaning: "The term's cap. The holdout gains shrink as the cap grows — a large residual gap over-predicts — so the money term is a nudge of up to 1.5 points.", basis: "calibrated", source: "scripts/stateLegBacktest.ts --money" },
            { name: "PARTIAL_CYCLE_GAP_SCALE", value: SC.PARTIAL_CYCLE_GAP_SCALE, meaning: "2026 receipts are to-date (each state's data-through date). Borrowed from the federal forecast, where the final gap is 0.90–0.91 × the September gap; there are no mid-cycle snapshots of state filings to measure the legislative ratio.", basis: "decision" },
          ] satisfies ConstantRow[]} />
        </Block>
        <Block label="Money sweep" meta={`generated ${MS.generatedAt} · scripts/stateLegBacktest.ts --money --emit`}>
          <P>The same holdout with the money term at each K and cap (K 0 is no money term anywhere), scored after fitted incumbency on every contested seat and on the seats whose race has both sides&apos; money on file. The term is applied to the held-out year&apos;s full-cycle receipts. Re-run after new money lands: the table shows whether the gain holds and whether the best cell moves.</P>
          <DataTable align="lrrrrrrr" head={["Year", "K", "Cap", "Seats", "With money", "MAE (inc.)", "MAE, money seats", "Inc. pts"]}
            rows={MS.rows.filter((r) => r.k === 0 || [1, 1.5, 3].includes(r.cap)).map((r) => [r.year, r.k, r.k === 0 ? "—" : r.cap, r.n, r.nMoney, r.maeAfterIncumbency.toFixed(3), r.maeMoneySeats.toFixed(3), r.incumbencyPts.toFixed(2)])} maxWidth="max-w-3xl" />
        </Block>
        <Block label="Independents">
          {(() => {
            const all = projectAllChambers();
            const modeled = all.flatMap((c) => c.districts.filter((d) => d.indep).map((d) => ({ c, d })));
            const outright = all.reduce((s, c) => s + c.decided.oth, 0);
            return <P>A ballot with one major party is usually decided, but not where an established independent is the real opponent. <N>{modeled.length}</N> such races are modeled this cycle ({modeled.filter((x) => x.d.indep!.basis === "incumbent").length} sitting independents, {modeled.filter((x) => x.d.indep!.basis === "record").length} with a strong last race, {modeled.filter((x) => x.d.indep!.basis === "endorsed").length} backed by a major party), and <N>{outright}</N> seats have no major party on the ballot and go to an independent outright.</P>;
          })()}
          <Formula lines={[
            "credible   = sitting  |  ≥ IND_RECORD_SHARE in their last head-to-head in the seat  |  backed by the absent party (data/stateLegIndependents.ts)",
            "advantage  = ± (lean + β*(state) × E(2026))  +  INCUMBENCY_PTS × (inc_I − inc_opp)  +  personal       sign: the independent takes the absent party's place",
            "personal   = (Σ_last two residual + IND_SHRINK_K × prior) / (n + IND_SHRINK_K)      prior = IND_PRIOR_PTS, or 0 for a backed newcomer",
            "residual   = past advantage − [± (lean + β* × E(year)) + INCUMBENCY_PTS × (inc_I − inc_opp)]      head-to-heads against the same party, on today's lines",
            "P(I)       = Φ(advantage / √(σ² + IND_SIGMA²))",
          ]} note="A party that backs an independent over its own nominee (Alaska's Senate S, where the Democrats list Bryce Edgmon above their nominee and ranked choice transfers the nominee's votes) puts the independent in its place. An appointed incumbent counts as sitting but gets no incumbency, the federal forecast's rule. In a multi-member district where the party fields a nominee for every seat (Vermont's Chittenden-15), the independent is racing that party's last nominee inside one electorate: lean and environment drop out, only incumbency and noise remain, and the other seats go to the party. Independents on a ballot with both major parties and no backing are not modeled." />
          <Constants rows={[
            { name: "IND_RECORD_SHARE", value: `${SC.IND_RECORD_SHARE}%`, meaning: "A non-incumbent independent is modeled when they took this share of their last head-to-head in the seat; below it, a perennial candidate.", basis: "designed" },
            { name: "IND_PRIOR_PTS", value: SC.IND_PRIOR_PTS, meaning: `How far a sitting or proven independent runs ahead of a generic nominee of the party they stand in for, before their own record. The holdout's median gap is ${IV.medianGap}; the mean is pulled higher by Alyse Galvin and John Mark Windle.`, basis: "calibrated", source: "scripts/stateLegIndependentBacktest.ts" },
            { name: "IND_SHRINK_K", value: SC.IND_SHRINK_K, meaning: "Pseudo-races of the prior in the personal effect: one head-to-head on record counts half.", basis: "calibrated", source: "scripts/stateLegIndependentBacktest.ts" },
            { name: "IND_SIGMA", value: SC.IND_SIGMA, meaning: `Extra seat noise in an independent's race: the holdout's robust residual spread (${IV.live.robustSd}) net of SIGMA and STATE_SHOCK — within them, so none.`, basis: "calibrated", source: "scripts/stateLegIndependentBacktest.ts" },
          ] satisfies ConstantRow[]} />
        </Block>
        <Block label="Independents holdout" meta={`generated ${IV.generatedAt} · scripts/stateLegIndependentBacktest.ts --emit`}>
          <P>Every past general on today&apos;s lines where an independent the rule would model faced exactly one major party (<N>{IV.cases}</N> races, 2018–2024), predicted from the lean before that year, the year&apos;s fitted environment, incumbency and the independent&apos;s earlier record. Small sample: the prior is set at the median gap rather than the grid&apos;s best fit, which leans on two outliers.</P>
          <DataTable align="rrrrrr" head={["Prior", "K", "RMSE", "Bias", "σ (robust)", "Winners"]} rows={IV.grid.map((g) => [g.prior, g.k, g.rmse.toFixed(1), (g.bias >= 0 ? "+" : "") + g.bias.toFixed(1), g.robustSd.toFixed(1), `${g.winners}/${g.n}`])} maxWidth="max-w-xl" />
        </Block>
        <Block label="Weight sweep" meta={`generated ${SW.generatedAt} · scripts/stateLegBacktest.ts --sweep --emit`}>
          <P>Two questions put to the holdout after the State Navigate comparison (their lean leans on the last legislative result): how much of the lean the seat&apos;s own races should carry, and whether the most recent of them deserves extra weight. Left: the seat share with no boost, where 0.25 is the live ratio. Right: the latest seat row&apos;s weight × k at the live ratio and at a 0.40 share. The boost beats every uniform reweighting; ×{SC.RECENT_SEAT_BOOST} is adopted.</P>
          <div className="grid gap-6 lg:grid-cols-2">
            <DataTable align="lrrrrr" head={["Year", "Seat share", "MAE (inc.)", "Bias", "Inc. pts", "σ (robust)"]} rows={SW.typeWeights.map((r) => [r.year, r.lShare.toFixed(2), r.maeAfterIncumbency.toFixed(2), (r.bias >= 0 ? "+" : "") + r.bias.toFixed(2), r.incumbencyPts.toFixed(2), r.sigmaRobust.toFixed(2)])} />
            <DataTable align="lrrrrr" head={["Year", "Seat share", "Boost", "MAE (inc.)", "Bias", "σ (robust)"]} rows={SW.recency.map((r) => [r.year, r.lShare.toFixed(2), `×${r.boost}`, r.maeAfterIncumbency.toFixed(2), (r.bias >= 0 ? "+" : "") + r.bias.toFixed(2), r.sigmaRobust.toFixed(2)])} />
          </div>
        </Block>
        <Block label="Environment scale" meta={`generated ${ES.generatedAt} · scripts/stateLegBacktest.ts --env --emit`}>
          <P>Whether legislative seats respond more strongly to the national environment than the statewide races E is fitted on: the term β* × E multiplied by λ on the forward term and the past seat rows&apos; strip, scored with the mean bias left in, since a uniform environment miss is what is being tested. 2018 and 2020 ran on superseded maps; their results are relocated onto today&apos;s lines through the crosswalk. &ldquo;Fitted&rdquo; projects into the environment fitted from that year&apos;s statewide results; &ldquo;polled&rdquo; into the one the live chain would have read from the final generic ballot. With the fitted environment, λ = 1 is within 0.06 of the best cell in every year. With the polled one, the best λ follows the year&apos;s poll miss. Not adopted; the change log has the full reading.</P>
          <DataTable align="llrrrrrrr" head={["Environment", "Year", "E", ...[0.8, 1, 1.2, 1.4, 1.6, 2].map((l) => `λ ${l}`)]}
            rows={(["fitted", "polled"] as const).flatMap((t) => [2018, 2020, 2022, 2024].map((y) => {
              const rs = ES.rows.filter((r) => r.target === t && r.rows === "L" && r.year === y);
              return [t, y, rs[0]?.targetE.toFixed(2) ?? "—", ...rs.map((r) => `${r.maeRaw.toFixed(2)} (${r.bias >= 0 ? "+" : ""}${r.bias.toFixed(1)})`)];
            }))} maxWidth="max-w-4xl" />
        </Block>
        <Block label="Holdout" meta={`generated ${STATE_LEG_VALIDATION.generatedAt} · scripts/stateLegBacktest.ts --emit`}>
          <P>Each district&apos;s lean is built from the years before Y and projected into Y with the fitted environment and the race&apos;s actual incumbent, then scored against the contested districts on today&apos;s lines. Incumbency is fitted from the residuals and σ is their spread after it. The worst states are the multi-member and ranked-choice ones (Vermont, Washington, Arizona, Alaska) and Nebraska, where a seat&apos;s own margin is a poor measure of the district.</P>
          <DataTable align="lrrrrrrrrr" head={["Year", "Districts", "Bias", "MAE", "MAE after inc.", "Incumbency (pts)", "Incumbent races", "σ (robust)", "Chamber shock τ", "Seat σ after τ"]} rows={STATE_LEG_VALIDATION.rows.map((r) => [r.year, r.n, (r.bias >= 0 ? "+" : "") + r.bias.toFixed(2), r.mae.toFixed(2), r.maeAfterIncumbency.toFixed(2), r.incumbencyPts.toFixed(2), r.incumbentRaces, `${r.sigma.toFixed(2)} (${r.sigmaRobust.toFixed(2)})`, `${r.stateShock.toFixed(2)} (${r.chambers} chambers)`, r.sigmaWithin.toFixed(2)])} maxWidth="max-w-4xl" />
        </Block>
        <Block label="Not in the model">
          <Defs items={[
            { term: "Candidate quality and polls", def: "No track-record or polling term; the seat's own history is the only candidate signal." },
            { term: "Below the chamber", def: "The chamber shock is one number per chamber; a regional swing inside a state (one metro moving against the rest) is still independent seat noise." },
          ]} />
        </Block>
      </Section>

      <Section id="popular-vote" kicker="The model" title="The 2026 chamber popular vote"
        lede={(() => {
          const all = projectAllChamberPopularVotes();
          const votes = all.reduce((s, c) => s + c.raw.votes, 0);
          const imputed = all.reduce((s, c) => s + c.adjusted.imputed, 0);
          const seats = all.reduce((s, c) => s + c.districts.length, 0);
          return <>Each seat on the ballot gets a projected vote count, split between the parties by its district projection, and the chamber&apos;s seats add up two ways: <N>raw</N>, the aggregate the certified results will print, and <N>adjusted</N>, with every seat that lacks a major party imputed as the contested race it would have been — the rule the corrected past chamber margins apply with the presidential vote, here applied with the projection. Today: <N>{(votes / 1e6).toFixed(1)}M</N> votes over <N>{seats.toLocaleString()}</N> districts in <N>{all.length}</N> chambers, <N>{imputed.toLocaleString()}</N> of them imputed in the adjusted figure. Both numbers head every chamber page beside the corrected chamber margin.</>;
        })()}>
        <Block label="Votes">
          <Formula lines={[
            "level     = the state's 2026 top-of-the-ticket votes from the turnout estimate (/methodology/turnout: CVAP × blended midterm rates, ticket and competitiveness terms)",
            "share_d   = the district's share of the chamber's 2024 presidential vote on today's lines (dataset A)",
            "factor_d  = votes cast in the seat's race per seat per expected top-race vote: leg votes ÷ [seats × top votes(year) × share_d(that cycle's presidential election)]",
            "            measured in each basis midterm from the seat's own contested race; on a superseded map, the population-weighted mean of the old districts (dataset C, coverage ≥ MIN_COVERAGE)",
            "            blended on BASIS_WEIGHTS, shrunk toward the chamber's contested mean: (pres votes_d × own + DROPOFF_SHRINK_VOTES × mean) / (pres votes_d + DROPOFF_SHRINK_VOTES)",
            "V_d       = level × share_d × factor_d × seats up      × UNOPPOSED_TURNOUT for a printed unopposed race or two nominees of one party; 0 where the state prints no count (FL, HI, OK, TX)",
          ]} note="A multi-member district's votes are candidate votes, as the certified aggregates are: each voter casts several, so a chamber like Arizona's House or New Hampshire's runs past the ballots cast, and its factor says so. A seat with no contested race in either basis midterm takes the chamber mean per seat. The level is the turnout estimate's, so its range (each basis midterm alone) carries through to the chamber total." />
        </Block>
        <Block label="Split and sums">
          <Formula lines={[
            "contested    R = (100 − other + margin) / 2 · D = (100 − other − margin) / 2       margin = the district projection's (lean + β*·E + incumbency), points of the full vote",
            "other        the chamber's other-party share over its last two elections in races of the same kind (a minor candidate on the ballot or not; one party with a minor candidate), shrunk toward the national figure with OTHER_SHRINK_RACES pseudo-races",
            "one party    all but the other share to it; a modeled independent takes the absent party's place on their projected advantage",
            "multi-member each seat's share of the district's votes on its own contest: a post with one party, a guaranteed seat, the rest on the margin",
            "raw          Σ counted districts                 adjusted = Σ every seat as a contested two-party race: V_d at contested turnout, the projection's margin, the chamber's no-minor-candidate other share",
          ]} note="The adjusted figure is the chamber's preference, not its ballot: Massachusetts prints D+58 in a House where 120 seats have no Republican, and the imputed sum lands near its lean. A seat with no lean (no presidential figure on its lines) stays as its raw race in both sums; Nebraska's nonpartisan votes are summed by each candidate's party." />
          <Constants rows={[
            { name: "BASIS_WEIGHTS", value: Object.entries(PC.BASIS_WEIGHTS).sort((a, b) => Number(b[0]) - Number(a[0])).map(([y, w]) => `${y} ${w}`).join(" / "), meaning: `The turnout estimate's midterm weights (${Object.entries(MIDTERM_WEIGHTS).sort((a, b) => Number(b[0]) - Number(a[0])).map(([y, w]) => `${y} ${w}`).join(" / ")}): a seat's turnout factor from the last two midterms. Adding the 2020 presidential-year race to the 2022 holdout basis changed district error by less than 0.1 point, so the midterm basis is kept.`, basis: "designed" },
            { name: "DROPOFF_SHRINK_VOTES", value: PC.DROPOFF_SHRINK_VOTES.toLocaleString(), meaning: "Presidential votes of the chamber mean a seat's own factor is weighed against. The 2022-from-2018 holdout's district-share error is lowest here (7.28% against 7.33% with no shrink and 8.18% with the chamber mean alone); chamber totals barely move.", basis: "calibrated", source: "scripts/stateLegPopularVoteBacktest.ts" },
            { name: "UNOPPOSED_TURNOUT", value: PC.UNOPPOSED_TURNOUT, meaning: `Votes cast per seat in a printed unopposed race relative to a contested one in the same chamber-year: the median over ${PV.unopposed.chamberYears} chamber-years 2018–2024 with both kinds (${PV.unopposed.median}; mean ${PV.unopposed.mean}; Alaska near 1, Delaware's and Connecticut's 2022 near 0.65).`, basis: "calibrated", source: "scripts/stateLegPopularVoteBacktest.ts" },
            { name: "OTHER_SHRINK_RACES", value: PC.OTHER_SHRINK_RACES, meaning: "Pseudo-races of the national other-share mean in each chamber's own figure, so a chamber with two such races does not set its own.", basis: "designed" },
          ] satisfies ConstantRow[]} />
        </Block>
        <Block label="Holdout" meta={`generated ${PV.generatedAt} · scripts/stateLegPopularVoteBacktest.ts --emit`}>
          <P>2022 predicted from 2018 alone on the chambers whose 2022 election ran on today&apos;s lines: the level from the turnout estimate&apos;s own backtest configuration, every seat&apos;s factor from its 2018 race relocated onto the 2022 lines, the split from the district projection with rows before 2022 and the fitted E(2022) on the year&apos;s actual ballot. The first row is the whole model; the second takes the actual top-of-the-ticket vote as the level and so measures the factor model alone — the gap between them is the turnout estimate&apos;s 2018→2022 miss. The 2024 row uses the live basis weights with the actual presidential vote as the level. Margin error is the raw chamber popular-vote margin against the certified aggregate; the worst of it is the projection&apos;s 2022 Florida miss, a chamber shock the margins share.</P>
          <DataTable align="lrrrrrrrrr" head={["Basis → target", "Level", "Chambers", "Districts", "Votes MAPE (bias)", "Share MAPE", "Chamber MAPE (bias)", "Margin MAE (bias)", "Total MAPE (bias)"]} rows={[PV.live, ...PV.grid.filter((g) => g.shrink === PC.DROPOFF_SHRINK_VOTES && g.level === "actual"), PV.year2024].map((r) => [r.label.replace(/,.*$/, ""), r.level === "model" ? "turnout estimate" : "actual", r.chambers, r.districts.toLocaleString(), `${r.voteMape.toFixed(1)}% (${signedPct(r.voteBias)})`, `${r.shareMape.toFixed(1)}%`, `${r.chamberMape.toFixed(1)}% (${signedPct(r.chamberBias)})`, `${r.marginMae.toFixed(1)} (${r.marginBias >= 0 ? "+" : ""}${r.marginBias.toFixed(1)})`, `${r.totalMape.toFixed(1)}% (${signedPct(r.totalBias)})`])} maxWidth="max-w-5xl" />
          <P>The shrink grid, 2022 from 2018 with the turnout estimate&apos;s level: how far a seat&apos;s own 2018 factor is trusted against the chamber mean.</P>
          <DataTable align="rrrrr" head={["Shrink (pres votes)", "Votes MAPE", "Share MAPE", "Chamber MAPE", "Margin MAE"]} rows={PV.grid.filter((g) => g.level === "model").map((g) => [g.shrink >= 1e9 ? "chamber mean only" : g.shrink.toLocaleString(), `${g.voteMape.toFixed(2)}%`, `${g.shareMape.toFixed(2)}%`, `${g.chamberMape.toFixed(2)}%`, g.marginMae.toFixed(2)])} maxWidth="max-w-2xl" />
          <P>Today&apos;s widest raw-to-adjusted gaps: {(() => {
            const all = projectAllChamberPopularVotes().filter((c) => c.raw.margin != null && c.adjusted.margin != null);
            return all.sort((a, b) => Math.abs(b.raw.margin! - b.adjusted.margin!) - Math.abs(a.raw.margin! - a.adjusted.margin!)).slice(0, 5).map((c) => `${c.abbr} ${c.chamber === "house" ? "House" : "Senate"} ${fmtM(c.raw.margin)} → ${fmtM(c.adjusted.margin)}`).join(" · ");
          })()}.</P>
        </Block>
      </Section>

      <Section id="files" kicker="Reproducing it" title="Files and commands">
        <FilesAndCommands
          files={[
            { path: "data-entry/state-leg-pres-by-era/<ST>.json", role: "dataset A, per state: chamber → era → district → {pop2020, splitPct, 2016, 2020, 2024}" },
            { path: "data-entry/state-leg-results/<ST>-<year>.json", role: "per-district results with the candidates array (dataset B)" },
            { path: "data-entry/state-leg-redistricting/<ST>.json", role: "dataset C, per state: chamber → era redrawn into → district → record" },
            { path: "data/stateLegPresByEra.ts · stateLegResults.ts · stateLegRedistricting.ts", role: "server-only modules built from the three above" },
            { path: "data-entry/state-leg-candidates-2026/<ST>.json", role: "dataset D, per state: chamber → district → {seats, candidates}" },
            { path: "data/stateLegIndependents.ts", role: "hand-curated independents: major-party backing (with sources), backing over a party's own nominee, appointed incumbents, exclusions" },
            { path: "data-entry/state-leg-outgoing-2026/<ST>.json", role: "outgoing members with reasons, per state: chamber → district → [{name, party, category, reason}]" },
            { path: "data-entry/state-leg-finance/{tu,ftm}/<ST>-<cycle>.json", role: "dataset E, per state and cycle: every legislative race's candidates with contributions and expenditures" },
            { path: "public/state-leg-atlas/<chamber>/<ST>.json", role: "the per-chamber slice a chamber page fetches, assembled from every module" },
          ]}
          commands={[
            { cmd: "python3 scripts/build-state-leg-pres-by-era.py <ST>", does: "dataset A for one state (downloads the DRA VTD file into the scratch cache)" },
            { cmd: "python3 scripts/build-state-leg-candidates-from-{klarner,wikipedia,sos}.py --write · derive-state-leg-candidate-flags.py --write", does: "dataset B passes, then the flag derivation" },
            { cmd: "python3 scripts/build-state-leg-redistricting.py <ST>", does: "dataset C for one state" },
            { cmd: "python3 scripts/fetch-state-leg-candidates-2026.py [ST] · node scripts/build-state-leg-candidates-2026.mjs", does: "dataset D (clear the HTML cache to refetch)" },
            { cmd: "python3 scripts/fetch-state-leg-outgoing-2026.py [ST] · node scripts/build-state-leg-outgoing-2026.mjs", does: "outgoing members and reasons from the Wikipedia chamber articles (cached wikitext)" },
            { cmd: "python3 scripts/fetch-state-leg-finance-tu.py --cycle 2026 [ST] · fetch-state-leg-finance-ftm.py --cycle 2024 [ST] · node scripts/build-state-leg-finance.mjs", does: "dataset E: one cycle of Transparency USA (slow, polite crawl) or FollowTheMoney, then the module" },
            { cmd: "node scripts/build-state-leg-pres-by-era.mjs · build-state-leg-results.mjs · split-state-leg-results.mjs · build-state-leg-redistricting.mjs", does: "rebuild the modules and the legislature page's result slices" },
            { cmd: "npx tsx --conditions=react-server scripts/stateLegBacktest.ts --emit", does: "the projection holdout; writes data/stateLegValidation.ts" },
            { cmd: "npx tsx --conditions=react-server scripts/stateLegBacktest.ts --sweep --emit", does: "the seat-share and recent-row weight sweeps; writes data/stateLegTypeWeightSweep.ts" },
            { cmd: "npx tsx --conditions=react-server scripts/stateLegBacktest.ts --money --emit", does: "the money term's K × cap sweep; writes data/stateLegMoneySweep.ts" },
            { cmd: "npm run state-leg-money", does: "after new fundraising lands: rebuild dataset E's module, re-run the holdout and the money sweep (methodology tables), rebuild the chamber slices; the expected-gap fit refreshes itself" },
            { cmd: "npx tsx --conditions=react-server scripts/stateLegIndependentBacktest.ts --emit", does: "the independent rule's holdout; writes data/stateLegIndependentValidation.ts" },
            { cmd: "npx tsx --conditions=react-server scripts/stateLegPopularVoteBacktest.ts --emit", does: "the chamber popular vote's holdout and the unopposed-turnout measurement; writes data/stateLegPopularVoteValidation.ts" },
            { cmd: "npx tsx --conditions=react-server scripts/buildStateLegAtlasSlices.ts [ST]", does: "rebuild the chamber slices the atlas pages read (projection included)" },
          ]}
        />
      </Section>
    </>
  );
}

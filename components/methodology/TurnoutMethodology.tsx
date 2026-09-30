import Link from "next/link";
import { TURNOUT_BACKTEST as B } from "@/data/turnoutCalibration";
import {
  BASE_PRES_YEAR, COMPETITIVENESS_CAP, COMPETITIVENESS_SLOPE, DISTRICT_DROPOFF_WEIGHT, ELECTION_YEAR, HOUSE_ONLY_TICKET_FACTOR, MIDTERM_WEIGHTS, SHRINK_VOTES,
  projectAll, projectionNational, runModel,
} from "@/lib/turnoutModel";
import { firstRoundNotes } from "@/lib/turnout";
import { COUNTY_MARGIN_CLAMP, OTHER_SHARE_CAP, impliedGenericBallot, projectRaceResults } from "@/lib/countyProjection";
import { Block, Code, Constants, DataTable, Defs, FilesAndCommands, Formula, Ledger, M, N, P, Section, StatRow, type ConstantRow, type LedgerLine } from "./kit";

// Every exported constant of lib/turnoutModel.ts and where it is documented on this tab.
const DOCUMENTED_IN = {
  ELECTION_YEAR: "turnout#level", BASE_PRES_YEAR: "turnout#level", MIDTERM_WEIGHTS: "turnout#level",
  HOUSE_ONLY_TICKET_FACTOR: "turnout#level", COMPETITIVENESS_SLOPE: "turnout#level", COMPETITIVENESS_CAP: "turnout#level",
  SHRINK_VOTES: "turnout#split", DISTRICT_DROPOFF_WEIGHT: "turnout#house",
  OTHER_SHARE_CAP: "turnout#county-results", COUNTY_MARGIN_CLAMP: "turnout#county-results",
} as const;
void DOCUMENTED_IN;

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const int = (v: number) => Math.round(v).toLocaleString();

export default function TurnoutMethodology() {
  const run = runModel();
  const nat = projectionNational();
  const ga = run.levels.get("GA")!;
  const gaRace = projectAll().find((r) => r.id === "S-GA")!;
  const fulton = gaRace.counties.find((c) => c.fips === "13121")!;
  const first = firstRoundNotes();
  const gaResult = projectRaceResults("senate", "GA")!;
  const fultonResult = gaResult.counties.find((c) => c.fips === "13121")!;
  const gb = impliedGenericBallot();
  const fmtGb = (m: number) => (Math.abs(m) < 0.05 ? "EVEN" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
  const weights = Object.entries(MIDTERM_WEIGHTS).sort((a, b) => Number(b[0]) - Number(a[0]));

  const constants: ConstantRow[] = [
    { name: "ELECTION_YEAR / BASE_PRES_YEAR", value: `${ELECTION_YEAR} / ${BASE_PRES_YEAR}`, meaning: "The target year and the presidential election whose county shares and CVAP release anchor it.", basis: "fixed" },
    { name: "MIDTERM_WEIGHTS", value: weights.map(([y, w]) => `${y}: ${w}`).join(", "), meaning: "Weight of each basis midterm in the level and office terms. The more recent midterm carries more of the signal; the older one keeps a single odd year from dominating. Each alone gives the range shown with every estimate.", basis: "decision" },
    { name: "HOUSE_ONLY_TICKET_FACTOR", value: HOUSE_ONLY_TICKET_FACTOR, meaning: <>Top-race turnout with only House races on the ballot, relative to the same state with a Senate or governor race. From the {B.ticket.switchers.length} states whose ticket changed between 2018 and 2022: their excess log change against the other states implies <N>{B.ticket.estimate.toFixed(3)}</N>.</>, basis: "fitted" },
    { name: "COMPETITIVENESS_SLOPE", value: COMPETITIVENESS_SLOPE, meaning: <>Change in log turnout per point of the top race&apos;s absolute margin. Fitted on the 41 states with a statewide race in both 2018 and 2022 (2018→2022 change in log turnout on the change in |margin|, slope −0.28% per point, r −0.40). For {ELECTION_YEAR} the margin is the site&apos;s forecast for the state&apos;s closest Senate or governor race.</>, basis: "fitted" },
    { name: "COMPETITIVENESS_CAP", value: `±${COMPETITIVENESS_CAP} pts`, meaning: "The largest margin change the term is allowed to see.", basis: "fixed" },
    { name: "SHRINK_VOTES", value: SHRINK_VOTES.toLocaleString(), meaning: <>Pseudo-votes a county&apos;s own midterm propensity and office factors are weighed against the state prior (n / (n + K), n = its {BASE_PRES_YEAR} presidential votes). Grid below: the county-share error is lowest at 20,000.</>, basis: "fitted" },
    { name: "DISTRICT_DROPOFF_WEIGHT", value: DISTRICT_DROPOFF_WEIGHT, meaning: "How far a district's own most recent House drop-off is trusted against the state's contested-seat mean, when the lines have not moved and the seat was contested. One observation per district, so half.", basis: "decision" },
  ];

  const levelLedger: LedgerLine[] = [
    ...Object.entries(ga.rateBy).map(([y, r]) => ({ label: `${y} top-race turnout`, note: `${ga.competitiveness[Number(y)]?.basisMargin != null ? `|margin| ${ga.competitiveness[Number(y)].basisMargin!.toFixed(1)} → ${ga.competitiveness[Number(y)].targetMargin!.toFixed(1)}, × ${ga.competitiveness[Number(y)].factor.toFixed(3)}` : "no adjustment"} · weight ${MIDTERM_WEIGHTS[Number(y)]}`, value: `${r?.toFixed(2)}%` })),
    { op: "=", label: "Blended rate", note: `× CVAP ${int(ga.cvap ?? 0)} (2020–24)`, value: `${ga.rate?.toFixed(2)}%` },
    { op: "=", label: `${ELECTION_YEAR} top-race votes`, note: `range ${int(ga.low)} – ${int(ga.high)}`, value: int(ga.votes), total: true },
    { op: "×", label: "Senate factor", note: "Senate votes ÷ top-race votes, blended", value: (ga.officeFactor.senate ?? 1).toFixed(4) },
    { op: "=", label: "Georgia Senate estimate", note: `${gaRace.rate}% of CVAP · 2022 first round ${int(gaRace.prior?.votes ?? 0)}`, value: int(gaRace.votes), total: true },
  ];

  const splitLedger: LedgerLine[] = [
    { label: `Fulton County ${BASE_PRES_YEAR} presidential share`, note: `${int(fulton.pres2024)} of ${int(gaRace.pres2024)}`, value: pct(fulton.pres2024 / gaRace.pres2024, 2) },
    { op: "×", label: "Midterm propensity", note: "midterm share ÷ presidential share, blended, shrunk toward 1", value: fulton.midtermRatio.toFixed(3) },
    { op: "×", label: "Senate factor vs. state", note: "shrunk toward 1", value: fulton.officeFactor.toFixed(3) },
    { op: "=", label: "Share of the Georgia Senate estimate", note: "after renormalising the state's counties to 100%", value: pct(fulton.votes / gaRace.votes, 2) },
    { op: "=", label: "Fulton County estimate", note: `${fulton.rate}% of its CVAP · range ${int(fulton.low)} – ${int(fulton.high)}`, value: int(fulton.votes), total: true },
  ];

  return (
    <>
      <Section id="scope" kicker="Turnout" title="What the turnout page measures"
        lede={<>The <Link href="/analysis/turnout" className="underline underline-offset-2">Turnout</Link> page shows votes cast in every general election since 2016 — President, Senate, governor and House — by state, House district and county, as a share of citizen voting-age population, and estimates {ELECTION_YEAR} turnout for every Senate, governor and House race down to the county. Everything is computed on the server from the certified results already on the site plus one new input, CVAP.</>}>
        <Block label="Definitions">
          <Defs items={[
            { term: "Turnout", def: <>Votes cast in the race ÷ CVAP. Votes, not ballots: no state reports ballots cast consistently, and blank or spoiled ballots add nothing to a race. VEP and total ballots from the U.S. Elections Project are shown beside the state figures as a cross-check.</> },
            { term: "CVAP", def: <>Citizens 18 and over from ACS table B05003 (<Code>scripts/fetch-cvap.py</Code> → <Code>data-entry/cvap.csv</Code>), one five-year release per election year (2016 → 2012–16 … 2024 → 2020–24; 2025 reuses 2024). Districts come on the Congress each release reports — the lines the election was run on. Connecticut&apos;s counties after 2021 are the 2021 release scaled by the state&apos;s growth, since the Census now publishes planning regions there.</> },
            { term: "First round", def: <>A race decided in a runoff or by ranked-choice rounds is counted at its first round (<Code>data-entry/turnout_first_round.csv</Code>, {first.length} races), the electorate that turned out; the race pages keep the decisive round. By-district figures for those races are the runoff round scaled to the first-round total.</> },
            { term: "Top race", def: <>The race with the most votes in a geography that year — the president in a presidential year; Senate, governor or the House total in a midterm. Drop-off is a race&apos;s votes as a share of it.</> },
            { term: "Unopposed seats", def: <>Shown as recorded (zero in FL, OK and LA, which tally no votes for an unopposed candidate) and flagged; the estimate imputes them as contested.</> },
          ]} />
        </Block>
      </Section>

      <Section id="level" kicker="Estimate · level" title="A state's top-of-the-ticket electorate"
        lede={<>The {ELECTION_YEAR} estimate is a level × distribution model (<Code>lib/turnoutModel.ts</Code>). The level is set per state from its own midterm history; the distribution splits it across counties and districts.</>}>
        <Formula lines={[
          <>votes<sub>S</sub> = CVAP<sub>S</sub>({BASE_PRES_YEAR}) × Σ<sub>y</sub> w<sub>y</sub> · rate<sub>S</sub>(y) · ticket<sub>S</sub>(y) · exp(slope × clamp(|m<sub>{ELECTION_YEAR}</sub>| − |m<sub>y</sub>|, ±{COMPETITIVENESS_CAP}))</>,
          <>rate<sub>S</sub>(y) = top-race votes ÷ CVAP in midterm y &nbsp;·&nbsp; w<sub>2022</sub> = {MIDTERM_WEIGHTS[2022]}, w<sub>2018</sub> = {MIDTERM_WEIGHTS[2018]}</>,
        ]} note={<>ticket<sub>S</sub>(y) puts the basis year on the target year&apos;s footing: ÷ {HOUSE_ONLY_TICKET_FACTOR} when the basis midterm had only House races and {ELECTION_YEAR} has a statewide race, × {HOUSE_ONLY_TICKET_FACTOR} the other way round. m<sub>y</sub> is the basis year&apos;s top-race margin; m<sub>{ELECTION_YEAR}</sub> the forecast margin of the state&apos;s closest Senate or governor race. Senate and governor votes are the level × the state&apos;s blended office-to-top ratio. The range is each basis midterm alone.</>} />
        <Block label="Worked example · Georgia Senate"><Ledger lines={levelLedger} /></Block>
        <Block label="Constants"><Constants rows={constants} /></Block>
      </Section>

      <Section id="split" kicker="Estimate · distribution" title="Counties"
        lede={<>A county&apos;s share of its state&apos;s midterm electorate is its {BASE_PRES_YEAR} presidential share times its midterm propensity — how much more or less of the state&apos;s midterm vote it casts than of its presidential vote — blended over the basis midterms and shrunk toward 1 with {SHRINK_VOTES.toLocaleString()} pseudo-votes. An office factor (the county&apos;s Senate-, governor- or House-to-top ratio relative to the state&apos;s, shrunk the same way) tilts it per office, and the state&apos;s counties are renormalised to the state total.</>}>
        <Block label="Worked example · Fulton County in the Georgia Senate race"><Ledger lines={splitLedger} /></Block>
        <P>The county&apos;s top race in a midterm is the state&apos;s top statewide race (the same race everywhere, so shares add up), or its House votes where the state had only House races and every district touching the county was contested. A county with no usable midterm history takes the state prior.</P>
      </Section>

      <Section id="house" kicker="Estimate · House" title="Districts"
        lede={<>A district&apos;s estimate is the sum over its counties of (county estimate × the share of the county inside the district × the district&apos;s House drop-off). Drop-off is House votes ÷ the top statewide race within the district, contested seats only, so an unopposed seat is imputed as if contested.</>}>
        <Defs items={[
          { term: "Own drop-off", def: <>The district&apos;s 2022 figure, weighted {DISTRICT_DROPOFF_WEIGHT} against the state&apos;s contested-seat mean, when the state has not redrawn since and the seat was contested. Redrawn districts and 2022&apos;s unopposed seats take the state mean; a state with no statewide race in a basis midterm takes the national mean.</> },
          { term: "County shares", def: <><Code>data-entry/county_district_shares_2026.csv</Code> (<Code>scripts/build-county-district-shares-2026.py</Code>): where the {ELECTION_YEAR} lines are the 2024 lines, each county piece&apos;s share of the county&apos;s 2024 House votes; in the ten states that redrew, every census tract placed in a {ELECTION_YEAR} district by its internal point and the shares are tract-summed CVAP. Slivers under 0.5% are dropped.</> },
        ]} />
        <StatRow stats={[
          { value: nat.houseVotes.toLocaleString(), label: `${ELECTION_YEAR} House votes, all districts` },
          { value: `${nat.low.toLocaleString()} – ${nat.high.toLocaleString()}`, label: "2022-like · 2018-like" },
          { value: `${nat.rate}%`, label: "of CVAP (2020–24)" },
          ...nat.basis.map((b) => ({ value: b.houseVotes.toLocaleString(), label: `${b.year} House votes (${((b.topVotes / b.cvap) * 100).toFixed(1)}% top-race turnout)` })),
        ]} />
      </Section>

      <Section id="county-results" kicker="Projected results" title="County results and the implied generic ballot"
        lede={<>The race pages&apos; county maps (<Code>lib/countyProjection.ts</Code>) spread each race&apos;s forecast margin over its counties on the turnout estimate. The race margin is the forecast&apos;s, unchanged; the county figures are how it is expected to be made up. Adding every race back up gives the national vote the forecast and the turnout estimate imply together.</>}>
        <Formula lines={[
          <>margin<sub>c</sub> = clamp(lean<sub>c</sub> + s, ±{COUNTY_MARGIN_CLAMP}) &nbsp;·&nbsp; s solved so that Σ<sub>c</sub> votes<sub>c</sub> · margin<sub>c</sub> / Σ<sub>c</sub> votes<sub>c</sub> = forecast margin</>,
          <>rep<sub>c</sub> = (100 − other<sub>c</sub> + margin<sub>c</sub>) / 2 &nbsp;·&nbsp; dem<sub>c</sub> = (100 − other<sub>c</sub> − margin<sub>c</sub>) / 2</>,
        ]} note={<>lean<sub>c</sub> is the county&apos;s TPL (its neutral-environment lean; the county&apos;s 2024 presidential margin where the county model has nothing to rest on); other<sub>c</sub> its 2024 third-party share, capped at {OTHER_SHARE_CAP}%. House counties are the district&apos;s pieces; a piece of a split county adds its 2024 deviation from the whole county (the piece&apos;s House margin minus the county&apos;s, same race, from the district-by-county results) where the lines are unchanged and every piece of the county was contested, so a county cut between a suburban and a rural district leans differently on each side. Redrawn states&apos; pieces keep the county&apos;s lean. A decided race — one major party absent, or two nominees of the same party — is painted 100% for the side that has it rather than solved.</>} />
        <Block label="Worked example · Fulton County in the Georgia Senate race">
          <Ledger lines={[
            { label: "Fulton County TPL", note: fultonResult.leanBasis === "county-tpl" ? "neutral-environment lean" : "2024 presidential margin", value: <M v={fultonResult.lean} /> },
            { op: "+", label: "Shift shared by every Georgia county", note: `solved for the forecast margin ${fmtGb(gaResult.margin)}`, value: <M v={gaResult.shift} /> },
            { op: "=", label: "Fulton County projected margin", note: `${fultonResult.demPct.toFixed(1)}% – ${fultonResult.repPct.toFixed(1)}% on ${fultonResult.votes.toLocaleString()} estimated votes`, value: <M v={fultonResult.margin} />, total: true },
          ]} />
        </Block>
        <Block label="Implied generic ballot" meta="every race's projected votes added up">
          <DataTable head={["Ballot", "Races", "Votes", "Dem", "Rep", "Margin", "Two-party"]} rows={gb.offices.map((o) => [o.office === "overall" ? "All three combined" : o.office[0].toUpperCase() + o.office.slice(1), o.races, o.votes.toLocaleString(), `${o.demPct}%`, `${o.repPct}%`, fmtGb(o.margin), fmtGb(o.twoPartyMargin)])}
            caption={<>Polling generic ballot {fmtGb(gb.polling.gb)}; the forecast&apos;s expected House vote {fmtGb(gb.polling.pvHat)}. House: contested races only {fmtGb(gb.house.contestedOnly)}, contested races weighted equally {fmtGb(gb.house.contestedEqualWeight)}; {gb.house.decidedRaces} decided seats add a net {gb.house.decidedNetVotes.toLocaleString()} votes.</>} />
        </Block>
      </Section>

      <Section id="backtest" kicker="Backtest" title={`${B.target} predicted from ${B.basis}`}
        lede={<>The same code run for {B.target} with {B.basis} as the only basis midterm and the {B.target - 2} presidential vote as the anchor (<Code>scripts/turnoutBacktest.ts</Code>). One basis midterm is the only honest test the data allow, so the state-level bias is largely the {B.basis}→{B.target} national swing; the county-share and district errors are what the machinery can be judged on. The competitiveness term uses {B.target}&apos;s actual margins here.</>}>
        <DataTable head={["", "n", "Mean abs. error", "Bias"]} rows={[
          ["State top-race votes", B.state.n, pct(B.state.mape), pct(B.state.bias)],
          ["  without the competitiveness term", B.state.n, pct(B.noCompetitiveness.state.mape), pct(B.noCompetitiveness.state.bias)],
          ["County top-race votes (vote-weighted)", B.county.n, pct(B.county.weightedMape), pct(B.county.bias)],
          ["County share of the state, level known", B.countyShare.n, pct(B.countyShare.weightedMape, 2), "—"],
          ["Contested House districts, 2022 lines", B.district.n, pct(B.district.mape), pct(B.district.bias)],
          ["  without the competitiveness term", B.noCompetitiveness.district.n, pct(B.noCompetitiveness.district.mape), pct(B.noCompetitiveness.district.bias)],
        ]} caption={<>Largest state misses: {B.state.worst.map((w) => `${w.state} ${w.office} ${w.error > 0 ? "+" : ""}${(w.error * 100).toFixed(0)}%`).join(", ")} — mostly a hot {B.basis} race followed by a quiet {B.target} one, which is what the competitiveness term now catches in part.</>} />
        <Block label="SHRINK_VOTES grid" meta="county-share error, level known">
          <DataTable head={["K", "County share", "County votes", "Districts"]} rows={B.grid.map((g) => [g.k >= 1e9 ? "∞ (state prior only)" : g.k.toLocaleString(), pct(g.countyShare, 2), pct(g.county), pct(g.district)])} />
        </Block>
        <Block label="Ticket effect" meta="states whose ticket changed 2018 → 2022">
          <DataTable head={["State", "2018", "2022", "Log change", "Excess vs. others"]} rows={B.ticket.switchers.map((s) => [s.state, s.from, s.to, s.change.toFixed(3), (s.change - B.ticket.others).toFixed(3)])} caption={<>Other states&apos; mean log change {B.ticket.others.toFixed(3)}; implied House-only factor {B.ticket.estimate.toFixed(3)}, used as {HOUSE_ONLY_TICKET_FACTOR}.</>} />
        </Block>
      </Section>

      <Section id="files" kicker="Reference" title="Files and commands">
        <FilesAndCommands
          files={[
            { path: "data-entry/cvap.csv", role: "CVAP and VAP by state, county and district, one ACS release per election year" },
            { path: "data-entry/vep_by_state.csv", role: "U.S. Elections Project VEP, VAP and total ballots by state, 2016–2024" },
            { path: "data-entry/turnout_first_round.csv", role: "first-round totals for runoff and ranked-choice races, with sources" },
            { path: "data-entry/county_district_shares_2026.csv", role: `county → ${ELECTION_YEAR} district shares (2024 pieces or tract CVAP)` },
            { path: "lib/turnout.ts", role: "the data hub: statewide, by-district and county turnout entries and slices" },
            { path: "lib/turnoutModel.ts", role: `the ${ELECTION_YEAR} estimate, its constants and backtest` },
            { path: "lib/countyProjection.ts", role: "projected county results per race and the implied generic ballot" },
            { path: "public/house-county-pieces/2026/", role: `county × district pieces on the ${ELECTION_YEAR} lines (scripts/build-house-county-pieces.py 2026)` },
            { path: "data/turnoutCalibration.ts", role: "the backtest tables above (generated)" },
            { path: "app/api/turnout/…", role: "static JSON slices per (level, year), per state's county splits, and all counties' estimates" },
          ]}
          commands={[
            { cmd: "python3 scripts/fetch-cvap.py", does: "refetch CVAP (needs CENSUS_API_KEY)" },
            { cmd: "python3 scripts/build-county-district-shares-2026.py", does: `rebuild the county → district shares after a boundary change` },
            { cmd: "npx tsx --conditions=react-server scripts/turnoutBacktest.ts --emit", does: "rerun the backtest and rewrite data/turnoutCalibration.ts" },
          ]} />
      </Section>
    </>
  );
}

import { TURNOUT_BACKTEST as B } from "@/data/turnoutCalibration";
import { ELECTION_YEAR, MIDTERM_WEIGHTS, projectAll, projectionNational } from "@/lib/turnoutModel";
import { impliedGenericBallot, projectRaceResults } from "@/lib/countyProjection";
import { A, Chapter, KeyFigures, Margin, QA, SeeIt, Steps } from "./kit";

// Public Turnout tab: the plain-language version of components/methodology/TurnoutMethodology.tsx,
// reading the same live estimate. Update alongside it when the estimate's STRUCTURE changes.

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

export default function TurnoutPublic() {
  const nat = projectionNational();
  const gaRace = projectAll().find((r) => r.id === "S-GA");
  const gaResult = projectRaceResults("senate", "GA");
  const fulton = gaResult?.counties.find((c) => c.fips === "13121");
  const gb = impliedGenericBallot();
  const overall = gb.offices.find((o) => o.office === "overall");
  const [recent, older] = Object.entries(MIDTERM_WEIGHTS).sort((a, b) => Number(b[0]) - Number(a[0]));

  return (
    <>
      <Chapter id="scope" kicker="Turnout" title="Who votes, and how many will"
        intro={<>The <A href="/analysis/turnout">Turnout</A> page shows how many people voted in every general election since 2016, by state, district and county, and estimates how many will vote in {ELECTION_YEAR}. Turnout is counted as votes cast in a race divided by the number of adult citizens who live there. That&rsquo;s the closest measure of the eligible population that is available for every county and district.</>}>
        <KeyFigures items={[
          { value: `${(nat.houseVotes / 1e6).toFixed(1)}M`, label: `House votes expected in ${ELECTION_YEAR}` },
          { value: `${nat.rate}%`, label: "of adult citizens" },
          { value: `${(nat.low / 1e6).toFixed(1)}M – ${(nat.high / 1e6).toFixed(1)}M`, label: `range: turnout like ${recent?.[0]} to turnout like ${older?.[0]}` },
        ]} />
      </Chapter>

      <Chapter id="level" kicker={`The ${ELECTION_YEAR} estimate`} title="Three steps"
        intro="The estimate starts with each state's total and then splits it among the state's counties and districts.">
        <Steps items={[
          { title: "A state's total, from its own midterms",
            figure: gaRace ? `${(gaRace.votes / 1e6).toFixed(2)}M` : undefined, figureLabel: "Georgia Senate votes",
            body: <>Each state&rsquo;s turnout rate in the last two midterms, with {recent?.[0]} counting more than {older?.[0]}, applied to today&rsquo;s adult citizen population. It is nudged up where this year&rsquo;s top race looks closer than last time and down where it looks less competitive, and down in a state with no Senate or governor race on the ballot.</> },
          { title: "Split among counties",
            body: "Each county gets its share of the state's last presidential vote, adjusted for how much more or less it tends to turn out in midterms than in presidential years. Places with few voters are pulled toward the state's pattern so that one odd year doesn't decide it." },
          { title: "Then among districts",
            body: "A House district adds up the counties, and the parts of counties, inside it. It's then adjusted for the voters who skip the House race in that district, where that's measured from a contested race." },
        ]} />
      </Chapter>

      <Chapter id="county-results" kicker="Projected results" title="County results on the race pages"
        intro="The county maps on each race page spread the race's forecast margin across its counties. Every county moves by the same amount from its own partisan lean, by whatever amount makes the counties add up to the forecast. The race's margin never changes; the map shows how it would most likely be made up.">
        <KeyFigures items={[
          ...(fulton ? [{ value: <Margin v={fulton.margin} />, label: `Fulton County in the Georgia Senate race, on ${fulton.votes.toLocaleString()} expected votes` }] : []),
          ...(overall ? [{ value: <Margin v={overall.margin} />, label: "every race's projected votes added up, nationwide" }] : []),
        ]} />
      </Chapter>

      <Chapter id="results-needle" kicker="Election night" title="The results needle"
        intro={<>On election night the <A href="/results">Results</A> page shows the count for every race next to the forecast, and a projected final margin. Each county starts at its projected result above. As it reports, the votes already counted stand as they are, and the rest of the county is moved by however much the counties that have reported are running ahead of or behind their projections. Early in the night that shared shift is held close to zero, because a few counties can mislead; it loosens as more comes in. The projection never calls a race: calls come from the results provider, civicAPI, and the needle only stops moving once one is made.</>}>
        <SeeIt>Live on the <A href="/results">Results</A> page from November 3.</SeeIt>
      </Chapter>

      <Chapter id="backtest" kicker="Track record" title={`How it did in ${B.target}`}
        intro={`We ran the same estimate for ${B.target} using only ${B.basis} as its guide and compared it with the actual count. Most of the state-level miss is the national change in turnout between the two years. How the vote is shared out among counties and districts is the part the method is responsible for.`}>
        <KeyFigures items={[
          { value: pct(B.state.mape, 1), label: "typical miss on a state's total" },
          { value: pct(B.countyShare.weightedMape, 1), label: "typical miss on a county's share of its state" },
          { value: pct(B.district.mape, 1), label: "typical miss on a House district's total" },
        ]} />
        <QA items={[
          { q: "Why adult citizens, not registered voters?", a: "Registration rules and list maintenance differ from state to state. Adult citizens are measured the same way everywhere by the Census Bureau." },
          { q: "What about runoffs?", a: "A race decided in a runoff or by ranked-choice rounds is counted at its first round, the electorate that actually turned out." },
        ]} />
        <SeeIt>The full numbers for every state, county and district are on the <A href="/analysis/turnout">Turnout</A> page.</SeeIt>
      </Chapter>
    </>
  );
}

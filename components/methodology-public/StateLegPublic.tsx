import { STATE_LEG_VALIDATION } from "@/data/stateLegValidation";
import { projectAllChambers } from "@/lib/stateLegForecast";
import { projectAllChamberPopularVotes } from "@/lib/stateLegPopularVote";
import { A, Chapter, KeyFigures, QA, SeeIt, Steps } from "./kit";

// Public Legislative atlas tab: the plain-language version of
// components/methodology/StateLegMethodology.tsx, reading the same live projection. Update alongside it
// when the projection's or the popular vote's STRUCTURE changes.

export default function StateLegPublic() {
  const chambers = projectAllChambers();
  const seatsUp = chambers.reduce((s, c) => s + c.seatsUp, 0);
  const inPlay = chambers.filter((c) => c.pDemControl != null && c.pDemControl >= 0.2 && c.pDemControl <= 0.8).length;
  const pv = projectAllChamberPopularVotes();
  const votes = pv.reduce((s, c) => s + c.raw.votes, 0);
  const latest = STATE_LEG_VALIDATION.rows.at(-1)!;

  return (
    <>
      <Chapter id="scope" kicker="Legislative atlas" title="Every state legislative seat"
        intro={<>The state legislature pages show every district in every chamber: who represents it, every general election since 2016 with the candidates&rsquo; names, how it voted for president on each map it has existed on, who lives there, and how its lines have changed. They also carry a {2026} projection for every seat on the ballot.</>}>
        <KeyFigures items={[
          { value: seatsUp.toLocaleString(), label: "seats on the 2026 ballot" },
          { value: chambers.length, label: "chambers projected" },
          { value: inPlay, label: "chambers where neither party is a clear favorite" },
        ]} />
      </Chapter>

      <Chapter id="data" kicker="The records" title="What the pages are built from">
        <Steps items={[
          { title: "Presidential results by district, on every map",
            body: "Precinct-level presidential returns, assigned to the district lines of each era. That lets a district be compared across redistricting." },
          { title: "Candidates and results",
            body: "Official results where states publish them, checked so that the candidates' votes add up to each district's total." },
          { title: "Redistricting",
            body: "For every new map, which old districts each new district was drawn from, measured in people rather than land." },
          { title: "The 2026 field and fundraising",
            body: "Each chamber's 2026 candidates and their reported fundraising, matched to the districts they're running in." },
        ]} />
      </Chapter>

      <Chapter id="projection" kicker="The model" title="The 2026 projection"
        intro="Each seat is projected with the same recipe as the congressional forecast, built from the atlas's own records.">
        <Steps items={[
          { title: "The district's lean",
            body: "Its presidential results on today's lines and its own legislative races, with the most recent legislative race counting extra. Older races from before a redraw are moved onto today's lines. Where a state's voters regularly split their tickets (Vermont Republicans run well ahead of their presidential nominee, for example), that habit is carried forward." },
          { title: "This year's conditions",
            body: "The same national mood as the congressional forecast, plus incumbency and the unusual part of any fundraising gap." },
          { title: "Odds for the chamber",
            body: "Each chamber is simulated thousands of times. Every run has one national surprise and one surprise for the whole state, so a chamber's seats can move together. Seats not up this year stay with their current holder." },
        ]} />
        <QA items={[
          { q: "How accurate has it been?", a: `Projecting ${latest.year} from earlier years, the typical seat missed by ${latest.maeAfterIncumbency.toFixed(1)} points across ${latest.n.toLocaleString()} contested districts.` },
          { q: "What about independents?", a: "Where an established independent is the real opponent, such as a sitting independent or one backed by a major party, the seat is forecast as a contest instead of being handed to the only party on the ballot." },
          { q: "What is the chamber popular vote?", a: <>Each chamber page shows two totals for {(votes / 1e6).toFixed(0)} million projected votes. <strong>Raw</strong> is what the official count will show. <strong>Adjusted</strong> fills in every uncontested seat as if both parties had run, which is a better read of how the state actually leans.</> },
        ]} />
        <SeeIt>The <A href="/legislatures">State Legislatures</A> board, and each state&rsquo;s chamber pages.</SeeIt>
      </Chapter>
    </>
  );
}

import { electionYear } from "@/data/forecastData";
import TurnoutPage from "@/components/turnout/TurnoutPage";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { firstRoundNotes, nationalRows, stateSeries } from "@/lib/turnout";
import { impliedGenericBallot } from "@/lib/countyProjection";
import { COMPETITIVENESS_SLOPE, DISTRICT_DROPOFF_WEIGHT, HOUSE_ONLY_TICKET_FACTOR, MIDTERM_WEIGHTS, SHRINK_VOTES, projectionNational, projectionSummary } from "@/lib/turnoutModel";

export const metadata = {
  title: `Turnout — ${electionYear} Analysis`,
  description: `Turnout in every general election since 2016 by state, House district and county, and the ${electionYear} turnout estimate.`,
};

// Everything below is computed at build time on the server (lib/turnout.ts, lib/turnoutModel.ts);
// the client gets the compact state series and the race-level estimate, and fetches the district,
// county and per-state county-split slices from app/api/turnout on demand.
const pct = (v: number) => `${v.toFixed(1)}%`; // rates are already in percent
const millions = (v: number) => `${(v / 1e6).toFixed(0)} million`;

export default function TurnoutAnalysisPage() {
  const national = nationalRows();
  const projNational = projectionNational();
  const lastPres = national.filter((r) => r.rate.president != null).at(-1);
  const lastMidterm = national.filter((r) => r.year % 4 === 2 && r.rate.house != null).at(-1);
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Turnout" title="Turnout">
        Who votes, where, and in which races, by state, House district and county since 2016.
        {lastPres && lastMidterm && <> In {lastPres.year}, <Fig>{pct(lastPres.rate.president!)}</Fig> of eligible citizens voted for president
        and <Fig>{pct(lastPres.rate.house!)}</Fig> in House races; in the {lastMidterm.year} midterm, <Fig>{pct(lastMidterm.rate.house!)}</Fig> voted for the House.</>}
        {" "}For {electionYear} we expect about <Fig>{millions(projNational.houseVotes)}</Fig> House votes
        (between {millions(projNational.low)} and {millions(projNational.high)}), or <Fig>{pct(projNational.rate)}</Fig> of eligible citizens.
      </StandfirstHeader>
      <TurnoutPage
        states={stateSeries()}
        national={national}
        projection={projectionSummary()}
        projectionNational={projNational}
        firstRound={firstRoundNotes()}
        impliedBallot={impliedGenericBallot()}
        model={{ midtermWeights: MIDTERM_WEIGHTS, shrinkVotes: SHRINK_VOTES, ticketFactor: HOUSE_ONLY_TICKET_FACTOR, slope: COMPETITIVENESS_SLOPE, dropoffWeight: DISTRICT_DROPOFF_WEIGHT }}
      />
    </div>
  );
}

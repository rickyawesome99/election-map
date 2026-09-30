import { electionYear } from "@/data/forecastData";
import TurnoutPage from "@/components/turnout/TurnoutPage";
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
export default function TurnoutAnalysisPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, var(--app-tab-bg) 0%, var(--app-bg) 65%)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-5 pt-6 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>US</span>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5vw, 3.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Turnout</h1>
          </div>
          <div className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>Who votes, where, and in which races — 2016 to 2025, and what {electionYear} should look like</div>
        </div>
      </div>
      <TurnoutPage
        states={stateSeries()}
        national={nationalRows()}
        projection={projectionSummary()}
        projectionNational={projectionNational()}
        firstRound={firstRoundNotes()}
        impliedBallot={impliedGenericBallot()}
        model={{ midtermWeights: MIDTERM_WEIGHTS, shrinkVotes: SHRINK_VOTES, ticketFactor: HOUSE_ONLY_TICKET_FACTOR, slope: COMPETITIVENESS_SLOPE, dropoffWeight: DISTRICT_DROPOFF_WEIGHT }}
      />
    </div>
  );
}

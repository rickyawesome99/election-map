import { electionYear } from "@/data/forecastData";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";
import OH31AnalysisContent from "@/components/OH31AnalysisContent";
import OH31Hero from "@/components/OH31Hero";

export const metadata = {
  title: `OH-31 — ${electionYear} Analysis`,
  description: `Analysis of Ohio's 31st State House District`,
};

export default function OH31Page() {
  const precinctCount = oh31PrecinctData.length;
  const ballots = oh31PrecinctData.reduce((sum, p) => sum + p.ballotsCast, 0);
  const registered = oh31PrecinctData.reduce((sum, p) => sum + p.regVoters, 0);
  const turnoutPct = registered > 0 ? (ballots / registered) * 100 : 0;
  const stRepD = oh31PrecinctData.reduce((sum, p) => sum + p.stRep.dVotes, 0);
  const stRepR = oh31PrecinctData.reduce((sum, p) => sum + p.stRep.rVotes, 0);
  const margin = stRepD + stRepR > 0 ? ((stRepR - stRepD) / (stRepD + stRepR)) * 100 : 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <OH31Hero
        precinctCount={precinctCount}
        ballots={ballots}
        registered={registered}
        turnoutPct={turnoutPct}
        margin={margin}
      />
      <main className="max-w-6xl mx-auto px-6 pb-10 pt-6">
        <OH31AnalysisContent />
      </main>
    </div>
  );
}

import { electionYear } from "@/data/forecastData";
import AppHeader from "@/components/AppHeader";
import BackButton from "@/components/BackButton";
import OH31Map from "@/components/OH31Map";
import OH31PrecinctTable from "@/components/OH31PrecinctTable";
import { oh31PrecinctData } from "@/data/oh31PrecinctData";

export const metadata = {
  title: `OH-31 — ${electionYear} Analysis`,
  description: `Analysis of Ohio's 31st State House District`,
};


function sumRace(key: "pres" | "senate" | "uSHouse" | "stRep") {
  return oh31PrecinctData.reduce(
    (acc, p) => ({ d: acc.d + p[key].dVotes, r: acc.r + p[key].rVotes }),
    { d: 0, r: 0 }
  );
}

const totalBallots = oh31PrecinctData.reduce((sum, precinct) => sum + precinct.ballotsCast, 0);
const totalRegistered = oh31PrecinctData.reduce((sum, precinct) => sum + precinct.regVoters, 0);
const turnoutPct = totalRegistered > 0 ? (totalBallots / totalRegistered) * 100 : 0;

const TOTALS = {
  pres:    { label: "President",   ...sumRace("pres") },
  senate:  { label: "U.S. Senate", ...sumRace("senate") },
  uSHouse: { label: "U.S. House",  ...sumRace("uSHouse") },
  stRep:   { label: "State Rep",   ...sumRace("stRep") },
};

export default function OH31Page() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            OH-31
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            Ohio 31st State House District · precinct map
          </p>
        </div>

        <section id="oh31-map" className="scroll-mt-24">
          <OH31Map />
        </section>

        {/* Vote totals summary */}
        <div className="mt-8 rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="px-4 py-3" style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
            <h2 className="font-semibold text-sm" style={{ color: "var(--app-text-primary)" }}>
              District-Wide Vote Totals
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4" style={{ background: "var(--app-bg)" }}>
            {Object.values(TOTALS).map(({ label, d, r }, i) => {
              const total = d + r;
              const dPct = total > 0 ? (d / total * 100) : 0;
              const rPct = total > 0 ? (r / total * 100) : 0;
              const dWins = d > r;
              return (
                <div
                  key={label}
                  className="px-5 py-4"
                  style={{
                    borderRight: i < 3 ? "1px solid var(--app-border)" : undefined,
                    borderBottom: i < 2 ? "1px solid var(--app-border)" : undefined,
                  }}
                >
                  <div className="text-xs font-medium mb-3" style={{ color: "var(--app-text-muted)" }}>
                    {label}
                  </div>
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: "var(--party-dem, #1b408c)" }}>
                        {d.toLocaleString()}
                      </div>
                      <div className="text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                        {dPct.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                      background: dWins ? "var(--party-dem-subtle, #dbeafe)" : "var(--party-rep-subtle, #fee2e2)",
                      color: dWins ? "var(--party-dem, #1b408c)" : "var(--party-rep, #be1c29)",
                    }}>
                      {dWins ? "D" : "R"}+{Math.abs(dPct - rPct).toFixed(1)}%
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold tabular-nums" style={{ color: "var(--party-rep, #be1c29)" }}>
                        {r.toLocaleString()}
                      </div>
                      <div className="text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                        {rPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  {/* D/R bar */}
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--app-border)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${dPct}%`,
                      background: "var(--party-dem, #1b408c)",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mt-6">
          <div className="rounded-xl px-4 py-4" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Precincts
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
              {oh31PrecinctData.length}
            </div>
          </div>
          <div className="rounded-xl px-4 py-4" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Ballots Cast
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
              {totalBallots.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl px-4 py-4" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
              Turnout
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
              {turnoutPct.toFixed(1)}%
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>
              {totalRegistered.toLocaleString()} registered voters
            </div>
          </div>
        </div>

        {/* Precinct data table */}
        <section id="oh31-table" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--app-text-primary)" }}>
            Precinct Results
          </h2>
          <OH31PrecinctTable />
        </section>
      </main>
    </div>
  );
}

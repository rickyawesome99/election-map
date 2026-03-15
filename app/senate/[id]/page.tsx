import { senateData } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import { notFound } from "next/navigation";
import Link from "next/link";
import SenateDetailClient from "./SenateDetailClient";

export async function generateStaticParams() {
  return senateData.map((race) => ({ id: race.id.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = senateData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!race) return { title: "Race Not Found" };
  return {
    title: `${race.name} Senate Race — 2026 Forecast`,
    description: `2026 Senate forecast for ${race.name}: ${race.rating}, ${Math.round(race.probability * 100)}% Democratic win probability`,
  };
}

export default async function SenatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = senateData.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!race) notFound();

  const demPct = Math.round(race.probability * 100);
  const repPct = 100 - demPct;
  const { bg, text } = getRatingColors(race.rating);
  const marginIsD = race.margin >= 0;

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      {/* Nav bar */}
      <header className="border-b border-[#30363d] bg-[#161b22] px-6 py-4 flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-[#8b949e] hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Map
        </Link>
        <div className="h-4 w-px bg-[#30363d]" />
        <span className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold">Senate</span>
        <span className="text-[#484f58]">/</span>
        <span className="text-white font-semibold">{race.name}</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Title block */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{race.name}</h1>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: bg, color: text }}
            >
              {race.rating}
            </span>
          </div>
          <p className="text-[#8b949e]">2026 U.S. Senate Race · Class 2</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Candidates */}
          {race.candidates && (
            <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
              <h2 className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-4">Candidates</h2>
              <div className="flex flex-col gap-3">
                {[
                  { candidate: race.candidates.dem, pct: demPct },
                  { candidate: race.candidates.rep, pct: repPct },
                ].map(({ candidate, pct }) => {
                  const isD = candidate.party === "D" || candidate.party === "I";
                  const partyLabel = candidate.party === "I" ? "Independent" : candidate.party === "D" ? "Democrat" : "Republican";
                  const borderColor = isD ? "#388bfd" : "#f85149";
                  const bgColor = isD ? "#1b3a5c" : "#5c1b1b";
                  const textColor = isD ? "#93c5fd" : "#fca5a5";
                  return (
                    <div
                      key={candidate.name}
                      className="flex items-center justify-between rounded-lg px-4 py-3"
                      style={{ background: bgColor, borderLeft: `3px solid ${borderColor}` }}
                    >
                      <div>
                        <div className="text-white font-semibold">{candidate.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span style={{ color: textColor }} className="text-xs font-medium">{partyLabel}</span>
                          {candidate.incumbent && (
                            <span className="text-[10px] bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full">Incumbent</span>
                          )}
                        </div>
                      </div>
                      <div style={{ color: textColor }} className="text-2xl font-bold tabular-nums">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Win probability */}
          <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
            <h2 className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-4">Win Probability</h2>
            <div className="flex justify-between text-sm font-semibold mb-3">
              <span className="text-blue-400">Dem {demPct}%</span>
              <span className="text-red-400">Rep {repPct}%</span>
            </div>
            <div className="h-4 rounded-full overflow-hidden flex">
              <div style={{ width: `${demPct}%` }} className="bg-blue-500 transition-all duration-300" />
              <div style={{ width: `${repPct}%` }} className="bg-red-500 transition-all duration-300" />
            </div>

            <div className="mt-6">
              <h2 className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-2">Projected Margin</h2>
              <div className={`text-4xl font-bold ${marginIsD ? "text-blue-400" : "text-red-400"}`}>
                {marginIsD ? "+" : ""}{race.margin.toFixed(1)}
              </div>
              <div className="text-sm text-[#8b949e] mt-1">
                {marginIsD ? "Democratic" : "Republican"} advantage
              </div>
            </div>
          </section>

          {/* Probability trend (client component for chart) */}
          <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
            <h2 className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-4">Probability Trend</h2>
            <SenateDetailClient history={race.history} />
          </section>

          {/* Past results */}
          {race.pastResults && race.pastResults.length > 0 && (
            <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
              <h2 className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold mb-4">Past Election Results</h2>
              <div className="flex flex-col gap-4">
                {race.pastResults.map((res) => {
                  const winner = res.demPct > res.repPct ? "D" : "R";
                  const margin = Math.abs(res.demPct - res.repPct).toFixed(1);
                  const total = res.demPct + res.repPct;
                  const dWidth = total > 0 ? (res.demPct / total) * 100 : 50;
                  return (
                    <div key={res.year}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-semibold text-[#8b949e]">{res.year}</span>
                        <span className={`text-xs font-bold ${winner === "D" ? "text-blue-400" : "text-red-400"}`}>
                          {winner}+{margin}
                        </span>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden">
                        <div style={{ width: `${dWidth}%` }} className="bg-blue-500" />
                        <div style={{ width: `${100 - dWidth}%` }} className="bg-red-500" />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-blue-400/70">{res.demPct}%</span>
                        <span className="text-xs text-red-400/70">{res.repPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

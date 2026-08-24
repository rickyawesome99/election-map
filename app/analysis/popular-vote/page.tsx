import { electionYear } from "@/data/forecastData";
import PopularVoteChart from "@/components/PopularVoteChart";

export const metadata = {
  title: `Popular Vote — ${electionYear} Analysis`,
  description: `${electionYear} popular vote analysis`,
};

export default function PopularVotePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, var(--app-tab-bg) 0%, var(--app-bg) 65%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              US
            </span>
            <h1
              style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5vw, 3.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
            >
              Popular Vote
            </h1>
          </div>
          <div className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
            National Popular Vote by Race Type Since 2016
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <PopularVoteChart />
      </main>
    </div>
  );
}

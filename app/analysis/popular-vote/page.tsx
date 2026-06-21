import { electionYear } from "@/data/forecastData";
import PopularVoteChart from "@/components/PopularVoteChart";

export const metadata = {
  title: `Popular Vote — ${electionYear} Analysis`,
  description: `${electionYear} popular vote analysis`,
};

export default function PopularVotePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            Popular Vote
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            National popular vote by race type since 2016
          </p>
        </div>
        <PopularVoteChart />
      </main>
    </div>
  );
}

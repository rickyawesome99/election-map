import { electionYear } from "@/data/forecastData";
import OH31AnalysisContent from "@/components/OH31AnalysisContent";

export const metadata = {
  title: `OH-31 — ${electionYear} Analysis`,
  description: `Analysis of Ohio's 31st State House District`,
};

export default function OH31Page() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <main className="max-w-6xl mx-auto px-6 pb-10 pt-3">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            OH-31
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            Ohio 31st State House District · Precinct Map
          </p>
        </div>
        <OH31AnalysisContent />
      </main>
    </div>
  );
}

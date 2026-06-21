import { electionYear } from "@/data/forecastData";
import Link from "next/link";

export const metadata = {
  title: `Analysis — ${electionYear} Forecast`,
  description: `${electionYear} U.S. election analysis`,
};

export default function AnalysisPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            Analysis
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            {electionYear} Election Analysis
          </p>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                <th
                  className="px-3 sm:px-4 py-3 text-left text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Category
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                className="transition-colors hover:opacity-80"
                style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}
              >
                <td className="px-3 sm:px-4 py-3">
                  <Link
                    href="/analysis/oh-31"
                    className="font-semibold hover:underline"
                    style={{ color: "var(--app-text-primary)" }}
                  >
                    OH-31
                  </Link>
                </td>
              </tr>
              <tr
                className="transition-colors hover:opacity-80"
                style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}
              >
                <td className="px-3 sm:px-4 py-3">
                  <Link
                    href="/analysis/popular-vote"
                    className="font-semibold hover:underline"
                    style={{ color: "var(--app-text-primary)" }}
                  >
                    Popular Vote
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

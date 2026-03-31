import { electionYear } from "@/data/forecastData";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata = {
  title: `Analysis — ${electionYear} Forecast`,
  description: `${electionYear} U.S. election analysis`,
};

const NAV = [
  { label: "States",   href: "/states" },
  { label: "House",    href: "/house" },
  { label: "Senate",   href: "/senate" },
  { label: "Governor", href: "/governor" },
  { label: "Analysis", href: "/analysis" },
];

export default function AnalysisPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div className="sticky top-0 z-10">
        <header
          className="px-6 py-4 flex items-center gap-4"
          style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-panel)" }}
        >
          <Link href="/" className="font-bold text-lg tracking-tight" style={{ color: "var(--app-text-primary)" }}>
            CT Strategies
          </Link>
          <div className="hidden md:block h-4 w-px" style={{ background: "var(--app-border)" }} />
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={
                  href === "/analysis"
                    ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                    : { color: "var(--app-text-muted)" }
                }
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <nav className="md:hidden flex border-b" style={{ background: "var(--app-panel)", borderColor: "var(--app-border)" }}>
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="flex-1 py-2 text-center text-sm font-medium"
              style={href === "/analysis" ? { color: "var(--app-text-primary)" } : { color: "var(--app-text-muted)" }}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            Analysis
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            {electionYear} election analysis
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
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

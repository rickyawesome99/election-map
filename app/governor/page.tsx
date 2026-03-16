import { governorData } from "@/data/forecastData";
import RaceTable from "@/components/RaceTable";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata = {
  title: "Governor Races — 2026 Forecast",
  description: "2026 U.S. Governor race forecasts",
};

export default function GovernorListPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <header
        className="px-6 py-4 flex items-center gap-4"
        style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-panel)" }}
      >
        <Link
          href="/"
          className="font-bold text-lg tracking-tight"
          style={{ color: "var(--app-text-primary)" }}
        >
          CT Strategies
        </Link>
        <div className="h-4 w-px" style={{ background: "var(--app-border)" }} />
        <nav className="flex items-center gap-1">
          {([
            { label: "States", href: "/states" },
            { label: "House", href: "/house" },
            { label: "Senate", href: "/senate" },
            { label: "Governor", href: "/governor" },
          ]).map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
              style={
                href === "/governor"
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

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            Governor Races
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            2026 U.S. Governor forecast · {governorData.length} races
          </p>
        </div>

        <RaceTable races={governorData} basePath="/governor" nameLabel="State" />
      </main>
    </div>
  );
}

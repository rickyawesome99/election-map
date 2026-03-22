import { statesData } from "@/data/statesData";
import { electionYear } from "@/data/forecastData";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata = {
  title: `States — ${electionYear} Forecast`,
  description: `${electionYear} U.S. election forecast by state`,
};

const NAV = [
  { label: "States",    href: "/states" },
  { label: "House",     href: "/house" },
  { label: "Senate",    href: "/senate" },
  { label: "Governor",  href: "/governor" },
];

export default function StatesListPage() {
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
                href === "/states"
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
            style={href === "/states" ? { color: "var(--app-text-primary)" } : { color: "var(--app-text-muted)" }}
          >
            {label}
          </Link>
        ))}
      </nav>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            States
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            {electionYear} election forecast by state · all 50 states
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {statesData.map((state) => (
            <Link
              key={state.id}
              href={`/states/${state.id}`}
              className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
              style={{
                background: "var(--app-panel)",
                border: "1px solid var(--app-border)",
              }}
            >
              <span
                className="text-xs font-bold w-7 shrink-0 text-center rounded px-1 py-0.5"
                style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
              >
                {state.abbr}
              </span>
              <span className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }}>
                {state.name}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

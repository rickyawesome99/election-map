import { senateData } from "@/data/forecastData";
import { getRatingColors } from "@/lib/colorScale";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata = {
  title: "Senate Races — 2026 Forecast",
  description: "2026 U.S. Senate race forecasts for all Class 2 seats",
};

const RATING_ORDER = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"];

export default function SenateListPage() {
  const sorted = [...senateData].sort((a, b) => {
    const ri = RATING_ORDER.indexOf(a.rating) - RATING_ORDER.indexOf(b.rating);
    if (ri !== 0) return ri;
    return a.name.localeCompare(b.name);
  });

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
            { label: "House", href: "/house" },
            { label: "Senate", href: "/senate" },
            { label: "Governor", href: "/governor" },
            { label: "States", href: "/states" },
          ]).map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
              style={
                href === "/senate"
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
            Senate Races
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            2026 U.S. Senate forecast · {senateData.length} Class 2 seats
          </p>
        </div>

        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--app-border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  State
                </th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  Rating
                </th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: "var(--app-text-muted)" }}>
                  Democrat
                </th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden md:table-cell" style={{ color: "var(--app-text-muted)" }}>
                  Republican
                </th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  Margin
                </th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold hidden sm:table-cell" style={{ color: "var(--app-text-muted)" }}>
                  D Win %
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((race, i) => {
                const { bg, text } = getRatingColors(race.rating);
                const marginIsD = race.margin >= 0;
                const demPct = Math.round(race.probability * 100);
                const repPct = 100 - demPct;
                return (
                  <tr
                    key={race.id}
                    style={{
                      background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                    className="transition-colors hover:opacity-80"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/senate/${race.id.toLowerCase()}`}
                        className="font-semibold hover:underline"
                        style={{ color: "var(--app-text-primary)" }}
                      >
                        {race.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: bg, color: text }}
                      >
                        {race.rating}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell" style={{ color: "#1b408c" }}>
                      {race.candidates?.dem.name ?? <span style={{ color: "var(--app-text-very-muted)" }} className="italic">TBD</span>}
                      {race.candidates?.dem.incumbent && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#1b408c20", color: "#1b408c" }}>
                          Inc.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell" style={{ color: "#be1c29" }}>
                      {race.candidates?.rep.name ?? <span style={{ color: "var(--app-text-very-muted)" }} className="italic">TBD</span>}
                      {race.candidates?.rep.incumbent && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#be1c2920", color: "#be1c29" }}>
                          Inc.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: marginIsD ? "#1b408c" : "#be1c29" }}>
                      {marginIsD ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-2 rounded-full overflow-hidden flex">
                          <div style={{ width: `${demPct}%`, background: "#1b408c" }} />
                          <div style={{ width: `${repPct}%`, background: "#be1c29" }} />
                        </div>
                        <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--app-text-muted)" }}>
                          {demPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

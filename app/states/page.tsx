import { statesData } from "@/data/statesData";
import { electionYear, governorData, governorNoElection, houseData, senateCurrent, pres2024, statePvi, houseDelegationHistory, RaceForecast } from "@/data/forecastData";
import StatesTable, { StateRow } from "@/components/StatesTable";
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
  { label: "Analysis",  href: "/analysis" },
];

function raceParty(race: RaceForecast): "D" | "R" | "I" {
  if (race.seatParty) return race.seatParty;
  if (race.candidates?.dem.incumbent) return "D";
  if (race.candidates?.rep.incumbent) return "R";
  return race.margin >= 0 ? "D" : "R";
}

function buildStateRows(): StateRow[] {
  return statesData.map((state) => {
    // Governor current party
    const govRace = governorData.find((r) => r.id === state.abbr);
    const govNoEl = !govRace ? governorNoElection.find((e) => e.abbr === state.abbr) : null;
    const govParty: "D" | "R" | "I" | null = govRace ? raceParty(govRace) : (govNoEl?.party ?? null);

    // Senate current composition
    const [senSeat1, senSeat2] = senateCurrent[state.abbr] ?? ["R", "R"];
    const seats = [senSeat1, senSeat2];
    const senateDem = seats.filter((p) => p === "D").length;
    const senateRep = seats.filter((p) => p === "R").length;
    const senateInd = seats.filter((p) => p === "I").length;

    // House current delegation (2024 results preferred, else infer from incumbents)
    const houseRaces = houseData.filter((r) => r.state === state.name);
    const del2024 = (houseDelegationHistory[state.name] ?? []).find((e) => e.year === 2024);
    const houseDem = del2024 ? del2024.demSeats : houseRaces.filter((r) => raceParty(r) === "D").length;
    const houseRep = del2024 ? del2024.repSeats : houseRaces.filter((r) => raceParty(r) === "R").length;

    return {
      id: state.id,
      name: state.name,
      abbr: state.abbr,
      govParty,
      senateDem,
      senateRep,
      senateInd,
      houseDem,
      houseRep,
      houseTotal: houseRaces.length,
      pres2024: pres2024[state.abbr] ?? null,
      pvi2026: statePvi[state.abbr] ?? null,
    };
  });
}

export default function StatesListPage() {
  const rows = buildStateRows();
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

      <nav className="md:hidden flex border-b px-2" style={{ background: "var(--app-panel)", borderColor: "var(--app-border)" }}>
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
            {electionYear} Election Forecast by State · All 50 States
          </p>
        </div>

        <StatesTable rows={rows} />
      </main>
    </div>
  );
}

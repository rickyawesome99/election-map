import { statesData } from "@/data/statesData";
import { stateLegData } from "@/data/forecastData";
import { stateLegDistricts, UNICAMERAL_STATES } from "@/data/stateLegDistricts";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import { latestChamberSeats } from "@/lib/stateLegSeats";
import { notFound } from "next/navigation";
import BackButton from "@/components/BackButton";
import StateLegSection from "@/components/StateLegSection";
import StateLegCompositionBox from "@/components/StateLegCompositionBox";
import Link from "next/link";

export async function generateStaticParams() {
  return statesData.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) return { title: "State Not Found" };
  return {
    title: `${state.name} State Legislature`,
    description: `2026 state legislative districts and results for ${state.name}`,
  };
}

export default async function StateLegislaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) notFound();

  const isUnicameral = UNICAMERAL_STATES.has(state.abbr);
  const entries = stateLegData[state.name] ?? [];
  const houseSeats = latestChamberSeats(entries, "House");
  const senateSeats = !isUnicameral ? latestChamberSeats(entries, "Senate") : null;

  const houseEntries = entries.filter((e) => e.type === "House");
  const senateEntries = entries.filter((e) => e.type === "Senate");
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero */}
      <div style={{ minHeight: "220px" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-8 sm:pb-10">
          <div className="mb-5 -ml-2">
            <BackButton />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
                >
                  {state.abbr}
                </span>
                <h1
                  className="whitespace-nowrap"
                  style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
                >
                  {state.name}
                </h1>
              </div>
              <div className="mt-3 flex items-center gap-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
                <span>State Legislature</span>
                <span style={{ color: "var(--app-text-very-muted)" }}>·</span>
                <Link href={`/states/${state.id}`} className="hover:underline" style={{ color: "var(--app-text-primary)", fontWeight: 600 }}>
                  View {state.name} overview
                </Link>
              </div>
            </div>
          </div>

          {/* Stat row */}
          {(houseSeats || senateSeats) && (
            <div className="mt-8 pt-5 flex flex-wrap gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
              {houseSeats && (
                <div className={senateSeats ? "pr-8" : ""} style={senateSeats ? { borderRight: "1px solid var(--app-border)" } : undefined}>
                  <div className="text-2xl font-extrabold tabular-nums">
                    <span style={{ color: "var(--party-dem)" }}>{houseSeats.dem}D</span>
                    <span style={{ color: "var(--app-text-very-muted)", fontWeight: 500 }}>–</span>
                    <span style={{ color: "var(--party-rep)" }}>{houseSeats.rep}R</span>
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                    {isUnicameral ? "Legislature" : "State House"} · {houseSeats.total} seats
                  </div>
                </div>
              )}
              {senateSeats && (
                <div>
                  <div className="text-2xl font-extrabold tabular-nums">
                    <span style={{ color: "var(--party-dem)" }}>{senateSeats.dem}D</span>
                    <span style={{ color: "var(--app-text-very-muted)", fontWeight: 500 }}>–</span>
                    <span style={{ color: "var(--party-rep)" }}>{senateSeats.rep}R</span>
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                    State Senate · {senateSeats.total} seats
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 pt-4 pb-10 sm:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start">
          <StateLegSection
            stateAbbr={state.abbr}
            stateName={state.name}
            districtsByChamber={stateLegDistricts[state.abbr] ?? {}}
            mapInfoByChamber={stateLegMapInfo[state.abbr] ?? {}}
            isUnicameral={isUnicameral}
          />

          {(houseEntries.length > 0 || senateEntries.length > 0) && (
            <StateLegCompositionBox
              houseEntries={houseEntries}
              senateEntries={senateEntries}
              isUnicameral={isUnicameral}
            />
          )}
        </div>
      </main>
    </div>
  );
}

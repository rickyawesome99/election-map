import { statesData } from "@/data/statesData";
import { stateLegData } from "@/data/forecastData";
import { stateLegDistricts, UNICAMERAL_STATES } from "@/data/stateLegDistricts";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import { stateLegPres2024 } from "@/data/stateLegPres2024";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { latestChamberSeats } from "@/lib/stateLegSeats";
import { notFound } from "next/navigation";
import BackButton from "@/components/BackButton";
import StateLegSection from "@/components/StateLegSection";
import StateLegAboutSection from "@/components/StateLegAboutSection";
import { calculateStateTpl } from "@/lib/tplCompute";
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
  const stateTpl = calculateStateTpl(state.abbr, state.name);
  const heroMargin = Number.isFinite(stateTpl) ? stateTpl : null;
  const heroIsD = heroMargin != null && heroMargin <= 0;

  const houseEntries = entries.filter((e) => e.type === "House");
  const senateEntries = entries.filter((e) => e.type === "Senate");

  const chamberMapInfo = stateLegMapInfo[state.abbr] ?? {};
  // Nebraska's single chamber is classified as "senate" (SLDU) in the boundary data, but its
  // election results are stored under "House" — see StateLegSection.tsx for the same convention.
  // Prefer the verified totalSeats from research (kept internally consistent with the
  // supermajority math shown in the chamber band) over the composition-data total, which can
  // undercount vacant/independent seats. The chamber band derives the majority threshold from it.
  const houseTotalSeats = (isUnicameral ? chamberMapInfo.senate?.totalSeats : chamberMapInfo.house?.totalSeats) ?? houseSeats?.total;
  const senateTotalSeats = chamberMapInfo.senate?.totalSeats ?? senateSeats?.total;
  const aboutBlocks = isUnicameral
    ? [{ label: "Legislature", mapInfo: chamberMapInfo.senate ?? null, totalSeats: houseTotalSeats ?? null, seats: houseSeats }]
    : [
        { label: "State House", mapInfo: chamberMapInfo.house ?? null, totalSeats: houseTotalSeats ?? null, seats: houseSeats },
        { label: "State Senate", mapInfo: chamberMapInfo.senate ?? null, totalSeats: senateTotalSeats ?? null, seats: senateSeats },
      ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>

      {/* Hero */}
      <div
        style={{
          background: heroMargin != null
            ? `linear-gradient(135deg, color-mix(in srgb, ${heroIsD ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`
            : "var(--app-bg)",
          minHeight: "220px",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-3 sm:pb-4">
          <div className="mb-5 -ml-2">
            <BackButton />
          </div>

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

          {/* Chamber facts, formerly the sidebar's "About the ... Legislature" section */}
          <div className="mt-8 pt-5 pb-1" style={{ borderTop: "1px solid var(--app-border)" }}>
            <StateLegAboutSection blocks={aboutBlocks} />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 pt-2 pb-10 sm:px-6">
        <StateLegSection
          stateAbbr={state.abbr}
          stateName={state.name}
          districtsByChamber={stateLegDistricts[state.abbr] ?? {}}
          mapInfoByChamber={stateLegMapInfo[state.abbr] ?? {}}
          pres2024ByChamber={stateLegPres2024[state.abbr] ?? {}}
          calendarByChamber={stateLegCalendar[state.abbr] ?? {}}
          historicalMapsByChamber={stateLegHistoricalMaps[state.abbr] ?? {}}
          isUnicameral={isUnicameral}
          compositionHouseEntries={houseEntries}
          compositionSenateEntries={senateEntries}
        />
      </main>
    </div>
  );
}

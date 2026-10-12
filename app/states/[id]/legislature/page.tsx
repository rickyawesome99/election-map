import Link from "next/link";
import { notFound } from "next/navigation";
import { statesData } from "@/data/statesData";
import { electionYear } from "@/data/forecastData";
import { UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import { calculateStateTpl } from "@/lib/tplCompute";
import { chamberShortLabel, chamberSummary } from "@/lib/stateLegChamberSummary";
import BackButton from "@/components/BackButton";
import StateLegAboutSection from "@/components/StateLegAboutSection";
import { SeatBar, SeatLine, fmtChamberMargin, fmtProb } from "@/components/atlas/ChamberSummary";
import { ChamberThumbnail } from "@/components/atlas/AtlasEraMaps";
import LegacyChamberHash from "@/components/atlas/LegacyChamberHash";

export async function generateStaticParams() {
  return statesData.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) return { title: "State Not Found" };
  return {
    title: `${state.name} State Legislature`,
    description: `${state.name}'s legislative chambers: seats, the ${electionYear} projection and every district.`,
  };
}

const PARTY_FILL: Record<string, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)", O: "var(--party-ind)" };

export default async function StateLegislaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) notFound();

  const unicameral = UNICAMERAL_STATES.has(state.abbr);
  const chambers: Chamber[] = unicameral ? ["senate"] : ["house", "senate"];
  const stateTpl = calculateStateTpl(state.abbr, state.name);
  const heroMargin = Number.isFinite(stateTpl) ? stateTpl : null;
  const heroIsD = heroMargin != null && heroMargin <= 0;

  const cards = chambers.map((chamber) => {
    const s = chamberSummary(state.abbr, state.name, chamber);
    // Seat-party fill per district for the thumbnail; split delegations purple, vacant blank.
    const fills: Record<string, string> = {};
    for (const d of s.roster) {
      const parties = new Set((d.incumbents ?? []).map((i) => i.party));
      if (parties.size === 1) fills[d.number] = PARTY_FILL[[...parties][0]] ?? "var(--app-tab-bg)";
      else if (parties.size > 1) fills[d.number] = "#4B0082";
      else fills[d.number] = "var(--app-tab-bg)";
    }
    return { chamber, s, fills };
  });
  const aboutBlocks = cards.map(({ chamber, s }) => ({
    label: chamberShortLabel(chamber, unicameral),
    mapInfo: stateLegMapInfo[state.abbr]?.[chamber] ?? null,
    totalSeats: s.totalSeats,
    seats: s.seats,
  }));

  const label = (t: string) => <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>{t}</div>;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <LegacyChamberHash stateId={state.id} chambers={chambers} />
      <div
        style={{
          background: heroMargin != null
            ? `linear-gradient(135deg, color-mix(in srgb, ${heroIsD ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`
            : "var(--app-bg)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 pb-5">
          <div className="mb-5 -ml-2"><BackButton /></div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{state.abbr}</span>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>{state.name}</h1>
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
            <span>State Legislature</span>
            <span style={{ color: "var(--app-text-very-muted)" }}>·</span>
            <Link href={`/states/${state.id}`} className="hover:underline" style={{ color: "var(--app-text-primary)", fontWeight: 600 }}>View {state.name} overview</Link>
          </div>
          <div className="mt-8 pt-5 pb-1" style={{ borderTop: "1px solid var(--app-border)" }}>
            <StateLegAboutSection blocks={aboutBlocks} />
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-12">
        <div className={`grid gap-10 grid-cols-1 ${cards.length > 1 ? "md:grid-cols-2" : "max-w-xl"}`}>
          {cards.map(({ chamber, s, fills }) => {
            const href = `/states/${state.id}/legislature/${chamber}`;
            const p = s.projection;
            const barTotal = s.totalSeats ?? s.seats?.total ?? null;
            const projTotal = p?.totalSeats ?? barTotal;
            return (
              <section key={chamber} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 pb-2 mb-4" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                  <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", fontWeight: 700, lineHeight: 1.1 }}>
                    <Link href={href} className="hover:underline">{chamberShortLabel(chamber, unicameral)}</Link>
                  </h2>
                  <span className="text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{s.roster.length} districts{s.totalSeats && s.totalSeats !== s.roster.length ? ` · ${s.totalSeats} seats` : ""}</span>
                </div>

                <Link href={href} className="block rounded-md p-2 mb-5 hover:opacity-90" style={{ background: "var(--app-tab-bg)" }} aria-label={`Explore ${chamberShortLabel(chamber, unicameral)} districts`}>
                  <ChamberThumbnail abbr={state.abbr} chamber={chamber} fills={fills} />
                </Link>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
                  {p && projTotal ? (
                    <div className="col-span-2 sm:col-span-1">
                      {label(`${electionYear} projection`)}
                      <SeatLine dem={p.expectedDem.toFixed(0)} rep={p.expectedRep.toFixed(0)} size="text-xl" />
                      <SeatBar dem={p.expectedDem} rep={p.expectedRep} total={projTotal} />
                      <div className="mt-1.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                        {p.pDemControl == null ? `${p.unprojected} seats unprojected` : <>P(control) <b style={{ color: "var(--party-dem)" }}>D {fmtProb(p.pDemControl)}</b> · <b style={{ color: "var(--party-rep)" }}>R {fmtProb(p.pRepControl)}</b></>}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {label(`${electionYear}`)}
                      <div className="text-xl font-bold" style={{ color: "var(--app-text-muted)" }}>Not on the ballot</div>
                    </div>
                  )}
                  <div>
                    {label(`Up in ${electionYear}`)}
                    <div className="text-base font-bold tabular-nums">{s.upcoming ? `${s.upcoming.seatsUp}${s.upcoming.totalSeats ? ` of ${s.upcoming.totalSeats}` : ""} seats` : "none"}</div>
                    {s.fieldStats && <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{s.fieldStats.contested} contested · {s.fieldStats.open} open</div>}
                  </div>
                  {s.margin && (
                    <div>
                      {label(`Chamber vote · ${s.margin.year}`)}
                      <div className="text-base font-bold tabular-nums" style={{ color: (s.margin.corrected ?? s.margin.raw) > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                        {fmtChamberMargin(s.margin.corrected ?? s.margin.raw)}
                      </div>
                      <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{s.margin.corrected != null ? "uncontested seats filled" : "raw"}</div>
                    </div>
                  )}
                </div>

                <Link href={href} className="mt-6 inline-block text-sm font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>
                  Explore {s.roster.length} districts →
                </Link>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

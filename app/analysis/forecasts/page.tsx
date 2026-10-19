import BackButton from "@/components/BackButton";
import ForecastComparisonGrid, { type GridData } from "@/components/ForecastComparisonGrid";
import ForecastToplinePanel, { type PanelData } from "@/components/ForecastToplinePanel";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
import { electionYear, type RaceType } from "@/data/forecastData";
import { externalForecasts, EXTERNAL_FORECASTS_READ, type ExternalForecaster } from "@/data/externalForecasts";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecast";
import { CHAMBERS, CHAMBER_LABEL, PROB_BANDS, comparisonFor } from "@/lib/forecastComparison";

export const metadata = {
  title: `Forecast Comparison — ${electionYear} Forecast`,
  description: `How this site's ${electionYear} House, Senate and governor forecasts line up against the major published models and race ratings, chamber by chamber and race by race.`,
};

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const chamberUrl = (f: ExternalForecaster, c: RaceType) => f.urls[c] ?? f.urls.home;

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{children}<span aria-hidden="true" style={{ color: "var(--app-text-very-muted)" }}> ↗</span></a>;
}

export default function ForecastComparisonPage() {
  const cmp = Object.fromEntries(CHAMBERS.map((c) => [c, comparisonFor(c)])) as Record<RaceType, ReturnType<typeof comparisonFor>>;
  const grid = Object.fromEntries(CHAMBERS.map((c) => [c, {
    rows: cmp[c].rows,
    forecasters: cmp[c].forecasters.map((f) => ({ id: f.id, name: f.shortName ?? f.name, fullName: f.name, kind: f.kind, url: chamberUrl(f, c), asOf: f.asOf })),
    summaries: cmp[c].summaries,
  }])) as GridData;

  const panel: PanelData = {
    rows: Object.fromEntries(CHAMBERS.map((c) => [c, [
      { id: "ours", name: "This site", shortName: "This site", kind: "model", asOf: "live", href: "/overview", external: false, t: cmp[c].ours, summary: null },
      ...cmp[c].forecasters.map((f) => {
        const s = cmp[c].summaries.find((x) => x.forecasterId === f.id);
        return {
          id: f.id, name: f.name, shortName: f.shortName ?? f.name, kind: f.kind, asOf: fmtDate(f.asOf), href: chamberUrl(f, c), external: true,
          t: cmp[c].toplines[f.id] ?? null, summary: s ? { ...s, url: chamberUrl(f, c) } : null,
        };
      }),
    ]])) as PanelData["rows"],
    chamberSeats: TOTAL_SEATS_BY_TYPE,
    holdovers: { senate: SEAT_HOLDOVERS.senate, governor: SEAT_HOLDOVERS.governor },
    bands: PROB_BANDS.map((b, i) => `${b.label} ${Math.round(b.min * 100)}${i === 0 ? "%+" : `–${Math.round(PROB_BANDS[i - 1].min * 100)}%`}`).join(", "),
  };

  const models = externalForecasts.filter((f) => f.kind === "model");
  const raters = externalForecasts.filter((f) => f.kind === "ratings");
  const racesCompared = CHAMBERS.reduce((n, c) => n + cmp[c].rows.filter((r) => Object.keys(r.calls).length).length, 0);
  const stats = [
    { value: externalForecasts.length, label: "Forecasts tracked" },
    { value: models.length, label: "Statistical models" },
    { value: raters.length, label: "Race raters" },
    { value: racesCompared, label: "Races compared" },
    { value: fmtDate(EXTERNAL_FORECASTS_READ), label: "Snapshot read" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-5 pt-3 sm:px-6 sm:pb-10">
          <div className="-ml-2 mb-3 sm:mb-5"><BackButton /></div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.9rem, 5.5vw, 4rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Forecast Comparison</h1>
          <div className="mt-3 max-w-3xl text-[13px] leading-relaxed sm:text-sm" style={{ color: "var(--app-text-muted)" }}>
            Where this site&rsquo;s {electionYear} forecast stands against the other published ones: the statistical models that
            put a probability on every race, and the race-raters that sort seats into Safe, Likely, Lean and Toss-up.
            First the chamber toplines and, chamber by chamber, how far each forecast sits from ours, then every race
            with every call. Each forecast&rsquo;s name links to its own site.
          </div>
          <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-3 pt-4 sm:mt-8 sm:flex sm:flex-wrap sm:gap-x-8 sm:pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            {stats.map((stat, i, all) => (
              <div key={stat.label} className={i < all.length - 1 ? "sm:pr-8 sm:[border-right:1px_solid_var(--app-border)]" : ""}>
                <div className="text-lg font-extrabold tabular-nums sm:text-2xl">{stat.value}</div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wider sm:mt-1 sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-4 sm:px-6 sm:pt-6">
        <section className="mb-10 sm:mb-12">
          <LedgerSectionHead label="Toplines &amp; Agreement" meta="Each forecast's seats and odds, and how far it sits from ours" />
          <ForecastToplinePanel data={panel} />
        </section>

        <section className="mb-10 sm:mb-12">
          <LedgerSectionHead label="Race by Race" meta="Every race with every call — race names open our race page, column headings open the forecaster's" />
          <ForecastComparisonGrid data={grid} initial="senate" />
        </section>

        <section className="mb-10 sm:mb-12">
          <LedgerSectionHead label="The Forecasts" meta="What each one is and where it lives" />
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {externalForecasts.map((f) => (
              <div key={f.id} className="text-sm" style={{ borderBottom: "1px solid var(--app-border)", paddingBottom: "0.75rem" }}>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-bold"><Ext href={f.urls.home}>{f.name}</Ext></span>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{f.kind === "model" ? "Statistical model" : "Race ratings"} · read {fmtDate(f.asOf)}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{f.description}{f.notes ? ` ${f.notes}` : ""}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs font-semibold" style={{ color: "var(--party-dem)" }}>
                  {CHAMBERS.filter((c) => f.urls[c]).map((c) => <Ext key={c} href={f.urls[c]!}>{CHAMBER_LABEL[c]}</Ext>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

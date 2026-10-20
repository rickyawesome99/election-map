import ForecastComparisonGrid, { type GridData } from "@/components/ForecastComparisonGrid";
import ForecastToplinePanel, { type PanelData } from "@/components/ForecastToplinePanel";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { electionYear, type RaceType } from "@/data/forecastData";
import { externalForecasts, EXTERNAL_FORECASTS_READ, type ExternalForecaster } from "@/data/externalForecasts";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecast";
import { CHAMBERS, CHAMBER_LABEL, PROB_BANDS, comparisonFor } from "@/lib/forecastComparison";

export const metadata = {
  title: `Forecast Comparison — ${electionYear} Forecast`,
  description: `How CT Strategies' ${electionYear} House, Senate and governor forecasts line up against the major published models and race ratings, chamber by chamber and race by race.`,
};

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtDateLong = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
const CHAMBER_SHORT: Record<RaceType, string> = { house: "House", senate: "Senate", governor: "Gov" };
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
      { id: "ours", name: "CT Strategies", shortName: "CTS", kind: "model", asOf: "live", href: "/overview", external: false, t: cmp[c].ours, summary: null },
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

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Forecasts" title="Forecast Comparison">
        On {fmtDateLong(EXTERNAL_FORECASTS_READ)} we read <Fig>{externalForecasts.length}</Fig> other published forecasts, <Fig>{models.length}</Fig> statistical
        models and <Fig>{raters.length}</Fig> race raters, and lined up their calls against ours on all <Fig>{racesCompared}</Fig> House, Senate and governor races.
      </StandfirstHeader>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 sm:pt-8">
        <section className="mb-10 sm:mb-12">
          <LedgerSectionHead label="Toplines &amp; Agreement" meta="Each forecast's seats and odds, and how far it sits from CT Strategies" />
          <ForecastToplinePanel data={panel} />
        </section>

        <section className="mb-10 sm:mb-12">
          <LedgerSectionHead label="Race by Race" meta="Every race with every call — race names open our race page, column headings open the forecaster's" />
          <ForecastComparisonGrid data={grid} initial="senate" />
        </section>

        <section className="mb-10 sm:mb-12">
          <LedgerSectionHead label="The Forecasts" meta="What each one is — names open the site, chamber links its forecast page" />
          <table className="w-full border-collapse text-sm md:table-fixed">
            <colgroup>
              <col className="md:w-56" />
              <col className="hidden sm:table-column md:w-20" />
              <col className="hidden md:table-column" />
              <col className="md:w-40" />
              <col className="md:w-16" />
            </colgroup>
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
                <th scope="col" className="py-1.5 pr-3">Forecast</th>
                <th scope="col" className="hidden py-1.5 pr-3 sm:table-cell">Type</th>
                <th scope="col" className="hidden py-1.5 pr-3 md:table-cell">About</th>
                <th scope="col" className="py-1.5 pr-3">Covers</th>
                <th scope="col" className="py-1.5 text-right">Read</th>
              </tr>
            </thead>
            <tbody>
              {externalForecasts.map((f) => (
                <tr key={f.id} className="align-top" style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-semibold">
                    <Ext href={f.urls.home}>{f.name}</Ext>
                    <div className="text-[10px] font-normal uppercase tracking-wider sm:hidden" style={{ color: "var(--app-text-very-muted)" }}>{f.kind === "model" ? "Model" : "Ratings"}</div>
                    <div className="mt-0.5 text-xs font-normal md:hidden" style={{ color: "var(--app-text-muted)" }}>{f.description}</div>
                  </th>
                  <td className="hidden whitespace-nowrap py-1.5 pr-3 text-xs sm:table-cell" style={{ color: "var(--app-text-muted)" }}>{f.kind === "model" ? "Model" : "Ratings"}</td>
                  <td className="hidden py-1.5 pr-3 text-xs md:table-cell" style={{ color: "var(--app-text-muted)" }}>
                    {f.description}
                    {f.notes && (
                      <details className="mt-0.5">
                        <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--app-text-very-muted)" }}>Sourcing</summary>
                        <p className="mt-1 max-w-2xl leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>{f.notes}</p>
                      </details>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-xs font-semibold" style={{ color: "var(--party-dem)" }}>
                    <span className="flex gap-x-2.5">
                      {CHAMBERS.filter((c) => f.urls[c] && cmp[c].forecasters.some((x) => x.id === f.id)).map((c) => (
                        <a key={c} href={f.urls[c]!} target="_blank" rel="noopener noreferrer" className="hover:underline" title={`${f.name}: ${CHAMBER_LABEL[c]}`}>{CHAMBER_SHORT[c]}</a>
                      ))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtDate(f.asOf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

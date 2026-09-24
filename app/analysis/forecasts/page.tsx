import BackButton from "@/components/BackButton";
import ForecastComparisonGrid, { type GridData } from "@/components/ForecastComparisonGrid";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
import { electionYear, type RaceType } from "@/data/forecastData";
import { externalForecasts, EXTERNAL_FORECASTS_READ, type ExternalForecaster } from "@/data/externalForecasts";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecast";
import { CHAMBERS, CHAMBER_LABEL, PROB_BANDS, comparisonFor, type AgreementSummary, type ChamberTopline } from "@/lib/forecastComparison";

export const metadata = {
  title: `Forecast Comparison — ${electionYear} Forecast`,
  description: `How this site's ${electionYear} House, Senate and governor forecasts line up against the major published models and race ratings, chamber by chamber and race by race.`,
};

const pct = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const seats = (n: number | null | undefined) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const chamberUrl = (f: ExternalForecaster, c: RaceType) => f.urls[c] ?? f.urls.home;

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{children}<span aria-hidden="true" style={{ color: "var(--app-text-very-muted)" }}> ↗</span></a>;
}

function ControlCell({ p }: { p: number | null }) {
  if (p == null) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const dem = p >= 0.5;
  return <span className="font-semibold tabular-nums" style={{ color: dem ? "var(--party-dem)" : "var(--party-rep)" }}>{dem ? "D" : "R"} {pct(dem ? p : 1 - p)}</span>;
}

function SeatCell({ t, total }: { t: ChamberTopline | null; total: number }) {
  if (!t || t.demSeats == null) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const rep = t.repSeats ?? (t.tossups != null ? total - t.demSeats - t.tossups : total - t.demSeats);
  return (
    <span className="tabular-nums whitespace-nowrap">
      <span className="font-semibold" style={{ color: "var(--party-dem)" }}>{seats(t.demSeats)}</span>
      <span style={{ color: "var(--app-text-very-muted)" }}> – </span>
      <span className="font-semibold" style={{ color: "var(--party-rep)" }}>{seats(rep)}</span>
      {t.tossups != null && t.tossups > 0 && <span className="text-[11px]" style={{ color: "var(--app-text-muted)" }}> · {t.tossups} toss-up</span>}
      {t.range80 && <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}> ({t.range80[0]}–{t.range80[1]})</span>}
    </span>
  );
}

const TH = ({ children, align = "left", title }: { children: React.ReactNode; align?: "left" | "center" | "right"; title?: string }) => (
  <th scope="col" title={title} className={`whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-${align}`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{children}</th>
);

function ToplineTable({ cmp }: { cmp: Record<RaceType, ReturnType<typeof comparisonFor>> }) {
  const rows: { name: React.ReactNode; kind: string; asOf: string; t: Record<RaceType, ChamberTopline | null>; ours?: boolean; links?: Partial<Record<RaceType, string>> }[] = [
    { name: <a href="/overview" className="hover:underline">This site</a>, kind: "model", asOf: "live", ours: true, t: { house: cmp.house.ours, senate: cmp.senate.ours, governor: cmp.governor.ours } },
    ...externalForecasts.map((f) => ({
      name: <Ext href={f.urls.home}>{f.name}</Ext>, kind: f.kind === "model" ? "model" : "ratings", asOf: fmtDate(f.asOf),
      t: { house: cmp.house.toplines[f.id] ?? null, senate: cmp.senate.toplines[f.id] ?? null, governor: cmp.governor.toplines[f.id] ?? null },
      links: { house: f.urls.house, senate: f.urls.senate, governor: f.urls.governor },
    })),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <TH>Forecast</TH><TH>Type</TH>
            <TH align="center" title="Probability of controlling the House (218 seats)">House control</TH>
            <TH align="center" title="Expected seats for a model; seats rated at least Tilt for a rater (80% range in parentheses where published)">House seats D – R</TH>
            <TH align="center" title="Probability of controlling the Senate (Democrats need 51; a tie goes to the Republican vice president)">Senate control</TH>
            <TH align="center">Senate seats D – R</TH>
            <TH align="center" title="Governorships after the election, including the 14 not on the ballot">Governors D – R</TH>
            <TH align="right">As of</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--app-border)", background: r.ours ? "color-mix(in srgb, var(--app-text-primary) 4%, transparent)" : undefined }}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{r.name}</th>
              <td className="px-2 py-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>{r.kind}</td>
              <td className="px-2 py-1.5 text-center"><ControlCell p={r.t.house?.pDemControl ?? null} /></td>
              <td className="px-2 py-1.5 text-center"><SeatCell t={r.t.house} total={TOTAL_SEATS_BY_TYPE.house} /></td>
              <td className="px-2 py-1.5 text-center"><ControlCell p={r.t.senate?.pDemControl ?? null} /></td>
              <td className="px-2 py-1.5 text-center"><SeatCell t={r.t.senate} total={TOTAL_SEATS_BY_TYPE.senate} /></td>
              <td className="px-2 py-1.5 text-center"><SeatCell t={r.t.governor} total={TOTAL_SEATS_BY_TYPE.governor} /></td>
              <td className="px-2 py-1.5 text-right text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.asOf}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgreementTable({ chamber, cmp }: { chamber: RaceType; cmp: ReturnType<typeof comparisonFor> }) {
  const byId = new Map(externalForecasts.map((f) => [f.id, f]));
  const fmtDelta = (d: number | null) => (d == null ? "—" : `${d > 0 ? "R" : "D"} ${Math.abs(d).toFixed(2)}`);
  const sorted = [...cmp.summaries].sort((a, b) => b.withinOne / b.compared - a.withinOne / a.compared);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <TH>Forecast</TH>
            <TH align="right" title="Races both sides call">Compared</TH>
            <TH align="right" title="Identical step on the nine-step scale">Same call</TH>
            <TH align="right" title="Same or one step apart">Within one</TH>
            <TH align="right" title="The two calls favor different parties (a Toss-up favors neither)">Opposite favorite</TH>
            <TH align="right" title="Races where our call sits further toward the Democrats than theirs">We lean D</TH>
            <TH align="right" title="Races where our call sits further toward the Republicans than theirs">We lean R</TH>
            <TH align="right" title="Average of our step minus theirs: which way we differ, net">Net lean</TH>
            <TH align="right" title="Models only: average gap between our Democratic win probability and theirs">Avg. P(D) gap</TH>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s: AgreementSummary) => {
            const f = byId.get(s.forecasterId)!;
            const share = (n: number) => `${Math.round((100 * n) / s.compared)}%`;
            return (
              <tr key={s.forecasterId} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-semibold"><Ext href={chamberUrl(f, chamber)}>{f.name}</Ext></th>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.compared}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{share(s.same)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{share(s.withinOne)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: s.differentFavorite ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>{s.differentFavorite}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--party-dem)" }}>{s.weMoreD}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--party-rep)" }}>{s.weMoreR}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: s.meanDelta == null || Math.abs(s.meanDelta) < 0.005 ? "var(--app-text-muted)" : s.meanDelta > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>{fmtDelta(s.meanDelta)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: s.meanAbsProbDiff == null ? "var(--app-text-very-muted)" : undefined }}>{s.meanAbsProbDiff == null ? "—" : `${(100 * s.meanAbsProbDiff).toFixed(1)} pts`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ForecastComparisonPage() {
  const cmp = Object.fromEntries(CHAMBERS.map((c) => [c, comparisonFor(c)])) as Record<RaceType, ReturnType<typeof comparisonFor>>;
  const grid = Object.fromEntries(CHAMBERS.map((c) => [c, {
    rows: cmp[c].rows,
    forecasters: cmp[c].forecasters.map((f) => ({ id: f.id, name: f.name, kind: f.kind, url: chamberUrl(f, c), asOf: f.asOf })),
    summaries: cmp[c].summaries,
  }])) as GridData;

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
  const note = "mt-4 max-w-3xl text-xs leading-relaxed";
  const bands = PROB_BANDS.map((b, i) => `${b.label} ${Math.round(b.min * 100)}${i === 0 ? "%+" : `–${Math.round(PROB_BANDS[i - 1].min * 100)}%`}`).join(", ");

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-3 sm:px-6 sm:pb-10">
          <div className="-ml-2 mb-5"><BackButton /></div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 4rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Forecast Comparison</h1>
          <div className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            Where this site&rsquo;s {electionYear} forecast stands against the other published ones: the statistical models that
            put a probability on every race, and the race-raters that sort seats into Safe, Likely, Lean and Toss-up.
            First the chamber toplines side by side, then how often each forecast agrees with ours, then every race
            with every call. Each forecast&rsquo;s name links to its own site.
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            {stats.map((stat, i, all) => (
              <div key={stat.label} className={i < all.length - 1 ? "pr-8" : ""} style={i < all.length - 1 ? { borderRight: "1px solid var(--app-border)" } : undefined}>
                <div className="text-2xl font-extrabold tabular-nums">{stat.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6">
        <section className="mb-12">
          <LedgerSectionHead label="Chamber Toplines" meta="Control probabilities and seat counts as each forecast publishes them" />
          <ToplineTable cmp={cmp} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            A model&rsquo;s seats are its expected (or median) count, with its 80% range in parentheses where it publishes one; ours is the
            mean of {(5000).toLocaleString()} chamber simulations. A rater publishes no probabilities, so its seats are the ones it rates
            at least Tilt for each party, with the Toss-ups counted separately, and include the seats not on the ballot
            (Senate {SEAT_HOLDOVERS.senate.dem} D – {SEAT_HOLDOVERS.senate.rep} R, governors {SEAT_HOLDOVERS.governor.dem} D – {SEAT_HOLDOVERS.governor.rep} R).
            A rater&rsquo;s House count is derived from its race list where the site publishes no tally.
          </p>
        </section>

        {CHAMBERS.map((c) => (
          <section key={c} className="mb-12">
            <LedgerSectionHead label={`${CHAMBER_LABEL[c]} — Agreement With Our Model`} meta={`${cmp[c].rows.length} races · every call placed on the same nine-step scale`} />
            <AgreementTable chamber={c} cmp={cmp[c]} />
          </section>
        ))}
        <p className={`${note} -mt-8 mb-12`} style={{ color: "var(--app-text-very-muted)" }}>
          The scale runs Safe D, Likely D, Lean D, Tilt D, Toss-up, Tilt R, Lean R, Likely R, Safe R. A rater&rsquo;s label is used as
          published (Solid counts as Safe). A model&rsquo;s probability is banded on its favorite&rsquo;s chance: {bands}, and Toss-up below
          that. Our own call is the site&rsquo;s rating, which is a band of the projected margin and has no Toss-up, so a race we call
          Tilt and a rater calls Toss-up is one step apart. A forecast that lists only its competitive seats is taken to rate every other
          seat Safe for the party ahead there.
        </p>

        <section className="mb-12">
          <LedgerSectionHead label="Race by Race" meta="Every race with every call — race names open our race page, column headings open the forecaster's" />
          <ForecastComparisonGrid data={grid} initial="senate" />
        </section>

        <section className="mb-12">
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

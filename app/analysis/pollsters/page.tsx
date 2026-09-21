import BackButton from "@/components/BackButton";
import PollsterGradeChip from "@/components/PollsterGradeChip";
import PollsterRatingsTable from "@/components/PollsterRatingsTable";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
import { electionYear } from "@/data/forecastData";
import { POLLSTER_RATING_META as META, pollsterRatings, type PollsterRating } from "@/data/pollsterRatings";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { fmtLean, fmtVsField, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";
import { pollsterIdOf } from "@/lib/pollsterRatings";
import { liveHouseEffects } from "@/lib/tplCompute";

export const metadata = {
  title: `Pollster Ratings — ${electionYear} Forecast`,
  description: "How accurate every major pollster's late general-election polls have been since 2008, by cycle and by region, and which way each one leans this cycle.",
};

const REGION_NAMES = Object.keys(META.regions);
const gradeOf = (score: number) => META.gradeBands.find(([, cut]) => score <= (cut as number))?.[0] ?? "F";
const MIN_REGION_POLLS = 5;

/** Pollsters with enough of a footprint to compare across regions: ≥ 5 graded polls in at least two of them. */
function regionalRows(): PollsterRating[] {
  return pollsterRatings
    .filter((r) => r.grade != null && r.byRegion.filter((x) => x.n >= MIN_REGION_POLLS).length >= 2)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 40);
}

function RegionalHeatmap() {
  const rows = regionalRows();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {["Pollster", "Overall", ...REGION_NAMES].map((h, i) => (
              <th key={h} scope="col" className={`whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${i === 0 ? "text-left" : "text-center"}`}
                style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{r.name}</th>
              <td className="px-2 py-1.5 text-center"><PollsterGradeChip grade={r.grade} /></td>
              {REGION_NAMES.map((region) => {
                const x = r.byRegion.find((b) => b.region === region);
                if (!x || x.n < MIN_REGION_POLLS)
                  return <td key={region} className="px-2 py-1.5 text-center text-xs" style={{ color: "var(--app-text-very-muted)" }} title={x ? `${x.n} graded polls — too few to grade` : "No graded polls"}>{x ? "·" : ""}</td>;
                return (
                  <td key={region} className="p-0.5 text-center"
                    title={`${r.name} · ${region}: ${x.n} graded polls, average error ${x.avgError.toFixed(1)}, ${fmtVsField(x.excess)} vs the field before shrinkage (regional score ${fmtVsField(x.score)}), bias ${fmtLean(x.bias)}`}>
                    <div className="rounded px-1 py-1" style={{ background: vsFieldTint(x.score) }}>
                      <div className="text-xs font-bold leading-tight">{gradeOf(x.score)}</div>
                      <div className="text-[10px] leading-tight tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtVsField(x.score)} · {x.n}</div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HOUSE_SCALE = 6; // pts at the edge of the bar track
function HouseEffectChart() {
  const byId = new Map(pollsterRatings.map((r) => [r.id, r]));
  const rows = liveHouseEffects().table.filter((h) => h.polls >= 4 && h.races >= 3).sort((a, b) => a.effect - b.effect);
  const pct = (v: number) => Math.min(50, (Math.abs(v) / HOUSE_SCALE) * 50);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "var(--party-dem)" }} />Leans Democratic vs the field in {electionYear}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "var(--party-rep)" }} />Leans Republican</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-0.5" style={{ background: "var(--app-text-primary)" }} />Its historical house effect</span>
      </div>
      <div role="table" aria-label={`${electionYear} house effects by pollster`}>
        {rows.map((h) => {
          const hist = byId.get(pollsterIdOf(h.pollster))?.house ?? null;
          return (
            <div key={h.key} role="row" className="grid grid-cols-[minmax(9rem,16rem)_minmax(0,1fr)_4.5rem] items-center gap-3 py-1"
              title={`${h.pollster}${h.partisan ? ` (${h.partisan})` : ""}: ${fmtLean(h.effect)} vs the field across ${h.polls} polls of ${h.races} races${hist != null ? `; historical house effect ${fmtLean(hist)}` : ""}`}>
              <div role="cell" className="truncate text-xs font-semibold">
                {h.pollster}{h.partisan && <span className="ml-1 text-[10px] font-bold" style={{ color: leanColor(h.partisan === "R" ? 1 : -1) }}>({h.partisan})</span>}
              </div>
              <div role="cell" className="relative h-4">
                <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--app-border)" }} />
                <div className="absolute inset-y-[3px]" style={{
                  background: h.effect > 0 ? "var(--party-rep)" : "var(--party-dem)", width: `${pct(h.effect)}%`,
                  ...(h.effect > 0 ? { left: "50%", borderRadius: "0 4px 4px 0" } : { right: "50%", borderRadius: "4px 0 0 4px" }),
                }} />
                {hist != null && <div className="absolute inset-y-0 w-0.5" style={{ background: "var(--app-text-primary)", left: `calc(${50 + (hist > 0 ? 1 : -1) * pct(hist)}% - 1px)`, boxShadow: "0 0 0 1px var(--app-bg)" }} />}
              </div>
              <div role="cell" className="text-right text-xs tabular-nums">{fmtLean(h.effect)} <span style={{ color: "var(--app-text-very-muted)" }}>· {h.polls}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CycleTable() {
  const max = Math.max(...META.byCycle.map((c) => c.avgError));
  return (
    <table className="w-full max-w-3xl border-collapse text-sm">
      <thead>
        <tr>{["Cycle", "Graded polls", "Average error", "", "Shared bias"].map((h, i) => (
          <th key={i} scope="col" className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${i === 0 || i === 3 ? "text-left" : "text-right"}`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {META.byCycle.map((c) => (
          <tr key={c.cycle} style={{ borderBottom: "1px solid var(--app-border)" }}>
            <td className="px-2 py-1.5 font-semibold tabular-nums">{c.cycle}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{c.n.toLocaleString()}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{c.avgError.toFixed(1)}</td>
            <td className="w-1/3 px-2 py-1.5"><div className="h-2" style={{ width: `${(c.avgError / max) * 100}%`, background: "var(--app-text-muted)", borderRadius: "0 4px 4px 0" }} /></td>
            <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: leanColor(c.bias) }}>{fmtLean(c.bias)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const corr = (v: number) => `${v > 0.005 ? "+" : v < -0.005 ? "−" : ""}${Math.abs(v).toFixed(2)}`;

export default function PollstersPage() {
  const active = pollsterRatings.filter((r) => r.racePolls2026 + r.genericPolls2026 > 0);
  const stats = [
    { value: META.gradedPolls.toLocaleString(), label: "Graded polls" },
    { value: META.graded, label: "Pollsters graded" },
    { value: `${META.firstYear}–${META.lastYear}`, label: "Elections covered" },
    { value: active.length, label: `Polling in ${electionYear}` },
    { value: active.filter((r) => r.grade == null).length, label: "Of those, not yet rated" },
  ];
  const P = META.persistence;
  const note = "mt-4 max-w-3xl text-xs leading-relaxed";
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-3 sm:px-6 sm:pb-10">
          <div className="-ml-2 mb-5"><BackButton /></div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 4rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Pollster Ratings</h1>
          <div className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            Every general-election poll taken in the last three weeks of a presidential, Senate, governor, House or
            generic-ballot race since {META.firstYear}, scored against the result. A pollster is graded on how much closer
            (or further) its polls landed than a typical poll of the same races, with recent cycles counting most, and
            again within each region it polls. The last sections show which way each pollster is leaning in {electionYear},
            and what a good record has actually been worth in the following cycle.
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
          <LedgerSectionHead label="Ratings" meta="Select a pollster for its record by cycle and region — column headings sort" />
          <PollsterRatingsTable ratings={pollsterRatings} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            <strong>Vs. field</strong> is the score the grade is a band of: the pollster&rsquo;s average miss minus the miss of a
            typical poll of the same race (the other pollsters in that race where there are any, otherwise the norm for that
            office, year, sample size and days out), weighted by recency (a poll counts half as much every four years)
            and pulled toward zero as if every pollster began with {META.scoreK} average polls. <strong>Bias</strong> is measured
            against the result; <strong>house effect</strong> against the other pollsters in the same race, so it is unaffected
            by a miss the whole industry shared. Fewer than five graded polls is &ldquo;NR&rdquo;.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="By Region" meta={`The ${regionalRows().length} most active graded pollsters with at least ${MIN_REGION_POLLS} graded polls in two or more regions`} />
          <RegionalHeatmap />
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            <span className="flex items-center gap-1.5"><span className="poll-swatch inline-block h-3 w-5 rounded-sm" data-vs="better" />Beat the field there</span>
            <span className="flex items-center gap-1.5"><span className="poll-swatch inline-block h-3 w-5 rounded-sm" data-vs="worse" />Trailed it</span>
            <span>Each cell: regional grade, then the regional score (points vs the field, shrunk) · graded polls there. A dot is fewer than {MIN_REGION_POLLS} polls.</span>
          </div>
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            {REGION_NAMES.filter((r) => r !== "National").map((r) => `${r}: ${(META.regions as Record<string, readonly string[]>)[r].join(" ")}`).join(" · ")}. National is
            the presidential popular vote and the generic ballot. A regional grade starts from the pollster&rsquo;s overall score and
            moves toward its record in that region as polls accumulate ({META.regionK} polls move it halfway), so a regional
            reputation has to be earned over more than one good night.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label={`${electionYear} House Effects`} meta="How far each pollster sits from the others in the races they have both polled this cycle" />
          <HouseEffectChart />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Pollsters with at least four polls across three races in the last {F.HOUSE_EFFECT_WINDOW_DAYS} days; the figure after
            each lean is its poll count, and (D) or (R) marks polls released by a party or campaign, which are tracked
            separately from the same firm&rsquo;s public work. Every poll is modelled as the race&rsquo;s level plus its pollster&rsquo;s
            lean, and each lean is shrunk toward zero by {F.HOUSE_EFFECT_K} pseudo-polls. {F.HOUSE_EFFECTS ? "The forecast's race polling averages subtract these leans from each poll before averaging." : "The forecast does not currently apply them."}{" "}
            A lean is relative to the other pollsters, not to the truth: if the whole field is off, this does not show it.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="The Error Everyone Shared" meta="Average miss and direction of all graded polls, by cycle" />
          <CycleTable />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Most of any one pollster&rsquo;s error in a year is the industry&rsquo;s: polls overstated Democrats in 2014, 2016, 2020 and 2024,
            overstated Republicans in 2012, and were close to even in 2018 and 2022. Odd-year elections are counted with the following even year.
          </p>
        </section>

        <section>
          <LedgerSectionHead label="What a Rating Is Worth" meta="Tested forward: each cycle graded only with what was known before it" />
          <div className="max-w-3xl space-y-3 text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            <p>
              A grade describes a record; it is a weak forecast. Across the {P.accuracy.n} cases since 2016 where a pollster had ten
              graded polls in the previous eight years and five in the cycle being tested, the correlation between how it had done
              against the field and how it did next is <strong style={{ color: "var(--app-text-primary)" }}>{corr(P.accuracy.corr)}</strong>.
              The reason is the table above: whether a pollster looks good in a given year depends mostly on whether its lean
              happened to point the way that year&rsquo;s shared miss went, and raw bias against the result does not carry over either
              ({corr(P.bias.corr)}).
            </p>
            <p>
              What does carry over is the lean itself. A pollster&rsquo;s house effect correlates{" "}
              <strong style={{ color: "var(--app-text-primary)" }}>{corr(P.house.corr)}</strong> with its house effect in the next cycle
              ({P.house.n} cases), and the lean measured inside the current cycle is better still. So the forecast uses pollster
              information in exactly one way: it removes each pollster&rsquo;s current-cycle house effect from its polls. In the
              2018&ndash;2024 backtest that cut the error of the Senate polling average from 6.6 to 6.3 points in mid-September and
              of the House average from 5.1 to 4.8, while weighting polls by their pollster&rsquo;s grade moved the projection&rsquo;s error by
              less than 0.1 in either direction, and regional grades predicted no better than overall ones. Grades are therefore shown
              beside every poll but are not a weight.
            </p>
            <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              Sources: FiveThirtyEight&rsquo;s graded poll file through 2022 and its poll archive for 2023&ndash;24, scored against this
              site&rsquo;s results. Primaries are not graded. Rebuild with <code>scripts/build-pollster-graded-polls.py</code> and{" "}
              <code>scripts/build-pollster-ratings.py</code> (<code>--validate</code> for the forward test); the averaging test is{" "}
              <code>scripts/forwardBacktest.ts --pollsters</code>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

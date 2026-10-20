import PollsterRatingsTable from "@/components/PollsterRatingsTable";
import PollsterGradeChip from "@/components/PollsterGradeChip";
import PollsterRegionList, { type RegionRow } from "@/components/PollsterRegionList";
import PollsterSectionTabs from "@/components/PollsterSectionTabs";
import RecentRacePollsTable from "@/components/RecentRacePollsTable";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { electionYear } from "@/data/forecastData";
import { POLLSTER_RATING_META as META, pollsterRatings, type PollsterRating } from "@/data/pollsterRatings";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import type { ReactNode } from "react";
import { ABBR_TO_FIPS, FIPS_TO_STATE } from "@/lib/fips";
import { fmtLean, fmtVsField, gradeTint, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";
import { pollsterIdOf } from "@/lib/pollsterRatings";
import { recentRacePolls } from "@/lib/pollsterRecord";
import { racePollsMeta } from "@/data/racePolls";
import { liveHouseEffects } from "@/lib/tplCompute";

export const metadata = {
  title: `Pollster Ratings — ${electionYear} Forecast`,
  description: "How accurate every major pollster's late general-election polls have been since 2008, by cycle and by region, and which way each one leans this cycle.",
};

const REGION_NAMES = Object.keys(META.regions);
const gradeOf = (score: number) => META.gradeBands.find(([, cut]) => score <= (cut as number))?.[0] ?? "F";
const MIN_REGION_POLLS = 5;
const RECENT_POLLS = 50;
const fmtIso = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Pollsters with enough of a footprint to compare across regions: ≥ 5 graded polls in at least two of them. */
function regionalRows(): PollsterRating[] {
  return pollsterRatings
    .filter((r) => r.grade != null && r.byRegion.filter((x) => x.n >= MIN_REGION_POLLS).length >= 2)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 40);
}

/** The heatmap's rows in the shape the phone list takes (plain data, so the client bundle skips the ratings file). */
function regionListRows(): RegionRow[] {
  return regionalRows().map((r) => ({
    id: r.id, slug: r.slug, name: r.name, grade: r.grade,
    cells: REGION_NAMES.map((region) => {
      const x = r.byRegion.find((b) => b.region === region);
      return { region, n: x?.n ?? 0, grade: x ? gradeOf(x.score) : null, score: x?.score ?? null, avgError: x?.avgError ?? null, bias: x?.bias ?? null };
    }),
  }));
}

function RegionalHeatmap() {
  const rows = regionalRows();
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {["Pollster", "Overall", ...REGION_NAMES].map((h, i) => (
              <th key={h} scope="col" className={`whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${i === 0 ? "text-left" : "text-center"}`}
                style={{ color: i === 1 ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{r.name}</th>
              <td className="p-0.5 text-center" title={`${r.name} overall: ${r.n} graded polls, ${fmtVsField(r.score)} vs the field (shrunk), bias ${fmtLean(r.bias)}`}>
                <div className="rounded px-1 py-1" style={{ background: gradeTint(r.grade) }}>
                  <div className="text-xs font-bold leading-tight">{r.grade}</div>
                  <div className="text-[10px] leading-tight tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtVsField(r.score)} · {r.n}</div>
                </div>
              </td>
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
      <div className="hidden flex-wrap items-center gap-x-5 gap-y-1 pb-3 text-xs md:flex" style={{ color: "var(--app-text-muted)" }}>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "var(--party-dem)" }} />Leans Democratic vs the field in {electionYear}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "var(--party-rep)" }} />Leans Republican</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-0.5" style={{ background: "var(--app-text-primary)" }} />Its historical house effect</span>
      </div>
      <div role="table" aria-label={`${electionYear} house effects by pollster`}>
        {rows.map((h) => {
          const hist = byId.get(pollsterIdOf(h.pollster))?.house ?? null;
          return (
            <div key={h.key} role="row" className="grid grid-cols-[minmax(0,1fr)_3.25rem_4rem] items-center gap-x-2 py-1 max-md:border-b max-md:border-[var(--app-border)] md:gap-x-3 md:grid-cols-[minmax(9rem,16rem)_minmax(0,1fr)_3.25rem_4rem]"
              title={`${h.pollster}${h.partisan ? ` (${h.partisan})` : ""}: ${fmtLean(h.effect)} vs the field across ${h.polls} polls of ${h.races} races${hist != null ? `; historical house effect ${fmtLean(hist)}` : ""}`}>
              <div role="cell" className="truncate text-xs font-semibold">
                {h.pollster}{h.partisan && <span className="ml-1 text-[10px] font-bold" style={{ color: leanColor(h.partisan === "R" ? 1 : -1) }}>({h.partisan})</span>}
              </div>
              <div role="cell" className="relative hidden h-4 md:block">
                <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--app-border)" }} />
                <div className="absolute inset-y-[3px]" style={{
                  background: h.effect > 0 ? "var(--party-rep)" : "var(--party-dem)", width: `${pct(h.effect)}%`,
                  ...(h.effect > 0 ? { left: "50%", borderRadius: "0 4px 4px 0" } : { right: "50%", borderRadius: "4px 0 0 4px" }),
                }} />
                {hist != null && <div className="absolute inset-y-0 w-0.5" style={{ background: "var(--app-text-primary)", left: `calc(${50 + (hist > 0 ? 1 : -1) * pct(hist)}% - 1px)`, boxShadow: "0 0 0 1px var(--app-bg)" }} />}
              </div>
              <div role="cell" className="text-right text-xs tabular-nums max-md:font-semibold" style={{ color: leanColor(h.effect) }}>{fmtLean(h.effect)}</div>
              <div role="cell" className="text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{h.polls} polls</div>
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

/** A collapsed "▶ label" section that opens to a ruled two-column list (term, explanation). */
function Disclosure({ label, intro, rows, labelWidth = "7rem" }: { label: string; intro?: ReactNode; rows: [string, ReactNode][]; labelWidth?: string }) {
  return (
    <details className="group mt-4 max-w-3xl">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-text-muted)" }}>
        <svg aria-hidden="true" viewBox="0 0 10 10" className="h-2.5 w-2.5 transition-transform group-open:rotate-90"><path d="M2 1 L9 5 L2 9 Z" fill="currentColor" /></svg>
        {label}
      </summary>
      {intro && <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{intro}</p>}
      <div className="mt-2 text-xs" style={{ borderTop: "1px solid var(--app-border)" }}>
        {rows.map(([term, text]) => (
          <div key={term} className="py-1.5 sm:grid sm:gap-4" style={{ borderBottom: "1px solid var(--app-border)", gridTemplateColumns: `${labelWidth} 1fr` }}>
            <div className="font-semibold">{term}</div>
            <div className="leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{text}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

const fmtCut = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2).replace(/0$/, "")}`;
const COLUMN_NOTES: [string, ReactNode][] = [
  ["Grade", <>
    A letter band of the Vs. field score, from A+ (best) to F. Fewer than {META.minPolls} graded polls is <strong>NR</strong> (not rated). Each grade covers
    scores up to the figure shown:
    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {META.gradeBands.map(([g, cut]) => (
        <span key={g} className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"><PollsterGradeChip grade={g} title={`${g}: Vs. field ${fmtCut(cut as number)} or less`} />{fmtCut(cut as number)}</span>
      ))}
      <span className="inline-flex items-center gap-1 whitespace-nowrap"><PollsterGradeChip grade="F" title="F: anything worse than D" />worse</span>
    </span>
  </>],
  ["Polls", "How many of the pollster's polls were graded."],
  ["Avg. error", "How far its polls missed the final margin, on average, in points, whichever way they missed. Lower is better."],
  ["Avg. miss", <>Which way its polls missed, on average, with every cycle counted equally. <strong>D+2</strong> means they overstated Democrats by 2 points.</>],
  ["Record", <>Polls that had the eventual winner ahead, then polls that had the loser ahead, then ties: <strong>41–3–1</strong>.</>],
  ["Vs. field", <>
    The score the grade comes from: the pollster&rsquo;s average error minus the error of a typical poll of the same races (the
    other pollsters in each race, or where there were none, the norm for that office, year, sample size and days out).{" "}
    <strong>The more negative, the better.</strong> Below 0, it missed by less than the field: −1.0 means its polls were a point
    closer to the result than typical polls of the same races. At 0 it matched the field; above 0 it missed by more. Small
    records are pulled toward 0, as if every pollster started with {META.scoreK} average polls, so a strongly negative score
    takes many good polls: a firm cannot reach A+ on a handful of lucky ones.
  </>],
  ["Bias", "Like Avg. miss, but recent polls count more and small records are pulled toward even. Measured against the result."],
  ["House effect", "Which way the pollster leans compared with the other pollsters in the same races, not with the result, so a miss the whole industry shared does not count against it."],
  ["Last graded", "The most recent election in which it had a graded poll."],
  [`${electionYear} polls`, `Race and generic-ballot polls it has released this cycle, fielded on or after January 1, ${electionYear}.`],
];

const corr = (v: number) => `${v > 0.005 ? "+" : v < -0.005 ? "−" : ""}${Math.abs(v).toFixed(2)}`;

export default function PollstersPage() {
  const active = pollsterRatings.filter((r) => r.racePolls2026 + r.genericPolls2026 > 0);
  const unrated = active.filter((r) => r.grade == null).length;
  const P = META.persistence;
  const note = "mt-4 max-w-3xl text-xs leading-relaxed";
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Polling" title="Pollster Ratings">
        We graded <Fig>{META.graded}</Fig> pollsters on <Fig>{META.gradedPolls.toLocaleString()}</Fig> final-stretch polls from {META.firstYear} to {META.lastYear},
        each scored against the result. In {electionYear}, <Fig>{active.length}</Fig> pollsters have released polls so far, and <Fig>{unrated}</Fig> of
        them have too short a record to rate yet.
      </StandfirstHeader>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 sm:pt-8">
        <section className="mb-12">
          <PollsterSectionTabs tabs={[
            {
              key: "ratings", label: "Ratings",
              meta: "Select a pollster for its full record and every poll it has run — column headings sort",
              content: (
                <>
                  <PollsterRatingsTable ratings={pollsterRatings} />
                  <Disclosure label="What each column means" intro={<>
                    Every general-election poll taken in the last three weeks of a presidential, Senate, governor, House or
                    generic-ballot race from {META.firstYear} to {META.lastYear} is scored against the result. Recent polls count
                    more: a poll&rsquo;s weight halves every four years.
                  </>} rows={COLUMN_NOTES} labelWidth="7rem" />
                </>
              ),
            },
            {
              key: "polls", label: "Polls",
              meta: `The ${RECENT_POLLS} most recent polls of ${electionYear} Senate, governor and House races`,
              content: (
                <>
                  <RecentRacePollsTable polls={recentRacePolls(RECENT_POLLS)} />
                  <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
                    Newest first by the last day in the field; polls through {fmtIso(racePollsMeta.newestPollEnd)}, sources last checked{" "}
                    {fmtIso(racePollsMeta.checked)}. Margins are as published, before the forecast&rsquo;s house-effect adjustment;
                    (D) and (R) mark polls sponsored by a party or campaign. Generic-ballot polls are not listed. Every poll of a race
                    is on its race page.
                  </p>
                </>
              ),
            },
          ]} />
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="By Region" meta={`The ${regionalRows().length} most active graded pollsters with at least ${MIN_REGION_POLLS} graded polls in two or more regions`} />
          <div className="md:hidden"><PollsterRegionList rows={regionListRows()} minPolls={MIN_REGION_POLLS} /></div>
          <RegionalHeatmap />
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            <span className="flex items-center gap-1.5"><span className="poll-swatch inline-block h-3 w-5 rounded-sm" data-vs="better" />Beat the field there</span>
            <span className="flex items-center gap-1.5"><span className="poll-swatch inline-block h-3 w-5 rounded-sm" data-vs="worse" />Trailed it</span>
            <span className="hidden md:inline">Each cell: regional grade, then the regional score (points vs the field, shrunk) · graded polls there. A dot is fewer than {MIN_REGION_POLLS} polls.</span>
          </div>
          <Disclosure label="Which states are in each region" rows={REGION_NAMES.map((region) => [region,
            region === "National"
              ? "Polls of the presidential popular vote and the generic congressional ballot"
              : (META.regions as Record<string, readonly string[]>)[region].map((a) => FIPS_TO_STATE[ABBR_TO_FIPS[a]]?.name ?? a).sort().join(", ")])} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            A regional grade starts at the pollster&rsquo;s overall score and moves toward its record in that region as polls add up
            ({META.regionK} polls move it halfway), so one good night in a region is not enough to earn a regional reputation.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label={`${electionYear} House Effects`} meta="How far each pollster sits from the others in the races they have both polled this cycle" />
          <HouseEffectChart />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Pollsters with at least four polls across three races in the last {F.HOUSE_EFFECT_WINDOW_DAYS} days, each lean shown with
            the number of polls it rests on; and (D) or (R) marks polls released by a party or campaign, which are tracked
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
              A good grade does not mean a pollster will be accurate next time. We checked {P.accuracy.n} cases since 2016 where a
              pollster had a solid record going into a cycle and enough polls in it to judge: how well it beat the field before had
              almost no link to how it did next (a correlation of <strong style={{ color: "var(--app-text-primary)" }}>{corr(P.accuracy.corr)}</strong>,
              where 0 is no link and 1 a perfect one). A pollster&rsquo;s good or bad year mostly comes down to whether its usual lean
              happened to point the same way as the miss every pollster shared that year (the table above). Its tendency to miss
              toward one party does not carry over either ({corr(P.bias.corr)}).
            </p>
            <p>
              What does carry over is a pollster&rsquo;s lean compared with other pollsters. A firm that ran more Democratic or more
              Republican than its rivals in one cycle tends to do it again in the next (
              <strong style={{ color: "var(--app-text-primary)" }}>{corr(P.house.corr)}</strong> across {P.house.n} cases), and its lean so
              far this cycle is an even better guide.
            </p>
            <p>
              So the forecast uses pollster information in just one way: it takes each pollster&rsquo;s {electionYear} house effect out
              of its polls before averaging them. Tested on 2018&ndash;2024, that made the mid-September polling averages more
              accurate (Senate error 6.6 &rarr; 6.3 points, House 5.1 &rarr; 4.8). Giving better-graded pollsters more weight changed
              the error by less than 0.1 point, and regional grades did no better than overall ones. That is why grades are shown
              next to every poll but do not affect the forecast.
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

import Link from "next/link";
import GenericBallotExplorer from "@/components/GenericBallotExplorer";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { electionYear } from "@/data/forecastData";

const FORECAST_YEAR = electionYear;
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { genericBallotPopularVote } from "@/lib/genericBallotPopularVote";

export const metadata = {
  title: `Generic Ballot vs Popular Vote — ${electionYear} Forecast`,
  description: "What the generic-ballot poll measures, three ways of counting the House popular vote it is compared with, how the two have lined up since 2016 in every state, and how the forecast turns this year's generic ballot into a House vote.",
};

const M = ({ v }: { v: number | null }) => <b style={{ color: marginColor(v) }}>{fmtMargin(v)}</b>;
// The page's prose reads the generic ballot as a Democratic or Republican lead, not an R-positive margin.
const lead = (v: number) => `${v < 0 ? "Democrats" : "Republicans"} by ${Math.abs(v).toFixed(1)}`;
const pts = (v: number) => `${Math.abs(v).toFixed(1)} point${Math.abs(v).toFixed(1) === "1.0" ? "" : "s"}`;

export default function GenericBallotPage() {
  const data = genericBallotPopularVote();
  const { years, miss, now } = data;
  const first = years[0].year, last = years[years.length - 1].year;
  const note = "mt-4 text-xs leading-relaxed";
  const th = (h: string, i: number, leftCols = 1) => (
    <th key={h} scope="col" className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${i < leftCols ? "text-left" : "text-right"}`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{h}</th>
  );
  const td = (v: number | null, key: string, bold = false) => <td key={key} className={`px-2 py-1.5 text-right tabular-nums ${bold ? "font-semibold" : ""}`} style={{ color: marginColor(v) }}>{fmtMargin(v)}</td>;
  const allRepublican = miss.contested.values.every((v) => v.miss > 0);
  const dropped2026 = now.unopposedD + now.unopposedR;

  // ── Chart: the generic ballot and the three House-vote bases, one column per year ──
  // One axis (margin), year columns; identity by shape and a legend, ink tokens for every mark
  // so no mark depends on color alone; the EVEN line is the baseline; 2px strokes, ≥8px markers.
  const W = 1200, H = 300, PAD_L = 48, PAD_R = 20, PAD_T = 20, PAD_B = 38;
  const lo = -12, hi = 6; // D+12 to R+6 covers every value on file
  const yOf = (v: number) => PAD_T + ((v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
  const xOf = (i: number) => PAD_L + ((i + 0.5) / years.length) * (W - PAD_L - PAD_R);
  const ticks = [-12, -9, -6, -3, 0, 3, 6];
  const label = (v: number) => (v === 0 ? "EVEN" : `${v < 0 ? "D" : "R"}+${Math.abs(v)}`);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="National" title="Generic Ballot vs Popular Vote">
        The generic ballot has <Fig><span style={{ color: marginColor(now.gb) }}>{lead(now.gb)}</span></Fig> points. In every election since {first} the
        House vote on contested seats landed <Fig>{pts(miss.contested.mean)}</Fig> more Republican than the final generic ballot, and our
        House projections add up to <Fig><span style={{ color: marginColor(now.sumAll) }}>{fmtMargin(now.sumAll)}</span></Fig>.
      </StandfirstHeader>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 sm:pt-8">
        <section className="mb-12 space-y-4 text-[15px] leading-relaxed">
          <LedgerSectionHead label="What the generic ballot measures" />
          <div className="grid gap-x-10 gap-y-4 lg:grid-cols-2">
          <p>
            A generic-ballot poll asks every voter in the country one question: if the election for Congress were held today, would you vote for the
            Democratic or the Republican candidate in your district? No names, no local races. Averaged across pollsters it is the best single reading of the
            national mood, and forecasters compare it with the <b>House popular vote</b>, the total of every vote cast in all 435 House races. Senate and governor
            races are not part of it.
          </p>
          <p>
            The catch is that the poll and the count are not quite the same thing. The poll asks everyone, including people whose district has no Democrat on the
            ballot, no Republican, or two candidates from the same party. The count only includes the votes that were actually cast, and in a seat with no
            opponent most of them go to one side or are left blank. So even a perfect poll would not match the reported total. There are three honest ways to
            count the House vote, and they give different answers.
          </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              ["Every vote", "The official total: every vote in every seat. A seat with only one major party on the ballot gives its whole vote to that party. This is the number usually reported."],
              ["Contested seats only", "Only the seats where a Democrat faced a Republican. Clean, but it drops a different set of seats every year, and those seats are never a random sample: they are the deepest-red and deepest-blue places."],
              ["Dropped seats imputed", "Contested seats plus an estimate for each dropped one: the vote a Democrat-versus-Republican race there would likely have produced, based on how the district voted for president. Closest to what the poll measures."],
            ] as const).map(([t, d]) => (
              <div key={t} className="pt-3" style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                <div className="font-bold">{t}</div>
                <p className="mt-1 text-sm" style={{ color: "var(--app-text-muted)" }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label={`How the poll and the count have lined up, ${first}–${last}`} meta="Two-party margins, Republican minus Democrat" />
          <figure className="mt-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Final generic ballot and the House vote on three bases, by election year ${first} to ${last}`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)} stroke={t === 0 ? "var(--app-text-muted)" : "var(--app-border)"} strokeWidth={t === 0 ? 1.5 : 1} />
                  <text x={PAD_L - 6} y={yOf(t) + 3.5} fontSize="12" textAnchor="end" fill="var(--app-text-muted)">{label(t)}</text>
                </g>
              ))}
              {years.map((y, i) => {
                const x = xOf(i);
                const marks: { v: number | null; shape: "ring" | "dot" | "square" | "diamond"; name: string }[] = [
                  { v: y.gbFinal, shape: "ring", name: "Final generic ballot" }, { v: y.raw, shape: "square", name: "Every vote" }, { v: y.contested, shape: "dot", name: "Contested seats only" }, { v: y.imputed, shape: "diamond", name: "Dropped seats imputed" },
                ];
                const vals = marks.map((m) => m.v).filter((v): v is number => v != null);
                return (
                  <g key={y.year}>
                    <line x1={x} x2={x} y1={yOf(Math.min(...vals))} y2={yOf(Math.max(...vals))} stroke="var(--app-text-very-muted)" strokeWidth="2.5" strokeLinecap="round" />
                    {marks.map((m) => m.v == null ? null : (
                      <g key={m.name}>
                        <title>{`${y.year} · ${m.name}: ${fmtMargin(m.v)}`}</title>
                        {m.shape === "ring" && <circle cx={x} cy={yOf(m.v)} r="7.5" fill="var(--app-bg)" stroke="var(--app-text-primary)" strokeWidth="2.5" />}
                        {m.shape === "dot" && <circle cx={x} cy={yOf(m.v)} r="7" fill="var(--app-text-primary)" stroke="var(--app-bg)" strokeWidth="2" />}
                        {m.shape === "square" && <rect x={x - 6} y={yOf(m.v) - 6} width="12" height="12" fill="var(--app-text-muted)" stroke="var(--app-bg)" strokeWidth="2" />}
                        {m.shape === "diamond" && <rect x={x - 6} y={yOf(m.v) - 6} width="12" height="12" transform={`rotate(45 ${x} ${yOf(m.v)})`} fill="var(--app-text-muted)" stroke="var(--app-bg)" strokeWidth="2" />}
                      </g>
                    ))}
                    <text x={x} y={H - 12} fontSize="13" fontWeight="700" textAnchor="middle" fill="var(--app-text-muted)">{y.year}</text>
                  </g>
                );
              })}
            </svg>
            <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: "var(--app-text-muted)" }} aria-label="Chart legend">
              <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4" fill="var(--app-bg)" stroke="var(--app-text-primary)" strokeWidth="2" /></svg>Final generic ballot</span>
              <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><rect x="2" y="2" width="8" height="8" fill="var(--app-text-muted)" /></svg>Every vote</span>
              <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="var(--app-text-primary)" /></svg>Contested seats only</span>
              <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" fill="var(--app-text-muted)" /></svg>Dropped seats imputed</span>
            </figcaption>
          </figure>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm" aria-label="Generic ballot and House vote by year">
              <thead><tr>{["Year", "Generic ballot, final", "Every vote", "Contested only", "Imputed", "Seats without a contest", "Miss, contested", "Miss, imputed"].map((h, i) => th(h, i))}</tr></thead>
              <tbody>
                {years.map((y) => {
                  const k = y.kinds;
                  return (
                    <tr key={y.year} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td className="px-2 py-1.5 font-semibold tabular-nums">{y.year}</td>
                      {td(y.gbFinal, "gb")}{td(y.raw, "raw")}{td(y.contested, "c", true)}{td(y.imputed, "i")}
                      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{k["unopposed-D"] + k["unopposed-R"] + k["same-party-D"] + k["same-party-R"]} <span className="text-xs">({k["unopposed-D"] + k["same-party-D"]} D, {k["unopposed-R"] + k["same-party-R"]} R)</span></td>
                      {td(y.gbFinal == null ? null : y.contested - y.gbFinal, "mc", true)}{td(y.gbFinal == null ? null : y.imputed - y.gbFinal, "mi")}
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                  <td className="px-2 py-1.5 font-semibold">Average</td>
                  <td /><td /><td /><td /><td />
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: marginColor(miss.contested.mean) }}>{fmtMargin(miss.contested.mean)} <span className="text-xs font-normal" style={{ color: "var(--app-text-muted)" }}>± {miss.contested.sd.toFixed(1)}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: marginColor(miss.imputed.mean) }}>{fmtMargin(miss.imputed.mean)} <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>± {miss.imputed.sd.toFixed(1)}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={`${note} space-y-1.5`} style={{ color: "var(--app-text-very-muted)" }}>
            <p>
              <strong>Miss:</strong> House vote minus the final generic ballot. R+2 means the Republicans did two points better in the count than in the poll.
              {allRepublican && <> On the contested basis the miss has pointed the same way, toward Republicans, in every election since {first}.</>}
            </p>
            <p>
              <strong>Why the bases differ:</strong> which seats go uncontested is never random. In 2018 most of the seats without an opponent were Democratic, so the
              official total overstated the contested vote by two points; in 2024 it was the reverse, and the two bases agreed. Imputing the dropped seats removes that
              accident.
            </p>
            <p>
              <strong>Generic ballot:</strong> the site&rsquo;s own averaging recipe run over the 538 archive for 2018–2024, RealClearPolitics&rsquo; final average for 2016. The official
              House vote counts third-party votes in its denominator, so published figures differ from the two-party numbers here by up to a point.
            </p>
            <p>
              <strong>Same-party seats:</strong> California and Washington top-two finals and Louisiana races between two members of one party have no two-party margin and are
              treated like unopposed seats.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="The House vote in every state" meta={`${first}–${last} as counted, and what the ${FORECAST_YEAR} forecast implies`} />
          <div className="mt-4">
            <GenericBallotExplorer
              years={years.map((y) => ({ year: y.year, raw: y.raw, contested: y.contested, imputed: y.imputed, gbFinal: y.gbFinal, states: y.states }))}
              now={{ raw: now.sumAll, contested: now.sumContested, states: now.states }}
            />
          </div>
          <div className={`${note} space-y-1.5`} style={{ color: "var(--app-text-very-muted)" }}>
            <p>
              <strong>Comparing years:</strong> a state&rsquo;s official total can swing by ten points or more simply because a seat went uncontested one year and not the next.
              Massachusetts, Illinois, Kentucky and Alabama are the usual examples. Use the contested or imputed basis to compare across years.
            </p>
            <p>
              <strong>Redrawn lines:</strong> California, Texas, Florida, Utah, Missouri, Ohio, North Carolina, Louisiana and Alabama changed their district maps for {FORECAST_YEAR}, so part of any
              change from 2024 there is geography rather than voters.
            </p>
            <p>
              <strong>{FORECAST_YEAR} bases:</strong> &ldquo;All seats&rdquo; counts a seat with no two-party contest for its party in full, the way the official total will.
              &ldquo;Lean + national mood&rdquo; is the state&rsquo;s partisan lean plus this year&rsquo;s environment, before incumbency, money, candidates and polls.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label={`From this year's generic ballot to a ${FORECAST_YEAR} House vote`} meta={now.gbThrough ? `Generic-ballot polls through ${now.gbThrough}` : undefined} />
          <div className="mt-4 grid gap-8 lg:grid-cols-2">
            <div className="space-y-4 text-[15px] leading-relaxed">
              <p>
                <b>What history says.</b> Take today&rsquo;s generic ballot, <M v={now.gb} />, and shift it by the average miss. On contested seats that points to about{" "}
                <M v={now.translation.contested.mid} />, with four elections in five landing between <M v={now.translation.contested.hi} /> and <M v={now.translation.contested.lo} />. With the dropped
                seats imputed the center is <M v={now.translation.imputed.mid} />. The official total will run more Democratic than the contested vote this year, because{" "}
                {now.unopposedD} of the {dropped2026} seats without a two-party contest are Democratic.
              </p>
              <p>
                <b>What the forecast does.</b> The model shades the generic ballot by half the historical miss, to <M v={now.pvHat} />, and treats the rest of the miss as uncertainty rather than a
                prediction. That House-vote estimate is then converted to the model&rsquo;s own environment scale, which past elections show moves about half as far as the House vote, and every race moves with it in
                proportion to how strongly its state has swung with the country before: a race in a typical state receives <M v={now.housePts} /> on top of its partisan lean, before incumbency, fundraising,
                candidates and the race&rsquo;s own polls.
              </p>
              <p>
                <b>Adding the races back up.</b> The 435 House projections sum to <M v={now.sumAll} /> as the official total will be counted, and <M v={now.sumContested} /> on the {now.contestedSeats} contested
                seats. Those are the forecast&rsquo;s predictions of the two numbers that will be reported on election night. The gap between them is the {dropped2026} seats without a contest, {now.unopposedD} of them Democratic.
              </p>
              <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                The summed projections sit below the model&rsquo;s own House-vote estimate, and that is by design. The House vote is the sum of the House races, which suggests they should move together one for one,
                and for a day the forecast was built that way. Testing the idea on the 2018 and 2020 House races, scored on the district lines of the time, showed it over-shot: House races have moved with the damped
                environment, not the full House vote, because each district&rsquo;s partisan lean already carries part of the swing. The reasoning is on the{" "}
                <Link href="/analysis/internal-methodology#environment" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>methodology page</Link>.
              </p>
            </div>
            <table className="w-full self-start border-collapse text-sm" aria-label={`The ${FORECAST_YEAR} chain from generic ballot to House vote`}>
              <thead><tr>{th("Step", 0)}{th("Value", 1)}</tr></thead>
              <tbody>
                {([
                  ["Generic ballot average", now.gb, "one poll per pollster, recent polls weighted more"],
                  [`Shaded by half the average miss (${fmtMargin(now.meanMissRaw)} × ${now.shrink})`, now.pvHat, "the model's expected House vote"],
                  ["Environment a typical race receives", now.eHat, "on the model's damped scale, every office"],
                  ["House projections summed, all 435 seats", now.sumAll, "how the official total will be counted"],
                  [`House projections summed, ${now.contestedSeats} contested seats`, now.sumContested, "the like-for-like number"],
                  ["History's translation, contested seats", now.translation.contested.mid, `80% band ${fmtMargin(now.translation.contested.hi)} to ${fmtMargin(now.translation.contested.lo)}`],
                ] as [string, number, string][]).map(([k, v, d]) => (
                  <tr key={k} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className="px-2 py-2"><div className="font-semibold">{k}</div><div className="text-xs" style={{ color: "var(--app-text-muted)" }}>{d}</div></td>
                    <td className="px-2 py-2 text-right text-base font-bold tabular-nums" style={{ color: marginColor(v) }}>{fmtMargin(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`${note} space-y-1.5`} style={{ color: "var(--app-text-very-muted)" }}>
            <p>
              <strong>On election night</strong> the number to compare with the generic ballot is the contested or imputed House vote, not the official total: this year&rsquo;s uncontested seats lean
              Democratic, so the official total will flatter the generic ballot by a point or two. The forecast&rsquo;s own test is whether the contested seats land near <M v={now.sumContested} />.
            </p>
            <p>
              <strong>Related:</strong> the <Link href="/analysis/popular-vote" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Popular Vote</Link> page asks whether approval, direction of country and party ID predict the
              national margin; the <Link href="/analysis/turnout" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Turnout</Link> page has the vote totals behind the {FORECAST_YEAR} sums.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

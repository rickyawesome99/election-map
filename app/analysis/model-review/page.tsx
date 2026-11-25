import Link from "next/link";
import type { ReactNode } from "react";
import { LedgerSectionHead, LedgerSubhead } from "@/components/LedgerSectionHead";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { BigStat, CalibrationPlot, Explain, Figure, FlatTable, Grade, HBars, Key, P, Prose, SeatHist, WeightCurves, type BarRow } from "@/components/model-review/charts";
import { ForecastScatter, MissMap, RaceGrades } from "@/components/model-review/sections";
import { Notes, Reveal, TouchHover } from "@/components/results/ui";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { fmtDateTime } from "@/lib/resultsFormat";
import { modelReview2026 } from "@/lib/modelReview2026";
import { MR_GRADES, MR_OFFICE_NAME, fmtMiss, gradeOf, missInk, type MrOffice, type MrScenario } from "@/lib/modelReview2026Types";

export const metadata = {
  title: "2026 Model Review",
  description: "How the final 2026 House, Senate and governor forecast did against the results: every call graded, where the miss came from, what each part of the model contributed, and what would change next time.",
};

const SECTIONS = [
  ["summary", "Summary"], ["scorecard", "Scorecard"], ["map", "Map"], ["seats", "Seats"], ["calls", "Missed calls"], ["environment", "Where the miss came from"],
  ["test", "The what-if test"], ["polls", "Polls vs fundamentals"], ["parts", "Each part"], ["field", "Other forecasters"], ["changes", "What would change"], ["races", "Every race"], ["method", "Method"],
] as const;

const OFFICES: MrOffice[] = ["house", "senate", "governor"];
const K = { house: "H", senate: "S", governor: "G" } as const;
const DEM = "var(--party-dem)", INK = "var(--app-text-primary)", MUTED = "var(--app-text-muted)", FAINT = "var(--app-text-very-muted)";

const WHAT_IF_LABELS = [
  "Final forecast, as published",
  "Fundamentals only, as published (no race polls)",
  "Real House vote as the input; race polls kept",
  "Real House vote as the input; no race polls",
  "Real House vote carried point for point; race polls kept",
  "Real House vote carried point for point; no race polls",
  "Real House vote point for point; race polls at face value",
];
const LADDER_LABELS = [
  "Final forecast, as published",
  "1. Stop moving polls toward Republicans",
  "2. Also carry the national vote point for point",
  "3. Also give race polls more weight",
  "4. Also drop the close-seat incumbency bonus",
  "Same model, told the real House vote",
];

/** A vote or forecast margin in its party's colour. */
const Mg = ({ v }: { v: number }) => <span className="tabular-nums" style={{ color: marginColor(v) }}>{fmtMargin(v)}</span>;
/** A miss (result minus forecast): "D+5.8" when Democrats beat the forecast by 5.8. */
const Ms = ({ v, digits = 1 }: { v: number; digits?: number }) => <span className="tabular-nums" style={{ color: missInk(v) }}>{fmtMiss(v, digits)}</span>;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2);
const dBar = (label: ReactNode, v: number, opts: Partial<BarRow> & { color?: string } = {}): BarRow => ({ label, sub: opts.sub, strong: opts.strong, values: [{ v, color: opts.color ?? DEM, text: `D+${f1(v)}` }] });

/** A verdict cell of the parts table: left-aligned running text in a figures table. */
const V = ({ children }: { children: ReactNode }) => <span className="block min-w-[16rem] whitespace-normal text-left text-[13px] leading-snug" style={{ color: MUTED }}>{children}</span>;

function Section({ id, label, meta, children }: { id: string; label: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mb-14 scroll-mt-24">
      <LedgerSectionHead label={label} meta={meta} />
      {children}
    </section>
  );
}

/** One proposed change: what, its effect on 2026, its effect on earlier years, and the judgement. */
function Change({ tag, title, rows }: { tag: string; title: string; rows: [string, ReactNode][] }) {
  return (
    <div className="vh-in py-5" style={{ borderTop: "1px solid var(--app-border)" }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>{tag}</div>
      <h3 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.2rem", letterSpacing: "-0.01em" }}>{title}</h3>
      <dl className="mt-3 grid max-w-[86ch] grid-cols-1 gap-x-5 gap-y-2 text-sm leading-relaxed sm:grid-cols-[7.5rem_minmax(0,1fr)]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="font-semibold sm:font-normal" style={{ color: MUTED }}>{k}</dt><dd className="min-w-0">{v}</dd></div>)}
      </dl>
    </div>
  );
}

export default function ModelReviewPage() {
  const d = modelReview2026(), s = d.snap;
  const H = d.score.house, S = d.score.senate, G = d.score.governor;
  const snapDay = "November 10";
  const wrong = d.races.filter((r) => !r.right).sort((a, b) => Math.max(a.pDem, 1 - a.pDem) - Math.max(b.pDem, 1 - b.pDem));
  const wrongNc = wrong.filter((r) => r.abbr === "NC" && r.office === "house");
  const coin = wrong.filter((r) => Math.max(r.pDem, 1 - r.pDem) <= 0.6);
  const confident = wrong.filter((r) => Math.max(r.pDem, 1 - r.pDem) >= 0.9);
  const biasAll = d.races.reduce((a, r) => a + r.err, 0) / d.races.length;
  const offBuckets = d.probBuckets.filter((b) => b.won / b.n < b.meanP - 0.05);
  const rating = (name: string) => d.ratings.find((r) => r.rating === name);
  const leanR = rating("Lean R"), likelyR = rating("Likely R");
  const gbNow = d.houseVote.imputed - s.national.gb;
  const gbYears: [number, number][] = [...s.gbMiss.byYear.filter(([y]) => y !== 2026), [2026, gbNow]];
  const gbMean6 = gbYears.reduce((a, [, v]) => a + v, 0) / gbYears.length;
  const scenarioRows = (rows: MrScenario[], labels: string[]) => ({
    strong: [0],
    rows: rows.map((r, i) => [labels[i] ?? r.label, f1(r.H.exp), <Ms key="h" v={r.H.bias} />, f2(r.H.mae), f1(r.S.exp), <Ms key="s" v={r.S.bias} />, f2(r.S.mae), f1(r.G.exp), <Ms key="g" v={r.G.bias} />, f2(r.G.mae)] as ReactNode[]),
  });
  const scenarioHead = ["Scenario", "House seats", "Miss", "Avg error", "Senate seats", "Miss", "Avg error", "Governors", "Miss", "Avg error"];
  const seatsNow: ReactNode[] = [<span key="l" style={{ color: MUTED }}>Result on today’s count</span>, d.seats.house.actual, "", "", d.seats.senate.actual, "", "", d.seats.governor.actual, "", ""];
  const others = d.forecasters.filter((f) => f.brier != null).sort((a, b) => a.brier! - b.brier!);
  const ourRank = others.findIndex((f) => f.ours) + 1;
  const models = d.forecasters.filter((f) => f.kind === "model" && !f.ours && f.houseSeats != null);
  const topHouse = Math.max(...models.map((f) => f.houseSeats!));
  const half = Math.ceil(d.states.length / 2);
  const stateBars = (rows: typeof d.states): BarRow[] => rows.map((st) => ({ label: st.abbr, sub: undefined, values: [{ v: st.resid, color: st.resid < 0 ? DEM : "var(--party-rep)", text: fmtMiss(st.resid), name: `${st.n} seats` }] }));

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: INK }}>
      <TouchHover />
      <StandfirstHeader kicker="Forecasts" title="2026 Model Review">
        The final forecast picked the winner in <Fig>{d.all.right}</Fig> of <Fig>{d.all.n}</Fig> contested House, Senate and governor races and called control of both chambers.
        It put the races in almost exactly the right order and read the country about <Fig><span style={{ color: DEM }}>{Math.round(-biasAll)} points</span></Fig> too Republican.
      </StandfirstHeader>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-5 sm:px-6">
        <nav aria-label="Sections" className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs" style={{ color: MUTED }}>
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className="ix-lift rounded-full px-2.5 py-1 font-semibold hover:text-[var(--app-text-primary)]" style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}>{label}</a>)}
          <span className="lg:ml-auto">Results as of <span className="font-semibold tabular-nums" style={{ color: INK }}>{fmtDateTime(d.asOf)}</span></span>
        </nav>

        {/* ── Summary ── */}
        <Section id="summary" label="The short version" meta="The forecast locked at 8:30 AM ET on November 3, against the count">
          <Reveal>
            <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <BigStat value={<>{d.all.right} <span style={{ fontSize: "0.6em", color: MUTED }}>of {d.all.n}</span></>} label="contested races where the forecast favourite won" />
              <BigStat delay={60} value={<>{d.seats.house.actual} <span style={{ fontSize: "0.6em", color: MUTED }}>vs {Math.round(d.seats.house.mean)}</span></>} label="House seats Democrats won, against the forecast average" />
              <BigStat delay={120} color={DEM} value={`D+${f1(-H.bias)}`} label="how far Democrats beat the forecast in the average House race" />
              <BigStat delay={180} value={f2(H.pearson)} label="correlation between forecast and actual House margins (1.00 is perfect)" />
            </div>
            <Prose>
              <P>
                A forecast has two jobs. One is telling races apart: which seats are safe, which are close, and which of two close seats is the better bet. The other is setting the level: how good a year it
                is for each party overall. The 2026 model did the first job very well and the second one badly.
              </P>
              <P>
                On the first job, forecast and actual margins moved together almost perfectly: a correlation of {f2(H.pearson)} in the House, {f2(S.pearson)} in the Senate and {f2(G.pearson)} for governor.
                On the second, Democrats finished ahead of the forecast in {d.all.dBeat} of {d.all.n} races, by an average of {f1(-H.bias)} points in the House, {f1(-S.bias)} in the Senate
                and {f1(-G.bias)} for governor. All {d.all.wrongTowardD === wrong.length ? wrong.length : `${d.all.wrongTowardD} of the ${wrong.length}`} missed calls were seats the model leaned Republican that a Democrat won.
              </P>
              <P>
                Most of this page is about that second job: where the six points went missing, which parts of the model held up once the level is corrected, and what the record says should change before 2028.
                The one finding worth carrying away is about polling. The national generic-ballot polls missed the size of the wave. The polls of individual races mostly did not, and the model trusted them too little.
              </P>
            </Prose>
            <LedgerSubhead label="Report card" meta="Graded by the rule in Every race, applied to each job" />
            <FlatTable label="Report card" leftCols={2} strong={[9]} head={["What", "How it went", "Grade"]} rows={[
              ["Chamber control", <span key="t">House and Senate both forecast Democratic ({pct(d.seats.house.pControl!)} and {pct(d.seats.senate.pControl!)}) and both went Democratic</span>, <Grade key="g" g="A" />],
              ["Ordering the races", <span key="t">Forecast and result correlate at {f2(G.pearson)} to {f2(H.pearson)}; with the level fixed, {H.netRight + S.netRight + G.netRight} of {d.all.n} calls are right</span>, <Grade key="g" g="A" />],
              ["Race winners", <span key="t">{d.all.right} of {d.all.n} ({pct(d.all.right / d.all.n)}); every miss was a Republican-leaning seat that went Democratic</span>, <Grade key="g" g="B" />],
              ["Governor seats", <span key="t">{f1(d.seats.governor.mean)} forecast, {d.seats.governor.actual} won; {d.seats.governor.inRange ? "inside" : "outside"} the 80% range of {d.seats.governor.lo} to {d.seats.governor.hi}</span>, <Grade key="g" g={d.seats.governor.inRange ? "B" : "D"} />],
              ["Senate seats", <span key="t">{f1(d.seats.senate.mean)} forecast, {d.seats.senate.actual} won; {d.seats.senate.inRange ? "inside" : "outside"} the 80% range of {d.seats.senate.lo} to {d.seats.senate.hi}</span>, <Grade key="g" g={d.seats.senate.inRange ? "B" : "D"} />],
              ["House seats", <span key="t">{Math.round(d.seats.house.mean)} forecast, {d.seats.house.actual} won; {d.seats.house.inRange ? "inside" : "outside"} the 80% range of {d.seats.house.lo} to {d.seats.house.hi}</span>, <Grade key="g" g={d.seats.house.inRange ? "B" : "D"} />],
              ["Margins", <span key="t">Average error of {f1(H.mae)} (House), {f1(S.mae)} (Senate) and {f1(G.mae)} (governor), against {f1(H.pastMae)}, {f1(S.pastMae)} and {f1(G.pastMae)} when the same model is replayed on 2018 to 2024</span>, <Grade key="g" g="C" />],
              ["Uncertainty", <span key="t">Race-by-race noise was sized correctly; the shared national error was set at about 3 points and the miss was 4 to 7</span>, <Grade key="g" g="C" />],
              ["National environment", <span key="t">The model’s forecasts added up to a House vote of <Mg v={s.national.modelPv} />; the vote was <Mg v={d.houseVote.raw} /></span>, <Grade key="g" g="F" />],
              ["Overall", "Right about which races and who controls what; about six points wrong about how big", <Grade key="g" g="C" />],
            ]} />
          </Reveal>
        </Section>

        {/* ── Scorecard ── */}
        <Section id="scorecard" label="Scorecard" meta={`${d.all.n} contested races`}>
          <Reveal>
            <div className="grid gap-x-12 gap-y-2 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
              <ForecastScatter races={d.races} bias={{ all: biasAll, house: H.bias, senate: S.bias, governor: G.bias }} />
              <div>
              <Explain term="How to read a margin and a miss">
                Every margin on this page is the Republican’s share of the vote minus the Democrat’s, written by its leader: <Mg v={3.2} /> is a Republican ahead by 3.2 points. A <b>miss</b> is the result minus the
                forecast. If the forecast said <Mg v={3.2} /> and the Democrat won by 1.0, Democrats beat the forecast by 4.2, written <Ms v={-4.2} />. The <b>average miss</b> keeps the direction, so misses both ways
                cancel; it measures lean. The <b>average error</b> ignores direction; it measures size.
              </Explain>
                <Explain term="What the picture shows">
                  If the forecast had the order of the races wrong, the dots would be a loose cloud. They are a tight band instead. If it had the level right, the band would sit on the dashed line. It sits about {Math.round(-biasAll)} points
                  to the Democratic side of it, which is the solid line. Nearly every missed call (the ringed dots) is in the same corner: seats forecast narrowly Republican that came in narrowly Democratic.
                </Explain>
              </div>
            </div>
            <FlatTable label="Scorecard by office" minWidth={760}
              head={["Office", "Races", "Calls right", "Avg error", "Same model, 2018–24", "Avg miss", "Dems beat forecast", "Inside 80% range", "Avg error, level fixed", "Calls, level fixed", "Correlation"]}
              rows={OFFICES.map((o) => { const x = d.score[o]; return [MR_OFFICE_NAME[o], x.n, `${x.right} (${pct(x.right / x.n)})`, f2(x.mae), f2(x.pastMae), <Ms key="m" v={x.bias} />, `${x.dBeat} of ${x.n}`, pct(x.cov80), f2(x.netMae), x.netRight, f2(x.pearson)]; })} />
            <Notes>
              <p><strong>Inside 80% range:</strong> each forecast came with a range meant to hold the result four times in five. It held {pct(H.cov80)} of House results, {pct(S.cov80)} of Senate and {pct(G.cov80)} of governor: too few, because the whole field was off in one direction.</p>
              <p><strong>Level fixed:</strong> the office’s average miss is taken out of every race, which is what the forecast would have scored with the national picture right and nothing else changed. The ranges then hold {pct(H.netCov80)}, {pct(S.netCov80)} and {pct(G.netCov80)}.</p>
              <p><strong>Left out:</strong> the {d.all.uncontested} House seats with one party on the ballot or two finalists from the same party have no Democrat-versus-Republican margin. They count as correct calls in the seat totals.</p>
            </Notes>
          </Reveal>
        </Section>

        {/* ── Map ── */}
        <Section id="map" label="Where the forecast missed" meta="Result against forecast, race by race">
          <MissMap races={d.races} />
        </Section>

        {/* ── Seats ── */}
        <Section id="seats" label="Seat counts" meta="The forecast’s simulated range against the result">
          <Reveal>
            <Prose>
              <P>
                The forecast called control of both chambers correctly. For each chamber it ran thousands of simulated elections and reported the middle 80% of them as its range.
                {d.seats.governor.inRange ? <> The governor total landed inside its range.</> : <> The governor total landed outside its range.</>}
                {!d.seats.senate.inRange && !d.seats.house.inRange ? <> The Senate and House totals did not: the simulations gave Democrats about a {pct(d.seats.senate.pAtLeast)} chance of {d.seats.senate.actual} Senate seats or more, and about a {pct(d.seats.house.pAtLeast)} chance of {d.seats.house.actual} House seats or more.</>
                  : <> The House total did not: the simulations gave Democrats about a {pct(d.seats.house.pAtLeast)} chance of {d.seats.house.actual} seats or more.</>}
              </P>
            </Prose>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
              {OFFICES.map((o) => <SeatHist key={o} name={MR_OFFICE_NAME[o]} seats={d.seats[o]} />)}
            </div>
            <p className="mt-2 max-w-[76ch] text-xs leading-relaxed" style={{ color: FAINT }}>Bars are the forecast’s simulated spread of Democratic seats, the shaded band its 80% range, the heavy line the result. The three figures under each chart are the low end of the range, the average, and the high end.</p>
            <div className="mt-6">
              <FlatTable label="Seat counts" minWidth={620} head={["Chamber", "Forecast average", "80% range", "Chance of control", "Democrats won", "Missed by", "Forecast chance of this many or more"]}
                rows={OFFICES.map((o) => { const x = d.seats[o]; return [MR_OFFICE_NAME[o], f1(x.mean), `${x.lo} to ${x.hi}`, x.pControl == null ? "—" : pct(x.pControl), x.actual, `${f1(x.actual - x.mean)} seats`, pct(x.pAtLeast)]; })} />
            </div>
            <Notes>
              <p>Senate and governor totals include the seats not up this year.{d.seats.house.uncalled.length > 0 && <> Not yet called and counted for the current leader: {d.seats.house.uncalled.map((u) => `${u.label} (${fmtMargin(u.a)})`).join(", ")}. Louisiana’s two seats go to a December 12 runoff.</>}</p>
            </Notes>
          </Reveal>
        </Section>

        {/* ── Missed calls ── */}
        <Section id="calls" label={`The ${wrong.length} calls it missed`} meta="And whether its confidence was earned">
          <Reveal>
            <Prose>
              <P>
                {coin.length} of the {wrong.length} were near coin-flips, with the favourite at 60% or less. {confident.length} were confident misses, a favourite at 90% or more.
                {wrongNc.length >= 3 && <> The largest cluster was North Carolina, where Democrats won {wrongNc.length} seats ({wrongNc.map((r) => r.label).join(", ")}) that the model had Republican by {f1(Math.min(...wrongNc.map((r) => r.f)))} to {f1(Math.max(...wrongNc.map((r) => r.f)))} points, each by under {Math.ceil(Math.max(...wrongNc.map((r) => -r.a)))} points.</>}
                {" "}That cluster is what a national miss looks like on the ground: one shared error landing on several seats that sat just out of reach.
              </P>
            </Prose>
            <FlatTable label="Missed calls" leftCols={2} minWidth={640} head={["Race", "Winner", "Forecast favourite", "Forecast", "Result", "Miss"]}
              rows={wrong.map((r) => [
                <Link key="l" href={r.href} prefetch={false} className="font-semibold hover:underline">{r.office === "house" ? r.label : `${r.label} ${MR_OFFICE_NAME[r.office]}`}{!r.called && " †"}</Link>,
                <span key="w">{r.demWon ? r.dem : r.rep} <span style={{ color: MUTED }}>({r.demWon ? r.demParty : "R"})</span></span>,
                `${r.pDem > 0.5 ? r.demParty : "R"} ${pct(Math.max(r.pDem, 1 - r.pDem))}`, <Mg key="f" v={r.f} />, <Mg key="a" v={r.a} />, <Ms key="m" v={r.err} />,
              ])} />
            <Notes><p>Ordered from the least confident call to the most. † marks a race not yet called, scored on the current leader.</p></Notes>

            <LedgerSubhead label="When it said 70%, did it happen about 70% of the time?" />
            <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
              <div>
                <CalibrationPlot buckets={d.probBuckets} />
                <p className="mt-2 max-w-[70ch] text-xs leading-relaxed" style={{ color: FAINT }}>Every contested race, grouped by how confident the forecast was in its favourite; a bigger dot is more races. A dot on the dashed line means favourites won exactly as often as forecast. Below it, they won less often.</p>
              </div>
              <div className="space-y-3">
                <P>
                  A well-calibrated forecast is right about its own doubt: favourites at 70% should win about seven times in ten.
                  {offBuckets.length > 0
                    ? <> The gaps are in {offBuckets.length === 1 ? "one group" : "these groups"}: {offBuckets.map((b, i) => <span key={b.label}>{i > 0 && (i === offBuckets.length - 1 ? " and " : ", ")}favourites at {b.label} won {pct(b.won / b.n)} of the time against {pct(b.meanP)} forecast</span>)}. Every one of those losses went the same way, to the Democrat.</>
                    : <> Every group landed close to the line.</>}
                </P>
                <FlatTable label="Calibration by confidence" head={["Favourite at", "Races", "Won", "Share", "Forecast"]}
                  rows={d.probBuckets.map((b) => [b.label, b.n, b.won, pct(b.won / b.n), pct(b.meanP)])} />
              </div>
            </div>

            <LedgerSubhead label="By rating" meta="Democratic wins the forecast expected against the wins that happened" />
            <FlatTable label="Calls by rating" head={["Rating", "Races", "Forecast expected Democrats to win", "Democrats won", "Avg miss"]}
              rows={d.ratings.map((r) => [r.rating, r.n, f1(r.expD), r.dWins, <Ms key="m" v={r.bias} />])} />
            {leanR && likelyR && <Notes><p>The expected figure adds up each race’s Democratic win chance. Democrats won {leanR.dWins} of the {leanR.n} seats rated Lean R, where the forecast expected about {Math.round(leanR.expD)}, and {likelyR.dWins} of the {likelyR.n} rated Likely R, where it expected about {Math.round(likelyR.expD)}.</p></Notes>}
          </Reveal>
        </Section>

        {/* ── Environment ── */}
        <Section id="environment" label="Where the miss came from" meta="Three choices that all pushed the same way">
          <Reveal>
            <Explain term="The national environment">
              The model builds each race from the seat’s usual partisan lean, then adds a single national number for how good the year is for each party: the <b>environment</b>. It comes mostly from <b>generic-ballot</b> polls,
              which ask voters which party they want in Congress. Get that one number wrong and every race is wrong by about the same amount, in the same direction. That is what happened.
            </Explain>
            <Prose>
              <P>Almost all of the miss is in the environment, and three separate choices each took something off the Democratic side of it.</P>
              <ol className="max-w-[70ch] list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
                <li><b>The generic-ballot polls were low.</b> The final average was <Mg v={s.national.gb} />. The House vote came in at <Mg v={d.houseVote.raw} /> on the official count and <Mg v={d.houseVote.imputed} /> once seats with no opponent are filled in, which is the basis a generic-ballot poll measures. On that basis the polls were {f1(-gbNow)} points too Republican.</li>
                <li><b>The model then moved the polls further toward Republicans.</b> Generic-ballot polls had understated Republicans in four of the five cycles from 2016 to 2024, so the model added half that average miss ({f1(s.gbMiss.mean5 / 2)} points) to the Republican side. A second adjustment of 0.9 to 1.7 points was applied to race polls on election morning for the same reason.</li>
                <li><b>Only part of the national number reached each race.</b> The model scales the environment down before applying it: a Senate or governor race received {f1(-s.envWanted.S.applied)} points of Democratic environment and a House race {f1(-s.envWanted.H.applied)}. The results asked for about 12 in all three offices, which is the House vote carried through point for point.</li>
              </ol>
            </Prose>
            <Figure title="The Democratic environment at each stage, in points"
              legend={<><Key color={FAINT}>What went in</Key><Key color={INK}>What a race received</Key><Key color={DEM}>What the results showed</Key></>}
              note={<>The first two bars are the model’s input, the next two what it applied to a race, and the rest what happened. “Implied by the results” is the environment that would have made each office’s average miss zero, measured on the {snapDay} count.</>}>
              <HBars ariaLabel="The Democratic environment at each stage" max={15} labelWidth="clamp(8.5rem, 34vw, 19rem)" ticks={[0, 5, 10, 15]} rows={[
                dBar("Generic-ballot polls, final average", -s.national.gb, { color: FAINT }),
                dBar("After the model’s Republican-ward adjustment", -s.national.pvHat, { color: FAINT }),
                dBar("Applied to a House race", -s.envWanted.H.applied, { color: INK }),
                dBar("Applied to a Senate or governor race", -s.envWanted.S.applied, { color: INK }),
                dBar("Implied by House results", -s.envWanted.H.wanted),
                dBar("Implied by Senate results", -s.envWanted.S.wanted),
                dBar("Implied by governor results", -s.envWanted.G.wanted),
                dBar("The House vote, every seat contested", -d.houseVote.imputed, { strong: true }),
              ]} />
            </Figure>

            <LedgerSubhead label="Undoing each choice in turn" meta={`Reruns of the locked model on the ${snapDay} count`} />
            <Prose>
              <P>
                To size each choice, the locked model’s own arithmetic was rerun with one thing changed at a time, each step keeping the changes before it. The bars show how far Democrats still beat the forecast after each step.
                Race polls are held at their final values throughout.
              </P>
            </Prose>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
              {OFFICES.map((o) => (
                <div key={o}>
                  <div className="mb-1 text-sm font-semibold">{MR_OFFICE_NAME[o]}</div>
                  <HBars ariaLabel={`${MR_OFFICE_NAME[o]}: average miss left after each step`} max={7.5} labelWidth="4.75rem"
                    rows={s.decomp.map((st, i) => dBar(i === 0 ? "Published" : `Step ${i}`, -st[K[o]].bias, { color: i === 0 ? FAINT : DEM }))} />
                </div>
              ))}
            </div>
            <ol className="mt-4 max-w-[76ch] list-decimal space-y-1 pl-5 text-sm leading-relaxed" style={{ color: MUTED }}>
              <li>Remove the Republican-ward adjustment to the generic ballot.</li>
              <li>Give the model the real House vote in place of the polls (<Mg v={s.national.actualPv} /> as it stood on {snapDay}).</li>
              <li>Carry that vote to every race point for point, with no scaling down.</li>
              <li>Read race polls at face value, without the election-morning adjustment.</li>
            </ol>
            <Prose>
              <div className="mt-4" />
              <P>
                In the House the polls being low is the largest single piece: step 2 removes {f1(s.decomp[1].H.bias * -1 - s.decomp[2].H.bias * -1)} of the {f1(-s.decomp[0].H.bias)} points. In the Senate the scaling-down matters more than the polling
                miss ({f1(s.decomp[3].S.bias - s.decomp[2].S.bias)} points against {f1(s.decomp[2].S.bias - s.decomp[1].S.bias)}), because it takes a third off whatever the national number is. After all four steps about one point is left in the House and governor
                races and {f1(-s.decomp[4].S.bias)} in the Senate.
              </P>
            </Prose>

            <LedgerSubhead label="The generic ballot’s miss, cycle by cycle" />
            <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
              <HBars ariaLabel="Generic-ballot miss by cycle" diverging min={-6} max={6} ticks={[-6, -3, 0, 3, 6]} tickText={["D+6", "D+3", "0", "R+3", "R+6"]} labelWidth="7.5rem"
                rows={gbYears.map(([y, v]) => ({ label: String(y), sub: y % 4 === 0 ? "presidential" : "midterm", strong: y === 2026, values: [{ v, color: v < 0 ? DEM : "var(--party-rep)", text: fmtMiss(v) }] }))} />
              <div className="space-y-3">
                <P>
                  The adjustment assumed the Republican-ward miss would repeat. It has repeated in all three presidential years on file, by an average of {f1(s.gbMiss.pres)} points.
                  The three midterms split: two missed toward Democrats and one toward Republicans.
                </P>
                <P muted>
                  With 2026 added, the six-cycle average miss falls from {f1(s.gbMiss.mean5)} points to {f1(gbMean6)}. The lesson is less that the polls lean one way than that the lean is not stable enough to correct for.
                </P>
              </div>
            </div>
            <Notes><p>Each bar is the House vote with every seat contested minus the final generic-ballot average. A bar to the right means Republicans did better than the polls; to the left, Democrats did.</p></Notes>
          </Reveal>
        </Section>

        {/* ── What-if test ── */}
        <Section id="test" label="The what-if test" meta={`Hand the model the real House vote and see what else was wrong · ${snapDay} count`}>
          <Reveal>
            <Prose>
              <P>
                If the environment was the problem, then a model told the true House vote in advance should come out close to right. If it does not, something else is broken too. This test separates the two. It is run twice,
                because the national number can be lost in two places: at the input, and in the scaling-down on the way to each race.
              </P>
            </Prose>
            <FlatTable label="What-if scenarios" minWidth={860} strong={[0]} head={scenarioHead} rows={[...scenarioRows(s.counterfactual.slice(0, 7), WHAT_IF_LABELS).rows, seatsNow]} />
            <Notes>
              <p><strong>Seats</strong> are expected Democratic seats: each race’s win chance added up, plus seats not up. <strong>Miss</strong> is the average of result minus forecast; <strong>avg error</strong> ignores direction.</p>
              <p>The test used the House vote as it stood on {snapDay}, <Mg v={s.national.actualPv} />; late ballots have since taken it to <Mg v={d.houseVote.raw} />, so a rerun today would close slightly more of the gap. Published-forecast figures here are on that count too ({d.all.right} calls right today against {s.locked.H.right + s.locked.S.right + s.locked.G.right} then).</p>
            </Notes>
            <div className="mt-6 grid gap-x-10 gap-y-5 md:grid-cols-3">
              {[
                ["The fundamentals hold up", <>With the vote carried point for point and no race polls at all, the average miss is under one point in every office and expected seats come to {f1(s.counterfactual[5].H.exp)}, {f1(s.counterfactual[5].S.exp)} and {f1(s.counterfactual[5].G.exp)}. Partisan lean, incumbency, money and candidate strength were sound. They were sitting on the wrong national number.</>],
                ["Fixing the input alone is not enough", <>With the true vote as the input and nothing else changed, the House is nearly fixed (a miss of {f1(-s.counterfactual[2].H.bias)}). The Senate still misses by {f1(-s.counterfactual[2].S.bias)}, because the model hands a Senate race only two thirds of the national swing.</>],
                ["Race polls still earn their place", <>With the environment right, adding the polls back at face value cuts Senate error from {f1(s.counterfactual[5].S.mae)} to {f1(s.counterfactual[6].S.mae)} and governor error from {f1(s.counterfactual[5].G.mae)} to {f1(s.counterfactual[6].G.mae)}. In the House they add little once the environment is right.</>],
              ].map(([h, body], i) => (
                <div key={i} className="vh-in pt-3 text-sm leading-relaxed" style={{ borderTop: `2px solid ${INK}`, animationDelay: `${i * 60}ms` }}>
                  <div className="mb-1.5 font-semibold" style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem" }}>{h}</div>
                  <div style={{ color: MUTED }}>{body}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </Section>

        {/* ── Polls vs fundamentals ── */}
        <Section id="polls" label="Polls against fundamentals" meta="In the races that had polls">
          <Reveal>
            <Explain term="Fundamentals and the blend">
              The <b>fundamentals</b> are everything the model knows without asking voters about the race itself: partisan lean, the national environment, incumbency, money and candidate strength. Where a race has polls, the forecast is a
              <b> blend</b> of the two, and the more and fresher the polls, the more weight they get, up to a ceiling of 75%.
            </Explain>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
              {(["senate", "governor", "house"] as const).map((o) => {
                const p = d.polled[o];
                return (
                  <div key={o}>
                    <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-semibold">{MR_OFFICE_NAME[o]}</span><span className="text-xs" style={{ color: MUTED }}>{p.n} polled races</span></div>
                    <HBars ariaLabel={`${MR_OFFICE_NAME[o]}: how far Democrats beat each source`} max={10} labelWidth="7.5rem" rows={[
                      dBar("Fundamentals", -p.model.bias, { color: FAINT, sub: `${p.model.right} calls right` }),
                      dBar("Polls alone", -p.poll.bias, { sub: `${p.poll.right} calls right` }),
                      dBar("Published blend", -p.blend.bias, { color: INK, sub: `${p.blend.right} calls right` }),
                    ]} />
                  </div>
                );
              })}
            </div>
            <p className="mt-2 max-w-[76ch] text-xs leading-relaxed" style={{ color: FAINT }}>How far Democrats beat each source on average, in points; shorter is better. Polls are read at face value, before the model’s adjustment.</p>
            <Prose>
              <div className="mt-4" />
              <P>
                Taken at face value, race polls understated Democrats by {f1(-d.polled.senate.poll.bias)} points in the Senate, {f1(-d.polled.governor.poll.bias)} for governor and {f1(-d.polled.house.poll.bias)} in the House.
                The fundamentals understated them by {f1(-d.polled.house.model.bias)} to {f1(-d.polled.senate.model.bias)}. The race polls had seen most of the wave. The published blend sits closer to the fundamentals than to the polls in the Senate and House, because polls got about half the weight or less.
              </P>
            </Prose>

            <LedgerSubhead label="How much weight the polls should have had" meta={`${snapDay} count; 2018 to 2024 from the backtest`} />
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: MUTED }}>
              <Key color={FAINT} line>2026 as published</Key><Key color={INK} line>2026 with the environment corrected</Key><Key color={MUTED} line="dashed">2018 to 2024</Key>
            </div>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
              {(["S", "G", "H"] as const).map((k) => (
                <WeightCurves key={k} name={k === "S" ? "Senate" : k === "G" ? "Governor" : "House"} ws={s.pollWeight.ws} used={s.pollWeight.meanW[k]} curves={[
                  { name: "2026 as published", stroke: FAINT, ...s.pollWeight.locked[k] },
                  { name: "2018 to 2024", stroke: MUTED, dash: "6 4", ...s.pollWeight.hist[k] },
                  { name: "2026 with the environment corrected", stroke: INK, ...s.pollWeight.true[k] },
                ]} />
              ))}
            </div>
            <p className="mt-2 max-w-[76ch] text-xs leading-relaxed" style={{ color: FAINT }}>Each curve is the average error in polled races if every race had given its poll average the same weight. The lowest point of a curve (the dot) is the weight that would have done best. The vertical line is the average weight the forecast used.</p>
            <Prose>
              <div className="mt-4" />
              <P>Two different things are happening in these curves, and they call for different answers.</P>
              <P>
                <b>For telling races apart, the weights were about right.</b> Once the environment is corrected (the dark curve), the 2026 results want a poll weight of {f2(s.pollWeight.true.S.best)} in the Senate, {f2(s.pollWeight.true.G.best)} for governor
                and {f2(s.pollWeight.true.H.best)} in the House. The forecast used {f2(s.pollWeight.meanW.S)}, {f2(s.pollWeight.meanW.G)} and {f2(s.pollWeight.meanW.H)}. Over all five cycles the best single weight is a little higher
                ({f2(s.pollWeight.five.S.best)}, {f2(s.pollWeight.five.G.best)}, {f2(s.pollWeight.five.H.best)}). Governor is the clear case for more.
              </P>
              <P>
                <b>For the national level, neither source is reliable, and they fail in different years.</b> As published (the light curve), 2026 wanted nearly all the weight on polls, but only because the polls had seen the wave and the
                fundamentals had not. The table shows why that cannot be made a rule: race polls were closer on the level in 2018 and 2026, and the fundamentals were closer in 2020 and 2024.
              </P>
            </Prose>
            <FlatTable label="Average miss of fundamentals and polls by year" minWidth={640}
              head={["Year", "Senate: fundamentals", "Polls", "Governor: fundamentals", "Polls", "House: fundamentals", "Polls"]} strong={[4]}
              rows={["2018", "2020", "2022", "2024", "2026"].map((y) => [y, ...(["S", "G", "H"] as const).flatMap((k) => { const g = s.pollWeight.grid[k].byYear[y]; return [<Ms key={`${k}m`} v={g.modelBias} />, <Ms key={`${k}p`} v={g.pollBias} />]; })])} />
            <Prose>
              <div className="mt-4" />
              <P>
                On election morning the race polls sat {f1(-s.pollGap.locked)} points more Democratic than the model across all three offices. The model read that gap as a sign the polls were off and adjusted them. Reading it the other
                way, as evidence about the environment, would have helped in 2026 and 2018 and hurt in 2020 and 2024, when polls also sat to the Democratic side of the model and Republicans beat both. So the gap is not a usable
                correction in either direction. It is a measure of how uncertain the level is, and the forecast should have been wider when it was large.
              </P>
            </Prose>
          </Reveal>
        </Section>

        {/* ── Each part ── */}
        <Section id="parts" label="Each part of the model" meta={`What the 2026 results say about each term · ${snapDay} count`}>
          <Reveal>
            <Prose>
              <P>
                A forecast margin is a sum of parts. The “fitted size” column asks what multiple of each part the 2026 results wanted, with all the parts fitted together and the national level left free. A value near 1 means the part was the right size.
                One cycle of {S.n} Senate and {G.n} governor races cannot pin these down, so those two columns come with wide ranges.
              </P>
            </Prose>
            <FlatTable label="Model components" minWidth={880} head={["Part", "Typical size (House / Senate / Gov.)", "Fitted size: House", "Senate", "Governor", "Verdict"]}
              rows={(() => {
                const c = s.components, cz = (k: "H" | "S" | "G", key: string) => (c[k].coef[key] == null ? "—" : `${f2(c[k].coef[key]!)} ± ${f2(c[k].se[key]!)}`);
                const size = (key: string, digits = 1) => (["H", "S", "G"] as const).map((k) => c[k].meanAbs[key].toFixed(digits)).join(" / ") + " pts";
                return [
                  ["Partisan lean", size("lean", 0), cz("H", "lean"), cz("S", "lean"), cz("G", "lean"), <V key="v"><b style={{ color: INK }}>Held.</b> Ranked the races almost perfectly. Margins came in a little narrower than the leans, most in the Senate.</V>],
                  ["Environment", size("env"), ...(["H", "S", "G"] as const).map((k) => f2(s.envWanted[k].wanted / s.envWanted[k].applied)), <V key="v"><b style={{ color: INK }}>The miss.</b> Results wanted about twice what was applied, and more than that in the Senate.</V>],
                  ["Incumbency", size("inc"), cz("H", "inc"), cz("S", "inc"), cz("G", "inc"), <V key="v"><b style={{ color: INK }}>Roughly held.</b> Worth about 2.2 points in the House this year against 3 assumed.</V>],
                  ["Close-seat incumbency bonus", `up to 2 pts, ${c.H.meanAbs.nComp} House seats`, cz("H", "comp"), "not used", "not used", <V key="v"><b style={{ color: INK }}>No support.</b> The seats that received it show no sign of it.</V>],
                  ["Money", size("money"), cz("H", "money"), cz("S", "money"), cz("G", "money"), <V key="v"><b style={{ color: INK }}>Held.</b> Right direction in all three offices; small either way.</V>],
                  ["Candidate strength", size("quality"), cz("H", "quality"), cz("S", "quality"), cz("G", "quality"), <V key="v"><b style={{ color: INK }}>Held.</b> Carries real weight for governor; House results asked for more of it.</V>],
                  ["Race polls", `weight ${f2(s.pollWeight.meanW.H)} / ${f2(s.pollWeight.meanW.S)} / ${f2(s.pollWeight.meanW.G)}`, ...(["H", "S", "G"] as const).map((k) => `${f2(c[k].pollW)} ± ${f2(c[k].pollWse)}`), <V key="v"><b style={{ color: INK }}>Held, and the most valuable input.</b> Fitted weights sit close to the ones used.</V>],
                  ["Republican-ward poll adjustments", "0.9 to 1.7 pts", "wrong sign", "wrong sign", "wrong sign", <V key="v"><b style={{ color: INK }}>Hurt.</b> Cost the Iowa and Kansas Senate calls, AL-02, FL-09, SC-01 and TX-35.</V>],
                ];
              })()} />
            <Notes>
              <p><strong>Uncertainty terms.</strong> Race-level spread came in at {f1(s.raceCal.H.realSd)} / {f1(s.raceCal.S.realSd)} / {f1(s.raceCal.G.realSd)} points against {f1(s.raceCal.H.ownSigma)} / {f1(s.raceCal.S.ownSigma)} / {f1(s.raceCal.G.ownSigma)} assumed (held). The national miss was {f1(s.raceCal.H.natZ)} / {f1(s.raceCal.S.natZ)} / {f1(s.raceCal.G.natZ)} times its assumed size (too small).</p>
            </Notes>

            <LedgerSubhead label="What is left after the level is fixed" meta="House races" />
            <Prose>
              <P>
                With the national miss removed, the House errors that remain are not random. They line up with how partisan the seat is: Democrats gained most in Republican seats and least in their own safest seats.
                A model that adds the same swing to every seat cannot produce that shape. The swing behaved more like a proportion than a flat number.
              </P>
            </Prose>
            <Figure title="House: average miss by the seat’s partisan lean" legend={<><Key color={FAINT}>As published</Key><Key color={INK}>With the real House vote carried through ({snapDay} rerun)</Key></>}
              note={<>A bar to the left means Democrats beat the forecast; to the right, Republicans did. After the environment is corrected, Democrats still beat the forecast by 2.5 to 3.5 points in seats leaning Republican by 5 or more, and fall short of it in seats leaning Democratic by 15 or more.</>}>
              <HBars ariaLabel="House average miss by partisan lean" diverging min={-10} max={4} ticks={[-10, -5, 0]} tickText={["D+10", "D+5", "0"]} labelWidth="8rem"
                rows={d.leanBuckets.map((b) => ({ label: b.label, sub: `${b.n} seats`, values: [{ v: b.bias, color: FAINT, name: "As published", text: fmtMiss(b.bias) }, ...(b.biasFixed != null ? [{ v: b.biasFixed, color: INK, name: "Environment corrected", text: fmtMiss(b.biasFixed) }] : [])] }))} />
            </Figure>
            <P>
              Incumbency shows the same shape: after the correction, Republican incumbents ran {f1(-s.incBuckets[0].true.bias)} points behind the forecast and Democratic incumbents {f1(s.incBuckets[1].true.bias)} ahead of it. Lean and incumbent party overlap heavily, so the two effects cannot be fully separated in one year.
            </P>
            <Figure title="House: each state’s average miss beyond the national one" note={<>States with three or more contested seats. The typical state sat {f1(d.stateSd)} points from the national miss; the simulation assumed 3.5, so this part of the uncertainty was sized correctly.</>}>
              <div className="grid gap-x-10 md:grid-cols-2">
                <HBars ariaLabel="State misses, first half" diverging min={-9} max={9} ticks={[-6, 0, 6]} tickText={["D+6", "0", "R+6"]} labelWidth="2.25rem" rows={stateBars(d.states.slice(0, half))} />
                <HBars ariaLabel="State misses, second half" diverging min={-9} max={9} ticks={[-6, 0, 6]} tickText={["D+6", "0", "R+6"]} labelWidth="2.25rem" rows={stateBars(d.states.slice(half))} />
              </div>
            </Figure>
            <P>
              Beyond lean, Democrats also ran further ahead in less-white districts (about {f1(-s.demo.nonwhite)} points for every 10 points of nonwhite population) and in districts with fewer college graduates ({f1(s.demo.college)} per 10 points).
              Several of the largest misses are heavily Hispanic seats in Texas and California, where the leans had absorbed the 2024 presidential shift and 2026 gave much of it back.
            </P>
          </Reveal>
        </Section>

        {/* ── Other forecasters ── */}
        <Section id="field" label="Other forecasters" meta={`Scored on the same ${d.forecasterRaces} contested House races`}>
          <Reveal>
            <Explain term="Brier score">
              A score for probabilities. For each race, take the gap between the chance a forecaster gave the Democrat and what happened (1 for a win, 0 for a loss), and square it; the Brier score is the average. Zero is perfect and
              0.25 is what saying 50% every time would score. It rewards being confident and right, and punishes being confident and wrong.
            </Explain>
            <Prose>
              <P>
                Every published model was low on the House. The highest expected {topHouse} Democratic seats and the result is {d.seats.house.actual}. This model ranks {ourRank} of {others.length} on Brier score: mid-field.
              </P>
            </Prose>
            <FlatTable label="Other forecasters" leftCols={2} minWidth={640} strong={[others.findIndex((f) => f.ours)]} head={["Forecaster", "Type", "House Brier", `Calls right, of ${d.forecasterRaces}`, "House D seats", "Short by", "Senate D seats", "Short by"]}
              rows={others.map((f) => [f.name, f.kind === "model" ? "Model" : "Ratings", f.brier!.toFixed(4), Number.isInteger(f.right) ? f.right : f.right!.toFixed(1),
                f.houseSeats == null ? "—" : Math.round(f.houseSeats), f.houseSeats == null ? "—" : Math.round(d.seats.house.actual - f.houseSeats),
                f.senateSeats == null ? "—" : Math.round(f.senateSeats), f.senateSeats == null ? "—" : Math.round(d.seats.senate.actual - f.senateSeats)])} />
            <Notes>
              <p>Each forecaster’s last update before the election, as collected for the <Link href="/analysis/forecasts" prefetch={false} className="underline underline-offset-2">Forecast Comparison</Link> page. Ratings-only outlets are scored by turning each rating into a chance (Safe 99%, Likely 90%, Lean 75%, Tilt 60%, Toss-up 50%); a seat an outlet left off its competitive list counts as Safe for the party ahead. A toss-up counts as half a call. Seat totals for ratings outlets count only the seats rated for Democrats, so toss-ups make them look lower.</p>
            </Notes>
          </Reveal>
        </Section>

        {/* ── Changes ── */}
        <Section id="changes" label="What would change" meta="Findings for the next model; the 2026 model stays frozen">
          <Reveal>
            <Prose>
              <P>
                It is easy to fix last year’s forecast: tune anything until 2026 comes out right. That is fitting the answer, and it usually makes the next forecast worse. So each idea below is scored twice: on 2026, where it will look
                better than it is, and on a replay of 2018 to 2024, where it has not seen the answer. Nothing here has been applied, and none of it is decided.
              </P>
            </Prose>
            <Change tag="1 · Strongest case" title="Stop moving polls toward Republicans in a midterm" rows={[
              ["Change", "Set the generic-ballot adjustment and the race-poll adjustment to zero, or apply them only in presidential years."],
              ["2026 effect", <>Expected House seats {f1(s.ladder[0].H.exp)} to {f1(s.ladder[1].H.exp)}, Senate {f1(s.ladder[0].S.exp)} to {f1(s.ladder[1].S.exp)}. Average error falls from {f1(s.ladder[0].H.mae)} to {f1(s.ladder[1].H.mae)} in the House, {f1(s.ladder[0].S.mae)} to {f1(s.ladder[1].S.mae)} in the Senate and {f1(s.ladder[0].G.mae)} to {f1(s.ladder[1].G.mae)} for governor.</>],
              ["Earlier years", <>Mixed, and split by the kind of year. The race-poll adjustment helped the Senate in 2020 ({f2(s.hist.noShade.S["2020"].mae)} to {f2(s.hist.shade.S["2020"].mae)}) and 2024 ({f2(s.hist.noShade.S["2024"].mae)} to {f2(s.hist.shade.S["2024"].mae)}) and hurt in 2018 ({f2(s.hist.noShade.S["2018"].mae)} to {f2(s.hist.shade.S["2018"].mae)}) and 2026.</>],
              ["Judgement", "2028 is a presidential year, where the adjustment has helped, so this is an open question. The case from 2026 is to widen the uncertainty instead of shifting the centre. If any adjustment is kept, the record now supports about half a point on the generic ballot."],
            ]} />
            <Change tag="2 · Strong case for the Senate" title="Carry the national vote to races point for point" rows={[
              ["Change", <>Give Senate and governor races the House-vote swing itself in place of {f2(s.national.s)} of it, and tie the House multiplier to that scale so the two cannot drift apart.</>],
              ["2026 effect", <>On top of change 1: Senate error {f1(s.ladder[1].S.mae)} to {f1(s.ladder[2].S.mae)}, governor {f1(s.ladder[1].G.mae)} to {f1(s.ladder[2].G.mae)}, House {f1(s.ladder[1].H.mae)} to {f1(s.ladder[2].H.mae)}.</>],
              ["Earlier years", "Supported in the other wave year and neutral elsewhere. The 2018 Senate wanted about 1.2 times the House swing. In 2020 to 2024 the environment was close to zero, so those years say little either way."],
              ["Judgement", <>Adopt for the Senate and House; test further for governor. Part of this happens by itself: once 2026 enters the history, the fitted scale rises from {f2(s.sRefit.sOld)} to about {f2(s.sRefit.sNew)}.</>],
            ]} />
            <Change tag="3 · Clear for governor, modest elsewhere" title="Give race polls more weight" rows={[
              ["Change", "Let polls reach their weight faster and raise the ceiling from 75% to 90%. One fresh poll would carry half of a Senate or House forecast and two thirds of a governor forecast."],
              ["2026 effect", <>On top of changes 1 and 2: Senate error {f2(s.ladder[2].S.mae)} to {f2(s.ladder[3].S.mae)}, governor {f2(s.ladder[2].G.mae)} to {f2(s.ladder[3].G.mae)}, House {f2(s.ladder[2].H.mae)} to {f2(s.ladder[3].H.mae)}.</>],
              ["Earlier years", <>Governor {f2(s.pollWeightHist.G.live)} to {f2(s.pollWeightHist.G.new)}, Senate {f2(s.pollWeightHist.S.live)} to {f2(s.pollWeightHist.S.new)}, House {f2(s.pollWeightHist.H.live)} to {f2(s.pollWeightHist.H.new)}.</>],
              ["Judgement", "This reverses two deliberate limits. The ceiling was set because polls had missed toward Democrats as a field; 2026 was the opposite case. A middle option is to change governor only, where the gain shows in every period tested."],
            ]} />
            <Change tag="4 · Structural" title="Widen the shared national error" rows={[
              ["Change", "Raise the national error from about 3 points to about 4, and let it grow when race polls and fundamentals disagree on the level."],
              ["2026 effect", <>The national miss was {f1(s.raceCal.H.natZ)} times the assumed error in the House, {f1(s.raceCal.S.natZ)} in the Senate and {f1(s.raceCal.G.natZ)} for governor. At 4 points the same miss is 1.1 to 1.6 times the assumed error.</>],
              ["Earlier years", <>Race-level noise needs no change: with the national miss removed, the 80% ranges held {pct(s.raceCal.H.cov)}, {pct(s.raceCal.S.cov)} and {pct(s.raceCal.G.cov)} of results. The shortfall is all in the shared term.</>],
              ["Judgement", "Adopt. The cost is less confident chamber odds through the autumn. This is the change that answers the part of the miss no setting can remove: the generic-ballot polls being low."],
            ]} />
            <Change tag="5 · Small" title="Drop the close-seat incumbency bonus" rows={[
              ["Change", "Remove the extra 2 points toward House incumbents in close seats, added on October 23."],
              ["2026 effect", <>The {s.components.H.meanAbs.nComp} seats that received it show no sign of it (fitted size {f1(s.components.H.coef.comp!)} ± {f1(s.components.H.se.comp!)}). Removing it moves House error from {f2(s.ladder[3].H.mae)} to {f2(s.ladder[4].H.mae)}.</>],
              ["Earlier years", "It was adopted on a gain of under a tenth of a point in 2022 and 2024."],
              ["Judgement", "Drop it. One cycle against and a thin case for."],
            ]} />
            <div className="py-5" style={{ borderTop: "1px solid var(--app-border)" }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>Tested, not recommended</div>
              <h3 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.2rem", letterSpacing: "-0.01em" }}>Three ideas 2026 suggests and the record does not support</h3>
              <ul className="mt-3 max-w-[80ch] list-disc space-y-2 pl-5 text-sm leading-relaxed">
                <li><b>Moving the environment toward what race polls imply.</b> Halfway would have cut 2026 House error from {f1(s.pollEnv26[0].H.mae)} to {f1(s.pollEnv26[1].H.mae)} and Senate from {f1(s.pollEnv26[0].S.mae)} to {f1(s.pollEnv26[1].S.mae)}. On the four earlier cycles it raises Senate error from {f2(s.hist.noShade.S.all.mae)} to {f2(s.hist.pollEnv.S.all.mae)} and House error from {f2(s.hist.noShade.H.all.mae)} to {f2(s.hist.pollEnv.H.all.mae)}.</li>
                <li><b>A larger swing in red seats than in blue ones.</b> The lean pattern above is large and tidy in 2026. It needs checking against 2018 before anything is built, since a pattern specific to this wave would hurt in a neutral year.</li>
                <li><b>More weight on House candidates, or less on House incumbency.</b> The 2026 fit asks for both. Changing either alone did not reduce 2026 error, and the multi-year backtest still puts incumbency at 2.5 to 3 points.</li>
              </ul>
            </div>

            <LedgerSubhead label="What the changes would have produced" meta={`${snapDay} count`} />
            <FlatTable label="Changes applied in turn" minWidth={860} head={scenarioHead} strong={[0]} rows={[...scenarioRows(s.ladder, LADDER_LABELS).rows, seatsNow]} />
            <Prose>
              <div className="mt-4" />
              <P>
                Rows 1 to 4 use only what was known on November 3. The last row is the same model told the House vote, which is the most any model of this design could have scored. Together the changes recover about a quarter of the House
                miss and under half of the Senate miss. The rest is the generic-ballot polls being {f1(-gbNow)} points low, which no setting in the model can see. That part belongs in the uncertainty, which is why change 4 matters as much as the first three.
              </P>
              <P muted>
                <b style={{ color: INK }}>What to leave alone.</b> The partisan leans, the money term, candidate effects, the race-level error sizes, and the state and demographic shocks in the simulation all behaved as designed.
              </P>
            </Prose>
          </Reveal>
        </Section>

        {/* ── Every race ── */}
        <Section id="races" label="Every race, graded" meta="Select a column heading to sort">
          <Prose>
            <P>
              One rule for every race. A miss within 3 points is an A, within 6 a B, within 9 a C, within 12 a D, and beyond that an F. A race where the forecast favourite lost drops one further grade and can be no better than a C.
              The second grade applies the same rule after the office’s average miss is taken out, which shows how well the forecast placed that race among the others.
            </P>
          </Prose>
          <FlatTable label="Grade distribution" minWidth={560} head={["Group", ...MR_GRADES, "Average (4.0 scale)", "Grade"]}
            rows={OFFICES.flatMap((o) => { const g = d.gpa[o]; return [
              [`${MR_OFFICE_NAME[o]}, as published`, ...MR_GRADES.map((x) => g.counts[x]), f2(g.gpa), <Grade key="g" g={gradeOf(g.gpa)} />],
              [<span key="l" style={{ color: MUTED }}>… with the level fixed</span>, ...MR_GRADES.map((x) => <span key={x} style={{ color: MUTED }}>{g.countsRel[x]}</span>), <span key="a" style={{ color: MUTED }}>{f2(g.gpaRel)}</span>, <Grade key="g" g={gradeOf(g.gpaRel)} />],
            ]; })} />
          <div className="mt-8"><RaceGrades races={d.races} /></div>
          <Notes>
            <p><strong>Competitive</strong> lists races forecast within 10 points, decided by under 5, or called wrong. <strong>Fundamentals</strong> is the forecast before race polls; <strong>Polls</strong> is the poll average at face value with the weight it received. ✗ marks a race the forecast favourite lost; † a race not yet called.</p>
            <p>An independent standing in for a Democrat (the Senate races in Idaho, Montana, Nebraska and South Dakota; Alaska’s House seat) is shown with “I+”.</p>
          </Notes>
        </Section>

        {/* ── Method ── */}
        <Section id="method" label="Method">
          <div className="max-w-[80ch] space-y-2 text-sm leading-relaxed" style={{ color: MUTED }}>
            <p><b style={{ color: INK }}>Forecast.</b> The final published run, locked at 8:30 AM ET on November 3 and archived unchanged: House {f1(d.seats.house.mean)}, Senate {f1(d.seats.senate.mean)}, governor {f1(d.seats.governor.mean)} Democratic seats, with a generic ballot of <Mg v={s.national.gb} />. No model file, constant or input was changed for this review.</p>
            <p><b style={{ color: INK }}>Results.</b> The site’s saved results as of {fmtDateTime(d.asOf)}, the same file behind the <Link href="/results" prefetch={false} className="underline underline-offset-2">Results</Link> page. The scorecard, map, seat counts, missed calls, calibration, the polls-against-fundamentals bars, the lean and state charts, the forecaster scores and every race grade are computed from it and follow it. Margins are in points of all votes cast. Alaska uses the final ranked-choice round. Uncalled races are scored on the current leader.</p>
            <p><b style={{ color: INK }}>Reruns.</b> The step-by-step decomposition, the what-if test, the poll-weight curves, the fitted sizes and the table of changes rerun the locked model’s own arithmetic with one input changed. They were computed on the count as of {snapDay} and are shown as computed: the average miss has since moved from {f1(-s.locked.H.bias)} to {f1(-H.bias)} points in the House, {f1(-s.locked.S.bias)} to {f1(-S.bias)} in the Senate and {f1(-s.locked.G.bias)} to {f1(-G.bias)} for governor, mostly from late California ballots and Alaska’s final round. Expected seats in those tables are sums of win chances; the published seat averages come from the simulation and differ by under one seat.</p>
            <p><b style={{ color: INK }}>Earlier years.</b> The 2018 to 2024 figures replay the 2026 model one day before each election (1,511 races, of which 603 had polls). They are a backtest of this year’s model, not a record of what was published at the time.</p>
            <p><b style={{ color: INK }}>A caution.</b> The fitted sizes and the best poll weights for 2026 are fitted to the results they are scored on. They describe 2026. They are not estimates for 2028.</p>
          </div>
        </Section>
      </main>
    </div>
  );
}

import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { FORECAST_CALIBRATION as CAL } from "@/data/forecastCalibration";
import { racePolls } from "@/data/racePolls";
import { pollWeight } from "@/lib/racePollAverage";
import { forecastsFor, getChamberSimulations, type ForecastedRace } from "@/lib/forecast";
import {
  getNationalEnvironment, incumbentAdvantage, calculateStateTpl, calculateDistrictTpl, effectiveEnvironment, computeIncumbentPts,
  raceMoneyTerm, candidateQuality,
} from "@/lib/tplCompute";
import { alignedParty } from "@/data/raceEligibility";
import { A, BuildUp, Chapter, KeyFigures, Label, Margin, Num, QA, RatingScale, SeeIt, ShareBars, SimpleTable, Steps } from "./kit";

// Public Forecast tab: the plain-language version of components/methodology/ForecastMethodology.tsx.
// Every number is read live from the same code. When the forecast's STRUCTURE changes (a new term,
// a term removed, a new rule a reader would notice), update this tab alongside the internal one.

const pct = (v: number) => `${Math.round(v * 100)}%`;
const odds = (p: number) => {
  const fav = Math.max(p, 1 - p);
  return fav >= 0.995 ? ">99%" : pct(fav);
};

function buildOf(race: ForecastedRace) {
  const tpl = race.raceType === "house" ? calculateDistrictTpl(race.id) : calculateStateTpl(race.stateAbbr, race.state);
  const inc = [race.candidates?.dem, race.candidates?.rep].find((c) => c?.incumbent) ?? null;
  const incPts = computeIncumbentPts(race.office, inc ? alignedParty(inc) : null, inc?.appointed ?? false);
  return { tpl, env: effectiveEnvironment(race.stateAbbr), incPts, money: raceMoneyTerm(race).pts, quality: candidateQuality(race).pts };
}

export default function ForecastPublic() {
  const env = getNationalEnvironment();
  const inc = incumbentAdvantage();
  const sims = getChamberSimulations();
  const byOffice = { H: forecastsFor("house"), S: forecastsFor("senate"), G: forecastsFor("governor") };
  const all = [...byOffice.S, ...byOffice.G, ...byOffice.H];
  const polled = all.filter((r) => r.pollMargin != null).length;
  const pollCount = Object.values(racePolls).reduce((a, p) => a + p.length, 0);
  const modelFloor = 1 - F.POLL_W_MAX;

  // The worked example: the closest polled Senate race right now.
  const example = [...byOffice.S].filter((r) => r.contest === "contested" && r.pollMargin != null).sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0] ?? byOffice.S[0];
  const ex = buildOf(example);
  const favored = example.margin > 0 ? "Republican" : "Democratic";
  const favoredPlural = example.margin > 0 ? "Republicans" : "Democrats";

  const pooled = (o: "H" | "S" | "G") => CAL.pooled.find((p) => p.office === o);
  const statewide = CAL.pooled.filter((p) => p.office !== "H");
  const swN = statewide.reduce((a, p) => a + p.n, 0);
  const swCalled = statewide.reduce((a, p) => a + p.calledRight * p.n, 0) / Math.max(1, swN);
  const swCover = statewide.reduce((a, p) => a + p.cover80 * p.n, 0) / Math.max(1, swN);

  return (
    <>
      <Chapter id="overview" kicker="Forecast · House, Senate, Governor" title="How a race forecast is built"
        intro={<>Every one of the <Num>{all.length}</Num> House, Senate and governor races on the ballot goes through the same recipe. We start with how the seat usually votes, adjust for this year&rsquo;s conditions and candidates, and then check that against the polls. What comes out is a projected margin, a chance of winning and a rating.</>}>
        <div>
          <Label meta="live · the closest polled Senate race right now">Follow one race: <A href={`/senate/${example.id.toLowerCase().replace(/-2$/, "2")}`}>{example.state} Senate</A></Label>
          <BuildUp steps={[
            { label: "How the state usually votes", note: "partisan lean in a neutral year", value: ex.tpl, total: true },
            { label: "The national mood", note: "this year's environment", value: ex.env },
            { label: "Incumbency", note: ex.incPts === 0 ? "open seat" : "a sitting senator running again", value: ex.incPts },
            { label: "Fundraising", note: "only the unusual part of the gap", value: ex.money },
            { label: "The candidates", note: "their past over- or under-performance", value: ex.quality },
            { label: "The model's estimate", note: `before polls · ${pct(1 - example.pollWeight)} of the final`, value: example.model, total: true },
            { label: "Polling average", note: `${example.pollCount} pollster${example.pollCount === 1 ? "" : "s"} · ${pct(example.pollWeight)} of the final`, value: example.pollMargin ?? example.model, total: true },
            { label: "Projected margin", note: `${favoredPlural} ${odds(example.probability)} to win · ${example.rating}`, value: example.margin, total: true },
          ]} />
        </div>
        <KeyFigures items={[
          { value: all.length, label: "races forecast" },
          { value: polled, label: `races with a polling average, from ${pollCount.toLocaleString()} polls` },
          { value: sims.house.sims.toLocaleString(), label: "simulated elections behind the chamber odds" },
        ]} />
      </Chapter>

      <Chapter id="lean" kicker="Step one" title="Five ingredients"
        intro="The model's estimate adds up five things. Each is measured the same way for every race, so two races differ only because their seats, years and candidates differ.">
        <Steps items={[
          { title: "How the seat usually votes",
            body: <>We call this the seat&rsquo;s <strong>True Partisan Lean</strong>: what a typical Republican would get against a typical Democrat in a year that favored neither party, measured from every election there since 2016. Senate and governor races use the state&rsquo;s lean; House races use the district&rsquo;s, on the lines in place for 2026.</>,
            more: <A href="/methodology/state-tpl">How lean is measured →</A> },
          { title: "The national mood", figureLabel: "national mood now", figure: <Margin v={env.eHat} />,
            body: <>The generic ballot asks voters which party they want in Congress. We turn its average into a national environment (now <Margin v={env.eHat} />) and apply it to each race, more strongly in states that have swung hard with the country before and less in states that have not. Generic-ballot polls have missed in the past, so the forecast allows for that rather than taking them at face value.</> },
          { title: "Incumbency", figure: <>{inc.H.toFixed(1)} · {inc.S.toFixed(1)} · {inc.G.toFixed(1)}</>, figureLabel: "points: House · Senate · Gov.",
            body: <>A sitting member running again gets a boost toward their party. The Senate and governor values are measured from past races; the House value was set by testing. Someone who was appointed to the seat and has never won it gets no boost: appointees have historically done no better than a newcomer.</> },
          { title: "Fundraising", figure: <>±{F.MONEY_CAP.S}</>, figureLabel: "most it moves a Senate race",
            body: <>Incumbents, and candidates in friendly territory, nearly always raise more, and the first three ingredients already account for that. So only the part of a fundraising gap that is unusual for a race like this one counts, and it is capped so a self-funder cannot buy a large shift.</> },
          { title: "The candidates",
            body: <>Some politicians reliably run ahead of their party, and some reliably run behind. If a nominee has been on a general-election ballot since 2016, how far they beat or trailed expectations carries forward, with older races counting less. A first-time candidate is treated as an average nominee.</>,
            more: <A href="/methodology/war">How candidate strength is measured →</A> },
        ]} />
      </Chapter>

      <Chapter id="polling" kicker="Step two" title="Then the polls"
        intro={<>Where a race has been polled, the polling average is a second, independent estimate of the same margin. The more fresh polls a race has, the more the forecast leans on them. But the model always keeps at least <Num>{pct(modelFloor)}</Num> of the say, because in recent elections the polls have tended to miss in the same direction everywhere at once.</>}>
        <div>
          <Label meta="share of the forecast that comes from the polling average">How much the polls count</Label>
          <ShareBars rows={[0, 1, 2, 4, 8].map((n) => ({ label: n === 0 ? "No polls" : `${n} fresh poll${n === 1 ? "" : "s"}`, value: n === 0 ? 0 : pollWeight(n, "S") }))} />
          <div className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>Senate races shown. One fresh poll counts for {pct(pollWeight(1, "H"))} of a House or governor forecast, where single polls have proven less reliable.</div>
        </div>
        <QA items={[
          { q: "Which polls count?", a: "General-election polls that name both nominees, fielded this year. Partisan polls are included and labeled, because leaving them out made the forecast worse." },
          { q: "How is the average made?", a: "Each pollster counts once, with its most recent poll. Newer polls and bigger samples count more, and older polls are adjusted for how the national mood has moved since they were taken." },
          { q: "What about pollsters that lean one way?", a: <>If a pollster has consistently shown one party doing better than other pollsters in the same races this year, its numbers are adjusted by that amount. Grades for past accuracy are shown on the <A href="/analysis/pollsters">pollster ratings</A> but are not used as weights, because a pollster&rsquo;s accuracy in one cycle has not predicted its accuracy in the next.</> },
          { q: "What about undecided voters?", a: "Up to 10 points of undecided voters in a poll are divided between the two candidates in proportion to their support. The leader stays the leader, and no assumption is made about which way undecided voters break." },
        ]} />
      </Chapter>

      <Chapter id="uncertainty" kicker="Step three" title="From a margin to a chance of winning"
        intro="No forecast is exact. We measure how far off this method has been in past elections and use that to turn a projected margin into a probability. Part of the error is national: when the polls or the model are off, they are usually off in the same direction everywhere. The rest is specific to each race. A race with good polling has less of its own uncertainty than one without.">
        <div>
          <Label meta="a rating is a band of the projected margin, not of the probability">Ratings</Label>
          <RatingScale marker={example.margin} markerLabel={`${example.state} Senate, ${example.margin > 0 ? "R" : "D"}+${Math.abs(example.margin).toFixed(1)} — ${example.rating}, ${odds(example.probability)} for the ${favored} nominee`} />
          <div className="mt-3 max-w-[62ch] text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Tilt: under 1 point. Lean: 1 to 5. Likely: 5 to 15. Safe: 15 or more. Every projection names a leader, even when the margin is a fraction of a point.</div>
        </div>
      </Chapter>

      <Chapter id="chambers" kicker="Step four" title="Who controls the House and the Senate"
        intro={<>The chances for individual races can&rsquo;t simply be added up, because races tend to miss together. Instead, the whole election is simulated <Num>{sims.house.sims.toLocaleString()}</Num> times. Each simulation draws one national surprise that hits every race at once, smaller shared swings among places with similar voters, and each race&rsquo;s own luck. Counting seats across all the simulations gives the range and the odds of control.</>}>
        <SimpleTable align="lrrr" head={["", "Expected Democratic seats", "80% of simulations", "Democratic control"]} rows={(["house", "senate", "governor"] as const).map((t) => [
          t === "house" ? "House" : t === "senate" ? "Senate" : "Governors",
          Math.round(sims[t].meanDem),
          `${sims[t].lo80}–${sims[t].hi80}`,
          sims[t].pDemControl == null ? "—" : <span key="p" className="font-bold" style={{ color: sims[t].pDemControl! >= 0.5 ? "var(--party-dem)" : "var(--party-rep)" }}>{pct(sims[t].pDemControl!)}</span>,
        ])} caption="Senate control needs 51 Democratic seats, because the Republican vice president breaks a 50–50 tie. Independents who caucus with Democrats are counted with them." />
      </Chapter>

      <Chapter id="special" kicker="Special cases" title="Races that don't fit the mold">
        <QA items={[
          { q: "Only one party on the ballot", a: "If a major party has no nominee, or both general-election candidates are from the same party (as in some California races), the seat is counted as decided." },
          { q: "Independents", a: "An independent who stands in for a party, such as one who caucuses with Democrats, is treated as that party's candidate. An independent running where one party has stepped aside, as in Nebraska's Senate race, is forecast on the seat's lean, their own record and their polls." },
          { q: "Three-way races", a: "In Montana's Senate race the independent Seth Bodnar, not the Democratic nominee, is Kurt Alme's main opponent, so the forecast is Alme against Bodnar, and Democrat Alani Bankhead is a third candidate. Polls of three-way races have missed by about a third more than usual, so the forecast's uncertainty is wider here. Like Nebraska's Dan Osborn, a Bodnar win is counted on the Democratic side of the seat totals." },
          { q: "Louisiana's House races", a: "All six seats are decided in an all-party primary on November 3, with a December runoff if needed. The forecast is for the combined Republican vote against the combined Democratic vote." },
          { q: "Alaska", a: "Alaska ranks its votes, so only the final head-to-head round of a ranked-choice poll is used." },
        ]} />
      </Chapter>

      <Chapter id="over-time" kicker="History" title="The forecast over time"
        intro="The charts showing how the forecast has moved are today's model rerun for each past day, using only the polls that had been released by then. A later fix to the model applies to every day, so the line shows how the forecast moved with the polls, not exactly what this site said on a given day." />

      <Chapter id="calibration" kicker="Track record" title="How well has this worked?"
        intro={<>We reran the model for each election from {CAL.years[0]} to {CAL.years.at(-1)} as if it were mid-September of that year, using only what was known before that year&rsquo;s votes were counted. These numbers are for the model&rsquo;s estimate without polls. Adding polls makes it more accurate.</>}>
        <KeyFigures items={[
          { value: pct(swCalled), label: `of ${swN} Senate and governor races called correctly` },
          { value: <>{pooled("S")?.mae.toFixed(1)} pts</>, label: "typical Senate miss" },
          { value: <>{pooled("G")?.mae.toFixed(1)} pts</>, label: "typical governor miss" },
          { value: pct(swCover), label: "of results landed inside the 80% range (the target is 80%)" },
        ]} />
        <div>
          <Label meta="all three offices, model without polls">Do the probabilities hold up?</Label>
          <SimpleTable align="lrrr" head={["When the model gave Democrats", "Races", "It said, on average", "Democrats won"]} rows={CAL.calibration.filter((b) => b.n > 0).map((b) => [
            `${pct(b.lo)} to ${pct(b.hi)}`, b.n, b.meanP == null ? "—" : pct(b.meanP), b.demWon == null ? "—" : pct(b.demWon),
          ])} caption="A well-calibrated forecast's last two columns roughly match: of the races given a 30% chance, about 30% should be won." />
        </div>
      </Chapter>

      <Chapter id="limits" kicker="Honest caveats" title="What the forecast can't see">
        <QA items={[
          { q: "House races have leaned Republican", a: `In 2022 and 2024, House results ran more Republican than the model expected. The forecast does not shift its estimates to correct for this, because a pattern from two elections is not a rule, but it allows for misses of that size in its ranges.` },
          { q: "Governors are the hardest", a: "Governors often build personal brands that cross party lines, which is why polls take over a governor's forecast fastest. Fundraising records are also missing for some governor races." },
          { q: "Records start in 2016", a: "Long-serving incumbents' earlier over-performance doesn't count toward their candidate record." },
          { q: "Expert ratings aren't used", a: <>The forecast is built only from results, polls, money and candidates. You can see it alongside other forecasters on the <A href="/analysis/forecasts">forecast comparison</A>.</> },
        ]} />
        <SeeIt>Every race page shows its own build-up, term by term, under <strong>Forecast calculation</strong>.</SeeIt>
      </Chapter>
    </>
  );
}


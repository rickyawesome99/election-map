import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { TPL_VALIDATION } from "@/data/tplValidation";
import { STATE_LEG_TPL_VALIDATION } from "@/data/stateLegTplValidation";
import LEG_EXAMPLE from "@/data/stateLegTplExample.json";
import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { houseData } from "@/data/forecastData";
import { calculateStateModel, calculateDistrictModel, calculateCountyModel, getMedianStateTpl, getTplFit } from "@/lib/tplCompute";
import { A, Chapter, KeyFigures, Label, Margin, Num, QA, SeeIt, ShareBars, SimpleTable, Steps } from "./kit";

// Public State / District / County TPL tabs: the plain-language version of
// components/methodology/TplMethodology.tsx, reading the same live fit. Update alongside it when the
// lean's STRUCTURE changes (which races count, what is stripped, how races are weighted).

const TYPE_NAME = { P: "President", H: "U.S. House", S: "Senate", L: "State legislature", G: "Governor" } as const;

function WeightCharts() {
  const types = (["P", "H", "S", "L", "G"] as const).map((t) => ({ label: TYPE_NAME[t], value: G.RACE_TYPE_WEIGHTS[t] })).sort((a, b) => b.value - a.value);
  const midTotal = (["H", "S", "L", "G"] as const).reduce((a, t) => a + G.RACE_TYPE_WEIGHTS_MIDTERM[t], 0);
  const mid = (["H", "L", "S", "G"] as const).map((t) => ({ label: TYPE_NAME[t], value: G.RACE_TYPE_WEIGHTS_MIDTERM[t] / midTotal })).sort((a, b) => b.value - a.value);
  const years = [...G.YEARS].sort((a, b) => b - a).filter((y) => y % 2 === 0);
  const top = G.YEAR_WEIGHTS[years[0]];
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div>
        <Label meta="share of the year's lean">Presidential year</Label>
        <ShareBars rows={types} max={types[0].value} />
      </div>
      <div>
        <Label meta="share of the year's lean">Midterm year</Label>
        <ShareBars rows={mid} max={mid[0].value} />
      </div>
      <div>
        <Label meta={`relative to ${years[0]}`}>Each year&rsquo;s weight</Label>
        <ShareBars rows={years.map((y) => ({ label: String(y), value: G.YEAR_WEIGHTS[y] / top }))} />
      </div>
    </div>
  );
}

export function StateTplPublic() {
  const models = statesData.map((s) => ({ ...s, tpl: calculateStateModel(s.abbr, s.name).tpl }));
  const ranked = [...models].sort((a, b) => a.tpl - b.tpl);
  const median = getMedianStateTpl();
  const closest = [...models].sort((a, b) => Math.abs(a.tpl) - Math.abs(b.tpl))[0];
  const fit = getTplFit();

  return (
    <>
      <Chapter id="overview" kicker="True Partisan Lean · States" title="A state's lean in a neutral year"
        intro={<>True Partisan Lean, or TPL, answers one question: if a typical Republican ran against a typical Democrat in a year that favored neither party, who would win this state, and by how much? It is a baseline, not a forecast: a forecast starts from it and adds the year and the candidates.</>}>
        <KeyFigures items={[
          { value: <Margin v={ranked[0].tpl} />, label: `${ranked[0].name}, the most Democratic state` },
          { value: <Margin v={ranked.at(-1)!.tpl} />, label: `${ranked.at(-1)!.name}, the most Republican state` },
          { value: <Margin v={median} />, label: "the median state" },
          { value: <Margin v={closest.tpl} />, label: `${closest.name}, the closest to even` },
        ]} />
      </Chapter>

      <Chapter id="steps" kicker="How it's built" title="Four steps"
        intro="A single election result says as much about that year's candidates and national mood as it does about the state. TPL uses many results at once and takes those things out.">
        <Steps items={[
          { title: `Collect every race since ${G.YEARS[0]}`, figure: fit.rowsUsed.toLocaleString(), figureLabel: "races in the fit",
            body: <>President, Senate, governor, U.S. House and the state legislature, including odd-year elections. A race counts only if a real Republican faced a real Democrat. Where one party had no candidate, the race is filled in from the area&rsquo;s presidential vote instead of being counted as a 100-point blowout. A state legislative seat with no contest, or not on the ballot that year, is filled in the same way and then moved by how far that chamber&rsquo;s contested seats ran from their own presidential vote, so each chamber is measured with every seat counted.</> },
          { title: "Take out what isn't about the place",
            body: <>Each result has three things removed: the national mood that year (one number for the whole country), the advantage of an incumbent on the ballot, and any unusual fundraising gap. What&rsquo;s left is how the place itself voted. A year that favored neither party is defined as one where the national vote for the U.S. House would be tied if every seat had a candidate from both parties.</> },
          { title: "Average across offices and years",
            body: <>In a presidential year the presidential race counts most, because every voter sees the same two candidates. A midterm has no such race, so the U.S. House and the state legislature, where every part of the state votes, carry most of that year. Recent years count more than older ones, and each year back counts {Math.round((G.YEAR_WEIGHTS[2024] / G.YEAR_WEIGHTS[2025]) * 100)}% as much as the year after it.</> },
          { title: "Turn down the outliers",
            body: <>A candidate who runs far from the state&rsquo;s usual result, like Joe Manchin in West Virginia or Phil Scott in Vermont, would otherwise drag the lean. Their races count for less, so the lean describes the state rather than one politician. Their personal strength shows up in <A href="/methodology/war">WAR</A> instead.</> },
        ]} />
        <WeightCharts />
      </Chapter>

      <Chapter id="validation" kicker="Track record" title="Does it do its job?"
        intro="TPL is not meant to predict a result by itself. The test is what is left of a result once the year's national mood and the candidates are accounted for. For each election we built the lean from earlier years only, supplied that year's national mood exactly, added incumbency, money and the candidates' own records, and measured how far the result still was from the total.">
        <SimpleTable align="lrrr" head={["Office", "Races", "Left over with TPL", "Left over with the last presidential result"]} rows={TPL_VALIDATION.pooled.map((p) => [
          p.office, p.n.toLocaleString(), p.tplFull.toFixed(1), p.presFull.toFixed(1),
        ])} caption={`Typical leftover in points, ${TPL_VALIDATION.years[0]} to ${TPL_VALIDATION.years.at(-1)}. Lower is better. The last column runs the same sum with the area's most recent presidential margin in place of TPL.`} />
      </Chapter>

      <Chapter id="faq" kicker="Questions" title="Reading a lean">
        <QA items={[
          { q: "Is it relative to the nation?", a: "No. It is an actual margin: R+5 means a typical Republican wins by 5 points in a neutral year. It is not a comparison with the country as a whole." },
          { q: "Why not just use the last presidential result?", a: "Presidential results move with the candidates at the top of the ticket and that year's national mood. TPL averages over many races and years with those effects removed, so it changes slowly and works for every office." },
          { q: "Does it include 2026?", a: "Yes, since November 19, on the votes counted so far. The 2026 forecast was made before the election from the lean as it stood then, and that forecast is kept as it was published." },
          { q: "Is a state's trend part of it?", a: "No. The lean is where a place stands, and it moves only as new results come in. Which way a place has been moving is shown beside it as a separate figure." },
        ]} />
        <SeeIt>Every state&rsquo;s lean, with the races behind it, is on the <A href="/model">TPL</A> tab.</SeeIt>
      </Chapter>
    </>
  );
}

export function DistrictTplPublic() {
  const ids = Object.keys(districtPresidentialData);
  const calcs = ids.map((id) => ({ id, tpl: calculateDistrictModel(id).tpl }));
  const sorted = [...calcs].sort((a, b) => a.tpl - b.tpl);
  const median = sorted[Math.floor(sorted.length / 2)].tpl;
  const within5 = calcs.filter((c) => Math.abs(c.tpl) < 5).length;
  const nameOf = (id: string) => houseData.find((r) => parseInt(r.id, 10).toString() === id)?.name ?? id;

  return (
    <>
      <Chapter id="overview" kicker="True Partisan Lean · Districts" title="A district's lean, on the 2026 lines"
        intro={<>District TPL asks the same question as the state version, for each of the <Num>{calcs.length}</Num> House districts, and it is where a House forecast starts. It is measured on the district lines in place for 2026, including in the states that have redrawn their maps.</>}>
        <KeyFigures items={[
          { value: <Margin v={sorted[0].tpl} />, label: `${nameOf(sorted[0].id)}, the most Democratic` },
          { value: <Margin v={sorted.at(-1)!.tpl} />, label: `${nameOf(sorted.at(-1)!.id)}, the most Republican` },
          { value: <Margin v={median} />, label: "the median district" },
          { value: within5, label: "districts within 5 points of even" },
        ]} />
      </Chapter>

      <Chapter id="differences" kicker="How it differs" title="Same recipe, two ingredients"
        intro="District TPL follows the same steps as the state version, so a district and its state can be compared directly. Two things are different.">
        <Steps items={[
          { title: "Only presidential and House races",
            body: "Senate, governor and state legislative results are not reported by congressional district, so a district's lean comes from the 2016, 2020 and 2024 presidential votes counted inside its 2026 lines, plus its House races since 2016, including 2026 as counted so far." },
          { title: "Old races are moved onto the new lines",
            body: "When a district has been redrawn, its old House results were cast on different ground. We can't rebuild an old race on new lines, so we shift it by how much more Republican or Democratic the new lines voted for president than the old ones." },
        ]} />
        <QA items={[
          { q: "Does the national mood count the same everywhere?", a: "Yes. One number per year is taken out of every state and district alike." },
          { q: "Does a member's own record affect it?", a: "A little: a long-serving member's own House results are part of their district's lean, the way any past result is." },
        ]} />
        <SeeIt>Each state&rsquo;s districts, with their leans, are on that state&rsquo;s page under the <A href="/model">TPL</A> tab.</SeeIt>
      </Chapter>
    </>
  );
}

export function CountyTplPublic() {
  const franklin = calculateCountyModel("39049")?.tpl ?? null;
  const ohio = calculateStateModel("OH", "Ohio").tpl;

  return (
    <>
      <Chapter id="overview" kicker="True Partisan Lean · Counties" title="The same lean, county by county"
        intro="County TPL runs the state recipe on each county's share of the same statewide races: president, Senate and governor, plus the county's House vote. Because the code is shared, a change to the state model changes every county with it. It appears on each county page and does not feed the forecast directly.">
        <KeyFigures items={[
          { value: <Margin v={franklin} />, label: "Franklin County, Ohio (Columbus)" },
          { value: <Margin v={ohio} />, label: "Ohio as a whole" },
        ]} />
      </Chapter>

      <Chapter id="differences" kicker="How it differs" title="What changes at county level">
        <QA items={[
          { q: "Statewide races", a: "The same race in every county, so the incumbent and the money are the state race's. Only the margin is the county's own." },
          { q: "House races", a: "A county often sits in more than one district, so its House vote mixes several races. No single incumbent or money gap can be taken out, and a year where one party ran no one in the county is filled in from its presidential vote." },
          { q: "Outliers", a: "A county far from its state's lean is not an outlier; it's just a different place. Only a House year that runs far from the county's own statewide results is turned down, since a popular local member can carry a county their party usually loses." },
          { q: "Does it include 2026?", a: "Yes, since November 25, on the votes counted so far in each county. Two counties whose 2026 votes are not yet published by county have no 2026 figures." },
          { q: "Missing places", a: "Alaska reports no county results, so it has no county leans." },
        ]} />
        <SeeIt>Open any county from <A href="/historical">Historical Results</A>, under Analysis.</SeeIt>
      </Chapter>
    </>
  );
}

export function LegTplPublic() {
  const ex = LEG_EXAMPLE;
  const v = STATE_LEG_TPL_VALIDATION.pooled;
  return (
    <>
      <Chapter id="overview" kicker="True Partisan Lean · Legislative districts" title="The same lean, for every state House and Senate district"
        intro="Legislative TPL runs the county recipe on each of the 6,814 state House and Senate districts as they are drawn today, with the district's own legislative race as a fifth ingredient beside president, U.S. Senate, governor and U.S. House. It is a measurement of how the district votes, not a forecast, and it is kept apart from the 2026 legislative forecast published before the election.">
        {ex && <KeyFigures items={[
          { value: <Margin v={ex.tpl} />, label: "Pennsylvania House District 151" },
          { value: <Margin v={ex.stateTpl} />, label: "Pennsylvania as a whole" },
        ]} />}
      </Chapter>

      <Chapter id="how" kicker="How it works" title="Votes on today's lines">
        <QA items={[
          { q: "Where do the votes come from?", a: "Precinct-by-precinct results for every election since 2016, each precinct placed in today's districts by where its residents live. So a race held on an older map is still measured on the district as it is drawn now. When the district's own race was held on today's map, it simply counts that race's result." },
          { q: "Statewide races", a: "For U.S. Senate and governor, the district's own margin, with the incumbent and the money of the statewide race taken out, as for a county. A race without a Democrat against a Republican is filled in from the district's presidential vote." },
          { q: "U.S. House and legislative races", a: "Often only part of a district had a Democrat against a Republican. That part counts as voted; the rest is filled in from its own presidential vote. The legislative race also has the sitting member's advantage and the money gap taken out, as a House race does." },
          { q: "Popular local candidates", a: "A legislative or House result that runs far from the district's statewide results, like a long-serving member holding a seat their party usually loses, is turned down rather than taken at face value." },
          { q: "Alaska", a: "Ranked-choice races count their final round, rebuilt from the state's ballot records." },
          { q: "Does it include 2026?", a: "Yes, for states whose 2026 results have been published precinct by precinct; others fill in as they certify." },
        ]} />
      </Chapter>

      <Chapter id="test" kicker="How well it works" title="The test">
        <p className="max-w-[65ch] text-[15px] leading-relaxed" style={{ color: "var(--app-text-primary)" }}>
          Take each legislative race, build the lean from earlier years only, add that year&apos;s national mood and the race&apos;s incumbent and money: what is left over averages <Num>{v.tplFull.toFixed(1)}</Num> points across <Num>{v.n.toLocaleString("en-US")}</Num> races, against <Num>{v.presFull.toFixed(1)}</Num> using the district&apos;s last presidential result instead. The lean comes out ahead in {v.tplBetterIn} of {v.years} years.
        </p>
        <SeeIt>Open any state&apos;s legislature from <A href="/legislatures">Chambers</A>, pick a district, and scroll to District TPL; or colour the chamber map by District TPL.</SeeIt>
      </Chapter>
    </>
  );
}

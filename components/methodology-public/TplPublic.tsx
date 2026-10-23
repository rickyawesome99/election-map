import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { TPL_VALIDATION } from "@/data/tplValidation";
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
  const years = [...G.YEARS].sort((a, b) => b - a).filter((y) => y % 2 === 0);
  const top = G.YEAR_WEIGHTS[years[0]];
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <Label meta="share of a year's lean">Each office&rsquo;s weight</Label>
        <ShareBars rows={types} max={types[0].value} />
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
  const row = (target: string, predictor: string) => TPL_VALIDATION.rows.find((r) => r.target === target && r.predictor === predictor);
  const tplName = "TPL holdout (full NM pipeline)", presName = "2020 presidential alone", rawName = "Raw, clipped ±50";

  return (
    <>
      <Chapter id="overview" kicker="True Partisan Lean · States" title="A state's lean in a neutral year"
        intro={<>True Partisan Lean, or TPL, answers one question: if a typical Republican ran against a typical Democrat in a year that favored neither party, who would win this state, and by how much? It is the starting point of every Senate and governor forecast.</>}>
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
          { title: "Collect every race since 2016", figure: fit.rowsUsed.toLocaleString(), figureLabel: "races in the fit",
            body: <>President, Senate, governor, U.S. House and the state legislature, including odd-year elections. A race counts only if a real Republican faced a real Democrat. Where one party had no candidate, the race is filled in from the area&rsquo;s presidential vote instead of being counted as a 100-point blowout.</> },
          { title: "Take out what isn't about the place",
            body: <>Each result has three things removed: the national mood that year (some states swing more with the country than others, and that is measured too), the advantage of an incumbent on the ballot, and any unusual fundraising gap. What&rsquo;s left is how the place itself voted.</> },
          { title: "Average across offices and years",
            body: <>The presidential race counts most, because every voter sees the same two candidates. Recent years count more than older ones, and each year back counts {Math.round((G.YEAR_WEIGHTS[2024] / G.YEAR_WEIGHTS[2025]) * 100)}% as much as the year after it.</> },
          { title: "Turn down the outliers",
            body: <>A candidate who runs far from the state&rsquo;s usual result, like Joe Manchin in West Virginia or Phil Scott in Vermont, would otherwise drag the lean. Their races count for less, so the lean describes the state rather than one politician. Their personal strength shows up in <A href="/methodology/war">WAR</A> instead.</> },
        ]} />
        <WeightCharts />
      </Chapter>

      <Chapter id="validation" kicker="Track record" title="How well does it predict?"
        intro="We built each state's lean from results through 2022 and compared it with the 2024 results, after allowing for the national shift between those years. The table shows the typical miss in points, next to two simpler ways of guessing.">
        <SimpleTable align="lrrr" head={["2024 result", "TPL", "2020 presidential result", "Average, nothing removed"]} rows={(["2024 President", "2024 Senate"] as const).map((t) => [
          t.replace("2024 ", ""), row(t, tplName)?.mae.toFixed(1) ?? "—", row(t, presName)?.mae.toFixed(1) ?? "—", row(t, rawName)?.mae.toFixed(1) ?? "—",
        ])} caption="Lower is better. The last presidential result is hard to beat at predicting the next one; TPL's job is to describe every office on one scale, which a single presidential result cannot do." />
      </Chapter>

      <Chapter id="faq" kicker="Questions" title="Reading a lean">
        <QA items={[
          { q: "Is it relative to the nation?", a: "No. It is an actual margin: R+5 means a typical Republican wins by 5 points in a neutral year. It is not a comparison with the country as a whole." },
          { q: "Why not just use the last presidential result?", a: "Presidential results move with the candidates at the top of the ticket and that year's national mood. TPL averages over many races and years with those effects removed, so it changes slowly and works for every office." },
          { q: "Does it include this year?", a: "No. It is built from past results only. The forecast adds 2026's conditions on top of it." },
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
        intro={<>District TPL asks the same question as the state version, for each of the <Num>{calcs.length}</Num> House districts, and it is the starting point of every House forecast. It is measured on the district lines in place for 2026, including in the states that have redrawn their maps.</>}>
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
            body: "Senate, governor and state legislative results are not reported by congressional district, so a district's lean comes from the 2016, 2020 and 2024 presidential votes counted inside its 2026 lines, plus its House races since 2016." },
          { title: "Old races are moved onto the new lines",
            body: "When a district has been redrawn, its old House results were cast on different ground. We can't rebuild an old race on new lines, so we shift it by how much more Republican or Democratic the new lines voted for president than the old ones. Races that moved a long way count for less." },
        ]} />
        <QA items={[
          { q: "Does it use the state's swing?", a: "Yes. A district moves with the national mood as much as its state does." },
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
          { q: "Missing places", a: "Alaska reports no county results, so it has no county leans." },
        ]} />
        <SeeIt>Open any county from the <A href="/historical">Historical</A> tab.</SeeIt>
      </Chapter>
    </>
  );
}

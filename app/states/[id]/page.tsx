import { notFound } from "next/navigation";
import { statesData } from "@/data/statesData";
import { electionYear } from "@/data/forecastData";
import { stateDemographics } from "@/data/demographics";
import { buildStatePage, GENERAL_ELECTION } from "@/lib/statePage";
import StateHero from "@/components/state/StateHero";
import StateExplorer from "@/components/state/StateExplorer";
import StateDemographicsSection from "@/components/StateDemographicsSection";
import StateTplTrendSection from "@/components/state/StateTplTrendSection";
import StateRedistrictingSection from "@/components/state/StateRedistrictingSection";
import { PAGE_CONTAINER } from "@/lib/pageLayout";

export async function generateStaticParams() {
  return statesData.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) return { title: "State Not Found" };
  return {
    title: `${state.name} — ${electionYear} Forecast`,
    description: `${electionYear} election forecast for ${state.name}: every race on the ballot, both legislative chambers, results since 2016, counties and demographics.`,
  };
}

/**
 * One state, top to bottom: who holds what today (hero), what is on this year's ballot beside a
 * map of it, results since 2016 as office columns that drive the same map, the counties, and the
 * demographics. Everything the sections show is computed in lib/statePage.ts on the server; the
 * explorer below is a client component only so the three sections can share the map's state.
 */
export default async function StateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) notFound();

  const data = buildStatePage(state);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StateHero name={state.name} abbr={state.abbr} tpl={data.tpl} ballotSentence={data.ballotSentence} bodies={data.bodies} />

      <main className={`${PAGE_CONTAINER} pt-2 pb-8`}>
        <StateExplorer data={data} electionYear={electionYear} generalElection={GENERAL_ELECTION} />

        {stateDemographics[state.abbr] && (
          <div className="mt-2">
            <StateDemographicsSection stateName={state.name} demographics={stateDemographics[state.abbr]} />
          </div>
        )}

        <StateTplTrendSection abbr={state.abbr} tpl={data.tpl} yearAggregations={data.tplTrend} />
        <StateRedistrictingSection stateAbbr={state.abbr} stateFips={data.stateFips} stateName={state.name} years={data.redistricting} />
      </main>
    </div>
  );
}

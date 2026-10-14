import { notFound } from "next/navigation";
import { statesData } from "@/data/statesData";
import { UNICAMERAL_STATES } from "@/data/stateLegDistricts";
import LegislatureRedirect from "@/components/atlas/LegislatureRedirect";

export async function generateStaticParams() {
  return statesData.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) return { title: "State Not Found" };
  return { title: `${state.name} State Legislature`, robots: { index: false } };
}

/**
 * The legislature overview folded into the state page (its chamber blocks, history and map live
 * there now). This route only forwards: old #house / #senate links to the chamber explorer, every
 * other visit to the state page's legislature anchor. Client-side, because the hash never reaches
 * the server.
 */
export default async function StateLegislaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) notFound();
  const chambers = UNICAMERAL_STATES.has(state.abbr) ? ["senate"] : ["house", "senate"];
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <LegislatureRedirect stateId={state.id} chambers={chambers} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-sm" style={{ color: "var(--app-text-muted)" }}>
        The {state.name} legislature now lives on the <a href={`/states/${state.id}#legislature`} className="underline">state page</a>.
      </div>
    </div>
  );
}

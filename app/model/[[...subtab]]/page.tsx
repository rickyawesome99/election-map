import { notFound } from "next/navigation";
import ForecastMap from "@/components/ForecastMap";
import { buildModelSummary, defaultModelSelection, districtModelSlice, stateModelSlice } from "@/lib/modelSlices";

const SUB_TABS = ["state", "district", "table", "districtTable", "war"] as const;
type ModelSubTab = (typeof SUB_TABS)[number];

export function generateStaticParams() {
  return [{ subtab: [] }, ...SUB_TABS.map((s) => ({ subtab: [s] }))];
}

function parseSubTab(segments: string[] | undefined): ModelSubTab | undefined {
  if (!segments || segments.length === 0) return undefined;
  if (segments.length > 1) notFound();
  const [segment] = segments;
  if (!SUB_TABS.includes(segment as ModelSubTab)) notFound();
  return segment as ModelSubTab;
}

export default async function ModelPage({ params }: { params: Promise<{ subtab?: string[] }> }) {
  const { subtab } = await params;
  const { abbr, districtId } = defaultModelSelection();
  const model = {
    summary: buildModelSummary(),
    initialState: { abbr, calc: stateModelSlice(abbr)! },
    initialDistrict: { id: districtId, calc: districtModelSlice(districtId)! },
  };
  return <ForecastMap activeTab="model" modelSubTab={parseSubTab(subtab)} model={model} />;
}

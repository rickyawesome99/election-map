import { notFound } from "next/navigation";
import ForecastMap from "@/components/ForecastMap";

const SUB_TABS = ["state", "district", "table", "districtTable"] as const;
type ModelSubTab = (typeof SUB_TABS)[number];

function parseSubTab(segments: string[] | undefined): ModelSubTab | undefined {
  if (!segments || segments.length === 0) return undefined;
  if (segments.length > 1) notFound();
  const [segment] = segments;
  if (!SUB_TABS.includes(segment as ModelSubTab)) notFound();
  return segment as ModelSubTab;
}

export default async function ModelPage({ params }: { params: Promise<{ subtab?: string[] }> }) {
  const { subtab } = await params;
  return <ForecastMap activeTab="model" modelSubTab={parseSubTab(subtab)} />;
}

import { notFound } from "next/navigation";
import { TplStatePage } from "@/components/tpl/TplStatePage";
import { fmtMargin } from "@/lib/colorScale";
import { districtModelSlice, modelStateParams, stateModelSlice } from "@/lib/modelSlices";

// One prerendered page per state (/model/states/oh). The state's full pipeline and its first
// district's calculation are rendered in; the other districts are fetched from
// /api/model/district/[id] as the reader picks them.
export const dynamicParams = false;

export function generateStaticParams() {
  return modelStateParams();
}

export async function generateMetadata({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params;
  const data = stateModelSlice(abbr);
  if (!data) return { title: "State not found" };
  return {
    title: `${data.name} — True Partisan Lean ${fmtMargin(data.tpl)}`,
    description: `${data.name}'s True Partisan Lean, built from ${data.races.length} races since ${data.fitYears[0]}: the year × office matrix, every race behind it, its ${data.districts.length} districts and its candidates.`,
  };
}

export default async function ModelStatePage({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params;
  const data = stateModelSlice(abbr);
  if (!data) notFound();
  const initialDistrict = data.districts[0] ? districtModelSlice(data.districts[0].id) : null;
  return <TplStatePage data={data} initialDistrict={initialDistrict} />;
}

import { redirect } from "next/navigation";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { statesData } from "@/data/statesData";

// The old District sub-tab URL (/model/district?modelDistrict=3909) forwards to that district
// inside its state's page.
export default async function LegacyModelDistrict({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const d = q.modelDistrict ? districtPresidentialData[q.modelDistrict] : undefined;
  const state = d && statesData.find((s) => s.abbr === d.state);
  redirect(d && state ? `/model/${state.id}#${d.code.toLowerCase()}` : "/model#districts");
}

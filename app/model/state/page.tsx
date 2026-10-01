import { redirect } from "next/navigation";
import { statesData } from "@/data/statesData";

// The old State sub-tab URL (/model/state?modelState=OH) forwards to that state's page.
export default async function LegacyModelState({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const state = statesData.find((s) => s.abbr === (q.modelState ?? "").toUpperCase());
  redirect(state ? `/model/${state.id}` : "/model");
}

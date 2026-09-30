import { notFound, redirect } from "next/navigation";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { statesData } from "@/data/statesData";

// The five old sub-tab URLs (/model/state?modelState=OH, /model/district?modelDistrict=3909,
// /model/table, /model/districtTable, /model/war) forward to their places in the new layout.
// Anything else under /model that is not a real page is a 404.
export default async function LegacyModelRoute({ params, searchParams }: { params: Promise<{ legacy: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { legacy } = await params;
  const q = await searchParams;
  switch (legacy) {
    case "state": {
      const state = statesData.find((s) => s.abbr === (q.modelState ?? "").toUpperCase());
      redirect(state ? `/model/states/${state.id}` : "/model/states");
    }
    case "district": {
      const d = q.modelDistrict ? districtPresidentialData[q.modelDistrict] : undefined;
      const state = d && statesData.find((s) => s.abbr === d.state);
      redirect(d && state ? `/model/states/${state.id}#${d.code.toLowerCase()}` : "/model#districts");
    }
    case "table": redirect("/model");
    case "districtTable": redirect("/model#districts");
    case "war": redirect("/model/candidates");
    default: notFound();
  }
}

import { redirect } from "next/navigation";

// Legacy `/?tab=...` links (and bare `/`) redirect to the equivalent real path.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tab = params.tab;

  if (tab === "house" || tab === "senate" || tab === "governor") redirect(`/${tab}`);
  if (tab === "forecast" || tab === "map") {
    redirect("/senate");
  }
  if (tab === "states") redirect("/analysis/delegation");
  if (tab === "counties") redirect("/historical");
  if (tab === "district-finder") redirect("/district-finder");
  if (tab === "model" || tab === "table") redirect("/model");
  if (tab === "districtTable") redirect("/model#districts");
  if (tab === "state" || tab === "district") {
    // The old sub-tab shims (app/model/state, app/model/district) resolve the state or district id to its new page.
    const qs = new URLSearchParams();
    if (params.modelState) qs.set("modelState", params.modelState);
    if (params.modelDistrict) qs.set("modelDistrict", params.modelDistrict);
    const query = qs.toString();
    redirect(query ? `/model/${tab}?${query}` : "/model");
  }

  redirect("/overview");
}

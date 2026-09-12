import type { Demographics } from "@/data/demographics";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span style={{ color: "var(--app-text-primary)" }}>
      <b className="font-bold">{value}</b> {label}
    </span>
  );
}

/**
 * The inline demographic summary shared by county, district and state pages. Takes the same
 * shape everywhere (data/demographics.ts's Demographics, which data/countyDemographics.ts's
 * CountyDemographics is a subset of) and simply omits any figure its source does not carry -
 * counties have no population field, so they render one stat fewer.
 */
export default function DemographicsStrip({
  population,
  collegePct,
  whitePct,
  blackPct,
  hispanicPct,
  asianPct,
  medianHouseholdIncome,
}: Demographics) {
  const stats: { label: string; value: string }[] = [];
  if (population != null) stats.push({ label: "population", value: population.toLocaleString() });
  if (collegePct != null) stats.push({ label: "college", value: `${collegePct.toFixed(1)}%` });
  if (whitePct != null) stats.push({ label: "white", value: `${whitePct.toFixed(1)}%` });
  if (blackPct != null) stats.push({ label: "Black", value: `${blackPct.toFixed(1)}%` });
  if (hispanicPct != null) stats.push({ label: "Hispanic", value: `${hispanicPct.toFixed(1)}%` });
  if (asianPct != null) stats.push({ label: "Asian", value: `${asianPct.toFixed(1)}%` });
  if (medianHouseholdIncome != null) stats.push({ label: "median income", value: `$${medianHouseholdIncome.toLocaleString()}` });

  if (stats.length === 0) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm">
      {stats.map((s) => (
        <Stat key={s.label} value={s.value} label={s.label} />
      ))}
    </div>
  );
}

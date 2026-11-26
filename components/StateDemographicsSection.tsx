import { nationalDemographics, stateDemographics, type Demographics } from "@/data/demographics";
import { statesData } from "@/data/statesData";
import DemographicStrips, { type DemographicMeasure } from "@/components/state/DemographicStrips";

const MEASURES: { key: keyof Demographics; label: string; kind: DemographicMeasure["kind"] }[] = [
  { key: "population", label: "Population", kind: "count" },
  { key: "medianHouseholdIncome", label: "Median household income", kind: "usd" },
  { key: "collegePct", label: "Bachelor's degree or higher", kind: "pct" },
  { key: "whitePct", label: "White (non-Hispanic)", kind: "pct" },
  { key: "blackPct", label: "Black (non-Hispanic)", kind: "pct" },
  { key: "hispanicPct", label: "Hispanic (any race)", kind: "pct" },
  { key: "asianPct", label: "Asian (non-Hispanic)", kind: "pct" },
];

const NAME = new Map(statesData.map((s) => [s.abbr, s.name]));

/**
 * A state's demographics read against the country's, on the same ACS vintage. The gap is the
 * point of the section — "34% college" says much less than "34% college, 1.6 points below the
 * national share" — so each measure is a strip of every state with the U.S. marked, this state's
 * dot, its gap to the U.S. and its rank (DemographicStrips). The 51 values per measure are worked
 * out here so the client never loads the demographics file.
 */
export default function StateDemographicsSection({ abbr, stateName, demographics }: { abbr: string; stateName: string; demographics: Demographics }) {
  const measures: DemographicMeasure[] = MEASURES.flatMap(({ key, label, kind }) => {
    const value = demographics[key];
    const national = nationalDemographics[key];
    if (value == null || national == null) return [];
    const all = Object.entries(stateDemographics).flatMap(([a, d]) => (d[key] == null ? [] : [{ abbr: a, name: NAME.get(a) ?? (a === "DC" ? "D.C." : a), v: d[key] as number }]));
    return [{ key, label, kind, value: value as number, national: national as number, all }];
  });
  if (measures.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-1" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Demographics</h2>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          ACS 2020–24 5-year estimates
        </span>
      </div>
      <DemographicStrips abbr={abbr} stateName={stateName} measures={measures} />
    </section>
  );
}

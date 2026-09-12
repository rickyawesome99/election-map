import { nationalDemographics, type Demographics } from "@/data/demographics";

type Row = {
  label: string;
  value: number | undefined;
  national: number | undefined;
  format: (n: number) => string;
  diff: (n: number) => string;
};

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function dollars(n: number) {
  return `$${n.toLocaleString()}`;
}

function signed(n: number, render: (abs: number) => string) {
  // A true minus sign, not a hyphen, so the column lines up under tabular-nums.
  return `${n < 0 ? "−" : "+"}${render(Math.abs(n))}`;
}

/**
 * A state's demographics read against the country's, on the same ACS vintage. The gap is the
 * point of the section — "34% college" says much less than "34% college, 1.6 points below the
 * national share" — so every measure carries its national counterpart and the difference.
 */
export default function StateDemographicsSection({
  stateName,
  demographics,
}: {
  stateName: string;
  demographics: Demographics;
}) {
  const allRows: Row[] = [
    { label: "Bachelor's degree or higher", value: demographics.collegePct, national: nationalDemographics.collegePct, format: pct, diff: (n) => signed(n, (a) => `${a.toFixed(1)} pts`) },
    { label: "White (non-Hispanic)", value: demographics.whitePct, national: nationalDemographics.whitePct, format: pct, diff: (n) => signed(n, (a) => `${a.toFixed(1)} pts`) },
    { label: "Black (non-Hispanic)", value: demographics.blackPct, national: nationalDemographics.blackPct, format: pct, diff: (n) => signed(n, (a) => `${a.toFixed(1)} pts`) },
    { label: "Hispanic (any race)", value: demographics.hispanicPct, national: nationalDemographics.hispanicPct, format: pct, diff: (n) => signed(n, (a) => `${a.toFixed(1)} pts`) },
    { label: "Asian (non-Hispanic)", value: demographics.asianPct, national: nationalDemographics.asianPct, format: pct, diff: (n) => signed(n, (a) => `${a.toFixed(1)} pts`) },
    { label: "Median household income", value: demographics.medianHouseholdIncome, national: nationalDemographics.medianHouseholdIncome, format: dollars, diff: (n) => signed(n, dollars) },
  ];
  const rows = allRows.filter((row) => row.value != null);

  if (rows.length === 0) return null;

  return (
    <section className="mt-8">
      <div
        className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-1"
        style={{ borderBottom: "2px solid var(--app-text-primary)" }}
      >
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
          Demographics
        </h2>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          American Community Survey 2020–24 5-year estimates
          {demographics.population != null && ` · ${demographics.population.toLocaleString()} residents`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] md:text-sm">
          <thead>
            <tr>
              <th className="pb-2 pr-2 md:pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                Measure
              </th>
              <th className="pb-2 pr-2 md:pr-3 text-right text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                {stateName}
              </th>
              <th className="pb-2 pr-2 md:pr-3 text-right text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                U.S.
              </th>
              <th className="pb-2 text-right text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                vs. U.S.
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="py-2 pr-2 md:py-3 md:pr-3 text-left font-semibold" style={{ color: "var(--app-text-primary)" }}>
                  {row.label}
                </td>
                <td className="py-2 pr-2 md:py-3 md:pr-3 text-right font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                  {row.format(row.value!)}
                </td>
                <td className="py-2 pr-2 md:py-3 md:pr-3 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  {row.national != null ? row.format(row.national) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  {row.national != null ? row.diff(row.value! - row.national) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

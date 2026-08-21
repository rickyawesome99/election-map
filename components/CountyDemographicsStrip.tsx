function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span style={{ color: "var(--app-text-primary)" }}>
      <b className="font-bold">{value}</b> {label}
    </span>
  );
}

export default function CountyDemographicsStrip({
  collegePct,
  whitePct,
  blackPct,
  hispanicPct,
  asianPct,
  medianHouseholdIncome,
}: {
  collegePct?: number;
  whitePct?: number;
  blackPct?: number;
  hispanicPct?: number;
  asianPct?: number;
  medianHouseholdIncome?: number;
}) {
  const stats: { label: string; value: string }[] = [];
  if (collegePct != null) stats.push({ label: "college", value: `${collegePct.toFixed(1)}%` });
  if (whitePct != null) stats.push({ label: "white", value: `${whitePct.toFixed(1)}%` });
  if (blackPct != null) stats.push({ label: "Black", value: `${blackPct.toFixed(1)}%` });
  if (hispanicPct != null) stats.push({ label: "Hispanic", value: `${hispanicPct.toFixed(1)}%` });
  if (asianPct != null) stats.push({ label: "Asian", value: `${asianPct.toFixed(1)}%` });
  if (medianHouseholdIncome != null) stats.push({ label: "median income", value: `$${medianHouseholdIncome.toLocaleString()}` });

  if (stats.length === 0) return null;

  return (
    <section
      className="rounded-xl mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <span className="text-[10px] uppercase tracking-wider font-semibold shrink-0" style={{ color: "var(--app-text-muted)" }}>
        Demographics
      </span>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm">
        {stats.map((s) => (
          <Stat key={s.label} value={s.value} label={s.label} />
        ))}
      </div>
    </section>
  );
}

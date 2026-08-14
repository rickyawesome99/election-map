import { calculateCountyModel } from "@/lib/tplCompute";

const RACE_TYPE_LABELS: Record<string, string> = { P: "President", S: "Senate", G: "Governor", H: "House" };

function fmtMargin(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.05) return "EVEN";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`;
}

function marginColor(v: number | null): string {
  if (v == null) return "var(--app-text-very-muted)";
  if (Math.abs(v) < 0.05) return "var(--app-text-primary)";
  return v > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

export default function CountyTplCard({
  fips,
  countyLabel,
  stateAbbr,
  stateName,
}: {
  fips: string;
  countyLabel: string;
  stateAbbr: string;
  stateName: string;
}) {
  const calc = calculateCountyModel(fips);

  // Alaska (all counties) and HI's Kalawao County have no county-level election data at
  // any geography — race stubs still get generated from the parent state's race list, but
  // every rawMargin/NM comes back null. Treat that the same as "no races at all" rather
  // than showing a fabricated EVEN TPL.
  if (!calc || calc.races.every((r) => r.NM == null)) {
    return (
      <section className="rounded-xl p-3" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
        <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--app-text-muted)" }}>
          County TPL
        </h2>
        <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          Not enough countywide election history to compute a True Partisan Lean for {countyLabel}.
        </p>
      </section>
    );
  }

  const { races, yearAggregations, tpl } = calc;
  const hasBlend = races.some((r) => r.competitivenessAdjusted && !r.blanketApplied);
  const hasBlanket = races.some((r) => r.blanketApplied);

  return (
    <section className="rounded-xl overflow-hidden" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
      <div className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div>
          <h2 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
            County TPL
          </h2>
          <p className="mt-0.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
            Neutralized Margin averaged across President, Senate, Governor &amp; House
          </p>
        </div>
        <span className="text-xl font-bold tabular-nums" style={{ color: marginColor(tpl) }}>
          {fmtMargin(tpl)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
              {["Race", "Year", "Raw", "Adjusted", "IF", "CQ", "WA", "NM"].map((label) => (
                <th
                  key={label}
                  className="px-2 py-1.5 text-left text-[9px] uppercase tracking-wider font-semibold whitespace-nowrap"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {races.map((r, i) => (
              <tr
                key={`${r.raceType}-${r.year}-${i}`}
                style={{ background: i % 2 === 0 ? "transparent" : "var(--app-bg)", opacity: r.inAggregation ? 1 : 0.75 }}
              >
                <td className="px-2 py-1.5 whitespace-nowrap font-semibold" style={{ color: "var(--app-text-primary)" }}>
                  <span
                    className="mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                    style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
                  >
                    {r.raceType}
                  </span>
                  {RACE_TYPE_LABELS[r.raceType] ?? r.race}
                </td>
                <td className="px-2 py-1.5 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  {r.year}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>
                  {fmtMargin(r.rawMargin)}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: marginColor(r.adjustedMargin) }}>
                  {fmtMargin(r.adjustedMargin)}
                  {r.blanketApplied && <span className="ml-0.5" style={{ color: "var(--app-text-very-muted)" }}>§</span>}
                  {r.competitivenessAdjusted && !r.blanketApplied && (
                    <span className="ml-0.5" style={{ color: "var(--app-text-very-muted)" }}>‡</span>
                  )}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-mono" style={{ color: r.IF !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                  {r.IF.toFixed(3)}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-mono" style={{ color: r.CQ !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                  {r.CQ.toFixed(3)}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                  {r.WA !== 0 ? `${r.WA > 0 ? "+" : ""}${r.WA.toFixed(2)}` : "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-bold" style={{ color: marginColor(r.NM) }}>
                  {fmtMargin(r.NM)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="px-3 py-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[9px]"
        style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}
      >
        {hasBlend && <span>‡ Raw margin ≥ 50 pts, blended 60% prior contested / 40% presidential.</span>}
        {hasBlanket && <span>§ Blanket ×0.8 applied (no valid prior data).</span>}
        <span>House rows are countywide district aggregates — no single incumbent, so IF/CQ default to neutral.</span>
      </div>

      <div className="px-3 py-2.5" style={{ borderTop: "1px solid var(--app-border)" }}>
        <h3 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
          Year-Level Aggregation
        </h3>
        <p className="mt-0.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
          Race type weights redistributed among types present each year. WRS = weighted average NM.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
              {(["Year", "President", "Governor", "Senate", "House", "WRS"] as const).map((label) => (
                <th
                  key={label}
                  className={`px-2 py-1.5 text-[9px] uppercase tracking-wider font-semibold whitespace-nowrap ${label === "Year" ? "text-left" : "text-right"}`}
                  style={{ color: label === "WRS" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yearAggregations.map((agg, i) => (
              <tr key={agg.year} style={{ background: i % 2 === 0 ? "transparent" : "var(--app-bg)" }}>
                <td className="px-2 py-1.5 font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                  {agg.year}
                </td>
                {(["P", "G", "S", "H"] as const).map((type) => {
                  const val = agg.typeNMs[type] ?? null;
                  const wt = agg.redistributedWeights[type];
                  return (
                    <td key={type} className="px-2 py-1.5 text-right tabular-nums">
                      <div className="font-semibold" style={{ color: marginColor(val) }}>{fmtMargin(val)}</div>
                      {wt != null && (
                        <div className="text-[9px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>
                          {(wt * 100).toFixed(0)}%
                        </div>
                      )}
                    </td>
                  );
                })}
                <td
                  className="px-2 py-1.5 text-right tabular-nums font-bold"
                  style={{ color: agg.racesPresent.length > 0 ? marginColor(agg.WRS) : "var(--app-text-very-muted)" }}
                >
                  {agg.racesPresent.length > 0 ? fmtMargin(agg.WRS) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 text-[10px]" style={{ borderTop: "1px solid var(--app-border)" }}>
        <a
          href={`/model/state?modelState=${stateAbbr}`}
          className="font-semibold hover:underline"
          style={{ color: "var(--app-text-muted)" }}
        >
          Uses the same methodology as {stateName}&apos;s State TPL →
        </a>
      </div>
    </section>
  );
}

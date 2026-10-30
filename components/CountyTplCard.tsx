import Link from "next/link";
import { calculateCountyModel, type ComputedRace } from "@/lib/tplCompute";
import { countyHouseData } from "@/data/countyHouseData";
import { pastHrefOf } from "@/lib/modelSlices";
import { pastElectionHref } from "@/lib/pastElections";
import { fmtMargin, marginColor, fmtLean, leanColor } from "@/lib/colorScale";

const RACE_TYPE_LABELS: Record<string, string> = { P: "President", S: "Senate", G: "Governor", H: "House" };

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
      <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
        Not enough countywide election history to compute a True Partisan Lean for {countyLabel}.
      </p>
    );
  }

  const { races, yearAggregations } = calc;
  // Each row links to that year's race page. A House row is a countywide aggregate, so it links
  // only when one district covered the whole county that year; statewide rows fall back to the
  // seat page when the year has no race page.
  const rowHref = (r: ComputedRace): string | undefined => {
    if (r.raceType !== "H") return pastHrefOf(stateAbbr, r) ?? r.detailHref;
    const districts = countyHouseData[fips]?.years[r.year]?.districts;
    if (districts?.length !== 1) return undefined;
    return pastElectionHref("house", `${stateAbbr}-${String(districts[0]).padStart(2, "0")}`, r.year);
  };
  const hasImputed = races.some((r) => r.imputed);

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: "var(--app-text-very-muted)" }}>
        Neutralized Margin averaged across President, Senate, Governor &amp; House
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
              {["Race", "Year", "Raw", "Adjusted", "IF", "Env", "NM"].map((label) => (
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
            {races.map((r, i) => {
              // "Senate Special" keeps its own name — a state can have a regular and a
              // special Senate race in the SAME year (GA 2020, MN/MS 2018, OK 2022,
              // NE 2024), and the type label alone would render them as twin rows.
              const raceLabel = r.race === "Senate Special" ? "Senate Special" : (RACE_TYPE_LABELS[r.raceType] ?? r.race);
              const href = rowHref(r);
              return (
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
                  {href ? (
                    <Link prefetch={false} href={href} className="hover:underline">
                      {raceLabel}
                    </Link>
                  ) : (
                    raceLabel
                  )}
                </td>
                <td className="px-2 py-1.5 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  {r.year}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>
                  {fmtMargin(r.rawMargin)}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: leanColor(r.adjustedMargin) }}>
                  {fmtLean(r.adjustedMargin)}
                  {r.imputed && <span className="ml-0.5" style={{ color: "var(--app-text-very-muted)" }}>⊘</span>}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-semibold" style={{ color: r.incumbencyPts != null && r.incumbencyPts !== 0 ? leanColor(r.incumbencyPts) : "var(--app-text-very-muted)" }}>
                  {r.incumbencyPts != null && r.incumbencyPts !== 0 ? `${r.incumbencyPts > 0 ? "+" : ""}${r.incumbencyPts.toFixed(0)}` : "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                  {r.envPts != null && r.envPts !== 0 ? `${r.envPts > 0 ? "+" : ""}${r.envPts.toFixed(2)}` : "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums font-bold" style={{ color: leanColor(r.NM) }}>
                  {fmtLean(r.NM)}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[9px]"
        style={{ color: "var(--app-text-very-muted)" }}
      >
        {hasImputed && <span>⊘ Ineligible race (missing major-party nominee or same-party general) — imputed from the county&apos;s nearest presidential result, half weight.</span>}
        <span>House rows are countywide district aggregates — no single incumbent, so no incumbency strip. Env = −β* × E(year) using the parent state&apos;s elasticity.</span>
      </div>

      <div className="mt-6">
        <h3 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
          Year-Level Aggregation
        </h3>
        <p className="mt-0.5 mb-3 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
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
            {yearAggregations.filter((a) => a.racesPresent.length > 0).map((agg, i) => (
              <tr key={agg.year} style={{ background: i % 2 === 0 ? "transparent" : "var(--app-bg)" }}>
                <td className="px-2 py-1.5 font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                  {agg.year}
                </td>
                {(["P", "G", "S", "H"] as const).map((type) => {
                  const val = agg.typeNMs[type] ?? null;
                  const wt = agg.redistributedWeights[type];
                  return (
                    <td key={type} className="px-2 py-1.5 text-right tabular-nums">
                      <div className="font-semibold" style={{ color: leanColor(val) }}>{fmtLean(val)}</div>
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
                  style={{ color: agg.racesPresent.length > 0 ? leanColor(agg.WRS) : "var(--app-text-very-muted)" }}
                >
                  {agg.racesPresent.length > 0 ? fmtLean(agg.WRS) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-[10px]">
        <Link prefetch={false}
          href={`/model/${stateAbbr.toLowerCase()}`}
          className="font-semibold hover:underline"
          style={{ color: "var(--app-text-muted)" }}
        >
          Uses the same methodology as {stateName}&apos;s State TPL →
        </Link>
      </div>
    </div>
  );
}

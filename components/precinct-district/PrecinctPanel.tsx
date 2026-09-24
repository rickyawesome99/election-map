"use client";

// The selected-unit panel: everything about one precinct (or one subdivision) in one place —
// its results in every year and race, turnout by year, demographics, and where it came from on
// the older precinct lines. When nothing is selected it summarizes the current view.

import type { PrecinctDistrictData, DemographicRow, YearResults } from "@/lib/precinctDistrict/types";
import { marginOf } from "@/lib/precinctDistrict/aggregate";
import { fmtInt, fmtPct1, fmtMargin, marginColorVar, type ExplorerRow, type Level } from "@/lib/precinctDistrict/explorer";
import { DEMO_METRICS, popWeightedMetric } from "@/lib/precinctDistrict/demographics";

export default function PrecinctPanel({
  data, unitId, level, rowFor, rowsByYearFor, activeYear, activeOffice, onClear, subdivisionName,
}: {
  data: PrecinctDistrictData;
  unitId: string | null;
  level: Level;
  /** the unit's row for a year on the current universe (crosswalked when needed) */
  rowFor: (year: number, id: string) => ExplorerRow | undefined;
  /** all rows on screen for a year (used for the "nothing selected" summary) */
  rowsByYearFor: (year: number) => ExplorerRow[];
  activeYear: number;
  activeOffice: string;
  onClear: () => void;
  subdivisionName: (id: string) => string;
}) {
  const years = [...data.config.years].sort((a, b) => b - a);
  const has = (o: string) => years.some((y) => data.results.years[String(y)]?.offices[o]);
  // One column per ticket position; "Top" resolves to President or Governor per year.
  const gridColumns: { key: string; label: string; resolve: (yr: YearResults) => string | null }[] = [
    ...(has("sthouse") ? [{ key: "sthouse", label: "St. Rep", resolve: (yr: YearResults) => (yr.offices.sthouse ? "sthouse" : null) }] : []),
    ...(has("stsen") ? [{ key: "stsen", label: "St. Sen", resolve: (yr: YearResults) => (yr.offices.stsen ? "stsen" : null) }] : []),
    { key: "top", label: "Top", resolve: (yr: YearResults) => (yr.offices.pres ? "pres" : yr.offices.gov ? "gov" : null) },
    ...(has("ussen") ? [{ key: "ussen", label: "Senate", resolve: (yr: YearResults) => (yr.offices.ussen ? "ussen" : null) }] : []),
    ...(has("ushouse") ? [{ key: "ushouse", label: "House", resolve: (yr: YearResults) => (yr.offices.ushouse ? "ushouse" : null) }] : []),
  ];

  const title = unitId == null ? "District" : level === "subdivision" ? subdivisionName(unitId) : unitId;
  const subtitle = unitId == null
    ? `${data.config.shortName} · all precincts`
    : level === "subdivision" ? "Subdivision · exact totals" : subdivisionName(rowFor(activeYear, unitId)?.sub ?? "");

  // demographics for the unit (current era only)
  const demo: DemographicRow[] = unitId == null
    ? Object.values(data.demographics.precincts)
    : level === "subdivision"
      ? rowsByYearFor(Math.max(...years)).filter((r) => r.sub === unitId).map((r) => data.demographics.precincts[r.id]).filter(Boolean)
      : [data.demographics.precincts[unitId]].filter(Boolean);

  const composition = unitId && level === "precinct"
    ? Object.values(data.crosswalk.eras)[0]?.composition[unitId] ?? null
    : null;
  const oldEra = data.config.eras.find((e) => !e.current);

  const active = unitId != null ? rowFor(activeYear, unitId) : null;

  return (
    <div className="text-[12.5px]" style={{ color: "var(--app-text-primary)" }}>
      <div className="flex items-start justify-between gap-2 pb-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold uppercase tracking-[0.04em]">{title}</div>
          <div className="truncate text-[11px]" style={{ color: "var(--app-text-muted)" }}>{subtitle}</div>
        </div>
        {unitId != null && (
          <button onClick={onClear} className="shrink-0 text-[11px] font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>Clear ✕</button>
        )}
      </div>

      {active && (
        <div className="grid grid-cols-3 gap-2 py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <Stat label={`${activeYear} ballots`} value={fmtInt(active.ballots)} />
          <Stat label="Registered" value={fmtInt(active.reg)} />
          <Stat label="Turnout" value={active.reg > 0 ? fmtPct1((active.ballots / active.reg) * 100) : "—"} />
        </div>
      )}

      {/* Results grid: years × offices */}
      <div className="py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
          Margin by year{unitId == null ? " · district" : ""}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="pb-1 text-left font-semibold" style={{ color: "var(--app-text-very-muted)" }}></th>
                {gridColumns.map((c) => (
                  <th key={c.key} className="pb-1 text-right font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const yr = data.results.years[String(y)];
                const row = unitId == null ? null : rowFor(y, unitId);
                const all = unitId == null ? rowsByYearFor(y) : null;
                return (
                  <tr key={y} style={{ background: y === activeYear ? "var(--app-tab-bg)" : undefined }}>
                    <td className="py-0.5 pr-2 font-semibold tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                      {y}{row?.estimated ? <span className="ml-0.5" style={{ color: "var(--app-text-very-muted)" }}>≈</span> : ""}
                    </td>
                    {gridColumns.map((c) => {
                      const key = c.resolve(yr);
                      let m: number | null = null;
                      if (key) {
                        if (row) m = row.races[key] ? marginOf(row.races[key]) : null;
                        else if (all) {
                          let d = 0, r = 0;
                          for (const p of all) { const v = p.races[key]; if (v) { d += v.d; r += v.r; } }
                          m = d + r > 0 ? ((r - d) / (d + r)) * 100 : null;
                        }
                      }
                      const isActive = y === activeYear && key === activeOffice;
                      return (
                        <td key={c.key} className="py-0.5 text-right tabular-nums" style={{ color: marginColorVar(m), fontWeight: isActive ? 700 : 500 }}>
                          {m == null ? <span style={{ color: "var(--app-text-very-muted)" }}>—</span> : fmtMargin(m)}
                          {key === "gov" ? <span className="ml-0.5 text-[9px]" style={{ color: "var(--app-text-very-muted)" }}>G</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
          Top = President, or Governor (G) in midterms. ≈ estimated on {data.config.eras.find((e) => e.current)?.label}.
        </div>
      </div>

      {/* Turnout by year */}
      <div className="py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Turnout</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] tabular-nums">
          {years.map((y) => {
            const row = unitId == null ? null : rowFor(y, unitId);
            const all = unitId == null ? rowsByYearFor(y) : null;
            const ballots = row ? row.ballots : all ? all.reduce((s, p) => s + p.ballots, 0) : 0;
            const reg = row ? row.reg : all ? all.reduce((s, p) => s + p.reg, 0) : 0;
            return (
              <span key={y}><span style={{ color: "var(--app-text-muted)" }}>{y}</span> <b>{reg > 0 ? `${((ballots / reg) * 100).toFixed(0)}%` : "—"}</b></span>
            );
          })}
        </div>
      </div>

      {/* Demographics */}
      {demo.length > 0 && (
        <div className="py-2.5" style={{ borderBottom: composition ? "1px solid var(--app-border)" : undefined }}>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
            Demographics {demo.length > 1 ? "· population-weighted" : ""}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
            <span><span style={{ color: "var(--app-text-muted)" }}>Population</span> <b className="tabular-nums">{fmtInt(demo.reduce((s, d) => s + (d.total_pop ?? 0), 0))}</b></span>
            {DEMO_METRICS.filter((m) => ["pct_white", "pct_black", "pct_hispanic", "pct_65plus", "pct_under35", "pct_college", "med_income", "avg_age"].includes(m.key)).map((m) => {
              const v = popWeightedMetric(demo, m);
              return <span key={m.key}><span style={{ color: "var(--app-text-muted)" }}>{m.label}</span> <b className="tabular-nums">{v == null ? "—" : m.format(v)}</b></span>;
            })}
          </div>
        </div>
      )}

      {composition && oldEra && (
        <div className="py-2.5">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>On {oldEra.label}</div>
          <div className="text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
            This precinct&apos;s 2020 population was in{" "}
            {composition.slice(0, 4).map(([old, share], i) => (
              <span key={old}>{i > 0 ? ", " : ""}<b style={{ color: "var(--app-text-primary)" }}>{old}</b> ({Math.round(share * 100)}%)</span>
            ))}
            {composition.length > 4 ? ` and ${composition.length - 4} more` : ""}.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[14px] font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{label}</div>
    </div>
  );
}


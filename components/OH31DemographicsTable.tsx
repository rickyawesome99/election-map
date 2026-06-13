"use client";

import { useEffect, useState } from "react";

type DemoPrecinct = {
  PRECNAME: string;
  total_pop: number;
  age_under18: number;
  age_18_34: number;
  age_35_64: number;
  age_65plus: number;
  pct_white: number | null;
  pct_black: number | null;
  pct_hispanic: number | null;
  pct_asian: number | null;
  pct_native: number | null;
  pct_multi: number | null;
  med_hh_income: number | null;
  pct_bachelors_plus: number | null;
  pct_no_hs_diploma: number | null;
  pct_some_college: number | null;
};

type SortKey =
  | "precinct" | "total_pop"
  | "pct_white" | "pct_black" | "pct_hispanic" | "pct_asian"
  | "pct_65plus" | "pct_under18" | "pct_18_34" | "pct_35_64"
  | "med_hh_income" | "pct_bachelors_plus" | "pct_no_hs_diploma" | "pct_some_college";

type SortDir = "asc" | "desc";

function getValue(p: DemoPrecinct, key: SortKey): number | string {
  switch (key) {
    case "precinct":          return p.PRECNAME;
    case "total_pop":         return p.total_pop ?? 0;
    case "pct_white":         return p.pct_white ?? -1;
    case "pct_black":         return p.pct_black ?? -1;
    case "pct_hispanic":      return p.pct_hispanic ?? -1;
    case "pct_asian":         return p.pct_asian ?? -1;
    case "pct_65plus":         return p.total_pop > 0 ? (p.age_65plus  / p.total_pop) * 100 : -1;
    case "pct_under18":        return p.total_pop > 0 ? (p.age_under18 / p.total_pop) * 100 : -1;
    case "pct_18_34":          return p.total_pop > 0 ? (p.age_18_34   / p.total_pop) * 100 : -1;
    case "pct_35_64":          return p.total_pop > 0 ? (p.age_35_64   / p.total_pop) * 100 : -1;
    case "med_hh_income":      return p.med_hh_income      ?? -1;
    case "pct_bachelors_plus": return p.pct_bachelors_plus  ?? -1;
    case "pct_no_hs_diploma":  return p.pct_no_hs_diploma   ?? -1;
    case "pct_some_college":   return p.pct_some_college    ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return <span className="inline-flex ml-1" style={{ fontSize: 9 }}>{dir === "asc" ? "▲" : "▼"}</span>;
}

const thBase = "px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity text-center align-middle";
const stickyTopLeftStyle: React.CSSProperties = {
  position: "sticky", left: 0, zIndex: 4,
  background: "var(--app-panel)", boxShadow: "1px 0 0 var(--app-border)",
};
const stickyFirstColStyle: React.CSSProperties = {
  position: "sticky", left: 0, zIndex: 3,
  background: "inherit", boxShadow: "1px 0 0 var(--app-border)",
};

function pctCell(value: number | null): string {
  return value != null ? `${value.toFixed(1)}%` : "—";
}

function incomeCell(value: number | null): string {
  return value != null ? `$${Math.round(value / 1000)}k` : "—";
}

export default function OH31DemographicsTable() {
  const [data, setData] = useState<DemoPrecinct[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("precinct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/oh31-demographics.geojson")
      .then(r => r.json())
      .then((geojson) => {
        const precincts: DemoPrecinct[] = geojson.features.map((f: { properties: Record<string, unknown> }) => ({
          PRECNAME: String(f.properties.PRECNAME ?? ""),
          total_pop: Number(f.properties.total_pop ?? 0),
          age_under18: Number(f.properties.age_under18 ?? 0),
          age_18_34: Number(f.properties.age_18_34 ?? 0),
          age_35_64: Number(f.properties.age_35_64 ?? 0),
          age_65plus: Number(f.properties.age_65plus ?? 0),
          pct_white: f.properties.pct_white != null ? Number(f.properties.pct_white) : null,
          pct_black: f.properties.pct_black != null ? Number(f.properties.pct_black) : null,
          pct_hispanic: f.properties.pct_hispanic != null ? Number(f.properties.pct_hispanic) : null,
          pct_asian: f.properties.pct_asian != null ? Number(f.properties.pct_asian) : null,
          pct_native: f.properties.pct_native != null ? Number(f.properties.pct_native) : null,
          pct_multi: f.properties.pct_multi != null ? Number(f.properties.pct_multi) : null,
          med_hh_income: f.properties.med_hh_income != null ? Number(f.properties.med_hh_income) : null,
          pct_bachelors_plus: f.properties.pct_bachelors_plus != null ? Number(f.properties.pct_bachelors_plus) : null,
          pct_no_hs_diploma: f.properties.pct_no_hs_diploma != null ? Number(f.properties.pct_no_hs_diploma) : null,
          pct_some_college: f.properties.pct_some_college != null ? Number(f.properties.pct_some_college) : null,
        }));
        setData(precincts);
        setLoading(false);
      });
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = [...data].sort((a, b) => {
    const av = getValue(a, sortKey);
    const bv = getValue(b, sortKey);
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const th = (key: SortKey, label: string, style?: React.CSSProperties) => (
    <th key={key} className={thBase} style={style} onClick={() => handleSort(key)}>
      {label}<SortIcon active={sortKey === key} dir={sortDir} />
    </th>
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead>
            {/* Group header row */}
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              <th
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", ...stickyTopLeftStyle }}
              />
              <th
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)" }}
              />
              <th
                colSpan={4}
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)" }}
              >
                Race / Ethnicity
              </th>
              <th
                colSpan={4}
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)" }}
              >
                Age
              </th>
              <th
                colSpan={4}
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)" }}
              >
                Education
              </th>
            </tr>
            {/* Sub-header row */}
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              <th
                className="px-3 py-2 text-center align-middle font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
                style={{ color: "var(--app-text-primary)", ...stickyTopLeftStyle }}
                onClick={() => handleSort("precinct")}
              >
                Precinct<SortIcon active={sortKey === "precinct"} dir={sortDir} />
              </th>
              {th("total_pop",    "Pop.",       { color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" })}
              {th("pct_white",    "White",     { color: "var(--app-text-muted)", borderLeft: "1px solid var(--app-border)" })}
              {th("pct_black",    "Black",     { color: "var(--app-text-muted)" })}
              {th("pct_hispanic", "Hispanic",  { color: "var(--app-text-muted)" })}
              {th("pct_asian",    "Asian",     { color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" })}
              {th("pct_under18",  "< 18",      { color: "var(--app-text-muted)", borderLeft: "1px solid var(--app-border)" })}
              {th("pct_18_34",    "18–34",     { color: "var(--app-text-muted)" })}
              {th("pct_35_64",    "35–64",     { color: "var(--app-text-muted)" })}
              {th("pct_65plus",   "65+",       { color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" })}
              {th("pct_no_hs_diploma",  "No HS",      { color: "var(--app-text-muted)", borderLeft: "1px solid var(--app-border)" })}
              {th("pct_some_college",   "Some College",{ color: "var(--app-text-muted)" })}
              {th("pct_bachelors_plus", "College+",    { color: "var(--app-text-muted)" })}
              {th("med_hh_income",      "Med. Income", { color: "var(--app-text-muted)" })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr style={{ background: "var(--app-bg)" }}>
                <td colSpan={14} className="px-4 py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : sorted.map((p, i) => {
              const pct65  = p.total_pop > 0 ? (p.age_65plus  / p.total_pop) * 100 : null;
              const pctU18 = p.total_pop > 0 ? (p.age_under18 / p.total_pop) * 100 : null;
              const pct1834 = p.total_pop > 0 ? (p.age_18_34  / p.total_pop) * 100 : null;
              const pct3564 = p.total_pop > 0 ? (p.age_35_64  / p.total_pop) * 100 : null;
              const rowBg = i % 2 === 0 ? "var(--app-bg)" : "var(--app-panel)";
              return (
                <tr key={p.PRECNAME} style={{ background: rowBg, borderBottom: "1px solid var(--app-border)" }}>
                  <td
                    className="px-3 py-2 text-center align-middle font-medium whitespace-nowrap"
                    style={{ color: "var(--app-text-primary)", ...stickyFirstColStyle, background: rowBg }}
                  >
                    {p.PRECNAME}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" }}>
                    {p.total_pop.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)", borderLeft: "1px solid var(--app-border)" }}>
                    {pctCell(p.pct_white)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(p.pct_black)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(p.pct_hispanic)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)" }}>
                    {pctCell(p.pct_asian)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)", borderLeft: "1px solid var(--app-border)" }}>
                    {pctCell(pctU18)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(pct1834)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(pct3564)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)" }}>
                    {pctCell(pct65)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)", borderLeft: "1px solid var(--app-border)" }}>
                    {pctCell(p.pct_no_hs_diploma)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(p.pct_some_college)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(p.pct_bachelors_plus)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums font-medium" style={{ color: "var(--app-text-primary)" }}>
                    {incomeCell(p.med_hh_income)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

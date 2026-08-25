"use client";

import { useEffect, useState } from "react";
import type { DemoProps } from "@/lib/oh31Demographics";

type DemoPrecinct = DemoProps & {
  PRECNAME: string;
  total_pop: number;
};

type SortKey =
  | "precinct" | "total_pop"
  | "pct_white" | "pct_black" | "pct_hispanic" | "pct_asian"
  | "pct_under18" | "pct_18_34" | "pct_35_64" | "pct_65plus"
  | "pct_no_hs_diploma" | "pct_some_college" | "pct_bachelors_plus"
  | "med_hh_income";

function getValue(p: DemoPrecinct, key: SortKey): number | string {
  switch (key) {
    case "precinct":           return p.PRECNAME;
    case "total_pop":          return p.total_pop ?? 0;
    case "pct_white":          return p.pct_white ?? -1;
    case "pct_black":          return p.pct_black ?? -1;
    case "pct_hispanic":       return p.pct_hispanic ?? -1;
    case "pct_asian":          return p.pct_asian ?? -1;
    case "pct_under18":        return p.total_pop > 0 ? ((p.age_under18 ?? 0) / p.total_pop) * 100 : -1;
    case "pct_18_34":          return p.total_pop > 0 ? ((p.age_18_34   ?? 0) / p.total_pop) * 100 : -1;
    case "pct_35_64":          return p.total_pop > 0 ? ((p.age_35_64   ?? 0) / p.total_pop) * 100 : -1;
    case "pct_65plus":         return p.total_pop > 0 ? ((p.age_65plus  ?? 0) / p.total_pop) * 100 : -1;
    case "pct_no_hs_diploma":  return p.pct_no_hs_diploma  ?? -1;
    case "pct_some_college":   return p.pct_some_college   ?? -1;
    case "pct_bachelors_plus": return p.pct_bachelors_plus ?? -1;
    case "med_hh_income":      return p.med_hh_income      ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return <span className="inline-flex ml-1" style={{ fontSize: 9 }}>{dir === "asc" ? "▲" : "▼"}</span>;
}

type SortDir = "asc" | "desc";

const thBase = "px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity text-center align-middle";
const MAX_VISIBLE_DEMOGRAPHIC_ROWS = 12;
const DEMOGRAPHICS_TABLE_HEADER_ROW_HEIGHT = 37;
const DEMOGRAPHICS_TABLE_HEADER_HEIGHT = DEMOGRAPHICS_TABLE_HEADER_ROW_HEIGHT * 2;
const DEMOGRAPHICS_TABLE_ROW_HEIGHT = 37;

const stickyHeaderTopStyle: React.CSSProperties = {
  background: "var(--app-panel)",
};

const stickyHeaderSecondRowStyle: React.CSSProperties = {
  background: "var(--app-panel)",
};

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

function incomeCell(value: number | null | undefined): string {
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
  const shouldScrollRows = sorted.length > MAX_VISIBLE_DEMOGRAPHIC_ROWS;

  const th = (key: SortKey, label: string, style?: React.CSSProperties) => (
    <th key={key} className={thBase} style={{ ...stickyHeaderSecondRowStyle, ...style }} onClick={() => handleSort(key)}>
      {label}<SortIcon active={sortKey === key} dir={sortDir} />
    </th>
  );

  return (
    <div>
      <style>{`
        .oh31-scroll-table {
          border-collapse: separate;
          border-spacing: 0;
        }
        .oh31-scroll-table th,
        .oh31-scroll-table td {
          border-bottom: 1px solid var(--app-border);
        }
        .oh31-scroll-table tbody tr:last-child td {
          border-bottom: 0;
        }
      `}</style>
      <div
        className="overflow-auto"
        style={{
          maxHeight: shouldScrollRows
            ? DEMOGRAPHICS_TABLE_HEADER_HEIGHT + DEMOGRAPHICS_TABLE_ROW_HEIGHT * MAX_VISIBLE_DEMOGRAPHIC_ROWS
            : undefined,
        }}
      >
        <table className="oh31-scroll-table text-sm" style={{ minWidth: "100%" }}>
          <thead
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              background: "var(--app-panel)",
              boxShadow: "0 1px 0 var(--app-border)",
            }}
          >
            {/* Group header row */}
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              <th
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", ...stickyTopLeftStyle, ...stickyHeaderTopStyle, zIndex: 7 }}
              />
              <th
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyHeaderTopStyle }}
              />
              <th
                colSpan={4}
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyHeaderTopStyle }}
              >
                Race / Ethnicity
              </th>
              <th
                colSpan={4}
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyHeaderTopStyle }}
              >
                Age
              </th>
              <th
                colSpan={3}
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)", ...stickyHeaderTopStyle }}
              >
                Education
              </th>
              <th
                className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                style={{ color: "var(--app-text-primary)", ...stickyHeaderTopStyle }}
              >
                Income
              </th>
            </tr>
            {/* Sub-header row */}
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              <th
                className="px-3 py-2 text-center align-middle font-semibold whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity"
                style={{ color: "var(--app-text-primary)", ...stickyTopLeftStyle, ...stickyHeaderSecondRowStyle, zIndex: 7 }}
                onClick={() => handleSort("precinct")}
              >
                Precinct<SortIcon active={sortKey === "precinct"} dir={sortDir} />
              </th>
              <th
                className={thBase}
                style={{ color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)", ...stickyHeaderSecondRowStyle }}
                onClick={() => handleSort("total_pop")}
              >
                Pop.<SortIcon active={sortKey === "total_pop"} dir={sortDir} />
              </th>
              {th("pct_white",    "White",     { color: "var(--app-text-muted)", borderLeft: "1px solid var(--app-border)" })}
              {th("pct_black",    "Black",     { color: "var(--app-text-muted)" })}
              {th("pct_hispanic", "Hispanic",  { color: "var(--app-text-muted)" })}
              {th("pct_asian",    "Asian",     { color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" })}
              {th("pct_under18",  "< 18",      { color: "var(--app-text-muted)" })}
              {th("pct_18_34",    "18–34",     { color: "var(--app-text-muted)" })}
              {th("pct_35_64",    "35–64",     { color: "var(--app-text-muted)" })}
              {th("pct_65plus",   "65+",       { color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" })}
              {th("pct_no_hs_diploma",  "No HS",       { color: "var(--app-text-muted)" })}
              {th("pct_some_college",   "Some College",{ color: "var(--app-text-muted)" })}
              {th("pct_bachelors_plus", "College+",    { color: "var(--app-text-muted)", borderRight: "1px solid var(--app-border)" })}
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
              const pct65   = p.total_pop > 0 ? ((p.age_65plus  ?? 0) / p.total_pop) * 100 : null;
              const pctU18  = p.total_pop > 0 ? ((p.age_under18 ?? 0) / p.total_pop) * 100 : null;
              const pct1834 = p.total_pop > 0 ? ((p.age_18_34   ?? 0) / p.total_pop) * 100 : null;
              const pct3564 = p.total_pop > 0 ? ((p.age_35_64   ?? 0) / p.total_pop) * 100 : null;
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
                    {pctCell(p.pct_white ?? null)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(p.pct_black ?? null)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(p.pct_hispanic ?? null)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)" }}>
                    {pctCell(p.pct_asian ?? null)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
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
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(p.pct_no_hs_diploma ?? null)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {pctCell(p.pct_some_college ?? null)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--app-text-primary)", borderRight: "1px solid var(--app-border)" }}>
                    {pctCell(p.pct_bachelors_plus ?? null)}
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

"use client";

// A sortable, scrollable table whose columns the explorer defines per mode. Rows are precincts
// or subdivisions; hovering or clicking a row talks to the same selection the map uses.

import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";

export interface TableRow { id: string; sub: string; estimated?: boolean }

export interface Column<R extends TableRow> {
  key: string;
  label: ReactNode;
  group?: string;
  align?: "left" | "right";
  sortValue: (r: R) => number | string | null;
  render: (r: R) => ReactNode;
  color?: string;          // header text color
  borderLeft?: boolean;    // visual group separator
  hideOnMobile?: boolean;
}

type SortDir = "asc" | "desc";

const ROW_H = 36;
const MAX_ROWS = 14;

export default function ExplorerTable<R extends TableRow>({
  rows, columns, nameOf, subNameOf, showSub, hoveredId, selectedId, onHover, onSelect, defaultSort, emptyText,
}: {
  rows: R[];
  columns: Column<R>[];
  nameOf: (r: R) => string;
  subNameOf?: (r: R) => string;
  showSub: boolean;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  defaultSort?: { key: string; dir: SortDir };
  emptyText?: string;
}) {
  const [sortKey, setSortKey] = useState<string>(defaultSort?.key ?? "__name");
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort?.dir ?? "asc");

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    const val = (r: R) => (sortKey === "__name" ? nameOf(r) : col ? col.sortValue(r) : null);
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" || typeof bv === "string" ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, columns, sortKey, sortDir, nameOf]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "__name" ? "asc" : "desc"); }
  }

  const groups = useMemo(() => {
    const out: { group: string | undefined; span: number }[] = [];
    for (const c of columns) {
      const last = out[out.length - 1];
      if (last && last.group === c.group && c.group !== undefined) last.span += 1;
      else out.push({ group: c.group, span: 1 });
    }
    return out;
  }, [columns]);
  const hasGroups = groups.some((g) => g.group !== undefined);

  // Flat style: the table sits on the page background and is held together by rules — a heavy
  // rule under the header, hairlines between rows — rather than a panel, stripes and a frame.
  const headBg: CSSProperties = { background: "var(--app-bg)" };
  const headRule = "2px solid var(--app-text-primary)";
  const sticky: CSSProperties = { position: "sticky", left: 0, zIndex: 3, background: "inherit" };
  const arrow = (key: string) => (sortKey === key ? <span className="ml-1 text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span> : null);

  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>{emptyText ?? "No rows."}</div>;
  }

  return (
    <div className="overflow-auto" style={{ maxHeight: rows.length > MAX_ROWS ? ROW_H * (MAX_ROWS + (hasGroups ? 2 : 1)) + 8 : undefined }}>
      <table className="text-[13px]" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
          {hasGroups && (
            <tr style={headBg}>
              <th style={{ ...sticky, zIndex: 6, background: "var(--app-bg)" }} />
              {showSub && <th style={headBg} />}
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span} className="px-3 py-1.5 text-center text-[11px] font-semibold" style={{ ...headBg, color: "var(--app-text-primary)", borderLeft: i > 0 ? "1px solid var(--app-border)" : undefined, borderBottom: g.group ? "1px solid var(--app-border)" : undefined }}>
                  {g.group}
                </th>
              ))}
            </tr>
          )}
          <tr style={headBg}>
            <th
              className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider"
              style={{ ...sticky, zIndex: 6, background: "var(--app-bg)", color: "var(--app-text-muted)", borderBottom: headRule }}
              onClick={() => toggleSort("__name")}
            >
              Name{arrow("__name")}
            </th>
            {showSub && (
              <th className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ ...headBg, color: "var(--app-text-muted)", borderBottom: headRule }}>
                Area
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${c.align === "left" ? "text-left" : "text-right"} ${c.hideOnMobile ? "hidden md:table-cell" : ""}`}
                style={{ ...headBg, color: c.color ?? "var(--app-text-muted)", borderLeft: c.borderLeft ? "1px solid var(--app-border)" : undefined, borderBottom: headRule }}
                onClick={() => toggleSort(c.key)}
              >
                {c.label}{arrow(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const active = r.id === selectedId;
            const hovered = r.id === hoveredId;
            const bg = active ? "var(--app-tab-bg)" : hovered ? "color-mix(in srgb, var(--app-tab-bg) 55%, var(--app-bg))" : "var(--app-bg)";
            return (
              <tr
                key={r.id}
                data-row-id={r.id}
                style={{ background: bg, cursor: "pointer" }}
                onMouseEnter={() => onHover(r.id)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(active ? null : r.id)}
              >
                <td className="whitespace-nowrap px-3 py-2 font-medium" style={{ ...sticky, background: bg, color: "var(--app-text-primary)", borderBottom: "1px solid var(--app-border)" }}>
                  {nameOf(r)}
                  {r.estimated && <span title="Estimated on today's precinct lines from 2016–2022 precincts by 2020 block population" className="ml-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>≈</span>}
                </td>
                {showSub && (
                  <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
                    {subNameOf ? subNameOf(r) : r.sub}
                  </td>
                )}
                {columns.map((c) => (
                  <Fragment key={c.key}>
                    <td
                      className={`whitespace-nowrap px-3 py-2 tabular-nums ${c.align === "left" ? "text-left" : "text-right"} ${c.hideOnMobile ? "hidden md:table-cell" : ""}`}
                      style={{ borderBottom: "1px solid var(--app-border)", borderLeft: c.borderLeft ? "1px solid var(--app-border)" : undefined }}
                    >
                      {c.render(r)}
                    </td>
                  </Fragment>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

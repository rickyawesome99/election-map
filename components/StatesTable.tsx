"use client";

import Link from "next/link";
import { useState } from "react";

export type StateRow = {
  id: string;       // URL slug, e.g. "california"
  name: string;
  abbr: string;
  govParty: "D" | "R" | "I" | null;
  senateDem: number;
  senateRep: number;
  senateInd: number;
  houseDem: number;
  houseRep: number;
  houseTotal: number;
  pres2024: number | null;  // positive = D margin, negative = R margin
  pvi2026: number | null;   // positive = R lean, negative = D lean
};

type SortKey = "name" | "gov" | "senate" | "house" | "pres2024" | "pvi";
type SortDir = "asc" | "desc";

const govOrder = (p: "D" | "R" | "I" | null) =>
  p === "D" ? 2 : p === "I" ? 1 : p === "R" ? 0 : -1;

function sortRows(rows: StateRow[], key: SortKey, dir: SortDir): StateRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "gov":
        // asc = D first
        cmp = govOrder(b.govParty) - govOrder(a.govParty);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case "senate":
        // asc = most Dem seats first
        cmp = b.senateDem - a.senateDem;
        if (cmp === 0) cmp = a.senateRep - b.senateRep;
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case "house": {
        // asc = largest D/R ratio first; all-Dem (no R seats) sorts highest, all-Rep sorts lowest
        const ratio = (d: number, r: number) => r === 0 ? (d > 0 ? Infinity : 0) : d / r;
        const aRatio = ratio(a.houseDem, a.houseRep);
        const bRatio = ratio(b.houseDem, b.houseRep);
        cmp = isFinite(bRatio - aRatio) ? bRatio - aRatio : bRatio === aRatio ? 0 : bRatio === Infinity ? 1 : -1;
        if (cmp === 0) cmp = (b.pres2024 ?? 0) - (a.pres2024 ?? 0);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      }
      case "pres2024":
        // asc = most D-friendly first (mirrors margin sort convention)
        cmp = (b.pres2024 ?? -999) - (a.pres2024 ?? -999);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case "pvi":
        // asc = most D-friendly first (most negative PVI first)
        cmp = (b.pvi2026 ?? 999) - (a.pvi2026 ?? 999);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return <span className="inline-flex ml-1" style={{ fontSize: 9 }}>{dir === "asc" ? "▼" : "▲"}</span>;
}

function PartyPill({ party }: { party: "D" | "R" | "I" | null }) {
  if (!party) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const color =
    party === "D" ? "var(--party-dem)" :
    party === "R" ? "var(--party-rep)" :
    "var(--app-text-muted)";
  return (
    <span className="font-bold tabular-nums" style={{ color }}>
      {party}
    </span>
  );
}

export default function StatesTable({ rows }: { rows: StateRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = sortRows(rows, sortKey, sortDir);

  function th(key: SortKey, label: string, align: "left" | "right" | "center" = "left", extraClass = "") {
    const active = sortKey === key;
    return (
      <th
        onClick={() => handleSort(key)}
        className={`px-3 sm:px-4 py-3 text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap text-${align} ${extraClass}`}
        style={{
          color: active ? "var(--app-text-primary)" : "var(--app-text-muted)",
          userSelect: "none",
        }}
      >
        {label}
        <SortIcon active={active} dir={sortDir} />
      </th>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              {th("name", "State", "left")}
              {th("pvi", "PVI", "center")}
              {th("gov", "Governor", "center", "hidden sm:table-cell")}
              {th("senate", "Senate", "center", "hidden sm:table-cell")}
              {th("house", "House", "center", "hidden md:table-cell")}
              {th("pres2024", "Pres. 2024", "center")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const pres = row.pres2024;
              const presIsD = pres != null && pres >= 0;
              return (
                <tr
                  key={row.id}
                  style={{
                    background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                    borderBottom: "1px solid var(--app-border)",
                  }}
                  className="transition-colors hover:opacity-80"
                >
                  {/* State name */}
                  <td className="px-3 sm:px-4 py-3 text-left">
                    <Link
                      href={`/states/${row.id}`}
                      className="font-semibold hover:underline"
                      style={{ color: "var(--app-text-primary)" }}
                    >
                      {row.name}
                    </Link>
                  </td>

                  {/* PVI */}
                  <td className="px-3 sm:px-4 py-3 text-center font-bold tabular-nums">
                    {row.pvi2026 != null ? (
                      <span style={{ color: row.pvi2026 === 0 ? "var(--app-text-muted)" : row.pvi2026 > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                        {row.pvi2026 === 0 ? "EVEN" : row.pvi2026 > 0 ? `R+${row.pvi2026}` : `D+${Math.abs(row.pvi2026)}`}
                      </span>
                    ) : (
                      <span style={{ color: "var(--app-text-very-muted)" }}>—</span>
                    )}
                  </td>

                  {/* Governor */}
                  <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">
                    <PartyPill party={row.govParty} />
                  </td>

                  {/* Senate */}
                  <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">
                    <span className="font-bold tabular-nums">
                      {row.senateInd > 0 ? (
                        <>
                          {row.senateDem > 0 && <span style={{ color: "var(--party-dem)" }}>{row.senateDem}D</span>}
                          {row.senateRep > 0 && (
                            <>
                              {row.senateDem > 0 && <span style={{ color: "var(--app-text-very-muted)" }}> · </span>}
                              <span style={{ color: "var(--party-rep)" }}>{row.senateRep}R</span>
                            </>
                          )}
                          {(row.senateDem > 0 || row.senateRep > 0) && <span style={{ color: "var(--app-text-very-muted)" }}> · </span>}
                          <span style={{ color: "var(--app-text-muted)" }}>{row.senateInd}I</span>
                        </>
                      ) : row.senateRep === 0 ? (
                        <span style={{ color: "var(--party-dem)" }}>{row.senateDem}D</span>
                      ) : row.senateDem === 0 ? (
                        <span style={{ color: "var(--party-rep)" }}>{row.senateRep}R</span>
                      ) : (
                        <>
                          <span style={{ color: "var(--party-dem)" }}>{row.senateDem}D</span>
                          <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
                          <span style={{ color: "var(--party-rep)" }}>{row.senateRep}R</span>
                        </>
                      )}
                    </span>
                  </td>

                  {/* House */}
                  <td className="px-3 sm:px-4 py-3 text-center hidden md:table-cell">
                    <span className="font-bold tabular-nums">
                      <span style={{ color: "var(--party-dem)" }}>{row.houseDem}D</span>
                      <span style={{ color: "var(--app-text-very-muted)" }}> · </span>
                      <span style={{ color: "var(--party-rep)" }}>{row.houseRep}R</span>
                    </span>
                  </td>

                  {/* Pres. 2024 */}
                  <td className="px-3 sm:px-4 py-3 text-center font-bold tabular-nums" style={{ color: pres != null ? (presIsD ? "var(--party-dem)" : "var(--party-rep)") : undefined }}>
                    {pres != null ? (
                      <>{presIsD ? "D" : "R"}+{Math.abs(pres).toFixed(1)}</>
                    ) : (
                      <span style={{ color: "var(--app-text-very-muted)" }}>—</span>
                    )}
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

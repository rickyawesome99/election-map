"use client";

import { getRatingColors } from "@/lib/colorScale";
import Link from "next/link";
import { useState } from "react";

type RaceForecast = {
  id: string;
  name: string;
  rating: string;
  margin: number;
  probability: number;
  candidates?: {
    dem: { name: string; incumbent: boolean };
    rep: { name: string; incumbent: boolean };
  };
};

type SortKey = "name" | "rating" | "dem" | "rep" | "margin" | "winpct";
type SortDir = "asc" | "desc";

const RATING_ORDER = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"];

function sortRaces(races: RaceForecast[], key: SortKey, dir: SortDir): RaceForecast[] {
  const sorted = [...races].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "rating":
        cmp = RATING_ORDER.indexOf(a.rating) - RATING_ORDER.indexOf(b.rating);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case "dem":
        cmp = (a.candidates?.dem.name ?? "").localeCompare(b.candidates?.dem.name ?? "");
        break;
      case "rep":
        cmp = (a.candidates?.rep.name ?? "").localeCompare(b.candidates?.rep.name ?? "");
        break;
      case "margin":
        cmp = a.margin - b.margin;
        break;
      case "winpct":
        cmp = a.probability - b.probability;
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return (
    <span className="inline-flex ml-1" style={{ fontSize: 9 }}>
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

interface RaceTableProps {
  races: RaceForecast[];
  basePath: string; // e.g. "/house", "/senate", "/governor"
  nameLabel: string; // "District" | "State"
}

export default function RaceTable({ races, basePath, nameLabel }: RaceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = sortRaces(races, sortKey, sortDir);

  function thProps(key: SortKey, align: "left" | "right" = "left", extraClass = "") {
    const active = sortKey === key;
    return {
      onClick: () => handleSort(key),
      className: `px-4 py-3 text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap text-${align} ${extraClass}`,
      style: {
        color: active ? "var(--app-text-primary)" : "var(--app-text-muted)",
        userSelect: "none" as const,
      },
    };
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
            <th {...thProps("name")}>
              {nameLabel}
              <SortIcon active={sortKey === "name"} dir={sortDir} />
            </th>
            <th {...thProps("rating")}>
              Rating
              <SortIcon active={sortKey === "rating"} dir={sortDir} />
            </th>
            <th {...thProps("dem", "left", "hidden md:table-cell")}>
              Democrat
              <SortIcon active={sortKey === "dem"} dir={sortDir} />
            </th>
            <th {...thProps("rep", "left", "hidden md:table-cell")}>
              Republican
              <SortIcon active={sortKey === "rep"} dir={sortDir} />
            </th>
            <th {...thProps("margin", "right")}>
              Margin
              <SortIcon active={sortKey === "margin"} dir={sortDir} />
            </th>
            <th {...thProps("winpct", "right", "hidden sm:table-cell")}>
              D Win %
              <SortIcon active={sortKey === "winpct"} dir={sortDir} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((race, i) => {
            const { bg, text } = getRatingColors(race.rating);
            const marginIsD = race.margin >= 0;
            const demPct = Math.round(race.probability * 100);
            const repPct = 100 - demPct;
            return (
              <tr
                key={race.id}
                style={{
                  background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                  borderBottom: "1px solid var(--app-border)",
                }}
                className="transition-colors hover:opacity-80"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`${basePath}/${race.id.toLowerCase()}`}
                    className="font-semibold hover:underline"
                    style={{ color: "var(--app-text-primary)" }}
                  >
                    {race.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: bg, color: text }}
                  >
                    {race.rating}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell" style={{ color: "#1b408c" }}>
                  {race.candidates?.dem.name ?? (
                    <span style={{ color: "var(--app-text-very-muted)" }} className="italic">TBD</span>
                  )}
                  {race.candidates?.dem.incumbent && (
                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#1b408c20", color: "#1b408c" }}>
                      Inc.
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell" style={{ color: "#be1c29" }}>
                  {race.candidates?.rep.name ?? (
                    <span style={{ color: "var(--app-text-very-muted)" }} className="italic">TBD</span>
                  )}
                  {race.candidates?.rep.incumbent && (
                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#be1c2920", color: "#be1c29" }}>
                      Inc.
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: marginIsD ? "#1b408c" : "#be1c29" }}>
                  {marginIsD ? "D" : "R"}+{Math.abs(race.margin).toFixed(1)}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-2 rounded-full overflow-hidden flex">
                      <div style={{ width: `${demPct}%`, background: "#1b408c" }} />
                      <div style={{ width: `${repPct}%`, background: "#be1c29" }} />
                    </div>
                    <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--app-text-muted)" }}>
                      {demPct}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

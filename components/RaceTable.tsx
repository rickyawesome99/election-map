"use client";

import { getRatingColors } from "@/lib/colorScale";
import Link from "next/link";
import { useState } from "react";
import CandidateLink from "./CandidateLink";

type RaceForecast = {
  id: string;
  name: string;
  rating?: string;
  margin?: number;
  probability?: number;
  electionType?: string;
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
        cmp = RATING_ORDER.indexOf(a.rating ?? "") - RATING_ORDER.indexOf(b.rating ?? "");
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case "dem":
        cmp = (a.candidates?.dem.name ?? "").localeCompare(b.candidates?.dem.name ?? "");
        break;
      case "rep":
        cmp = (a.candidates?.rep.name ?? "").localeCompare(b.candidates?.rep.name ?? "");
        break;
      case "margin":
        // Intentionally reversed so "asc" (down arrow) shows larger margins first.
        cmp = (b.margin ?? 0) - (a.margin ?? 0);
        break;
      case "winpct":
        cmp = (a.probability ?? 0) - (b.probability ?? 0);
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
      {dir === "asc" ? "▼" : "▲"}
    </span>
  );
}

interface RaceTableProps {
  races: RaceForecast[];
  basePath: string; // e.g. "/house", "/senate", "/governor"
  nameLabel: string; // "District" | "State"
  showSpecialBadge?: boolean;
  nameOnly?: boolean;
  initialSortKey?: SortKey;
  initialSortDir?: SortDir;
}

export default function RaceTable({
  races,
  basePath,
  nameLabel,
  showSpecialBadge = false,
  nameOnly = false,
  initialSortKey,
  initialSortDir,
}: RaceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(initialSortKey ?? (nameOnly ? "name" : "margin"));
  const [sortDir, setSortDir] = useState<SortDir>(initialSortDir ?? "asc");

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
      className: `px-2 sm:px-4 py-2.5 sm:py-3 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap text-${align} ${extraClass}`,
      style: {
        color: active ? "var(--app-text-primary)" : "var(--app-text-muted)",
        userSelect: "none" as const,
        ...(key === "name"
          ? {
              background: "var(--app-panel)",
              boxShadow: "1px 0 0 var(--app-border)",
            }
          : {}),
      },
    };
  }

  if (nameOnly) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              <th {...thProps("name", "left", "text-left")}>
                {nameLabel}
                <SortIcon active={sortKey === "name"} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((race, i) => (
              <tr
                key={race.id}
                style={{
                  background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                  borderBottom: "1px solid var(--app-border)",
                }}
                className="transition-colors hover:opacity-80"
              >
                <td className="px-4 py-3 text-left">
                  <Link
                    href={`${basePath}/${race.id.toLowerCase()}?from=${encodeURIComponent(`/?tab=${basePath.slice(1)}`)}`}
                    className="font-semibold hover:underline"
                    style={{ color: "var(--app-text-primary)" }}
                  >
                    {race.name}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] table-fixed text-xs sm:text-sm md:min-w-full md:table-auto">
        <thead>
          <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
            <th {...thProps("name", "left", "sticky left-0 z-20 w-32 min-w-32 text-left md:w-auto md:min-w-0")}>
              {nameLabel}
              <SortIcon active={sortKey === "name"} dir={sortDir} />
            </th>
            <th {...thProps("rating", "left", "w-24 text-left md:w-auto")}>
              Rating
              <SortIcon active={sortKey === "rating"} dir={sortDir} />
            </th>
            <th {...thProps("dem", "left", "w-36 md:w-auto")}>
              Democrat
              <SortIcon active={sortKey === "dem"} dir={sortDir} />
            </th>
            <th {...thProps("rep", "left", "w-36 md:w-auto")}>
              Republican
              <SortIcon active={sortKey === "rep"} dir={sortDir} />
            </th>
            <th {...thProps("margin", "right", "w-20 md:w-auto")}>
              Margin
              <SortIcon active={sortKey === "margin"} dir={sortDir} />
            </th>
            <th {...thProps("winpct", "right", "w-28 md:w-auto")}>
              D Win %
              <SortIcon active={sortKey === "winpct"} dir={sortDir} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((race, i) => {
            const rowBackground = i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)";
            const margin = race.margin ?? 0;
            const probability = race.probability ?? 0.5;
            const { bg, text } = getRatingColors(race.rating ?? "Tossup");
            const marginIsD = margin >= 0;
            const demPct = Math.round(probability * 100);
            const repPct = 100 - demPct;
            return (
              <tr
                key={race.id}
                style={{
                  background: rowBackground,
                  borderBottom: "1px solid var(--app-border)",
                }}
                className="transition-colors hover:opacity-80"
              >
                <td
                  className="sticky left-0 z-10 w-32 min-w-32 px-2 py-2.5 text-left sm:px-4 sm:py-3 md:w-auto md:min-w-0"
                  style={{ background: rowBackground, boxShadow: "1px 0 0 var(--app-border)" }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      href={`${basePath}/${race.id.toLowerCase()}?from=${encodeURIComponent(`/?tab=${basePath.slice(1)}`)}`}
                      className="font-semibold hover:underline truncate"
                      style={{ color: "var(--app-text-primary)" }}
                    >
                      {race.name}
                    </Link>
                    {showSpecialBadge && race.electionType?.toLowerCase().includes("special") && (
                      <span
                        className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                      >
                        Special
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-left sm:px-4 sm:py-3">
                  <span
                    className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs"
                    style={{ background: bg, color: text }}
                  >
                    {race.rating ?? "TBD"}
                  </span>
                </td>
                <td className="px-2 py-2.5 sm:px-4 sm:py-3" style={{ color: "var(--party-dem)" }}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate">
                      {race.candidates?.dem.name ? (
                        <CandidateLink
                          name={race.candidates.dem.name}
                          className="hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {race.candidates.dem.name}
                        </CandidateLink>
                      ) : (
                        <span style={{ color: "var(--app-text-very-muted)" }} className="italic">TBD</span>
                      )}
                    </span>
                    {race.candidates?.dem.incumbent && (
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--party-dem-subtle)", color: "var(--party-dem)" }}>
                        Inc.
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2.5 sm:px-4 sm:py-3" style={{ color: "var(--party-rep)" }}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate">
                      {race.candidates?.rep.name ? (
                        <CandidateLink
                          name={race.candidates.rep.name}
                          className="hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {race.candidates.rep.name}
                        </CandidateLink>
                      ) : (
                        <span style={{ color: "var(--app-text-very-muted)" }} className="italic">TBD</span>
                      )}
                    </span>
                    {race.candidates?.rep.incumbent && (
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--party-rep-subtle)", color: "var(--party-rep)" }}>
                        Inc.
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right font-bold tabular-nums sm:px-4 sm:py-3" style={{ color: marginIsD ? "var(--party-dem)" : "var(--party-rep)" }}>
                  {marginIsD ? "D" : "R"}+{Math.abs(margin).toFixed(1)}
                </td>
                <td className="px-2 py-2.5 sm:px-4 sm:py-3">
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
    </div>
  );
}

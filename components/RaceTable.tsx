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
    dem: { name: string; incumbent: boolean; party?: "D" | "R" | "I" };
    rep: { name: string; incumbent: boolean; party?: "D" | "R" | "I" };
  };
};

type SortKey = "name" | "rating" | "margin" | "competitive";
type SortDir = "asc" | "desc";

const RATING_ORDER = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "margin", label: "Margin" },
  { key: "name", label: "State" },
  { key: "rating", label: "Rating" },
  { key: "competitive", label: "Competitive" },
];

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
      case "margin":
        // Intentionally reversed so "asc" (down arrow) shows larger margins first.
        cmp = (b.margin ?? 0) - (a.margin ?? 0);
        break;
      case "competitive":
        cmp = Math.abs(a.margin ?? 0) - Math.abs(b.margin ?? 0);
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

const PARTY_COLOR: Record<string, string> = {
  D: "var(--party-dem)",
  R: "var(--party-rep)",
  I: "var(--app-text-secondary)",
};
const PARTY_SUBTLE: Record<string, string> = {
  D: "var(--party-dem-subtle)",
  R: "var(--party-rep-subtle)",
  I: "var(--app-tab-bg)",
};
const PARTY_LABEL: Record<string, string> = {
  D: "Dem",
  R: "Rep",
  I: "Ind",
};

function CandidateName({
  candidate,
  slot,
  showPartyLabel = false,
}: {
  candidate: { name: string; incumbent: boolean; party?: "D" | "R" | "I" } | undefined;
  slot: "dem" | "rep";
  showPartyLabel?: boolean;
}) {
  const actualParty = candidate?.party ?? (slot === "dem" ? "D" : "R");
  const color = PARTY_COLOR[actualParty] ?? "var(--app-text-primary)";
  const subtle = PARTY_SUBTLE[actualParty] ?? "var(--app-tab-bg)";
  const label = PARTY_LABEL[actualParty] ?? actualParty;

  return (
    <span className="flex min-w-0 items-center gap-1.5" style={{ color }}>
      {showPartyLabel && (
        <span
          className="w-7 shrink-0 text-[9px] font-bold"
          aria-label={label}
        >
          {label}
        </span>
      )}
      <span className="min-w-0 truncate">
        {candidate?.name ? (
          <CandidateLink
            name={candidate.name}
            className="hover:underline"
            onClick={e => e.stopPropagation()}
          >
            {candidate.name}
          </CandidateLink>
        ) : (
          <span style={{ color: "var(--app-text-very-muted)" }} className="italic">TBD</span>
        )}
      </span>
      {candidate?.incumbent && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
          style={{ background: subtle, color }}
        >
          Inc.
        </span>
      )}
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
  const storageKey = `race-table-sort:${basePath}`;

  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window === "undefined") return initialSortKey ?? (nameOnly ? "name" : "margin");
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
      if (SORT_OPTIONS.some(o => o.key === stored.key)) return stored.key;
    } catch {}
    return initialSortKey ?? (nameOnly ? "name" : "margin");
  });

  const [sortDir, setSortDir] = useState<SortDir>(() => {
    if (typeof window === "undefined") return initialSortDir ?? "asc";
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
      if (stored.dir === "asc" || stored.dir === "desc") return stored.dir;
    } catch {}
    return initialSortDir ?? "asc";
  });

  function persist(key: SortKey, dir: SortDir) {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ key, dir })); } catch {}
  }

  function handleSort(key: SortKey) {
    const newDir: SortDir = sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    setSortKey(key);
    setSortDir(newDir);
    persist(key, newDir);
  }

  const sorted = sortRaces(races, sortKey, sortDir);

  function thProps(key: SortKey, align: "left" | "right" = "left", extraClass = "") {
    const active = sortKey === key;
    return {
      onClick: () => handleSort(key),
      className: `px-3 sm:px-4 py-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap text-${align} ${extraClass}`,
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
      {/* Sort bar — visible on all sizes since margin/rating are embedded in cells */}
      <div
        className="flex items-center justify-between gap-3 border-b px-3 py-2"
        style={{ background: "var(--app-panel)", borderColor: "var(--app-border)" }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="shrink-0 text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--app-text-muted)" }}
          >
            Sort
          </span>
          <select
            value={sortKey}
            onChange={e => {
              const newKey = e.target.value as SortKey;
              setSortKey(newKey);
              setSortDir("asc");
              persist(newKey, "asc");
            }}
            className="min-w-0 flex-1 rounded-md border px-2 py-1 text-xs font-semibold outline-none"
            style={{
              background: "var(--app-bg)",
              borderColor: "var(--app-border)",
              color: "var(--app-text-primary)",
            }}
          >
            {SORT_OPTIONS.map(option => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            const newDir: SortDir = sortDir === "asc" ? "desc" : "asc";
            setSortDir(newDir);
            persist(sortKey, newDir);
          }}
          className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold"
          style={{
            background: "var(--app-bg)",
            borderColor: "var(--app-border)",
            color: "var(--app-text-primary)",
          }}
          aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
        >
          {sortDir === "asc" ? "▼" : "▲"}
        </button>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {sorted.map((race, i) => {
          const rowBackground = i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)";
          const margin = race.margin ?? 0;
          const probability = race.probability ?? 0.5;
          const { bg, text } = getRatingColors(race.rating ?? "Tossup");
          const marginIsD = margin >= 0;
          const demPct = Math.round(probability * 100);
          const repPct = 100 - demPct;

          return (
            <Link
              key={race.id}
              href={`${basePath}/${race.id.toLowerCase()}?from=${encodeURIComponent(`/?tab=${basePath.slice(1)}`)}`}
              className="block px-3 py-3"
              style={{
                background: rowBackground,
                borderBottom: "1px solid var(--app-border)",
              }}
            >
              {/* Line 1: Name + Rating */}
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                  {race.name}
                </span>
                <span
                  className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                  style={{ background: bg, color: text }}
                >
                  {race.rating ?? "TBD"}
                </span>
                {showSpecialBadge && race.electionType?.toLowerCase().includes("special") && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                    style={{
                      background: "var(--app-tab-bg)",
                      color: "var(--app-text-primary)",
                      border: "1px solid var(--app-border)",
                    }}
                  >
                    Special
                  </span>
                )}
              </div>
              {/* Line 2: Margin */}
              <div className="mt-0.5">
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: marginIsD ? "var(--party-dem)" : "var(--party-rep)" }}
                >
                  {marginIsD ? "D" : "R"}+{Math.abs(margin).toFixed(1)}
                </span>
              </div>
              {/* Lines 3–4: Candidates stacked */}
              <div className="mt-2 flex flex-col gap-0.5 text-xs">
                <CandidateName candidate={race.candidates?.dem} slot="dem" showPartyLabel />
                <CandidateName candidate={race.candidates?.rep} slot="rep" showPartyLabel />
              </div>
              {/* Line 5: D Win % bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full flex">
                  <div style={{ width: `${demPct}%`, background: "#1b408c" }} />
                  <div style={{ width: `${repPct}%`, background: "#be1c29" }} />
                </div>
                <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  D {demPct}%
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop table — 3 columns, 2-line rows */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
              <th {...thProps("name", "left", "sticky left-0 z-20 text-left")}>
                {nameLabel}
                <SortIcon active={sortKey === "name"} dir={sortDir} />
              </th>
              <th
                className="px-3 sm:px-4 py-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold text-left"
                style={{ color: "var(--app-text-muted)" }}
              >
                Candidates
              </th>
              <th
                className="px-3 sm:px-4 py-2.5 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold text-right"
                style={{ color: "var(--app-text-muted)" }}
              >
                D Win %
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
                  {/* Race: name + rating / margin */}
                  <td
                    className="sticky left-0 z-10 px-3 py-2.5 sm:px-4 sm:py-3"
                    style={{ background: rowBackground, boxShadow: "1px 0 0 var(--app-border)" }}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Link
                        href={`${basePath}/${race.id.toLowerCase()}?from=${encodeURIComponent(`/?tab=${basePath.slice(1)}`)}`}
                        className="min-w-0 truncate font-semibold hover:underline"
                        style={{ color: "var(--app-text-primary)" }}
                      >
                        {race.name}
                      </Link>
                      <span
                        className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: bg, color: text }}
                      >
                        {race.rating ?? "TBD"}
                      </span>
                      {showSpecialBadge && race.electionType?.toLowerCase().includes("special") && (
                        <span
                          className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                        >
                          Special
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5">
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{ color: marginIsD ? "var(--party-dem)" : "var(--party-rep)" }}
                      >
                        {marginIsD ? "D" : "R"}+{Math.abs(margin).toFixed(1)}
                      </span>
                    </div>
                  </td>
                  {/* Candidates: D / R stacked */}
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                    <div className="flex flex-col gap-0.5">
                      <CandidateName candidate={race.candidates?.dem} slot="dem" showPartyLabel />
                      <CandidateName candidate={race.candidates?.rep} slot="rep" showPartyLabel />
                    </div>
                  </td>
                  {/* D Win % */}
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full flex">
                        <div style={{ width: `${demPct}%`, background: "#1b408c" }} />
                        <div style={{ width: `${repPct}%`, background: "#be1c29" }} />
                      </div>
                      <span className="w-8 text-right text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
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

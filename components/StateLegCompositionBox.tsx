"use client";

import { useState } from "react";
import type { HouseDelegationEntry, StateLegEntry } from "@/data/forecastData";
import type { Chamber } from "@/data/stateLegDistricts";
import { MajorityPill, majorityStatus } from "./StateLegAboutSection";

type CompositionEntry = StateLegEntry | HouseDelegationEntry;
/** Verified size of the chamber on screen, and the seats a veto override takes in it. */
type MajorityInfo = { totalSeats?: number; supermajoritySeats?: number };
type CompositionTab = "us-house" | "state-house" | "state-senate" | "state-legislature";

// The veto-override threshold is carried for the chamber's current size. A past cycle is held to
// the same share of whatever the chamber's size was that year — identical arithmetic whenever the
// size never moved, which is the usual case.
function supermajorityFor(totalSeats: number, info: MajorityInfo): number | null {
  if (info.supermajoritySeats == null) return null;
  if (info.totalSeats == null || info.totalSeats === totalSeats) return info.supermajoritySeats;
  return Math.ceil((info.supermajoritySeats / info.totalSeats) * totalSeats);
}

function EntryCard({
  entry,
  selectable = false,
  active = false,
  onSelect,
  majorityInfo,
}: {
  entry: CompositionEntry;
  /** True where this year's district results exist, so the card can put them on the map. */
  selectable?: boolean;
  active?: boolean;
  onSelect?: () => void;
  majorityInfo?: MajorityInfo | null;
}) {
  const hasSeats = entry.demSeats != null && entry.repSeats != null;
  const hasVoteData = entry.demPct != null && entry.repPct != null;
  // Only StateLegEntry carries the third-party bucket; HouseDelegationEntry does not.
  const othPct = "othPct" in entry ? entry.othPct : undefined;
  const othVotes = "othVotes" in entry ? entry.othVotes : undefined;
  const winner = hasVoteData ? (entry.demPct! > entry.repPct! ? "D" : "R") : null;
  const margin = hasVoteData ? Math.abs(entry.demPct! - entry.repPct!).toFixed(1) : null;
  // Selecting a year is what puts it on the map — there is no separate year control — so a
  // selectable card is a real button, with a left rail and an "on map" tag when it's the
  // year being drawn.
  const Tag = selectable ? "button" : "div";

  // Each year's split labelled the way the chamber band up in the hero labels the current one.
  // Only a state chamber carries its size here, so US House delegation cards get no pill.
  const chamberSize = ("totalSeats" in entry ? entry.totalSeats : undefined) ?? majorityInfo?.totalSeats;
  const status = hasSeats && majorityInfo && chamberSize
    ? majorityStatus(entry.demSeats!, entry.repSeats!, Math.floor(chamberSize / 2) + 1, supermajorityFor(chamberSize, majorityInfo))
    : null;
  const body = (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="shrink-0 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.375rem", fontWeight: 700, color: "var(--app-text-primary)" }}>
          {entry.year}
        </span>
        {winner && margin ? (
          <span
            className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums"
            style={{ color: winner === "D" ? "var(--party-dem)" : "var(--party-rep)" }}
          >
            {winner}+{margin}
          </span>
        ) : (
          <span className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>TBD</span>
        )}
      </div>

      {hasSeats && (
        <div className="mb-1.5 flex items-baseline gap-1.5 whitespace-nowrap text-lg font-bold leading-none tabular-nums">
          <span style={{ color: "var(--party-dem)" }}>{entry.demSeats}D</span>
          <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
          <span style={{ color: "var(--party-rep)" }}>{entry.repSeats}R</span>
          {active && (
            <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
              On map
            </span>
          )}
          {status && <MajorityPill status={status} className="ml-auto hidden md:inline-block" />}
        </div>
      )}

      {hasVoteData ? (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5 text-xs">
            <span className="font-bold" style={{ color: "var(--party-dem)" }}>D {entry.demPct!.toFixed(1)}%</span>
            <span className="tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
              {entry.demVotes != null ? entry.demVotes.toLocaleString() : "—"}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 text-xs">
            <span className="font-bold" style={{ color: "var(--party-rep)" }}>R {entry.repPct!.toFixed(1)}%</span>
            <span className="tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
              {entry.repVotes != null ? entry.repVotes.toLocaleString() : "—"}
            </span>
          </div>
          {/* Third-party/independent line — only sourced for state-leg rows rebuilt from the
              Klarner returns data (US House delegation entries have no such field), and only
              worth a row when it actually moved votes. */}
          {othPct != null && othPct >= 0.5 && (
            <div className="flex items-baseline gap-1.5 text-xs">
              <span className="font-bold" style={{ color: "var(--app-text-secondary)" }}>O {othPct.toFixed(1)}%</span>
              <span className="tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
                {othVotes != null ? othVotes.toLocaleString() : "—"}
              </span>
            </div>
          )}
        </div>
      ) : !hasSeats ? (
        <div className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Vote data unavailable</div>
      ) : null}
    </>
  );

  return (
    <Tag
      {...(selectable ? { type: "button" as const, onClick: onSelect, "aria-current": active } : {})}
      className={`block w-full py-4 pl-2.5 pr-1 text-left${selectable ? " stateleg-year" : ""}`}
      style={{
        borderBottom: "1px solid var(--app-border)",
        borderLeft: `2px solid ${active ? "var(--app-text-primary)" : "transparent"}`,
        background: active ? "var(--app-tab-bg)" : undefined,
      }}
    >
      {body}
    </Tag>
  );
}

export default function StateLegCompositionBox({
  federalEntries = [],
  houseEntries,
  senateEntries,
  isUnicameral = false,
  chamber,
  activeYear = null,
  selectableYears,
  onSelectYear,
  majorityInfo = null,
}: {
  federalEntries?: HouseDelegationEntry[];
  houseEntries: StateLegEntry[];
  senateEntries: StateLegEntry[];
  isUnicameral?: boolean;
  /** Set on the legislature page, where the chamber is driven by the map's own toggle, so the
   *  box drops its chamber tabs and is simply that chamber's history. */
  chamber?: Chamber;
  /** The year currently drawn on the map, or null when the map is showing something else. */
  activeYear?: number | null;
  /** Years with district results to draw — only those cards become controls. */
  selectableYears?: number[];
  onSelectYear?: (year: number) => void;
  /** Chamber size and override threshold, which turn each year's seat split into a majority
   *  label on its card. Supplied only where one chamber is on screen, i.e. with `chamber`. */
  majorityInfo?: MajorityInfo | null;
}) {
  const hasFederal = federalEntries.length > 0;
  const hasHouse = houseEntries.length > 0;
  const hasSenate = senateEntries.length > 0;
  const [tab, setTab] = useState<CompositionTab>(hasFederal ? "us-house" : isUnicameral ? "state-legislature" : hasHouse ? "state-house" : "state-senate");

  // Nebraska's one chamber is keyed "senate" in the boundary data but its composition history is
  // filed under House — the same convention StateLegSection follows.
  const entries: CompositionEntry[] = chamber
    ? (!isUnicameral && chamber === "senate" ? senateEntries : houseEntries)
    : tab === "us-house" ? federalEntries : tab === "state-senate" ? senateEntries : houseEntries;

  if (entries.length === 0) return null;

  const chamberTabs: { key: CompositionTab; label: string }[] = [
    ...(hasFederal ? [{ key: "us-house" as const, label: "US House" }] : []),
    ...(hasHouse ? [{ key: (isUnicameral ? "state-legislature" : "state-house") as CompositionTab, label: isUnicameral ? "State Legislature" : "State House" }] : []),
    ...(!isUnicameral && hasSenate ? [{ key: "state-senate" as const, label: "State Senate" }] : []),
  ];

  return (
    <section className="flex h-[25rem] min-w-0 flex-col md:h-full">
      <div className="mb-3 flex shrink-0 flex-col items-start gap-3">
        <h2
          className="text-[11px] uppercase tracking-wider font-bold"
          style={{ color: "var(--app-text-muted)" }}
        >
          Legislative Composition · Since 2016
        </h2>

        {chamberTabs.length > 1 && !chamber ? (
          <div className="flex items-end gap-4 w-full" style={{ borderBottom: "1px solid var(--app-border)" }}>
            {chamberTabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className="whitespace-nowrap pb-2 text-xs font-semibold transition-colors"
                style={tab === item.key
                  ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                  : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 min-w-0 flex-1">
        <div className="stateleg-scroll h-full overflow-x-hidden overflow-y-auto pr-1">
          <div className="flex flex-col">
            {entries.map((entry) => {
              const selectable = !!onSelectYear && !!selectableYears?.includes(entry.year);
              return (
                <EntryCard
                  key={`${entry.year}-${"type" in entry ? entry.type : "US House"}`}
                  entry={entry}
                  selectable={selectable}
                  active={selectable && entry.year === activeYear}
                  onSelect={selectable ? () => onSelectYear?.(entry.year) : undefined}
                  majorityInfo={chamber ? majorityInfo : null}
                />
              );
            })}
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
          style={{ background: "linear-gradient(to top, var(--app-bg), transparent)" }}
        />
      </div>
    </section>
  );
}

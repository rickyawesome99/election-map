"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import CountyTooltip from "@/components/CountyTooltip";
import { StateSection, housePopularVote, sortStateRows, tiltCard, untiltCard } from "@/components/post-election/StateRaceCards";
import { getRaceColor, getRatingColors, marginToRating } from "@/lib/colorScale";
import { startPendingNav } from "@/lib/navPending";
import { callSideColor, fmtCall, raceHash } from "@/lib/resultsFormat";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { useTouchHover } from "@/lib/useTouchHover";
import type { LegChamberResult, PostElectionRow } from "@/lib/postElectionTypes";

// /analysis/post-election: a small box per state, coloured by the state's counted House popular vote
// on the rating scale, and the picked state's profile under them, all from the saved snapshot
// (lib/resultsSnapshot.ts). The state lives in the hash (#FL), so switching
// loads nothing and Back works. A race card opens the race on /results.

/** The legend: the rating scale's bands, strongest D to strongest R, each with a margin inside it. */
const BANDS = [[-20, "15+ D"], [-10, "5–15 D"], [-3, "1–5 D"], [-0.5, "<1 D"], [0.5, "<1 R"], [3, "1–5 R"], [10, "5–15 R"], [20, "15+ R"]] as const;

/** The box orders. Margins are R-positive, so ascending runs most D to most R; a state with no votes counted goes last. */
const SORTS = [["alpha", "Alphabetical"], ["margin", "Margin"], ["competitive", "Competitive"]] as const;
type BoxSort = (typeof SORTS)[number][0];
const sortValue = (margin: number | null, sort: BoxSort) => margin == null ? Infinity : sort === "competitive" ? Math.abs(margin) : margin;

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export default function PostElectionAnalysis({ rows, legislature }: { rows: PostElectionRow[]; legislature: Record<string, LegChamberResult[]> }) {
  const router = useRouter();
  useTouchHover(tiltCard, untiltCard);
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const [sort, setSort] = useState<BoxSort>("alpha");
  const [hovered, setHovered] = useState<string | null>(null);
  const { onMouseMove: onTipMove, tooltipRef } = useMapTooltip(14, 8);
  const states = useMemo(() => {
    const m = new Map<string, PostElectionRow[]>();
    for (const r of rows) m.set(r.prior.state, [...(m.get(r.prior.state) ?? []), r]);
    return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [rows]);
  const boxes = useMemo(() => {
    const list = [...states.entries()].map(([st, stateList]) => ({ st, name: stateList[0].prior.stateName, margin: housePopularVote(stateList.filter((r) => r.prior.office === "house")).margin }));
    return sort === "alpha" ? list : list.sort((a, b) => sortValue(a.margin, sort) - sortValue(b.margin, sort));
  }, [states, sort]);
  const hoveredBox = boxes.find((b) => b.st === hovered);
  const picked = hash.slice(1).toUpperCase();
  const stateRows = useMemo(() => sortStateRows(states.get(picked) ?? []), [states, picked]);
  const openRace = useCallback((row: PostElectionRow) => {
    const href = `/results#${raceHash(row.prior)}`;
    startPendingNav(href);
    router.push(href);
  }, [router]);

  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded-md p-0.5" style={{ background: "var(--app-tab-bg)" }} role="group" aria-label="Sort the states">
        {SORTS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setSort(key)} aria-pressed={sort === key} className="rounded px-3 py-1 text-xs font-semibold"
            style={{ background: sort === key ? "var(--app-panel)" : "transparent", color: sort === key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
            {label}
          </button>
        ))}
      </div>
      <div className="relative" onMouseMove={onTipMove} onMouseLeave={() => setHovered(null)}>
      <nav aria-label="States" className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))" }}>
        {boxes.map(({ st, name, margin }) => {
          const on = st === picked;
          return (
            <a key={st} href={`#${st}`} onMouseEnter={() => setHovered(st)} aria-label={`${st} · ${name} · House popular vote ${fmtCall(margin)}`} aria-current={on ? "true" : undefined}
              className="rounded py-1.5 text-center text-xs font-semibold tabular-nums transition-opacity hover:opacity-80 sm:py-2 sm:text-sm"
              style={{ ...(margin == null ? { border: "1px solid var(--app-border)" } : { background: getRaceColor(margin), color: getRatingColors(marginToRating(margin)).text }), ...(on ? { outline: "2px solid var(--app-text-primary)", outlineOffset: 2 } : null) }}>
              {st}
            </a>
          );
        })}
      </nav>
      {hoveredBox && <CountyTooltip kind="figure" title={hoveredBox.name} label="House popular vote" value={hoveredBox.margin == null ? null : fmtCall(hoveredBox.margin)} valueColor={callSideColor(hoveredBox.margin)} boxRef={tooltipRef} className="absolute z-20 hidden md:block" />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px]" style={{ color: "var(--app-text-muted)" }}>
        <span className="font-mono font-bold uppercase tracking-wider">House popular vote</span>
        {BANDS.map(([m, label]) => <span key={label} className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4" style={{ background: getRaceColor(m) }} />{label}</span>)}
      </div>
      {stateRows.length > 0
        ? <StateSection rows={stateRows} legislature={legislature[picked] ?? []} onSelect={openRace} />
        : <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>Pick a state to open its profile.</p>}
    </div>
  );
}

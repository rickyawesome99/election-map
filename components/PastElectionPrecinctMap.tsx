"use client";

// The past-election page's map for a place with no county split worth drawing (DC is one
// county-equivalent): the /precincts map of that state for that year and office, in the map column.
// Tiles, names and results are the same public/precincts files the Precincts tab reads, fetched by
// the browser; the precinct file's party sides are labelled with this race's candidates.

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import CountyTooltip, { type CountyTooltipProps } from "@/components/CountyTooltip";
import { useDarkMode } from "@/lib/useDarkMode";
import { resultCard } from "@/components/precincts/cards";
import type { Office, StateIndex, StateResults, StateShell } from "@/components/precincts/types";

const PrecinctMap = dynamic(() => import("@/components/precincts/PrecinctMap"), { ssr: false, loading: () => <div style={{ height: "100%" }} /> });

type Props = {
  shell: Pick<StateShell, "abbr" | "name" | "fips" | "n" | "first" | "bbox">;
  year: number;
  office: Office;
  demName: string;
  repName: string;
  height: number;
  caption?: ReactNode;
  /** Desktop only: fill a parent of fixed height instead of setting it (as PastElectionCountyMap). */
  fill?: boolean;
};

export default function PastElectionPrecinctMap({ shell, year, office, demName, repName, height, caption, fill = false }: Props) {
  const darkMode = useDarkMode();
  const [results, setResults] = useState<StateResults | null>(null);
  const [index, setIndex] = useState<StateIndex | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [moved, setMoved] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/precincts/results/${shell.abbr}/${year}.json`).then((r) => (r.ok ? (r.json() as Promise<StateResults>) : null)).catch(() => null)
      .then((d) => { if (live) setResults(d); });
    fetch(`/precincts/index/${shell.abbr}.json`).then((r) => (r.ok ? (r.json() as Promise<StateIndex>) : null)).catch(() => null)
      .then((d) => { if (live) setIndex(d); });
    return () => { live = false; };
  }, [shell.abbr, year]);

  // PrecinctMap's own hover card says "Democrat"/"Republican"; the clicked precinct's panel below
  // names this race's candidates instead.
  const named = (card: CountyTooltipProps): CountyTooltipProps =>
    card.kind === "result" ? { ...card, dem: { ...card.dem, name: demName }, rep: { ...card.rep, name: repName } } : card;
  const i = selected !== null ? selected - shell.first : -1;
  const panel = i >= 0
    ? named(resultCard(index?.names[i] || `Precinct ${selected}`, shell.name, results?.offices[office]?.[i], office))
    : null;

  // The full shell PrecinctMap wants; `years` is only read by the Precincts tab's own controls.
  const fullShell: StateShell = { ...shell, years: {} };

  return (
    <div className={fill ? "md:flex md:h-full md:flex-col" : undefined}>
      <div className={`relative${fill ? " md:min-h-[180px] md:flex-1" : ""}`} style={{ height: fill ? undefined : height, minHeight: height }}>
        <div className="absolute inset-0">
          <PrecinctMap
            key={`${shell.abbr}-${darkMode ? "dark" : "light"}`}
            shell={fullShell}
            year={year}
            office={office}
            darkMode={darkMode}
            results={results}
            index={index}
            selectedPid={selected}
            onSelect={setSelected}
            onMoved={setMoved}
            resetNonce={resetNonce}
            streetsZoom={13}
          />
        </div>
        {moved && (
          <button
            type="button"
            onClick={() => setResetNonce((n) => n + 1)}
            className="absolute right-2 top-2 z-10 rounded px-2 py-1 text-[11px] font-semibold"
            style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
          >
            Reset view
          </button>
        )}
      </div>
      {caption}
      {panel && (
        <div className="mt-2 md:shrink-0">
          <CountyTooltip {...panel} variant="panel" size="small" />
        </div>
      )}
    </div>
  );
}

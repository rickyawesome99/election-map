"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import CountyTooltip from "@/components/CountyTooltip";
import { GenericBallots, StateSection, housePopularVote, rowKey, sortStateRows, tiltCard, untiltCard } from "@/components/post-election/StateRaceCards";
import { getRaceColor, getRatingColors, marginToRating } from "@/lib/colorScale";
import { startPendingNav } from "@/lib/navPending";
import { callSideColor, fmtCall } from "@/lib/resultsFormat";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { useTouchHover } from "@/lib/useTouchHover";
import type { LegChamberResult, PostElectionRow } from "@/lib/postElectionTypes";

// /analysis/post-election: a small box per state, coloured by the state's counted House popular vote
// on the rating scale (or, with Lean vs GB on, by that vote minus the national House popular vote),
// and the picked state's profile under them, all from the saved snapshot
// (lib/resultsSnapshot.ts), or for a past year from the historical results (lib/pastPostElection.ts,
// at /analysis/post-election/[year]). The state lives in the hash (#FL), so switching loads nothing
// and Back works, and the year toggle keeps it. A race card opens the race on /results, or a past
// race's past-election page.

/** The legend: the rating scale's bands, strongest D to strongest R, each with a margin inside it. */
const BANDS = [[-20, "15+ D"], [-10, "5–15 D"], [-3, "1–5 D"], [-0.5, "<1 D"], [0.5, "<1 R"], [3, "1–5 R"], [10, "5–15 R"], [20, "15+ R"]] as const;

/** The box orders. Margins are R-positive, so ascending runs most D to most R; a state with no votes counted goes last. */
const SORTS = [["alpha", "A–Z"], ["margin", "Margin"], ["competitive", "Competitive"]] as const;
type BoxSort = (typeof SORTS)[number][0];
const sortValue = (margin: number | null, sort: BoxSort) => margin == null ? Infinity : sort === "competitive" ? Math.abs(margin) : margin;

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/** What a box's colour measures: the state's House popular vote (House GB), it minus the national vote
 *  (Lean vs GB), or it minus the state's vote two years before (Swing). */
type BoxMeasure = "gb" | "lean" | "swing";

/** The boxes' sort and measure, kept here so they carry over when the year changes (each year is its
 *  own page, so its state starts fresh). A full load starts from the defaults, as the server renders. */
const boxView: { sort: BoxSort; measure: BoxMeasure } = { sort: "alpha", measure: "gb" };

const YEAR_BTN = "ix-press ix-rail-btn h-7 w-7 shrink-0 grid place-items-center rounded-full text-sm disabled:opacity-30";

/** The page for a year: the newest at /analysis/post-election, a past one under it. */
const yearPath = (year: number, latest: number) => (year === latest ? "/analysis/post-election" : `/analysis/post-election/${year}`);

export default function PostElectionAnalysis({ rows, legislature, year, years, housePvPrev, nationalPvPrev }: { rows: PostElectionRow[]; legislature: Record<string, LegChamberResult[]>; year: number; years: number[]; housePvPrev: Record<string, number>; nationalPvPrev: number | null }) {
  const router = useRouter();
  useTouchHover(tiltCard, untiltCard);
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const [sort, setSort] = useState<BoxSort>(() => boxView.sort);
  const [measureChoice, setMeasure] = useState<BoxMeasure>(() => boxView.measure);
  useEffect(() => { boxView.sort = sort; boxView.measure = measureChoice; }, [sort, measureChoice]);
  // Swing needs the House two years before (none for 2016): the choice is kept for the next year, the boxes show House GB.
  const swingYear = year - 2;
  const hasSwing = nationalPvPrev != null;
  const measure = measureChoice === "swing" && !hasSwing ? "gb" : measureChoice;
  const [hovered, setHovered] = useState<string | null>(null);
  const { onMouseMove: onTipMove, tooltipRef } = useMapTooltip(14, 8);
  const states = useMemo(() => {
    const m = new Map<string, PostElectionRow[]>();
    for (const r of rows) m.set(r.prior.state, [...(m.get(r.prior.state) ?? []), r]);
    return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [rows]);
  /** The national House popular vote: every House race's counted votes, the baseline Lean vs GB subtracts. */
  const nationalPv = useMemo(() => housePopularVote(rows.filter((r) => r.prior.office === "house")).margin, [rows]);
  const nationalSwing = nationalPv != null && nationalPvPrev != null ? nationalPv - nationalPvPrev : null;
  const boxes = useMemo(() => {
    const list = [...states.entries()].map(([st, stateList]) => {
      const pv = housePopularVote(stateList.filter((r) => r.prior.office === "house")).margin;
      const prev = housePvPrev[st];
      const margin = pv == null ? null : measure === "lean" ? (nationalPv == null ? null : pv - nationalPv) : measure === "swing" ? (prev == null ? null : pv - prev) : pv;
      return { st, name: stateList[0].prior.stateName, margin };
    });
    return sort === "alpha" ? list : list.sort((a, b) => sortValue(a.margin, sort) - sortValue(b.margin, sort));
  }, [states, sort, measure, nationalPv, housePvPrev]);
  const label = measure === "lean" ? "House lean vs GB" : measure === "swing" ? `House swing vs ${swingYear}` : "House popular vote";
  const legendLabel = measure === "lean" ? `${label} (${fmtCall(nationalPv)})` : measure === "swing" ? `${label} (${fmtCall(nationalSwing)})` : label;
  const measures: { key: BoxMeasure; text: string; title: string; disabled?: boolean }[] = [
    { key: "gb", text: "House GB", title: "Each state's House popular vote" },
    { key: "lean", text: "Lean vs GB", title: `Each state's House popular vote minus the national House popular vote (${fmtCall(nationalPv)})` },
    { key: "swing", text: `Swing vs ${swingYear}`, title: hasSwing ? `Each state's House popular vote minus its ${swingYear} House popular vote (national ${fmtCall(nationalSwing)})` : `No ${swingYear} House results to compare`, disabled: !hasSwing },
  ];
  const hoveredBox = boxes.find((b) => b.st === hovered);
  const picked = hash.slice(1).toUpperCase();
  const stateRows = useMemo(() => sortStateRows(states.get(picked) ?? []), [states, picked]);
  const openRace = useCallback((row: PostElectionRow) => {
    const href = row.past ? row.past.href : `/results#${rowKey(row.prior)}`;
    if (!href) return;
    startPendingNav(href);
    router.push(href);
  }, [router]);
  // A native hash link leaves a history entry without the router's state, and the router ignores
  // Back onto it: the URL returns here but /results stays rendered. Next's patched pushState keeps
  // its state on the entry; pushState fires no hashchange, so send one for the hash store.
  const pickState = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const hash = new URL(e.currentTarget.href).hash;
    if (hash === window.location.hash) return;
    history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

  // `years` runs newest first: ‹ goes back in time, › forward.
  const at = years.indexOf(year);
  const older = years[at + 1] ?? null, newer = at > 0 ? years[at - 1] : null;
  const pickYear = (y: number) => {
    if (y !== year) router.push(`${yearPath(y, years[0])}${window.location.hash}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <GenericBallots rows={rows} />
      <div className="flex flex-wrap items-center gap-2">
        {/* As the legislative district pages' selector: ‹ › step a year, the pill opens the list. */}
        <div className="flex items-center gap-1.5">
          <button type="button" className={YEAR_BTN} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} disabled={older == null} onClick={() => older != null && pickYear(older)} aria-label={older != null ? `Previous: ${older}` : "Previous year"}>‹</button>
          <select value={year} onChange={(e) => pickYear(Number(e.target.value))} aria-label="Choose an election year" className="h-7 rounded-full px-2.5 text-xs font-semibold tabular-nums"
            style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" className={YEAR_BTN} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} disabled={newer == null} onClick={() => newer != null && pickYear(newer)} aria-label={newer != null ? `Next: ${newer}` : "Next year"}>›</button>
        </div>
        <div className="flex w-fit rounded-md p-0.5" style={{ background: "var(--app-tab-bg)" }} role="group" aria-label="Sort the states">
          {SORTS.map(([key, text]) => (
            <button key={key} type="button" onClick={() => setSort(key)} aria-pressed={sort === key} className="rounded px-3 py-1 text-xs font-semibold"
              style={{ background: sort === key ? "var(--app-panel)" : "transparent", color: sort === key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
              {text}
            </button>
          ))}
        </div>
        <div className="flex w-fit rounded-md p-0.5" style={{ background: "var(--app-tab-bg)" }} role="group" aria-label="What the boxes measure">
          {measures.map(({ key, text, title, disabled }) => (
            <button key={key} type="button" onClick={() => setMeasure(key)} aria-pressed={measure === key} disabled={disabled} title={title} className="rounded px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: measure === key ? "var(--app-panel)" : "transparent", color: measure === key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="relative" onMouseMove={onTipMove} onMouseLeave={() => setHovered(null)}>
      <nav aria-label="States" className="grid gap-1 sm:gap-1.5" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))" }}>
        {boxes.map(({ st, name, margin }) => {
          const on = st === picked;
          return (
            <a key={st} href={`#${st}`} onClick={pickState} onMouseEnter={() => setHovered(st)} aria-label={`${st} · ${name} · ${label} ${fmtCall(margin)}`} aria-current={on ? "true" : undefined}
              className="rounded py-1.5 text-center text-xs font-semibold tabular-nums transition-opacity hover:opacity-80 sm:py-2 sm:text-sm"
              style={{ ...(margin == null ? { border: "1px solid var(--app-border)" } : { background: getRaceColor(margin), color: getRatingColors(marginToRating(margin)).text }), ...(on ? { outline: "2px solid var(--app-text-primary)", outlineOffset: 2 } : null) }}>
              {st}
            </a>
          );
        })}
      </nav>
      {hoveredBox && <CountyTooltip kind="figure" title={hoveredBox.name} label={label} value={hoveredBox.margin == null ? null : fmtCall(hoveredBox.margin)} valueColor={callSideColor(hoveredBox.margin)} boxRef={tooltipRef} className="absolute z-20 hidden md:block" />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px]" style={{ color: "var(--app-text-muted)" }}>
        <span className="font-mono font-bold uppercase tracking-wider">{legendLabel}</span>
        {BANDS.map(([m, label]) => <span key={label} className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4" style={{ background: getRaceColor(m) }} />{label}</span>)}
      </div>
      {stateRows.length > 0
        ? <StateSection rows={stateRows} legislature={legislature[picked] ?? []} year={year} housePvPrev={housePvPrev[picked] ?? null} onSelect={openRace} />
        : <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>Pick a state to open its profile.</p>}
    </div>
  );
}

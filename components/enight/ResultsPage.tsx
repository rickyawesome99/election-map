"use client";

import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTouchHover } from "@/lib/useTouchHover";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { StandfirstHeader } from "@/components/StandfirstHeader";
import { ELECTION_YEAR } from "@/lib/electionYear";
import ResultsMap, { type MapMode } from "@/components/enight/ResultsMap";
import StateGlyph from "@/components/enight/StateGlyph";
import RaceDetail from "@/components/enight/RaceDetail";
import ChamberCard from "@/components/enight/ChamberCard";
import { flipBackground } from "@/components/FlipStripes";
import ResultsRaceTable from "@/components/enight/ResultsRaceTable";
import { loadStaticJson } from "@/lib/useStaticJson";
import { LATE_COUNT_FROM, partyVotes, projectRace, tallyChamber, type ChamberTally } from "@/lib/resultsNeedle";
import NightPanel from "@/components/enight/NightPanel";
import { reviveNightFit, type NightFit } from "@/lib/resultsNight";
import { closeMinutes, fmtClose, fmtDateTime, partyColor, raceHash, fmtCall, callSideColor, fmtIn, fmtInt, inColor, inState } from "@/lib/resultsFormat";
import { SEAT_HOLDOVERS } from "@/lib/forecastTypes";
import { OFFICE_LABEL, RESULTS_ARCHIVE, RESULTS_OFFICES, type LiveRace, type ResultsArchiveChunk, type ResultsArchiveFrame, type ResultsArchiveManifest, type PriorsSlice, type RacePrior, type RaceProjection, type ResultsOffice, type SeatSeries, type RaceMarginSeries, type RaceHistory } from "@/lib/resultsTypes";

// The 2026 Results page: a static archive of the count as it came in, 6 PM ET Nov 3 → 6 PM ET
// Nov 16. Nothing here reads a live feed or the clock. The priors (forecast, nominees, county
// projection, closing times) come from the static slice /api/enight/priors/{office}; the count
// from public/results-archive-2026/ (scripts/publish-results-archive.ts): a manifest of 338
// frames, chunk files of a keyframe plus each later frame's changed races (with the night model's
// fit precomputed per frame), the chambers' seat series and, read only once a race opens, every
// race's margin series. A frame shows the needle (lib/resultsNeedle.ts) run against that board.
// Speed: a chunk's boards are built once and cached, the chunks either side are fetched ahead,
// and the heavy render trails the slider (useDeferredValue) so stepping never blocks.

export type ResultsRow = { prior: RacePrior; live: LiveRace | null; proj: RaceProjection };
type Board = { index: number; t: number; races: Map<number, LiveRace>; frame: ResultsArchiveFrame; fit: NightFit };

const DIR = `/${RESULTS_ARCHIVE.dir}`;
/** Races listed under Latest updates. */
const LATEST_SHOWN = 8;
/** Play: one frame per this long. */
const PLAY_EVERY_MS = 700;
const COMPETITIVE = 15;
/** z for the 80% band. */
const Z80 = 1.2816;
const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };

type SortKey = "close" | "margin" | "projected" | "forecast" | "in";

// A chunk is published gzipped. Hosts serve it as application/gzip, but one that adds
// Content-Encoding hands over plain JSON already: only gunzip what starts gzipped.
async function readGzipJson(res: Response): Promise<unknown> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

/** Two rows show the same thing: the same race payload and every headline figure equal. */
function sameRow(a: ResultsRow, b: ResultsRow): boolean {
  const p = a.proj, q = b.proj;
  return a.live === b.live && p.margin === q.margin && p.sigma === q.sigma && p.probD === q.probD && p.locked === q.locked && p.winner === q.winner
    && p.currentMargin === q.currentMargin && p.countedShare === q.countedShare && p.projectedTotal === q.projectedTotal && p.counted === q.counted
    && p.tier === q.tier && p.turnoutFactor === q.turnoutFactor && p.swing === q.swing && p.night.shift === q.night.shift && p.night.se === q.night.se;
}

const isCompetitive = (p: RacePrior) => p.forecast.contest === "contested" && Math.abs(p.forecast.margin) < COMPETITIVE;

/** Every frame's board in a chunk, built once: the keyframe, then each frame's changed races laid
 *  over the one before. The needle reads a race's fetchedAt only against LATE_COUNT_FROM (its
 *  late-count rules), so each race is stamped with the frame's side of that line, and a race that
 *  did not change keeps the very same object from frame to frame (cheap redraws downstream). */
function buildBoards(chunk: ResultsArchiveChunk): Board[] {
  const out: Board[] = [];
  let prev = new Map<number, LiveRace>();
  const stored = new Map<number, LiveRace>();
  chunk.frames.forEach((frame, k) => {
    const stamp = frame.t >= LATE_COUNT_FROM ? LATE_COUNT_FROM : RESULTS_ARCHIVE.start;
    const changed = new Set<number>();
    for (const l of frame.races) { stored.set(l.civicId, l); changed.add(l.civicId); }
    const races = new Map<number, LiveRace>();
    for (const [id, l] of stored) {
      const before = prev.get(id);
      races.set(id, before && !changed.has(id) && before.fetchedAt === stamp ? before : { ...l, fetchedAt: stamp });
    }
    prev = races;
    out.push({ index: chunk.first + k, t: frame.t, races, frame, fit: reviveNightFit(frame.fit) });
  });
  return out;
}

export default function ResultsPage() {
  const [priors, setPriors] = useState<Record<ResultsOffice, PriorsSlice> | null>(null);
  // Latest updates folds away behind its head; closed by default (user, 2026-11-18).
  const [latestOpen, setLatestOpen] = useState(false);
  const [manifest, setManifest] = useState<ResultsArchiveManifest | null>(null);
  const [seatSeries, setSeatSeries] = useState<SeatSeries | null>(null);
  const [raceSeries, setRaceSeries] = useState<RaceMarginSeries | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The frame asked for (the slider) and the board shown; the board follows once its chunk is in.
  const [frame, setFrame] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [playing, setPlaying] = useState(false);
  const [office, setOffice] = useState<ResultsOffice>("house");
  const [mapMode, setMapMode] = useState<MapMode>("status");
  const [sort, setSort] = useState<SortKey>("close");
  const [uncalledOnly, setUncalledOnly] = useState(false);
  // Key races: contested races the forecast has within COMPETITIVE points.
  const [keyOnly, setKeyOnly] = useState(false);
  const [raceView, setRaceView] = useState<"table" | "closing" | "state">("table");
  const [stateView, setStateView] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Priors, the manifest and the seat series, once, in parallel; the page opens on the last frame.
  useEffect(() => {
    Promise.all([
      Promise.all(RESULTS_OFFICES.map((o) => loadStaticJson<PriorsSlice>(`/api/enight/priors/${o}`))),
      fetch(`${DIR}/manifest.json`).then((r) => { if (!r.ok) throw new Error(`archive manifest ${r.status}`); return r.json() as Promise<ResultsArchiveManifest>; }),
    ]).then(([[house, senate, governor], m]) => {
      setPriors({ senate, governor, house });
      setManifest(m);
      setFrame((f) => f ?? m.frames.length - 1);
    }).catch((e: Error) => setLoadError(e.message));
    fetch(`${DIR}/seats.json`).then((r) => (r.ok ? r.json() : null)).then((s: SeatSeries | null) => { if (s) setSeatSeries(s); }).catch(() => {});
  }, []);

  useEffect(() => {
    const readHash = () => setSelected(window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : null);
    readHash();
    window.addEventListener("hashchange", readHash);
    window.addEventListener("popstate", readHash);
    return () => { window.removeEventListener("hashchange", readHash); window.removeEventListener("popstate", readHash); };
  }, []);

  // Every race's margin over the count, only once a race is open.
  useEffect(() => {
    if (!selected || raceSeries) return;
    fetch(`${DIR}/races.json`).then((r) => (r.ok ? r.json() : null)).then((s: RaceMarginSeries | null) => { if (s) setRaceSeries(s); }).catch(() => {});
  }, [selected, raceSeries]);

  // Chunks: fetched once, boards built once, kept for the session (14 MB for all 15).
  const chunks = useRef(new Map<number, Promise<Board[]>>());
  const chunkOf = useCallback((index: number) => (manifest ? manifest.chunks.findLastIndex((c) => c.first <= index) : -1), [manifest]);
  const loadChunk = useCallback((ci: number) => {
    if (!manifest || ci < 0 || ci >= manifest.chunks.length) return null;
    let p = chunks.current.get(ci);
    if (!p) {
      p = fetch(`${DIR}/${manifest.chunks[ci].file}`).then((res) => { if (!res.ok) throw new Error(`archive ${res.status}`); return readGzipJson(res); }).then((c) => buildBoards(c as ResultsArchiveChunk));
      p.catch(() => chunks.current.delete(ci));
      chunks.current.set(ci, p);
    }
    return p;
  }, [manifest]);

  // The asked-for frame's board; a later request wins over a slower earlier one. The chunks either
  // side are fetched while the browser is idle, so stepping across a chunk edge is instant.
  const wanted = useRef<number | null>(null);
  useEffect(() => {
    if (frame == null || !manifest) return;
    wanted.current = frame;
    const ci = chunkOf(frame);
    loadChunk(ci)?.then((boards) => {
      if (wanted.current !== frame) return;
      setBoard(boards[frame - manifest.chunks[ci].first]);
      const ahead = () => { loadChunk(ci + 1); loadChunk(ci - 1); };
      if ("requestIdleCallback" in window) requestIdleCallback(ahead, { timeout: 2000 }); else setTimeout(ahead, 300);
    }).catch((e: Error) => setLoadError(e.message));
  }, [frame, manifest, chunkOf, loadChunk]);

  const last = manifest ? manifest.frames.length - 1 : 0;
  const step = useCallback((to: number) => setFrame(Math.max(0, Math.min(last, to))), [last]);

  // Play: a frame every PLAY_EVERY_MS, waiting for each board before the next; stops at the end.
  useEffect(() => {
    if (!playing || frame == null || board?.index !== frame) return;
    const id = setTimeout(() => (frame >= last ? setPlaying(false) : setFrame(frame + 1)), frame >= last ? 0 : PLAY_EVERY_MS);
    return () => clearTimeout(id);
  }, [playing, frame, board, last]);

  // Arrow keys step (Shift: an hour's worth, 12 frames), Home/End jump, space plays; not while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable) && !(el instanceof HTMLInputElement && el.type === "range")) return;
      if (frame == null) return;
      const by = e.shiftKey ? 12 : 1;
      if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); step(frame + by); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); step(frame - by); }
      else if (e.key === "Home") { e.preventDefault(); setPlaying(false); step(0); }
      else if (e.key === "End") { e.preventDefault(); setPlaying(false); step(last); }
      else if (e.key === " " && !(el instanceof HTMLButtonElement)) { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frame, last, step]);

  // The heavy render (map, tables, cards) trails the slider: the slider and its label move at once.
  const shown = useDeferredValue(board);

  // Every race projected against the frame's board with its precomputed night fit. A race whose
  // count and figures did not change keeps last frame's row object, so the memoized table rows, map
  // shapes and cards under it skip their redraw (the open race is always fresh: its county figures
  // can move while the headline does not).
  const [rowCache] = useState(() => new Map<string, ResultsRow>());
  const rowsByOffice = useMemo(() => {
    const out = {} as Record<ResultsOffice, ResultsRow[]>;
    const cache = rowCache;
    for (const o of RESULTS_OFFICES) out[o] = (priors?.[o].races ?? []).map((prior) => {
      const live = shown && prior.civicId ? shown.races.get(prior.civicId) ?? null : null;
      const row: ResultsRow = { prior, live, proj: projectRace(prior, live, undefined, shown?.fit) };
      const key = raceHash(prior), prev = cache.get(key);
      if (prev && key !== selected && sameRow(prev, row)) return prev;
      cache.set(key, row);
      return row;
    });
    return out;
  }, [priors, shown, selected, rowCache]);

  const tallies = useMemo(() => Object.fromEntries(RESULTS_OFFICES.map((o) => [o, tallyChamber(rowsByOffice[o], SEAT_HOLDOVERS[o])])) as Record<ResultsOffice, ChamberTally>, [rowsByOffice]);

  // Latest updates: the races whose count moved since the previous frame, most votes added first.
  const latestUpdates = useMemo(() => {
    if (!shown) return [];
    const rows = new Map(RESULTS_OFFICES.flatMap((o) => rowsByOffice[o]).filter((r) => r.prior.civicId).map((r) => [r.prior.civicId!, r]));
    return shown.frame.moved.slice(0, LATEST_SHOWN).flatMap(([id, added]) => { const row = rows.get(id); return row ? [{ row, at: shown.t, added }] : []; });
  }, [shown, rowsByOffice]);

  // The seat charts up to the frame shown.
  const seatHistory: SeatSeries = useMemo(() => {
    const t = shown?.t ?? -Infinity;
    return Object.fromEntries(RESULTS_OFFICES.map((o) => [o, (seatSeries?.[o] ?? []).filter((p) => p.t <= t)])) as SeatSeries;
  }, [seatSeries, shown]);

  // A race opens as its own page: the hash is pushed (so the browser's Back closes it), the
  // results page's scroll position is kept and restored on the way back.
  const listScroll = useRef<number | null>(null);
  const select = useCallback((row: ResultsRow | null) => {
    if (row) {
      const hash = raceHash(row.prior);
      if (!selectedRef.current) listScroll.current = window.scrollY;
      history[selectedRef.current ? "replaceState" : "pushState"]({ raceDetail: true }, "", `#${hash}`);
      setSelected(hash);
      return;
    }
    if ((history.state as { raceDetail?: boolean } | null)?.raceDetail) history.back();
    else { history.replaceState(null, "", window.location.pathname + window.location.search); setSelected(null); }
  }, []);
  // Every way in or out (a click, the hash on load, Back/Forward) lands here.
  const shownDetail = useRef<string | null>(null);
  useEffect(() => {
    if (selected && !shownDetail.current) window.scrollTo(0, 0);
    if (!selected && shownDetail.current && listScroll.current != null) {
      // The map and tables re-render over a few frames; keep trying until the page is tall enough.
      const y = listScroll.current, until = Date.now() + 1500;
      const restore = () => { window.scrollTo(0, y); if (Math.abs(window.scrollY - y) > 2 && Date.now() < until) requestAnimationFrame(restore); };
      requestAnimationFrame(restore);
      listScroll.current = null;
    }
    shownDetail.current = selected;
  }, [selected]);

  const selectedRow = useMemo(() => {
    if (!selected) return null;
    for (const o of RESULTS_OFFICES) { const r = rowsByOffice[o].find((x) => raceHash(x.prior) === selected); if (r) return r; }
    return null;
  }, [selected, rowsByOffice]);

  // The open race's projected and counted margins up to the frame shown. The counted series has no
  // band and starts at the first counted vote.
  const raceHistory: RaceHistory = useMemo(() => {
    const pts = selected ? raceSeries?.[selected] : null;
    if (!pts || !seatSeries || !shown) return { projected: [], counted: [] };
    const rows = pts.slice(0, shown.index + 1).map(([m, sg, c], i) => [seatSeries.senate[i]?.t ?? 0, m, sg, c ?? null] as const).filter(([t]) => t);
    return {
      projected: rows.map(([t, m, sg]) => ({ t, mean: m, lo: m - Z80 * sg, hi: m + Z80 * sg })),
      counted: rows.flatMap(([t, , , c]) => (c == null ? [] : [{ t, mean: c, lo: c, hi: c }])),
    };
  }, [selected, raceSeries, seatSeries, shown]);

  // By state: one state's governor, Senate and House races together. Until a state is picked, the
  // state whose count moved most in this frame (else the first alphabetically).
  const stateOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of RESULTS_OFFICES) for (const r of rowsByOffice[o]) m.set(r.prior.state, r.prior.stateName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rowsByOffice]);
  const shownState = stateView ?? latestUpdates[0]?.row.prior.state ?? stateOptions[0]?.[0] ?? null;
  const stateRows = useMemo(() => {
    if (!shownState) return [];
    const order: Record<ResultsOffice, number> = { senate: 0, governor: 1, house: 2 };
    return RESULTS_OFFICES.flatMap((o) => rowsByOffice[o]).filter((r) => r.prior.state === shownState)
      .sort((a, b) => order[a.prior.office] - order[b.prior.office] || Number(a.prior.special) - Number(b.prior.special) || a.prior.label.localeCompare(b.prior.label, "en", { numeric: true }));
  }, [rowsByOffice, shownState]);

  const sortedRows = useMemo(() => {
    const rows = rowsByOffice[office].filter((r) => (!uncalledOnly || !(r.proj.locked && r.proj.winner)) && (!keyOnly || isCompetitive(r.prior)));
    const abs = (v: number | null) => (v == null ? 999 : Math.abs(v));
    rows.sort((a, b) => {
      switch (sort) {
        case "margin": return abs(a.proj.currentMargin) - abs(b.proj.currentMargin);
        case "projected": return abs(a.proj.margin) - abs(b.proj.margin);
        case "forecast": return abs(a.prior.forecast.margin) - abs(b.prior.forecast.margin);
        case "in": return (b.proj.countedShare - a.proj.countedShare) || a.prior.label.localeCompare(b.prior.label);
        default: return closeMinutes(a.prior.pollsClose.first) - closeMinutes(b.prior.pollsClose.first) || a.prior.label.localeCompare(b.prior.label);
      }
    });
    return rows;
  }, [rowsByOffice, office, sort, uncalledOnly, keyOnly]);

  const header = (
    <StandfirstHeader kicker="Results archive" title={`${ELECTION_YEAR} Election Night`} href="/overview" hubLabel="Overview" />
  );
  const main = "mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8";
  if (loadError) return <>{header}<main className={main}><p className="text-sm" style={muted}>The results archive failed to load ({loadError}). Reload the page.</p></main></>;
  if (!priors || !manifest || !shown || frame == null) return <>{!selected && header}<main className={main}><p className="text-sm" style={muted}>Loading the results archive…</p></main></>;

  const anyIn = RESULTS_OFFICES.some((o) => tallies[o].racesIn > 0);

  const status = (
    <TimeBar frames={manifest.frames} frame={frame} shownIndex={shown.index} loading={board?.index !== frame} playing={playing}
      onStep={(i) => { setPlaying(false); step(i); }} onScrub={step} onPlay={() => { if (frame >= last) setFrame(0); setPlaying((p) => !p); }}
      back={selectedRow ? () => select(null) : null} />
  );

  // A race's own page.
  if (selectedRow) {
    return (
      <main className={main}>
        <div id="race-detail" className="space-y-6">
          {status}
          <RaceDetail row={selectedRow} history={raceHistory} />
        </div>
      </main>
    );
  }

  return (
    <>
    {header}
    <main className="mx-auto max-w-7xl px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-3">
    {status}
    <div className="mt-3 space-y-10">

      {/* Latest updates: the races whose count moved in this frame. Collapsed by default; when open,
          always LATEST_SHOWN rows, blank ones filling in, so stepping through time never moves the
          page under it (user). */}
      <section className={latestOpen ? "" : "mb-5!"}>{/* collapsed: half the usual gap to Balance of power */}
        {/* The whole head is the toggle: label, chevron, then the note (its own line on phones, always,
            so its length never changes the height; beside the label from sm). */}
        <button
          type="button"
          onClick={() => setLatestOpen((v) => !v)}
          aria-expanded={latestOpen}
          aria-controls="latest-updates-list"
          className={`flex w-full flex-wrap items-baseline gap-1.5 text-left sm:gap-3 ${latestOpen ? "mb-3" : ""}`}
        >
          <span className="flex items-baseline gap-1.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Latest updates</h2>
            <svg aria-hidden viewBox="0 0 10 10" className="h-2.5 w-2.5 self-center transition-transform" style={{ transform: latestOpen ? "rotate(90deg)" : "none", color: "var(--app-text-muted)" }}>
              <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
            <span className="block max-sm:w-[calc(100vw-2rem)] max-sm:truncate">{shown.frame.moved.length ? `${shown.frame.moved.length} ${shown.frame.moved.length === 1 ? "race" : "races"} moved since the previous snapshot${shown.frame.moved.length > LATEST_SHOWN ? `, the ${LATEST_SHOWN} biggest shown` : ""}` : "no count moved since the previous snapshot"}</span>
          </span>
        </button>
        {latestOpen && (
          <ol id="latest-updates-list" className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            {latestUpdates.map(({ row, at, added }) => <LatestUpdate key={row.prior.civicId} row={row} at={at} added={added} onSelect={select} />)}
            {Array.from({ length: LATEST_SHOWN - latestUpdates.length }, (_, i) => <LatestUpdatePlaceholder key={`blank-${i}`} />)}
          </ol>
        )}
      </section>

      {/* Dashboard (a tighter gap to the map than the page's other sections) */}
      <section className="mb-5">
        <LedgerSectionHead label="Balance of power" meta={anyIn ? <BarLegend /> : "nothing counted yet"} />
        <div className="grid gap-8 sm:grid-cols-3 sm:gap-10">
          {RESULTS_OFFICES.map((o) => <ChamberCard key={o} office={o} tally={tallies[o]} rows={rowsByOffice[o]} history={seatHistory[o]} />)}
        </div>
      </section>

      {/* Map */}
      <section>
        <LedgerSectionHead label="Map" right={
          <div className="flex flex-wrap items-center gap-1">
            <OfficeTabs office={office} setOffice={setOffice} />
            <Sep />
            {(["status", "current", "projected", "swing"] as MapMode[]).map((m) => <Tab key={m} active={mapMode === m} onClick={() => setMapMode(m)}>{m === "status" ? "Status" : m === "current" ? "Margin" : m === "projected" ? "Projected margin" : "Swing"}</Tab>)}
          </div>
        } />
        <ResultsMap office={office} rows={rowsByOffice[office]} mode={mapMode} selected={selected} onSelect={select} />
      </section>

      {/* The night model: what the counties finished anywhere imply for the races still out */}
      {anyIn && <NightPanel fit={shown.fit} areas={shown.frame.areas} />}

      {/* Races: the sortable table, or the same races by poll-closing time */}
      <section>
        <div className="mb-2 flex items-center gap-1">
          <Tab active={raceView === "table"} onClick={() => setRaceView("table")}>Table</Tab>
          <Tab active={raceView === "closing"} onClick={() => setRaceView("closing")}>By poll close</Tab>
          <Tab active={raceView === "state"} onClick={() => setRaceView("state")}>By state</Tab>
        </div>
        <LedgerSectionHead label={raceView === "table" ? `${OFFICE_LABEL[office]} races` : raceView === "state" ? `${stateOptions.find(([st]) => st === shownState)?.[1] ?? ""} races` : "Races by poll closing time"}
          meta={raceView === "table"
            ? `${uncalledOnly || keyOnly ? `${sortedRows.length} of ${rowsByOffice[office].length} races` : `${rowsByOffice[office].length} races`}${keyOnly ? ` · forecast within ${COMPETITIVE}` : ""} · click a row to open it`
            : raceView === "state" ? `${stateRows.length} race${stateRows.length === 1 ? "" : "s"} · statewide, then House · click a card to open it`
            : "governor, Senate, then the closest House races"}
          right={raceView === "state" ? (
            <label className="text-xs" style={muted}>State <select value={shownState ?? ""} onChange={(e) => setStateView(e.target.value)} className="rounded px-1 py-0.5 text-xs" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} aria-label="State">
              {stateOptions.map(([st, name]) => <option key={st} value={st}>{name}</option>)}
            </select></label>
          ) : raceView === "table" && (
          <div className="flex flex-wrap items-center gap-1">
            <OfficeTabs office={office} setOffice={setOffice} />
            <Sep />
            <Tab active={keyOnly} onClick={() => setKeyOnly((v) => !v)}>Key races</Tab>
            <Tab active={uncalledOnly} onClick={() => setUncalledOnly((v) => !v)}>Uncalled only</Tab>
            <span className="mx-1 hidden sm:inline" style={veryMuted}>|</span>
            <label className="ml-auto text-xs sm:ml-0" style={muted}>Sort <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded px-1 py-0.5 text-xs" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
              <option value="close">Poll close</option><option value="margin">Closest count</option><option value="projected">Closest projection</option><option value="forecast">Closest forecast</option><option value="in">Most counted</option>
            </select></label>
          </div>
        )} />
        {raceView === "table" ? (
          <>
            <ResultsRaceTable rows={sortedRows} selected={selected} onSelect={select} />
            {sortedRows.length === 0 && (uncalledOnly || keyOnly) && <p className="mt-3 text-sm" style={muted}>{uncalledOnly && keyOnly ? `Every key ${OFFICE_LABEL[office]} race has been called.` : uncalledOnly ? `Every ${OFFICE_LABEL[office]} race has been called.` : `No ${OFFICE_LABEL[office]} race is forecast within ${COMPETITIVE} points.`}</p>}
          </>
        ) : raceView === "state" ? (
          <StateView rows={stateRows} selected={selected} onSelect={select} />
        ) : (
          <ClosingTable rowsByOffice={rowsByOffice} selected={selected} onSelect={select} />
        )}
      </section>

      <p className="max-w-3xl text-xs leading-relaxed" style={veryMuted}>
        Counts and race calls are <a href="https://civicapi.org" className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">civicAPI</a>&rsquo;s, recorded as they came in from 6 PM ET November 3 to 6 PM ET November 16 (unofficial; the saved results by seat and county are on the <Link href="/overview" prefetch={false} className="underline underline-offset-2">Overview</Link>). Each snapshot shows the count at that moment and what the page projected from it. The projected margin is the needle: the pre-election county projection updated by the counties that have reported, with a shared swing shrunk toward zero while little is in. It never calls a race. Ranked-choice races (Alaska, Maine) show first choices; the projection is of the final round. Louisiana House seats are a jungle round. <Link href="/analysis/internal-methodology/turnout#results-needle" prefetch={false} className="underline underline-offset-2">How this is built</Link>.
      </p>
    </div>
    </main>
    </>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** A "|" between tab groups; on phones a line break instead, so each group keeps to one row. */
function Sep() {
  return <><span className="mx-1 hidden sm:inline" style={veryMuted}>|</span><span className="basis-full sm:hidden" /></>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="rounded-md px-2 py-1 text-xs font-semibold" style={active ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" } : muted}>{children}</button>;
}

function OfficeTabs({ office, setOffice }: { office: ResultsOffice; setOffice: (o: ResultsOffice) => void }) {
  return <>{RESULTS_OFFICES.map((o) => <Tab key={o} active={office === o} onClick={() => setOffice(o)}>{OFFICE_LABEL[o]}</Tab>)}</>;
}

function BarLegend() {
  const sw = (bg: string) => <i className="inline-block h-2 w-3 rounded-[1px] align-middle" style={{ background: bg }} />;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      <span className="inline-flex items-center gap-1">{sw("var(--party-dem)")}{sw("var(--party-rep)")} called</span>
      <span className="inline-flex items-center gap-1">{sw("color-mix(in srgb, var(--party-dem) 38%, var(--app-bg))")}{sw("color-mix(in srgb, var(--party-rep) 38%, var(--app-bg))")} leading</span>
      <span className="inline-flex items-center gap-1">{sw("var(--app-tab-bg)")} no votes yet</span>
    </span>
  );
}

/** An empty Latest updates line, the height of a real one (same padding, text size and rule). */
function LatestUpdatePlaceholder() {
  return <li aria-hidden="true" style={{ borderBottom: "1px solid var(--app-border)" }}><div className="py-2 text-[13px]">&nbsp;</div></li>;
}

/** One line of Latest updates: the time the count moved, the race, the votes added, the counted
 *  margin and the share of the expected vote in. Opens the race. */
function LatestUpdate({ row, at, added, onSelect }: { row: ResultsRow; at: number; added: number; onSelect: (row: ResultsRow) => void }) {
  const { prior, proj } = row;
  const name = prior.office === "house" ? `${prior.label} · ${prior.stateName}` : `${prior.stateName} ${OFFICE_LABEL[prior.office]}${prior.special ? " (special)" : ""}`;
  const time = new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
  const pct = proj.countedShare * 100;
  return (
    <li style={{ borderBottom: "1px solid var(--app-border)" }}>
      <button onClick={() => onSelect(row)} className="flex w-full min-w-0 items-baseline gap-2 py-2 text-left text-[13px] hover:opacity-80 sm:gap-3">
        <span className="w-[4.75rem] shrink-0 tabular-nums text-[12px] sm:w-[5.5rem]" style={{ color: "var(--app-text-muted)" }}>{time}</span>
        <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: "var(--app-text-primary)" }}>{name}</span>
        <span className="hidden shrink-0 tabular-nums text-[12px] sm:inline" style={{ color: "var(--app-text-muted)" }}>+{fmtInt(added)} votes</span>
        <span className="w-14 shrink-0 text-right font-bold tabular-nums" style={{ color: callSideColor(proj.currentMargin, prior) }}>{fmtCall(proj.currentMargin, prior)}</span>
        <span className="w-12 shrink-0 text-right tabular-nums text-[12px]" style={{ color: inColor(inState(pct)) }}>{fmtIn(pct)} in</span>
      </button>
    </li>
  );
}

/** The time control: the snapshot's date and time, first / previous / play / next / final, and
 *  the slider. The slider and the label follow input at once; the page under them follows when
 *  the board is in (a dot shows meanwhile). Sticky, so the time stays in view while scrolling. */
const TimeBar = memo(function TimeBar({ frames, frame, shownIndex, loading, playing, onStep, onScrub, onPlay, back }: {
  frames: ResultsArchiveManifest["frames"]; frame: number; shownIndex: number; loading: boolean; playing: boolean;
  onStep: (i: number) => void; onScrub: (i: number) => void; onPlay: () => void; back: (() => void) | null;
}) {
  const last = frames.length - 1;
  const btn = "inline-flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs font-semibold disabled:opacity-40";
  const border = { border: "1px solid var(--app-border)", color: "var(--app-text-primary)" };
  return (
    <div className="sticky top-0 z-30 -mx-4 px-4 py-2 sm:-mx-6 sm:px-6" style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" style={muted}>
        <span className="min-w-[10.5rem] text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{fmtDateTime(frames[frame].t)}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onStep(0)} disabled={frame <= 0} className={btn} style={border} aria-label="First snapshot" title="6 PM ET Nov 3 (Home)">⏮</button>
          <button onClick={() => onStep(frame - 1)} disabled={frame <= 0} className={btn} style={border} aria-label="Previous snapshot" title="Previous (←; Shift+← for 12)">◀</button>
          <button onClick={onPlay} className={`${btn} w-[4.5rem]`} style={border} aria-label={playing ? "Pause" : "Play"} title="Play / pause (space)">{playing ? "❚❚ Pause" : "▶ Play"}</button>
          <button onClick={() => onStep(frame + 1)} disabled={frame >= last} className={btn} style={border} aria-label="Next snapshot" title="Next (→; Shift+→ for 12)">▶</button>
          <button onClick={() => onStep(last)} disabled={frame >= last} className={btn} style={border} aria-label="Final snapshot" title="Final, 6 PM ET Nov 16 (End)">⏭</button>
        </div>
        <input type="range" min={0} max={last} value={frame} onChange={(e) => onScrub(Number(e.target.value))} className="min-w-[10rem] flex-1" aria-label="Snapshot" />
        <span className="tabular-nums">{frame + 1} / {frames.length}<span className="inline-block w-3 text-center" style={{ visibility: loading || shownIndex !== frame ? "visible" : "hidden" }} aria-hidden="true">•</span></span>
        {back && (
          <button onClick={back} className="ml-auto inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors hover:text-[var(--app-text-primary)]"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>← All results</button>
        )}
      </div>
    </div>
  );
});

/** How many races a state shows in the poll-closing view: governor and Senate, then the House
 *  races the forecast has closest, up to this many in all. */
const CARDS_PER_STATE = 6;

const TILT_DEG = 7;

function tiltCard(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  const x = (clientX - r.left) / r.width, y = (clientY - r.top) / r.height;
  el.style.setProperty("--rx", `${((x - 0.5) * TILT_DEG).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${((0.5 - y) * TILT_DEG).toFixed(2)}deg`);
}

function untiltCard(el: HTMLElement) {
  el.style.setProperty("--rx", "0deg");
  el.style.setProperty("--ry", "0deg");
}

function tiltToPointer(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "mouse") tiltCard(e.currentTarget, e.clientX, e.clientY);
}

function resetTilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "mouse") untiltCard(e.currentTarget);
}

const RaceCard = memo(function RaceCard({ row, selected, onSelect, index }: { row: ResultsRow; selected: string | null; onSelect: (r: ResultsRow) => void; index: number }) {
  const { prior, proj, live } = row;
  const key = raceHash(prior);
  const hasVotes = !!live && live.total > 0;
  const office = prior.office === "house" ? "House" : prior.office === "senate" ? `Senate${prior.special ? " special" : ""}` : "Governor";
  const name = prior.office === "house" ? prior.label : office;
  const ratingColor = prior.forecast.rating.startsWith("Toss") ? "var(--app-text-primary)" : prior.forecast.rating.endsWith("D") ? "var(--party-dem)" : "var(--party-rep)";
  // A called race fills its box with the winner's colour (as the race table's winner bar), every
  // figure in white over it.
  const won = proj.locked && proj.winner ? proj.winner : null;
  // A called race the other party held is a flip: "Flip" in place of "Called" and the maps' flip
  // stripes over the fill, at 3× and fainter so the figures stay readable (as the chamber tally's called flips).
  const flipped = !!won && !!prior.seatParty && won !== prior.seatParty;
  const fill = won === "R" ? "var(--party-rep-fill)" : won === "I" ? "var(--party-ind-fill)" : won === "D" ? "var(--party-dem-fill)" : null;
  const on = (c: string) => (fill ? "#ffffff" : c);
  const soft = fill ? { color: "rgba(255,255,255,0.82)" } : null;
  const counted = hasVotes ? Math.min(100, proj.countedShare * 100) : 0;
  const current = fmtCall(proj.currentMargin, prior);
  const projected = fmtCall(proj.margin, prior);
  // Motion (globals.css rc-*): the cards rise in staggered, a figure rolls in whenever it changes
  // (keyed on its text), the call fades the fill in and pops its badge, a race still counting
  // pulses a dot, and the bar along the bottom fills with the count. Under a mouse or a finger
  // (useTouchHover) the card tilts toward the pointer (CSS variables set here, no re-render) and darkens.
  return (
    <button onClick={() => onSelect(row)} onPointerMove={tiltToPointer} onPointerLeave={resetTilt} data-touch-hover="" data-filled={fill ? "" : undefined} className={`rc-card group block h-full w-full self-start py-1 pl-3 text-left align-top${fill ? " rounded-r-md pr-2" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms`, borderLeft: `${selected === key ? 2 : 1}px solid ${selected === key ? "var(--app-text-primary)" : fill ?? "var(--app-border)"}`, backgroundColor: fill ?? undefined, backgroundImage: flipped ? flipBackground("linear-gradient(transparent, transparent)", 3, "rgba(255,255,255,0.18)") : undefined, color: fill ? "#ffffff" : undefined }}>
      <div className="flex min-h-full flex-col justify-start">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{name}</span>
          {hasVotes && !won && <span className="rc-live" style={{ color: callSideColor(proj.currentMargin, prior) }} title="Counting" />}
        </span>
        {won && <span key={won} className="rc-badge font-mono text-[9px] font-bold uppercase tracking-wider" style={{ color: on(partyColor(won)) }} title={flipped ? `Called; flips a seat ${prior.seatParty} held` : undefined}>{flipped ? "Flip" : "Called"}</span>}
      </div>
      {hasVotes ? (
        <>
          <div className="rc-figure mt-1 overflow-hidden text-lg font-extrabold leading-none tabular-nums"><span key={current} className="rc-tick" style={{ color: on(callSideColor(proj.currentMargin, prior)) }}>{current}</span></div>
          {/* The pre-election forecast margin rides at the right end of the counted line (no extra row). */}
          <div className="mt-1 flex items-baseline justify-between gap-2 text-[10px] tabular-nums" style={soft ?? veryMuted}>
            <span className="whitespace-nowrap"><span style={{ color: on(inColor(inState(counted))), fontWeight: 600 }}>{fmtIn(counted)}</span> counted</span>
            <span className="truncate" title="Our final pre-election forecast margin">Fcst <b style={{ color: on(callSideColor(prior.forecast.margin, prior)) }}>{fmtCall(prior.forecast.margin, prior)}</b></span>
          </div>
          <div className="overflow-hidden text-[11px] tabular-nums" style={soft ?? muted}>Proj. Margin <b key={projected} className="rc-tick" style={{ color: on(callSideColor(proj.margin, prior)) }}>{projected}</b></div>
        </>
      ) : (
        <>
          <div className="mt-1 text-lg font-extrabold leading-none" style={{ color: on(ratingColor) }}>{prior.forecast.rating}</div>
          <div className="mt-1 text-[10px]" style={soft ?? veryMuted}>No votes counted yet</div>
        </>
      )}
      <div className="mt-2 h-[3px] overflow-hidden rounded-full" style={{ background: fill ? "rgba(255,255,255,0.28)" : "var(--app-tab-bg)" }}>
        <div className="rc-progress h-full rounded-full" style={{ width: `${counted}%`, background: fill ? "rgba(255,255,255,0.9)" : callSideColor(proj.currentMargin, prior) }} />
      </div>
      </div>
    </button>
  );
});

/** By state: one state's races as cards (the poll-close view's), statewide first, then every
 *  House seat in district order, under a header with the state's count and poll closing. */
function StateView({ rows, selected, onSelect }: { rows: ResultsRow[]; selected: string | null; onSelect: (r: ResultsRow) => void }) {
  useTouchHover(tiltCard, untiltCard);
  if (!rows.length) return null;
  const p0 = rows[0].prior;
  const statewide = rows.filter((r) => r.prior.office !== "house");
  const house = rows.filter((r) => r.prior.office === "house");
  const counted = rows.reduce((a, r) => a + (r.live?.total ?? 0), 0);
  const total = rows.reduce((a, r) => a + r.proj.projectedTotal, 0);
  const called = rows.filter((r) => r.proj.locked && r.proj.winner).length;
  const group = (label: string, list: ResultsRow[], offset: number) => list.length > 0 && (
    <div className="py-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider" style={muted}>{label}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {list.map((r, i) => <RaceCard key={raceHash(r.prior)} row={r} selected={selected} onSelect={onSelect} index={offset + i} />)}
      </div>
    </div>
  );
  return (
    <div>
      <div className="flex items-center gap-3 pb-2" style={{ borderBottom: "1px solid var(--app-text-primary)" }}>
        <StateGlyph state={p0.state} className="h-10 w-10 shrink-0" />
        <div className="min-w-0">
          <div className="text-xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>{p0.stateName}</div>
          <div className="text-[11px] tabular-nums" style={muted}>
            {total ? `${Math.round((counted / total) * 100)}% of the expected vote counted` : ""} · {called} of {rows.length} called · polls close {fmtClose(p0.pollsClose.first)}{p0.pollsClose.last !== p0.pollsClose.first ? `–${fmtClose(p0.pollsClose.last)}` : ""} ET
          </div>
        </div>
      </div>
      {house.length > 0 && (
        <div className="py-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider" style={muted}>House popular vote</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6"><HousePopularVote rows={house} /></div>
        </div>
      )}
      {group("Statewide", statewide, 0)}
      {group(`House · ${house.length} ${house.length === 1 ? "seat" : "seats"}`, house, statewide.length)}
    </div>
  );
}

/** The state's House popular vote: every House race's votes summed by party, margin over all votes
 *  (R-positive), beside the needle's projection (each seat's projected margin weighted by its
 *  projected vote). Uncontested seats count as the feed reports them. */
function HousePopularVote({ rows }: { rows: ResultsRow[] }) {
  let dem = 0, rep = 0, total = 0, projVotes = 0, projSum = 0;
  for (const { prior, live, proj } of rows) {
    if (live && live.total > 0) { const v = partyVotes(prior, live); dem += v.dem; rep += v.rep; total += live.total; }
    // A same-party contest's margin is between two candidates of one party: all of its vote is that party's.
    const seatMargin = prior.dem.party === prior.rep.party ? (prior.dem.party === "R" ? 100 : -100) : proj.margin;
    if (proj.projectedTotal > 0) { projVotes += proj.projectedTotal; projSum += seatMargin * proj.projectedTotal; }
  }
  const margin = total > 0 ? ((rep - dem) / total) * 100 : null;
  const projected = projVotes > 0 ? projSum / projVotes : null;
  const counted = projVotes > 0 ? Math.min(100, (total / projVotes) * 100) : 0;
  const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`;
  return (
    <div onPointerMove={tiltToPointer} onPointerLeave={resetTilt} data-touch-hover="" title={total > 0 ? `D ${fmtInt(dem)} · R ${fmtInt(rep)} · ${fmtInt(total)} votes counted` : undefined}
      className="rc-card group block h-full w-full self-start py-1 pl-3 text-left align-top" style={{ borderLeft: "1px solid var(--app-border)" }}>
      <div className="flex min-h-full flex-col justify-start">
      <div className="truncate text-sm font-semibold">{rows.length} {rows.length === 1 ? "seat" : "seats"} combined</div>
      {margin != null ? (
        <>
          <div className="mt-1 text-lg font-extrabold leading-none tabular-nums"><span key={fmtCall(margin)} className="rc-tick" style={{ color: callSideColor(margin) }}>{fmtCall(margin)}</span></div>
          <div className="mt-1 text-[10px] tabular-nums" style={veryMuted}><span style={{ color: inColor(inState(counted)), fontWeight: 600 }}>{fmtIn(counted)}</span> counted · <span style={{ color: "var(--party-dem)", fontWeight: 600 }}>D {pct(dem)}</span> <span style={{ color: "var(--party-rep)", fontWeight: 600 }}>R {pct(rep)}</span></div>
          {projected != null && <div className="overflow-hidden text-[11px] tabular-nums" style={muted}>Proj. Margin <b key={fmtCall(projected)} className="rc-tick" style={{ color: callSideColor(projected) }}>{fmtCall(projected)}</b></div>}
        </>
      ) : (
        <>
          <div className="mt-1 text-lg font-extrabold leading-none tabular-nums" style={{ color: callSideColor(projected) }}>{fmtCall(projected)}</div>
          <div className="mt-1 text-[10px]" style={veryMuted}>No votes counted yet · projected</div>
        </>
      )}
      <div className="mt-2 h-[3px] overflow-hidden rounded-full" style={{ background: "var(--app-tab-bg)" }}>
        <div className="rc-progress h-full rounded-full" style={{ width: `${counted}%`, background: callSideColor(margin) }} />
      </div>
      </div>
    </div>
  );
}

function ClosingTable({ rowsByOffice, selected, onSelect }: { rowsByOffice: Record<ResultsOffice, ResultsRow[]>; selected: string | null; onSelect: (r: ResultsRow) => void }) {
  useTouchHover(tiltCard, untiltCard);
  const groups = useMemo(() => {
    type St = { state: string; name: string; close: RacePrior["pollsClose"]; statewide: ResultsRow[]; house: ResultsRow[]; counted: number; total: number };
    const m = new Map<string, St>();
    const get = (p: RacePrior) => { let s = m.get(p.state); if (!s) { s = { state: p.state, name: p.stateName, close: p.pollsClose, statewide: [], house: [], counted: 0, total: 0 }; m.set(p.state, s); } return s; };
    for (const r of rowsByOffice.governor) get(r.prior).statewide.push(r);
    for (const r of rowsByOffice.senate) get(r.prior).statewide.push(r);
    for (const r of rowsByOffice.house) { const s = get(r.prior); if (r.prior.forecast.contest === "contested") s.house.push(r); }
    for (const o of RESULTS_OFFICES) for (const r of rowsByOffice[o]) { const s = get(r.prior); s.counted += r.live?.total ?? 0; s.total += r.proj.projectedTotal; }
    const states = [...m.values()].map((s) => {
      const house = [...s.house].sort((a, b) => Math.abs(a.prior.forecast.margin) - Math.abs(b.prior.forecast.margin)).filter((r) => Math.abs(r.prior.forecast.margin) < COMPETITIVE);
      return { ...s, cards: [...s.statewide, ...house].slice(0, Math.max(CARDS_PER_STATE, s.statewide.length)) };
    }).filter((s) => s.cards.length > 0);
    const byTime = new Map<string, typeof states>();
    for (const s of states) { const k = s.close.first; byTime.set(k, [...(byTime.get(k) ?? []), s]); }
    return [...byTime.entries()].sort((a, b) => closeMinutes(a[0]) - closeMinutes(b[0])).map(([time, ss]) => ({ time, states: ss.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [rowsByOffice]);

  return (
    <div className="space-y-8">
      {groups.map(({ time, states }) => (
        <div key={time}>
          <div className="flex items-baseline gap-3 pb-2" style={{ borderBottom: "1px solid var(--app-text-primary)" }}>
            <span className="text-xl font-bold tabular-nums" style={{ fontFamily: "var(--font-serif)" }}>{fmtClose(time)}</span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={muted}>ET · {states.length} {states.length === 1 ? "state" : "states"}</span>
          </div>
          {states.map((s) => (
            <div key={s.state} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]" style={{ borderBottom: "1px solid var(--app-border)" }}>
              {/* The state's silhouette beside its name (not under it), so it never makes the row taller than its cards */}
              <div className="flex items-start gap-2.5">
                <StateGlyph state={s.state} className="mt-0.5 h-9 w-9 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-[11px] tabular-nums" style={muted}>{s.total ? `${Math.round((s.counted / s.total) * 100)}% counted` : ""}</div>
                  {s.close.last !== s.close.first && <div className="text-[10px]" style={veryMuted}>{s.close.note ?? `some polls close at ${fmtClose(s.close.last)}`}</div>}
                </div>
              </div>
              <div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                  {s.cards.map((r, i) => <RaceCard key={raceHash(r.prior)} row={r} selected={selected} onSelect={onSelect} index={i} />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

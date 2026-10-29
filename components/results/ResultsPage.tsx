"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { StandfirstHeader } from "@/components/StandfirstHeader";
import { ELECTION_YEAR } from "@/lib/electionYear";
import ResultsMap, { type MapMode } from "@/components/results/ResultsMap";
import RaceDetail from "@/components/results/RaceDetail";
import ChamberCard from "@/components/results/ChamberCard";
import ResultsRaceTable from "@/components/results/ResultsRaceTable";
import { loadStaticJson } from "@/lib/useStaticJson";
import { fetchRaces, normalizeRace, CIVIC_ATTRIBUTION } from "@/lib/resultsFeed";
import { projectRace, tallyChamber, type ChamberTally } from "@/lib/resultsNeedle";
import { closeMinutes, fmtClose, fmtMargin, fmtTime, marginSideColor, partyColor, raceHash, fmtCall, callSideColor, fmtIn, inColor, inState } from "@/lib/resultsFormat";
import { SEAT_HOLDOVERS } from "@/lib/forecastTypes";
import { ELECTION_DATE, FEED_OPENS_AT, OFFICE_LABEL, RESULTS_OFFICES, type LiveRace, type PriorsSlice, type RacePrior, type RaceProjection, type ResultsOffice, type SeatSeries, type ArchiveSeries, type RaceHistory } from "@/lib/resultsTypes";

// The election-night Results page. Priors (forecast, nominees, county projection, closing times,
// civicAPI ids) come from the static slice /api/results/priors/{office}; live counts come
// straight from civicAPI in the browser (lib/resultsFeed.ts); the needle (lib/resultsNeedle.ts)
// runs on every refresh. Nothing here imports the forecast or a dataset.

export type ResultsRow = { prior: RacePrior; live: LiveRace | null; proj: RaceProjection };
type ArchiveSnapshot = { file: string; fetchedAt: string; set?: string };

const AUTO_EVERY_MS = 120_000;
/** County detail is refetched for competitive races at most this often; the selected race every refresh. */
const DETAIL_EVERY_MS = 5 * 60_000;
const COMPETITIVE = 15;
/** Points kept per race in the live margin record before the older half is thinned. */
const RACE_HISTORY_CAP = 160;
/** z for the 80% band. */
const Z80 = 1.2816;
const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };

type SortKey = "close" | "margin" | "projected" | "forecast" | "in";

// A published snapshot is the archive's .json.gz as is. Hosts serve it as application/gzip, but
// one that adds Content-Encoding hands over plain JSON already: only gunzip what starts gzipped.
async function readGzipJson(res: Response): Promise<unknown> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

const isCompetitive = (p: RacePrior) => p.forecast.contest === "contested" && Math.abs(p.forecast.margin) < COMPETITIVE;

export default function ResultsPage() {
  const [priors, setPriors] = useState<Record<ResultsOffice, PriorsSlice> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const liveRef = useRef(new Map<number, LiveRace>());
  const detailAt = useRef(new Map<number, number>());
  const abortRef = useRef<AbortController | null>(null);
  const [liveVersion, setLiveVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  const [auto, setAuto] = useState(true);
  const [allowTest, setAllowTest] = useState(false);
  const [office, setOffice] = useState<ResultsOffice>("senate");
  const [mapMode, setMapMode] = useState<MapMode>("status");
  const [sort, setSort] = useState<SortKey>("close");
  const [uncalledOnly, setUncalledOnly] = useState(false);
  // Key races: contested races the forecast has within COMPETITIVE points.
  const [keyOnly, setKeyOnly] = useState(false);
  const [raceView, setRaceView] = useState<"table" | "closing">("table");
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  // Replay: the archive script's snapshots, read from the dev-only archive routes, or on the
  // deployed site (where those are empty) from the simulated nights scripts/publish-sim-night.ts
  // copied to public/results-sim/. While a snapshot is shown the live feed is not read.
  const [archiveAll, setArchiveAll] = useState<ArchiveSnapshot[]>([]);
  const [archiveStatic, setArchiveStatic] = useState(false);
  // Sets: only the simulated nights (sim-*) for now, the pre-election preview; the latest set is
  // the default. The archiver's dated sets are civicAPI test data and are left out.
  const archiveSets = useMemo(() => Array.from(new Set(archiveAll.map((a) => a.set ?? "archive"))).filter((set) => set.startsWith("sim-")), [archiveAll]);
  const [archiveSet, setArchiveSet] = useState<string | null>(null);
  const activeSet = archiveSet && archiveSets.includes(archiveSet) ? archiveSet : archiveSets[archiveSets.length - 1] ?? null;
  const archive = useMemo(() => archiveAll.filter((a) => (a.set ?? "archive") === activeSet), [archiveAll, activeSet]);
  const [replay, setReplay] = useState<number | null>(null);
  const replayRef = useRef<number | null>(null);
  replayRef.current = replay;
  const [replayLoading, setReplayLoading] = useState(false);

  // Priors, once.
  useEffect(() => {
    Promise.all(RESULTS_OFFICES.map((o) => loadStaticJson<PriorsSlice>(`/api/results/priors/${o}`)))
      .then(([senate, governor, house]) => setPriors({ senate, governor, house }))
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  // ?test=1 previews the page on the stored simulated night (a replay; civicAPI is not read). A
  // live test payload still reads as "nothing in".
  useEffect(() => {
    setAllowTest(new URLSearchParams(window.location.search).get("test") === "1");
    const readHash = () => setSelected(window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : null);
    readHash();
    window.addEventListener("hashchange", readHash);
    window.addEventListener("popstate", readHash);
    return () => { window.removeEventListener("hashchange", readHash); window.removeEventListener("popstate", readHash); };
  }, []);

  const allPriors = useMemo(() => (priors ? [...priors.senate.races, ...priors.governor.races, ...priors.house.races] : []), [priors]);

  useEffect(() => {
    const list = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { snapshots: [] })).then((d: { snapshots?: ArchiveSnapshot[] }) => d.snapshots ?? []).catch(() => [] as ArchiveSnapshot[]);
    list("/api/results/archive").then(async (snaps) => {
      if (snaps.some((a) => a.set?.startsWith("sim-"))) return setArchiveAll(snaps);
      const published = await list("/results-sim/manifest.json");
      setArchiveStatic(published.length > 0);
      setArchiveAll(published);
    });
  }, []);

  // Before election night the feed is closed: no civicAPI requests at all. A page left open flips
  // itself on at FEED_OPENS_AT.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (now >= FEED_OPENS_AT) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(FEED_OPENS_AT - now + 500, 60 * 60_000));
    return () => clearTimeout(id);
  }, [now]);
  const feedOpen = now >= FEED_OPENS_AT;
  const feedOpenRef = useRef(feedOpen);
  feedOpenRef.current = feedOpen;

  const refresh = useCallback(async () => {
    if (!allPriors.length || replayRef.current != null || !feedOpenRef.current) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setRefreshing(true);
    const now = Date.now();
    const detail = (p: RacePrior) => {
      if (!p.civicId) return false;
      if (selectedRef.current === raceHash(p)) return true;
      return isCompetitive(p) && now - (detailAt.current.get(p.civicId) ?? 0) > DETAIL_EVERY_MS;
    };
    let n = 0;
    const result = await fetchRaces(allPriors, detail, (p, live) => {
      const prev = liveRef.current.get(p.civicId!);
      if (live.counties) detailAt.current.set(p.civicId!, now);
      // A topline refresh keeps the county detail fetched earlier (at most DETAIL_EVERY_MS old).
      liveRef.current.set(p.civicId!, live.counties || !prev?.counties ? live : { ...live, counties: prev.counties });
      if (++n % 40 === 0) setLiveVersion((v) => v + 1);
    }, ctl.signal);
    if (ctl.signal.aborted) return;
    setFailed(result.failed);
    setLastRefresh(Date.now());
    setLiveVersion((v) => v + 1);
    setRefreshing(false);
  }, [allPriors]);

  // First load, then every AUTO_EVERY_MS while the tab is visible.
  useEffect(() => { if (allPriors.length && feedOpen) refresh(); }, [allPriors, refresh, feedOpen]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, AUTO_EVERY_MS);
    return () => clearInterval(id);
  }, [auto, refresh]);

  // A snapshot from the archive replaces everything the live feed had (every race, counties included).
  const loadSnapshot = useCallback(async (index: number) => {
    const snap = archive[index];
    if (!snap || !allPriors.length) return;
    setReplayLoading(true);
    try {
      const res = await fetch(archiveStatic ? `/results-sim/${snap.file}` : `/api/results/archive?file=${encodeURIComponent(snap.file)}`, { cache: archiveStatic ? "force-cache" : "no-store" });
      if (!res.ok) throw new Error(`archive ${res.status}`);
      const data = (archiveStatic ? await readGzipJson(res) : await res.json()) as { fetchedAt: string; races: Record<string, unknown> };
      const at = Date.parse(data.fetchedAt) || Date.parse(snap.fetchedAt);
      const next = new Map<number, LiveRace>();
      for (const p of allPriors) {
        const raw = p.civicId ? data.races[String(p.civicId)] : null;
        if (raw) next.set(p.civicId!, normalizeRace(p, raw as never, at));
      }
      liveRef.current = next;
      detailAt.current = new Map();
      setLastRefresh(at);
      setFailed(0);
      setLiveVersion((v) => v + 1);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn(e);
    } finally {
      setReplayLoading(false);
    }
  }, [archive, allPriors, archiveStatic]);

  const startReplay = useCallback((index: number) => {
    const i = Math.max(0, Math.min(archive.length - 1, index));
    abortRef.current?.abort();
    setRefreshing(false);
    setReplay(i);
    loadSnapshot(i);
  }, [archive.length, loadSnapshot]);

  const exitReplay = useCallback(() => {
    setReplay(null);
    replayRef.current = null;
    liveRef.current = new Map();
    detailAt.current = new Map();
    setLiveVersion((v) => v + 1);
    refresh();
  }, [refresh]);

  // ?test=1: start the replay at the first snapshot once the archive and the priors are in.
  const previewStarted = useRef(false);
  useEffect(() => {
    if (!allowTest || previewStarted.current || !archive.length || !allPriors.length) return;
    previewStarted.current = true;
    startReplay(0);
  }, [allowTest, archive.length, allPriors.length, startReplay]);

  // The selected race's county detail, as soon as it is selected.
  useEffect(() => {
    if (!selected || !allPriors.length || replay != null || !feedOpen) return;
    const p = allPriors.find((x) => raceHash(x) === selected);
    if (!p || !p.civicId || liveRef.current.get(p.civicId)?.counties) return;
    fetchRaces([p], () => true, (pr, live) => { liveRef.current.set(pr.civicId!, live); detailAt.current.set(pr.civicId!, Date.now()); setLiveVersion((v) => v + 1); });
  }, [selected, allPriors, replay, feedOpen]);

  // Replaying an archive shows whatever it holds, test data included.
  const showTest = replay != null;
  const rowsByOffice = useMemo(() => {
    void liveVersion;
    const out = {} as Record<ResultsOffice, ResultsRow[]>;
    for (const o of RESULTS_OFFICES) {
      out[o] = (priors?.[o].races ?? []).map((prior) => {
        const raw = prior.civicId ? liveRef.current.get(prior.civicId) ?? null : null;
        const live = raw && raw.testData && !showTest ? null : raw;
        return { prior, live, proj: projectRace(prior, live) };
      });
    }
    return out;
  }, [priors, liveVersion, showTest]);

  const testSeen = useMemo(() => { void liveVersion; for (const l of liveRef.current.values()) if (l.testData) return true; return false; }, [liveVersion]);

  const tallies = useMemo(() => Object.fromEntries(RESULTS_OFFICES.map((o) => [o, tallyChamber(rowsByOffice[o], SEAT_HOLDOVERS[o])])) as Record<ResultsOffice, ChamberTally>, [rowsByOffice]);

  // The seat charts' history. Live: one point per refresh, kept in this browser so a reload does
  // not lose the night (a per-viewer convenience; nothing depends on it). Replay: the needle run
  // over every snapshot of the archive set on the server, shown up to the current snapshot.
  const liveKey = `results-seat-history-${ELECTION_DATE}${showTest ? "-test" : ""}`;
  const [liveSeries, setLiveSeries] = useState<SeatSeries>({ senate: [], governor: [], house: [] });
  useEffect(() => {
    try { const raw = localStorage.getItem(liveKey); setLiveSeries(raw ? (JSON.parse(raw) as SeatSeries) : { senate: [], governor: [], house: [] }); } catch { setLiveSeries({ senate: [], governor: [], house: [] }); }
  }, [liveKey]);
  useEffect(() => {
    if (replay != null || !lastRefresh || refreshing) return;
    setLiveSeries((prev) => {
      if (prev.senate.length && prev.senate[prev.senate.length - 1].t >= lastRefresh) return prev;
      const next = Object.fromEntries(RESULTS_OFFICES.map((o) => {
        const e = tallies[o].projectedDem;
        return [o, [...prev[o], { t: lastRefresh, mean: e.seats, lo: e.lo80, hi: e.hi80 }].slice(-500)];
      })) as SeatSeries;
      try { localStorage.setItem(liveKey, JSON.stringify(next)); } catch { /* storage unavailable: keep it in memory */ }
      return next;
    });
  }, [lastRefresh, refreshing, replay, tallies, liveKey]);
  // Each counting race's projected margin, the same way: one [t, margin, sigma, counted] per refresh while
  // it changes, kept compact and capped (older points thinned) so the night fits in storage.
  const raceKey = `results-race-history-${ELECTION_DATE}${showTest ? "-test" : ""}`;
  const [liveRaces, setLiveRaces] = useState<Record<string, [number, number, number, (number | null)?][]>>({});
  useEffect(() => {
    try { const raw = localStorage.getItem(raceKey); setLiveRaces(raw ? JSON.parse(raw) : {}); } catch { setLiveRaces({}); }
  }, [raceKey]);
  useEffect(() => {
    if (replay != null || !lastRefresh || refreshing) return;
    setLiveRaces((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const o of RESULTS_OFFICES) for (const { prior, live, proj } of rowsByOffice[o]) {
        if (!live || live.total <= 0) continue;
        const k = raceHash(prior), pts = next[k] ?? [], last = pts[pts.length - 1];
        const r1 = (v: number) => Math.round(v * 10) / 10;
        const pt: [number, number, number, number | null] = [lastRefresh, r1(proj.margin), r1(proj.sigma), proj.currentMargin == null ? null : r1(proj.currentMargin)];
        if (last && last[0] >= lastRefresh) continue;
        // An unchanged projection only moves the last point's time forward.
        const same = (q: (typeof pts)[number]) => q[1] === pt[1] && q[2] === pt[2] && (q[3] ?? null) === pt[3];
        const out = last && same(last) && pts.length > 1 && same(pts[pts.length - 2]) ? [...pts.slice(0, -1), pt] : [...pts, pt];
        next[k] = out.length > RACE_HISTORY_CAP ? [...out.slice(0, RACE_HISTORY_CAP / 2).filter((_, i) => i % 2 === 0), ...out.slice(RACE_HISTORY_CAP / 2)] : out;
        changed = true;
      }
      if (!changed) return prev;
      try { localStorage.setItem(raceKey, JSON.stringify(next)); } catch { /* storage unavailable: keep it in memory */ }
      return next;
    });
  }, [lastRefresh, refreshing, replay, rowsByOffice, raceKey]);
  const [archiveSeries, setArchiveSeries] = useState<{ set: string; series: ArchiveSeries } | null>(null);
  useEffect(() => {
    if (replay == null || !activeSet || archiveSeries?.set === activeSet) return;
    fetch(archiveStatic ? `/results-sim/${activeSet}/series.json` : `/api/results/archive/series?set=${encodeURIComponent(activeSet)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((series: ArchiveSeries | null) => { if (series && RESULTS_OFFICES.every((o) => Array.isArray(series[o]))) setArchiveSeries({ set: activeSet, series }); }).catch(() => {});
  }, [replay, activeSet, archiveSeries?.set, archiveStatic]);
  const seatHistory: SeatSeries = useMemo(() => {
    if (replay == null) return liveSeries;
    const series = archiveSeries?.set === activeSet ? archiveSeries.series : null;
    const now = archive[replay] ? Date.parse(archive[replay].fetchedAt) : Infinity;
    if (!series) return { senate: [], governor: [], house: [] };
    return Object.fromEntries(RESULTS_OFFICES.map((o) => [o, series[o].filter((p) => p.t <= now + 1)])) as SeatSeries;
  }, [replay, liveSeries, archiveSeries, activeSet, archive]);

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

  // The open race's projected and counted margins over the night, from the live record or the
  // replayed archive. The counted series has no band and starts at the first counted vote.
  const raceHistory: RaceHistory = useMemo(() => {
    const empty: RaceHistory = { projected: [], counted: [] };
    if (!selected) return empty;
    let rows: [number, number, number, number | null][];
    if (replay == null) rows = (liveRaces[selected] ?? []).map(([t, m, sg, c]) => [t, m, sg, c ?? null]);
    else {
      const series = archiveSeries?.set === activeSet ? archiveSeries.series : null;
      const pts = series?.races?.[selected];
      if (!series || !pts) return empty;
      const now = archive[replay] ? Date.parse(archive[replay].fetchedAt) : Infinity;
      rows = pts.map(([m, sg, c], i): [number, number, number, number | null] => [series.senate[i]?.t ?? 0, m, sg, c ?? null]).filter(([t]) => t && t <= now + 1);
    }
    return {
      projected: rows.map(([t, m, sg]) => ({ t, mean: m, lo: m - Z80 * sg, hi: m + Z80 * sg })),
      counted: rows.flatMap(([t, , , c]) => (c == null ? [] : [{ t, mean: c, lo: c, hi: c }])),
    };
  }, [selected, replay, liveRaces, archiveSeries, activeSet, archive]);

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
    <StandfirstHeader kicker="Election night" title={`${ELECTION_YEAR} Results`} href="/overview" hubLabel="Overview" />
  );
  const main = "mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8";
  if (loadError) return <>{header}<main className={main}><p className="text-sm" style={muted}>The priors failed to load ({loadError}). Reload the page.</p></main></>;
  if (!priors) return <>{!selected && header}<main className={main}><p className="text-sm" style={muted}>Loading the forecast priors…</p></main></>;

  const anyIn = RESULTS_OFFICES.some((o) => tallies[o].racesIn > 0);

  const status = (
    <>
      {/* Status line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={muted}>
        <span>Results from <a href={CIVIC_ATTRIBUTION.href} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">{CIVIC_ATTRIBUTION.label}</a>{lastRefresh ? ` · ${replay != null ? "snapshot from" : "fetched"} ${fmtTime(lastRefresh)}` : ""}{failed ? ` · ${failed} races failed to load` : ""}</span>
        {replay == null && !feedOpen ? (
          <span className="rounded px-2 py-0.5 font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
            Live results begin on election night, after the first polls close at 6 PM ET on November 3.{archive.length > 0 && <> <button onClick={() => startReplay(0)} className="font-normal underline" style={muted}>Preview a simulated night</button></>}
          </span>
        ) : replay == null ? (
          <>
            <button onClick={() => refresh()} disabled={refreshing} className="rounded px-2 py-1 font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-primary)", opacity: refreshing ? 0.6 : 1 }}>{refreshing ? "Refreshing…" : "Refresh now"}</button>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto-refresh every 2 min</label>
          </>
        ) : (
          <button onClick={exitReplay} className="rounded px-2 py-1 font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>Back to live</button>
        )}
        {testSeen && !showTest && <span className="rounded px-2 py-0.5 font-semibold" style={{ background: "var(--app-tab-bg)" }}>civicAPI is serving pre-election test data; counts are hidden until real results begin.</span>}
        {replay != null && activeSet?.startsWith("sim-") && <span className="rounded px-2 py-0.5 font-semibold" style={{ background: "var(--party-rep)", color: "#ffffff" }}>SIMULATED NIGHT — not results</span>}
        {testSeen && showTest && !activeSet?.startsWith("sim-") && <span className="rounded px-2 py-0.5 font-semibold" style={{ background: "var(--party-rep)", color: "#ffffff" }}>TEST DATA — randomized by civicAPI, not results</span>}
        {/* On a race's page: back to the dashboard, at the line's right end */}
        {selectedRow && (
          <button onClick={() => select(null)} className="ml-auto inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors hover:text-[var(--app-text-primary)]"
            style={{ border: "1px solid var(--app-border)", background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>← All results</button>
        )}
      </div>

      {/* Replay: the dev archive, or the published simulated nights */}
      {archive.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-2 text-xs" style={{ border: "1px dashed var(--app-border)", color: "var(--app-text-muted)" }}>
          <span className="font-bold uppercase tracking-wider text-[10px]">Replay archive</span>
          {archiveSets.length > 1 && (
            <select value={activeSet ?? ""} onChange={(e) => { setArchiveSet(e.target.value); if (replay != null) { setReplay(null); replayRef.current = null; } }} className="rounded px-1 py-0.5 text-xs" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} aria-label="Archive set">
              {archiveSets.map((set) => <option key={set} value={set}>{set.startsWith("sim-") ? `simulated · ${set.slice(4)}` : set}</option>)}
            </select>
          )}
          <span>{archive.length} snapshots · {fmtTime(Date.parse(archive[0].fetchedAt))}–{fmtTime(Date.parse(archive[archive.length - 1].fetchedAt))}{activeSet?.startsWith("sim-") ? " (virtual clock, ET)" : ""}</span>
          <button onClick={() => startReplay((replay ?? 0) - 1)} disabled={replay != null && replay <= 0} className="rounded px-2 py-0.5 font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} aria-label="Previous snapshot">◀</button>
          <input type="range" min={0} max={archive.length - 1} value={replay ?? 0} onChange={(e) => startReplay(Number(e.target.value))} className="w-56 sm:w-80" aria-label="Snapshot" />
          <button onClick={() => startReplay((replay ?? -1) + 1)} disabled={replay != null && replay >= archive.length - 1} className="rounded px-2 py-0.5 font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} aria-label="Next snapshot">▶</button>
          <span className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{replay != null ? `${replay + 1} / ${archive.length} · ${new Date(archive[replay].fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "live"}{replayLoading ? " · loading…" : ""}</span>
          {replay == null && <button onClick={() => startReplay(0)} className="underline underline-offset-2">Start from the first snapshot</button>}
        </div>
      )}
    </>
  );

  // A race's own page.
  if (selectedRow) {
    return (
      <main className={main}>
        <div id="race-detail" className="space-y-6">
          <div className="space-y-3">{status}</div>
          <RaceDetail row={selectedRow} history={raceHistory} />
        </div>
      </main>
    );
  }

  return (
    <>
    {header}
    <main className="mx-auto max-w-7xl px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-3">
    <div className="space-y-3">{status}</div>
    <div className="mt-6 space-y-10">

      {/* Map, with the balance of power beside it at xl (stacked below xl) */}
      <div className="grid gap-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:gap-8">
      <section>
        <LedgerSectionHead label="Map" right={
          <div className="flex flex-wrap items-center gap-1">
            <OfficeTabs office={office} setOffice={setOffice} />
            <Sep />
            {(["status", "current", "projected"] as MapMode[]).map((m) => <Tab key={m} active={mapMode === m} onClick={() => setMapMode(m)}>{m === "status" ? "Status" : m === "current" ? "Margin" : "Projected margin"}</Tab>)}
          </div>
        } />
        <ResultsMap office={office} rows={rowsByOffice[office]} mode={mapMode} selected={selected} onSelect={select} />
      </section>

      {/* Dashboard */}
      <section>
        <LedgerSectionHead label="Balance of power" meta={anyIn ? <BarLegend /> : "nothing counted yet"} />
        <div className="grid gap-8 sm:grid-cols-3 sm:gap-10 xl:grid-cols-1 xl:gap-6">
          {RESULTS_OFFICES.map((o) => <ChamberCard key={o} office={o} tally={tallies[o]} rows={rowsByOffice[o]} history={seatHistory[o]} />)}
        </div>
      </section>
      </div>

      {/* Races: the sortable table, or the same races by poll-closing time */}
      <section>
        <LedgerSectionHead label={raceView === "table" ? `${OFFICE_LABEL[office]} races` : "Races by poll closing time"}
          meta={raceView === "table"
            ? `${uncalledOnly || keyOnly ? `${sortedRows.length} of ${rowsByOffice[office].length} races` : `${rowsByOffice[office].length} races`}${keyOnly ? ` · forecast within ${COMPETITIVE}` : ""} · click a row to open it`
            : "governor, Senate, then the closest House races"}
          right={
          <div className="flex flex-wrap items-center gap-1">
            <Tab active={raceView === "table"} onClick={() => setRaceView("table")}>Table</Tab>
            <Tab active={raceView === "closing"} onClick={() => setRaceView("closing")}>By poll close</Tab>
            {raceView === "table" && (
              <>
                <Sep />
                <OfficeTabs office={office} setOffice={setOffice} />
                <Sep />
                <Tab active={keyOnly} onClick={() => setKeyOnly((v) => !v)}>Key races</Tab>
                <Tab active={uncalledOnly} onClick={() => setUncalledOnly((v) => !v)}>Uncalled only</Tab>
                <span className="mx-1 hidden sm:inline" style={veryMuted}>|</span>
                <label className="ml-auto text-xs sm:ml-0" style={muted}>Sort <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded px-1 py-0.5 text-xs" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
                  <option value="close">Poll close</option><option value="margin">Closest count</option><option value="projected">Closest projection</option><option value="forecast">Closest forecast</option><option value="in">Most counted</option>
                </select></label>
              </>
            )}
          </div>
        } />
        {raceView === "table" ? (
          <>
            <ResultsRaceTable rows={sortedRows} selected={selected} onSelect={select} />
            {sortedRows.length === 0 && (uncalledOnly || keyOnly) && <p className="mt-3 text-sm" style={muted}>{uncalledOnly && keyOnly ? `Every key ${OFFICE_LABEL[office]} race has been called.` : uncalledOnly ? `Every ${OFFICE_LABEL[office]} race has been called.` : `No ${OFFICE_LABEL[office]} race is forecast within ${COMPETITIVE} points.`}</p>}
          </>
        ) : (
          <ClosingTable rowsByOffice={rowsByOffice} selected={selected} onSelect={select} />
        )}
      </section>

      <p className="max-w-3xl text-xs leading-relaxed" style={veryMuted}>
        Counts and race calls are <a href={CIVIC_ATTRIBUTION.href} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">civicAPI</a>&rsquo;s, read directly by this page. The projected margin is the needle: the pre-election county projection updated by the counties that have reported, with a shared swing shrunk toward zero while little is in. It never calls a race. Ranked-choice races (Alaska, Maine) show first choices; the projection is of the final round. Louisiana House seats are a jungle round. <Link href="/analysis/internal-methodology/turnout#results-needle" prefetch={false} className="underline underline-offset-2">How this is built</Link>.
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

/** How many races a state shows in the poll-closing view: governor and Senate, then the House
 *  races the forecast has closest, up to this many in all. */
const CARDS_PER_STATE = 6;

function RaceCard({ row, selected, onSelect }: { row: ResultsRow; selected: string | null; onSelect: (r: ResultsRow) => void }) {
  const { prior, proj, live } = row;
  const key = raceHash(prior);
  const hasVotes = !!live && live.total > 0;
  const office = prior.office === "house" ? "House" : prior.office === "senate" ? `Senate${prior.special ? " special" : ""}` : "Governor";
  const name = prior.office === "house" ? prior.label : office;
  const ratingColor = prior.forecast.rating.startsWith("Toss") ? "var(--app-text-primary)" : prior.forecast.rating.endsWith("D") ? "var(--party-dem)" : "var(--party-rep)";
  return (
    <button onClick={() => onSelect(row)} className="group block h-full w-full self-start py-1 pl-3 text-left align-top transition-opacity hover:opacity-70"
      style={{ borderLeft: `${selected === key ? 2 : 1}px solid ${selected === key ? "var(--app-text-primary)" : "var(--app-border)"}` }}>
      <div className="flex min-h-full flex-col justify-start">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold">{name}</span>
        {proj.locked && proj.winner && <span className="font-mono text-[9px] font-bold uppercase tracking-wider" style={{ color: partyColor(proj.winner) }}>Called</span>}
      </div>
      {hasVotes ? (
        <>
          <div className="mt-1 text-lg font-extrabold leading-none tabular-nums" style={{ color: callSideColor(proj.currentMargin, prior) }}>{fmtCall(proj.currentMargin, prior)}</div>
          <div className="mt-1 text-[10px] tabular-nums" style={veryMuted}><span style={{ color: inColor(inState(proj.countedShare * 100)), fontWeight: 600 }}>{fmtIn(proj.countedShare * 100)}</span> counted</div>
          <div className="text-[11px] tabular-nums" style={muted}>Proj. Margin <b style={{ color: callSideColor(proj.margin, prior) }}>{fmtCall(proj.margin, prior)}</b></div>
        </>
      ) : (
        <>
          <div className="mt-1 text-lg font-extrabold leading-none" style={{ color: ratingColor }}>{prior.forecast.rating}</div>
          <div className="mt-1 text-[10px]" style={veryMuted}>No votes counted yet</div>
        </>
      )}
      </div>
    </button>
  );
}

function ClosingTable({ rowsByOffice, selected, onSelect }: { rowsByOffice: Record<ResultsOffice, ResultsRow[]>; selected: string | null; onSelect: (r: ResultsRow) => void }) {
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
            <div key={s.state} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)]" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-[11px] tabular-nums" style={muted}>{s.total ? `${Math.round((s.counted / s.total) * 100)}% counted` : ""}</div>
                {s.close.last !== s.close.first && <div className="text-[10px]" style={veryMuted}>{s.close.note ?? `some polls close at ${fmtClose(s.close.last)}`}</div>}
              </div>
              <div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                  {s.cards.map((r) => <RaceCard key={raceHash(r.prior)} row={r} selected={selected} onSelect={onSelect} />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

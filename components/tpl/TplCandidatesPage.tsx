"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { statesData } from "@/data/statesData";
import { useStaticJson } from "@/lib/useStaticJson";
import { TplSubNav } from "./TplSubNav";
import { OFFICE_LABELS, candidateSlug, districtHref, marginColor, stateHref } from "./format";
import type { WarSlim } from "./types";
import { CandidateLink, Foot, M, Pills, Segmented, SubHead, TD, TD_R, TH, TH_R, VERY_MUTED, WarChip } from "./ui";

// The candidates view: one row per race with both nominees and their WAR (or one row per
// candidate-performance), filters and search, and — when a name is clicked anywhere on the
// site — that person's record under the table. The selection lives in the URL (?c=slug) so
// links land on a person; the full table is fetched once the page is open.

type Office = "all" | "P" | "S" | "G" | "H";
type Party = "all" | "D" | "R" | "I";
type Year = "all" | number;
type View = "race" | "candidate";
type Sort = "winner" | "runner" | "newest" | "closest";

type RaceGroup = { key: string; state: string; office: WarSlim["office"]; race: string; year: number; actual: number; expected: number; winner: WarSlim | null; loser: WarSlim | null; pastHref?: string };

function groupRaces(rows: WarSlim[]): RaceGroup[] {
  const map = new Map<string, WarSlim[]>();
  for (const r of rows) {
    const k = `${r.state}|${r.office}|${r.race}|${r.year}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(r);
  }
  const out: RaceGroup[] = [];
  for (const [key, rs] of map) {
    const first = rs[0];
    const rSlot = rs.find((r) => r.party === "R") ?? null;
    const dSlot = rs.find((r) => r !== rSlot) ?? null;
    const rWon = first.actual > 0;
    out.push({ key, state: first.state, office: first.office, race: first.race, year: first.year, actual: first.actual, expected: first.expected, winner: rWon ? rSlot : dSlot, loser: rWon ? dSlot : rSlot, pastHref: first.pastHref });
  }
  return out;
}

function raceLabel(r: { office: WarSlim["office"]; race: string }): string {
  return r.office === "H" ? r.race.replace(/^House /, "") : r.race;
}
function placeHref(r: { office: WarSlim["office"]; race: string; state: string }): string {
  const st = statesData.find((s) => s.abbr === r.state);
  const id = st?.id ?? r.state.toLowerCase();
  return r.office === "H" ? districtHref(id, r.race.replace(/^House /, "")) : stateHref(id);
}

export function TplCandidatesPage({ initialRows, initialYear, totals }: { initialRows: WarSlim[]; initialYear: number; totals: { races: number; performances: number } }) {
  // The selection lives in the URL (?c=slug, ?state=OH) but is read from it after mount and on
  // back/forward, not through useSearchParams — that would defer the whole prerendered table to
  // the client. In-page name clicks are intercepted below and pushed into history the same way.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [stateParam, setStateParam] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(window.location.search);
      // Sync from the URL after mount and on popstate; neither is available during SSR.
      setSelectedSlug(q.get("c"));
      setStateParam(q.get("state")?.toUpperCase() ?? null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const selectCandidate = (slug: string | null) => {
    setSelectedSlug(slug);
    window.history.pushState(null, "", slug ? `/model/candidates?c=${encodeURIComponent(slug)}` : "/model/candidates");
  };
  const onClickCapture = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a[href]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const m = a.getAttribute("href")?.match(/^\/model\/candidates\?c=([^&#]+)/);
    if (!m) return;
    e.preventDefault();
    selectCandidate(decodeURIComponent(m[1]));
  };

  const full = useStaticJson<WarSlim[]>("/api/model/war");
  const rows = full.data ?? initialRows;
  const loadedAll = !!full.data;

  const [view, setView] = useState<View>("race");
  const [office, setOffice] = useState<Office>("all");
  const [party, setParty] = useState<Party>("all");
  const [year, setYear] = useState<Year>(initialYear);
  const [state, setState] = useState<string>(stateParam ?? "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("winner");
  const [limit, setLimit] = useState(100);

  // ?state=OH from a state page: that state, every year.
  const appliedState = useRef<string | null>(null);
  useEffect(() => {
    if (stateParam && appliedState.current !== stateParam) {
      appliedState.current = stateParam;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(stateParam);
      setYear("all");
    }
  }, [stateParam]);

  const years = useMemo(() => [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a), [rows]);
  const stateAbbrs = useMemo(() => new Set(statesData.map((s) => s.abbr.toLowerCase())), []);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    return rows.filter((r) =>
      (office === "all" || r.office === office) &&
      (party === "all" || (party === "I" ? r.party !== "D" && r.party !== "R" : r.party === party)) &&
      (year === "all" || r.year === year) &&
      (state === "all" || r.state === state) &&
      terms.every((t) => /^\d{4}$/.test(t) ? String(r.year) === t : stateAbbrs.has(t) ? r.state.toLowerCase() === t
        : r.candidate.toLowerCase().includes(t) || r.race.toLowerCase().includes(t) || OFFICE_LABELS[r.office].toLowerCase().includes(t)));
  }, [rows, office, party, year, state, query, stateAbbrs]);

  const races = useMemo(() => {
    // A party or name filter should still show the whole race the matching row belongs to.
    const keys = new Set(filtered.map((r) => `${r.state}|${r.office}|${r.race}|${r.year}`));
    const groups = groupRaces(rows.filter((r) => keys.has(`${r.state}|${r.office}|${r.race}|${r.year}`)));
    const w = (g: RaceGroup) => g.winner?.war ?? -Infinity, l = (g: RaceGroup) => g.loser?.war ?? -Infinity;
    if (sort === "winner") groups.sort((a, b) => w(b) - w(a));
    else if (sort === "runner") groups.sort((a, b) => l(b) - l(a));
    else if (sort === "closest") groups.sort((a, b) => Math.abs(a.actual) - Math.abs(b.actual));
    else groups.sort((a, b) => b.year - a.year || a.state.localeCompare(b.state) || a.race.localeCompare(b.race, undefined, { numeric: true }));
    return groups;
  }, [rows, filtered, sort]);

  const performances = useMemo(() => {
    const list = [...filtered];
    if (sort === "winner") list.sort((a, b) => b.war - a.war);
    else if (sort === "runner") list.sort((a, b) => a.war - b.war);
    else if (sort === "closest") list.sort((a, b) => Math.abs(a.actual) - Math.abs(b.actual));
    else list.sort((a, b) => b.year - a.year || a.state.localeCompare(b.state) || a.race.localeCompare(b.race, undefined, { numeric: true }));
    return list;
  }, [filtered, sort]);

  // ── Candidate record ─────────────────────────────────────────────────────
  const record = useMemo(() => {
    if (!selectedSlug) return null;
    const mine = rows.filter((r) => candidateSlug(r.candidate) === selectedSlug).sort((a, b) => a.year - b.year);
    if (mine.length === 0) return { name: selectedSlug.replace(/-/g, " "), rows: [] as WarSlim[], opponents: new Map<string, WarSlim | null>() };
    const opponents = new Map<string, WarSlim | null>();
    for (const r of mine) {
      const k = `${r.state}|${r.office}|${r.race}|${r.year}`;
      opponents.set(k, rows.find((x) => x !== r && `${x.state}|${x.office}|${x.race}|${x.year}` === k) ?? null);
    }
    return { name: mine[0].candidate, rows: mine, opponents };
  }, [rows, selectedSlug]);
  const recordRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedSlug && recordRef.current) recordRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selectedSlug]);

  const counts = view === "race" ? `${races.length.toLocaleString()} race${races.length === 1 ? "" : "s"}` : `${performances.length.toLocaleString()} candidate-performance${performances.length === 1 ? "" : "s"}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <TplSubNav methodologyHref="/methodology/war" methodologyLabel="How WAR works" />
          <div className="pb-6 pt-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Wins Above Replacement · 2016–2025</div>
                <h1 className="mt-2" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.02em" }}>Candidates</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                  How far each nominee ran ahead of a replacement-level candidate of their party, once the seat&apos;s lean, the year&apos;s environment, incumbency and structural money are taken out. A ridge regression pools every race a person has run; effects fade 0.8 per year.
                </p>
              </div>
              <div className="shrink-0 sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Races scored</div>
                <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1 }}>{totals.races.toLocaleString()}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>{totals.performances.toLocaleString()} candidate-performances · P · S · G · H</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 sm:px-6" onClickCapture={onClickCapture}>
        <section className="mt-6">
          <LedgerSectionHead label={view === "race" ? "Races" : "Candidate-performances"} meta={`${counts}${loadedAll ? "" : ` · ${initialYear} loaded, the rest on its way`}`}
            right={<Segmented label="View" options={[{ key: "race", label: "By race" }, { key: "candidate", label: "By candidate" }]} value={view} onChange={setView} />} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5"><span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Office</span>
              <Pills label="Office" size="xs" value={office} onChange={setOffice} options={[{ key: "all" as Office, label: "All" }, { key: "P" as Office, label: "P" }, { key: "S" as Office, label: "S" }, { key: "G" as Office, label: "G" }, { key: "H" as Office, label: "H" }]} /></span>
            <span className="flex items-center gap-1.5"><span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Party</span>
              <Pills label="Party" size="xs" value={party} onChange={setParty} options={[{ key: "all" as Party, label: "All" }, { key: "D" as Party, label: "D" }, { key: "R" as Party, label: "R" }, { key: "I" as Party, label: "I" }]} /></span>
            <span className="flex items-center gap-1.5"><span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Year</span>
              <select aria-label="Filter by year" value={String(year)} onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))} className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}>
                <option value="all">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select></span>
            <span className="flex items-center gap-1.5"><span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>State</span>
              <select aria-label="Filter by state" value={state} onChange={(e) => setState(e.target.value)} className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}>
                <option value="all">All states</option>
                {[...statesData].sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.abbr} value={s.abbr}>{s.abbr} — {s.name}</option>)}
              </select></span>
            <span className="flex items-center gap-1.5"><span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Sort</span>
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}>
                <option value="winner">{view === "race" ? "Biggest winner WAR" : "▲ Overperformers"}</option>
                <option value="runner">{view === "race" ? "Biggest runner-up WAR" : "▼ Underperformers"}</option>
                <option value="closest">Closest races</option>
                <option value="newest">Newest first</option>
              </select></span>
            <input type="search" aria-label="Search performances" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(100); }} placeholder="Search year, state, race, candidate…"
              className="min-w-[12rem] flex-1 rounded-md px-3 py-1.5 text-sm sm:max-w-xs" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} />
          </div>

          <div className="-mx-1 mt-3 overflow-x-auto px-1">
            {view === "race" ? (
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-muted)" }}>
                    <th className={TH}>Race</th><th className={TH}>Winner · WAR</th><th className={TH}>Runner-up · WAR</th><th className={TH_R}>Actual</th><th className={`${TH_R} hidden sm:table-cell`}>Expected</th><th className={`${TH} hidden md:table-cell`}>Place TPL</th><th className={`${TH} hidden sm:table-cell`} />
                  </tr>
                </thead>
                <tbody>
                  {races.length === 0 && <tr><td colSpan={7} className="px-2 py-6 text-center" style={VERY_MUTED}>No performances match the filters.</td></tr>}
                  {races.slice(0, limit).map((g) => (
                    <tr key={g.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td className={`${TD} font-medium`}>
                        <span className="mr-1.5 rounded px-1 py-px font-mono text-[9px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{g.office}</span>
                        {g.year} · {g.state} {g.pastHref ? <Link href={g.pastHref} className="underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)" }}>{raceLabel(g)}</Link> : raceLabel(g)}
                      </td>
                      <td className={TD}><CandidateLink name={g.winner?.candidate} party={g.winner?.party} war={g.winner?.war} /></td>
                      <td className={TD}><CandidateLink name={g.loser?.candidate} party={g.loser?.party} war={g.loser?.war} /></td>
                      <td className={TD_R}><M v={g.actual} digits={1} /></td>
                      <td className={`${TD_R} hidden sm:table-cell`}><M v={g.expected} digits={1} /></td>
                      <td className={`${TD} hidden md:table-cell`}><Link href={placeHref(g)} className="underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)", color: "var(--app-text-muted)" }}>{g.office === "H" ? raceLabel(g) : g.state} ›</Link></td>
                      <td className={`${TD} hidden sm:table-cell`} style={VERY_MUTED}>{g.pastHref && <Link href={g.pastHref} className="hover:underline">results ›</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-muted)" }}>
                    <th className={TH}>#</th><th className={TH}>Candidate</th><th className={TH}>Race</th><th className={TH}>Year</th><th className={TH_R}>Actual</th><th className={`${TH_R} hidden sm:table-cell`}>Expected</th><th className={`${TH_R} hidden sm:table-cell`}>vs Opp</th><th className={`${TH_R} hidden md:table-cell`}>Effect</th><th className={TH_R}>WAR</th>
                  </tr>
                </thead>
                <tbody>
                  {performances.length === 0 && <tr><td colSpan={9} className="px-2 py-6 text-center" style={VERY_MUTED}>No performances match the filters.</td></tr>}
                  {performances.slice(0, limit).map((r, i) => (
                    <tr key={`${r.state}|${r.office}|${r.race}|${r.year}|${r.candidate}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td className={TD} style={VERY_MUTED}>{i + 1}</td>
                      <td className={TD}><CandidateLink name={r.candidate} party={r.party} /></td>
                      <td className={TD}>{r.pastHref ? <Link href={r.pastHref} className="underline decoration-dotted underline-offset-4" style={{ textDecorationColor: "var(--app-border)" }}>{raceLabel(r)} · {r.state}</Link> : `${raceLabel(r)} · ${r.state}`}</td>
                      <td className={TD}>{r.year}</td>
                      <td className={TD_R}><M v={r.actual} digits={1} /></td>
                      <td className={`${TD_R} hidden sm:table-cell`}><M v={r.expected} digits={1} /></td>
                      <td className={`${TD_R} hidden sm:table-cell`}><M v={r.vsOpp} digits={1} /></td>
                      <td className={`${TD_R} hidden md:table-cell`}>{r.effect > 0 ? "+" : ""}{r.effect.toFixed(1)} <span style={VERY_MUTED}>n={r.effectN}</span></td>
                      <td className={TD_R}><WarChip war={r.war} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Foot>
            {(view === "race" ? races.length : performances.length) > limit && <><button type="button" onClick={() => setLimit((l) => l + 200)} className="underline">Show more</button> · </>}
            WAR is each candidate&apos;s Wins Above Replacement in that race, signed toward them. Expected is generic vs generic for that seat and year. Place TPL opens the state page, or the district inside it. Results opens the election&apos;s own page. Click any name for the record.
          </Foot>
        </section>

        {record && (
          <section ref={recordRef} className="mt-10 scroll-mt-24">
            <LedgerSectionHead label="Selected candidate" right={<button type="button" onClick={() => selectCandidate(null)} className="text-xs hover:underline" style={{ color: "var(--app-text-muted)" }}>Clear ×</button>} />
            {record.rows.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{loadedAll ? `No scored races for “${record.name}”.` : "Loading the full table…"}</p>
            ) : <CandidateRecord name={record.name} rows={record.rows} opponents={record.opponents} />}
          </section>
        )}
      </main>
    </div>
  );
}

function CandidateRecord({ name, rows, opponents }: { name: string; rows: WarSlim[]; opponents: Map<string, WarSlim | null> }) {
  const last = rows[rows.length - 1];
  const sum = rows.reduce((t, r) => t + r.war, 0);
  const best = rows.reduce((b, r) => (r.war > b.war ? r : b), rows[0]);
  const offices = [...new Set(rows.map((r) => OFFICE_LABELS[r.office]))];
  const states = [...new Set(rows.map((r) => r.state))];
  const partyName = last.party === "D" ? "Democrat" : last.party === "R" ? "Republican" : "Independent";
  const max = Math.max(...rows.map((r) => Math.abs(r.war)), 0.1);
  const stCol = (r: WarSlim) => states.length > 1 ? ` · ${r.state}` : "";
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: 700, lineHeight: 1 }}>{name}</div>
          <div className="mt-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
            <span style={{ color: marginColor(last.party === "R" ? 1 : last.party === "D" ? -1 : 0) }}>{partyName}</span> · {offices.join(", ")} · {rows.length} scored race{rows.length === 1 ? "" : "s"} · {states.map((s) => <Link key={s} href={stateHref(statesData.find((x) => x.abbr === s)?.id ?? s)} className="underline">{s}</Link>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}
          </div>
        </div>
        <div className="flex gap-7 sm:text-right">
          <div><div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Effect</div><div className="mt-0.5 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, lineHeight: 1, color: last.effect > 0 ? "var(--poll-better)" : last.effect < 0 ? "var(--poll-worse)" : undefined }}>{last.effect > 0 ? "+" : ""}{last.effect.toFixed(1)}</div><div className="text-[11px]" style={VERY_MUTED}>n={last.effectN} · faded 0.8/yr</div></div>
          <div><div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Career WAR</div><div className="mt-0.5 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, lineHeight: 1, color: sum > 0 ? "var(--poll-better)" : sum < 0 ? "var(--poll-worse)" : undefined }}>{sum > 0 ? "+" : ""}{sum.toFixed(1)}</div><div className="text-[11px]" style={VERY_MUTED}>best {best.war > 0 ? "+" : ""}{best.war.toFixed(1)} · {best.year} {raceLabel(best)}</div></div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="min-w-0">
          <SubHead label="WAR by cycle" />
          <div className="flex h-32 items-end gap-2 px-1" style={{ borderBottom: "1px solid var(--app-border)" }} role="img" aria-label={rows.map((r) => `${r.year}: ${r.war.toFixed(1)}`).join(", ")}>
            {rows.map((r, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                <b className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{r.war > 0 ? "+" : ""}{r.war.toFixed(1)}</b>
                <span className="block w-full max-w-[48px] rounded-t-sm" style={{ height: Math.max(3, (Math.abs(r.war) / max) * 76), background: r.war < 0 ? "var(--poll-worse)" : "var(--poll-better)" }} />
                <span className="truncate">{r.year}{stCol(r)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <SubHead label="Races" meta="every scored race, any state" />
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr style={{ borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-muted)" }}>
                  <th className={TH}>Race</th><th className={TH}>Opponent · WAR</th><th className={TH_R}>Actual</th><th className={`${TH_R} hidden sm:table-cell`}>Expected</th><th className={`${TH_R} hidden sm:table-cell`}>vs Opp</th><th className={TH_R}>WAR</th><th className={`${TH} hidden sm:table-cell`} />
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r, i) => {
                  const opp = opponents.get(`${r.state}|${r.office}|${r.race}|${r.year}`) ?? null;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td className={`${TD} font-medium`}>{r.pastHref ? <Link href={r.pastHref} className="underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)" }}>{r.year} · {raceLabel(r)}</Link> : `${r.year} · ${raceLabel(r)}`} <span style={VERY_MUTED}>{r.state}</span></td>
                      <td className={TD}><CandidateLink name={opp?.candidate} party={opp?.party} war={opp?.war} /></td>
                      <td className={TD_R}><M v={r.actual} digits={1} /></td>
                      <td className={`${TD_R} hidden sm:table-cell`}><M v={r.expected} digits={1} /></td>
                      <td className={`${TD_R} hidden sm:table-cell`}><M v={r.vsOpp} digits={1} /></td>
                      <td className={TD_R}><WarChip war={r.war} /></td>
                      <td className={`${TD} hidden sm:table-cell`} style={VERY_MUTED}><Link href={placeHref(r)} className="hover:underline">{r.office === "H" ? "district" : "state"} ›</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Foot>Expected is generic vs generic (lean + β* × E(year) + incumbency + structural money). vs Opp removes the opponent&apos;s own effect. WAR = Actual − vs Opp, signed toward the candidate. Actual and expected are R-positive margins.</Foot>
        </div>
      </div>
    </div>
  );
}

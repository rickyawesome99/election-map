"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { statesData } from "@/data/statesData";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";
import { useStaticJson } from "@/lib/useStaticJson";
import { HeaderMethodLink } from "./HeaderMethodLink";
import { OFFICE_LABELS, candidateSlug } from "./format";
import type { WarSlim } from "./types";
import { useTouchHover } from "@/lib/useTouchHover";
import { WarRaceBreakdown } from "./WarRaceBreakdown";
import { ColumnGuideModal } from "./TplModals";
import { CandidateLink, Foot, M, Pills, TH, TH_R, VERY_MUTED, WarChip } from "./ui";

// The candidates view: one row per candidate-performance (a candidate in a race), with filters and
// search. Clicking a row opens the race's calculation under it (WarRaceBreakdown); a name opens
// the candidate's page. ?c=slug narrows the table to one candidate, ?state=OH to one state. The
// full table is fetched once the page is open.

type Office = "all" | "P" | "S" | "G" | "H";
type Party = "all" | "D" | "R" | "I";
type Year = "all" | number;
type Sort = "winner" | "runner" | "newest" | "closest";

function raceLabel(r: { office: WarSlim["office"]; race: string }): string {
  return r.office === "H" ? r.race.replace(/^House /, "") : r.race.replace(/\bSenate\b/, "Sen").replace(/\bGovernor\b/, "Gov");
}
/** The race with its state ("Sen · AK"); a House district's code already names the state ("MN-01"). */
function raceWithState(r: { office: WarSlim["office"]; race: string; state: string }): string {
  return r.office === "H" ? raceLabel(r) : `${raceLabel(r)} · ${r.state}`;
}

export function TplCandidatesPage({ initialRows, initialYear, totals }: { initialRows: WarSlim[]; initialYear: number; totals: { races: number; performances: number } }) {
  // ?c=slug (a candidate page's "WAR breakdown" link) narrows the table to that candidate's races;
  // ?race=… (a past-election page) to one race;
  // ?state=OH to one state. Both are read from the URL after mount and on back/forward, not through
  // useSearchParams, which would defer the whole prerendered table to the client.
  const [candidateParam, setCandidateParam] = useState<string | null>(null);
  // ?race=2022-AL-G-Governor (a past-election page's link): that one race, both candidates.
  const [raceParam, setRaceParam] = useState<{ year: number; state: string; office: string; race: string } | null>(null);
  const [stateParam, setStateParam] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(window.location.search);
      // Sync from the URL after mount and on popstate; neither is available during SSR.
      setCandidateParam(q.get("c"));
      const rp = q.get("race")?.split("-");
      setRaceParam(rp && rp.length >= 4 ? { year: Number(rp[0]), state: rp[1].toUpperCase(), office: rp[2].toUpperCase(), race: rp.slice(3).join("-") } : null);
      setStateParam(q.get("state")?.toUpperCase() ?? null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const clearCandidate = () => { setCandidateParam(null); setRaceParam(null); window.history.pushState(null, "", "/war"); };
  // The row whose calculation is open under it: one at a time, a second click closes it.
  const [openRow, setOpenRow] = useState<string | null>(null);

  const full = useStaticJson<WarSlim[]>("/api/model/war");
  const rows = full.data ?? initialRows;
  const loadedAll = !!full.data;

  const [office, setOffice] = useState<Office>("all");
  const [party, setParty] = useState<Party>("all");
  const [year, setYear] = useState<Year>(initialYear);
  const [state, setState] = useState<string>(stateParam ?? "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("winner");
  const [limit, setLimit] = useState(100);
  const [guideOpen, setGuideOpen] = useState(false);
  // Rows tint under the mouse, darker while pressed; a finger gets the same tint (data-touch).
  useTouchHover();

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
      (raceParam ? r.year === raceParam.year && r.state === raceParam.state && r.office === raceParam.office && r.race === raceParam.race
        : candidateParam ? candidateSlug(r.candidate, r.state) === candidateParam : year === "all" || r.year === year) &&
      (state === "all" || r.state === state) &&
      terms.every((t) => /^\d{4}$/.test(t) ? String(r.year) === t : stateAbbrs.has(t) ? r.state.toLowerCase() === t
        : r.candidate.toLowerCase().includes(t) || r.race.toLowerCase().includes(t) || OFFICE_LABELS[r.office].toLowerCase().includes(t)));
  }, [rows, office, party, year, state, query, stateAbbrs, candidateParam, raceParam]);
  const candidateName = raceParam ? `${raceParam.year} ${raceParam.state} ${raceParam.race}` : candidateParam ? rows.find((r) => candidateSlug(r.candidate, r.state) === candidateParam)?.candidate ?? candidateParam.replace(/-/g, " ") : null;
  // The other candidate's row in each race, for a row's calculation.
  const opponentOf = useMemo(() => {
    const byRace = new Map<string, WarSlim[]>();
    for (const r of rows) { const k = `${r.state}|${r.office}|${r.race}|${r.year}`; const list = byRace.get(k); if (list) list.push(r); else byRace.set(k, [r]); }
    return (r: WarSlim) => byRace.get(`${r.state}|${r.office}|${r.race}|${r.year}`)?.find((x) => x !== r && x.candidate !== r.candidate) ?? null;
  }, [rows]);

  const performances = useMemo(() => {
    const list = [...filtered];
    if (sort === "winner") list.sort((a, b) => b.war - a.war);
    else if (sort === "runner") list.sort((a, b) => a.war - b.war);
    else if (sort === "closest") list.sort((a, b) => Math.abs(a.actual) - Math.abs(b.actual));
    else list.sort((a, b) => b.year - a.year || a.state.localeCompare(b.state) || a.race.localeCompare(b.race, undefined, { numeric: true }));
    return list;
  }, [filtered, sort]);

  const counts = `${performances.length.toLocaleString()} candidate-performance${performances.length === 1 ? "" : "s"}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: PAGE_HERO_BG }}>
        <div className={PAGE_CONTAINER}>
          <div className={`pb-6 sm:pb-1 ${PAGE_HERO_TOP}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
              <div className="min-w-0">
                <h1 style={PAGE_TITLE_STYLE}>Wins Above Replacement</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed sm:min-h-[3lh] md:min-h-[2lh]" style={{ color: "var(--app-text-muted)" }}>
                  How far each candidate ran ahead of a generic candidate of their party in every race since 2016, given the state or district&apos;s blended popular vote that year.
                </p>
              </div>
              <div className="flex shrink-0 items-end justify-between gap-6 sm:justify-end sm:gap-8">
              <div className="sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Races scored</div>
                <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1 }}>{totals.races.toLocaleString()}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>{totals.performances.toLocaleString()} candidate-performances</div>
              </div>
              <HeaderMethodLink model="war" layout="inline" />
              </div>
            </div>
            <HeaderMethodLink model="war" />
          </div>
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} pb-14`}>
        <section className="mt-6">
          <LedgerSectionHead label="Candidate-performances" meta={`${counts}${loadedAll ? "" : ` · ${initialYear} loaded, the rest on its way`}`}
            right={<button type="button" onClick={() => setGuideOpen(true)} aria-haspopup="dialog" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors hover:bg-[var(--app-tab-bg)]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M6 5.4v3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="6" cy="3.5" r="0.75" fill="currentColor" /></svg>
              What the columns mean
            </button>} />
          {guideOpen && <ColumnGuideModal title="What the columns mean" sub="Margins and Residual name the party they favor; Effect and WAR are signed toward the candidate." columns={WAR_COLUMNS} onClose={() => setGuideOpen(false)} />}
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
                <option value="winner">▲ Overperformers</option>
                <option value="runner">▼ Underperformers</option>
                <option value="closest">Closest races</option>
                <option value="newest">Newest first</option>
              </select></span>
            <input type="search" aria-label="Search performances" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(100); }} placeholder="Search year, state, race, candidate…"
              className="min-w-[12rem] flex-1 rounded-md px-3 py-1.5 text-sm sm:max-w-xs" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }} />
          </div>

          {candidateName && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
              {raceParam ? "Showing" : "Showing every scored race for"}
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full pl-2.5 pr-1 font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
                {candidateName}
                <button type="button" onClick={clearCandidate} aria-label="Show all candidates" className="grid h-5 w-5 place-items-center rounded-full text-sm leading-none hover:bg-[var(--app-border)]" style={{ color: "var(--app-text-muted)" }}>×</button>
              </span>
            </div>
          )}

          <div className="-mx-1 mt-3 overflow-x-auto px-1">
              <table className="w-full border-collapse text-[13px] max-sm:text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                    <th className={`${TH} hidden sm:table-cell`}>#</th>
                    <th className={`${TH} max-sm:pl-0`}>Candidate</th>
                    <th className={`${TH} hidden sm:table-cell`}>Year</th>
                    <th className={`${TH} hidden sm:table-cell`}>Race</th>
                    <th className={`${TH_R} max-sm:px-1`}><span className="sm:hidden">Exp.</span><span className="hidden sm:inline">Expected</span></th>
                    <th className={`${TH_R} max-sm:px-1`}>vs Opp</th>
                    <th className={`${TH_R} max-sm:px-1`}><span className="sm:hidden">Act.</span><span className="hidden sm:inline">Actual</span></th>
                    <th className={`${TH_R} hidden lg:table-cell`}>Residual</th>
                    <th className={`${TH_R} hidden lg:table-cell`}>Effect</th>
                    <th className={`${TH_R} max-sm:pr-0 max-sm:pl-1`} style={{ color: "var(--app-text-primary)" }}>WAR</th>
                    <th className="w-6 p-0" aria-label="Open the calculation" />
                  </tr>
                </thead>
                <tbody>
                  {performances.length === 0 && <tr><td colSpan={11} className="px-2 py-6 text-center" style={VERY_MUTED}>No performances match the filters.</td></tr>}
                  {performances.slice(0, limit).map((r, i) => {
                    const key = perfKey(r), open = openRow === key;
                    const toggle = () => setOpenRow(open ? null : key);
                    return (
                    <Fragment key={key}>
                    <tr data-row={key} data-touch-hover className="tbl-tr cursor-pointer" style={{ borderBottom: open ? "none" : "1px solid var(--app-border)" }}
                      role="button" tabIndex={0} aria-expanded={open} aria-label={`${r.candidate}, ${r.year} ${raceWithState(r)}: ${open ? "hide" : "show"} the WAR calculation`}
                      // A click on a link inside the row (the name, the race) follows the link instead.
                      onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) toggle(); }}
                      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); toggle(); } }}>
                      <td className={`${CELL} hidden sm:table-cell`} style={VERY_MUTED}>{i + 1}</td>
                      <td className={`${CELL} font-medium max-sm:whitespace-normal max-sm:pl-0`}>
                        <CandidateLink name={r.candidate} state={r.state} party={r.party} tint letter className="sm:flex-nowrap" />
                        {r.incumb !== 0 && <IncTag incumb={r.incumb} className="ml-1.5 max-sm:hidden" />}
                        {/* Phones: the race and year under the name instead of their own columns. */}
                        <span className="mt-0.5 block text-[11px] font-normal sm:hidden" style={{ color: "var(--app-text-muted)" }}>{r.year} · {raceWithState(r)}{r.incumb !== 0 && <IncTag incumb={r.incumb} className="ml-1.5" />}</span>
                      </td>
                      <td className={`${CELL} hidden sm:table-cell`} style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
                      <td className={`${CELL} hidden sm:table-cell`}>{r.pastHref ? <Link href={r.pastHref} className="underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)" }}>{raceWithState(r)}</Link> : raceWithState(r)}</td>
                      <td className={`${CELL_R} max-sm:px-1`}><M v={r.expected} digits={1} /></td>
                      <td className={`${CELL_R} max-sm:px-1`}><M v={r.vsOpp} digits={1} /></td>
                      <td className={`${CELL_R} max-sm:px-1`}><M v={r.actual} digits={1} /></td>
                      <td className={`${CELL_R} hidden font-bold lg:table-cell`}><M v={r.actual - r.expected} digits={1} /></td>
                      <td className={`${CELL_R} hidden lg:table-cell`}>{r.effect > 0 ? "+" : ""}{r.effect.toFixed(1)} <span className="text-[11px]" style={VERY_MUTED}>n={r.effectN}</span></td>
                      <td className={`${CELL_R} max-sm:pr-0 max-sm:pl-1`}><WarChip war={r.war} size="md" /></td>
                      <td className="w-6 p-0 pr-1 text-right" style={{ color: "var(--app-text-very-muted)" }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" className="inline-block transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : undefined }}><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td colSpan={11} className="px-2 pb-6 pt-2 max-sm:px-0">
                          <div className="max-w-[calc(100vw-2rem)] sm:max-w-none"><WarRaceBreakdown row={r} opp={opponentOf(r)} /></div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
          </div>
          <Foot>
            {performances.length > limit && <><button type="button" onClick={() => setLimit((l) => l + 200)} className="underline">Show more</button> · </>}
            Click a row for its calculation. A name opens the candidate&apos;s page; the race name opens the election&apos;s own page.
          </Foot>
        </section>

      </main>
    </div>
  );
}

// Table cells a step larger than the site's compact tables: this table is the page.
const CELL = "whitespace-nowrap px-2 py-2 tabular-nums";
const CELL_R = `${CELL} text-right`;

/** Marks an incumbent, whose WAR includes what incumbency was worth (the figure is in the tooltip and the record). */
function IncTag({ incumb, className = "" }: { incumb: number; className?: string }) {
  return <span className={`rounded px-1 py-px align-middle text-[9px] font-bold uppercase tracking-wider ${className}`} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }} title={`Incumbent: WAR includes ${signed1(incumb)} for incumbency`}>Inc.</span>;
}

// The column guide behind "What the columns mean", in table order.
const WAR_COLUMNS: { name: string; desc: string }[] = [
  { name: "#", desc: "Rank under the current sort and filters." },
  { name: "Candidate", desc: "The nominee, colored by party. A name opens their candidate page; Inc. marks the incumbent. Click anywhere else on a row for the race's calculation." },
  { name: "Year · Race", desc: "The election. The race name opens that election's own page." },
  { name: "Expected", desc: "Generic vs generic: the margin this seat would produce that year with two replacement-level nominees. It starts from how the state (for a House race, the district) voted on the rest of its ballot that year, plus incumbency and the money gap a generic pair would have." },
  { name: "Vs Opp", desc: "Generic vs this opponent: what a replacement-level, non-incumbent nominee of the candidate's party would be expected to get against this specific opponent. It is Expected moved by the opponent's strength, with the candidate's own incumbency taken out." },
  { name: "Actual", desc: "The real result of the race." },
  { name: "Residual", desc: "Actual minus Expected, naming the party it favored: how far the race as a whole departed from generic vs generic. Both candidates in a race show the same figure." },
  { name: "Effect", desc: "The candidate's standing as of that race, in points: their record across their scored races, this one included. n is how many races are on file for them." },
  { name: "WAR", desc: "Wins Above Replacement: Actual minus Vs Opp, signed toward the candidate. How many points better (green) or worse (red) they ran than a replacement-level nominee would have against the same opponent. A replacement is never the incumbent, so an incumbent's WAR includes what incumbency was worth: roughly 4 to 6 points depending on the office. The exact figure for each race is in the row's calculation." },
];

const signed1 = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

const perfKey = (r: WarSlim) => `${r.state}|${r.office}|${r.race}|${r.year}|${r.candidate}`;

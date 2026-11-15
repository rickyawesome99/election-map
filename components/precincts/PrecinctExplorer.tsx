"use client";

// Controls, maps and detail panel for /precincts. Two views: the national inset map (pick a state) and
// one state's precincts on their own. This shell fetches and keeps each state's results and names, so
// an office switch or a theme change (which remounts the map) never refetches.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDarkMode } from "@/lib/useDarkMode";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { RATING_SCALE, OFFICES, OFFICE_LABEL, marginOf, type Office, type StateIndex, type StateResults, type StateShell } from "./types";

const NationalMap = dynamic(() => import("./NationalMap"), { ssr: false, loading: () => <div style={{ aspectRatio: "975 / 610" }} /> });
const PrecinctMap = dynamic(() => import("./PrecinctMap"), { ssr: false, loading: () => <div style={{ height: "100%" }} /> });

type Cached = { results: StateResults | null; index: StateIndex | null };

// Typography shared with the site's county cards and ledgers (components/CountyTooltip, RaceDetailSections).
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.06em]";
const KICKER = "text-[10.5px] font-bold uppercase tracking-[0.07em]";
const SERIF_FIGURE = { fontFamily: "var(--font-serif)", fontWeight: 700, lineHeight: 1.05 } as const;

const pill = (active: boolean, enabled = true): React.CSSProperties => ({
  border: "1px solid var(--app-border)",
  background: active ? "var(--app-text-primary)" : "transparent",
  color: active ? "var(--app-bg)" : enabled ? "var(--app-text-primary)" : "var(--app-text-very-muted)",
  opacity: enabled ? 1 : 0.55,
  cursor: enabled ? "pointer" : "default",
});

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div className={`${KICKER} pb-1.5`} style={{ color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)" }}>{children}</div>;
}

export default function PrecinctExplorer({ states, years }: { states: StateShell[]; years: { year: number; loaded: boolean }[] }) {
  const darkMode = useDarkMode();
  const [office, setOffice] = useState<Office>("PRES");
  const [year, setYear] = useState(() => years.filter((y) => y.loaded).at(-1)?.year ?? 2024);
  // The one state whose precincts are on screen; null = the national map.
  const [current, setCurrent] = useState<string | null>(null);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [moved, setMoved] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [data, setData] = useState<Map<string, Cached>>(() => new Map()); // keyed "year|ST"
  const byAbbr = useMemo(() => new Map(states.map((s) => [s.abbr, s])), [states]);

  const openState = useCallback((abbr: string | null) => {
    setCurrent(abbr);
    setSelectedPid(null);
    setMoved(false);
    window.history.replaceState(null, "", abbr ? `#${abbr}` : window.location.pathname);
  }, []);

  // /precincts#TX opens Texas. After hydration, so the server-rendered picker and the first client render agree.
  useEffect(() => {
    const h = window.location.hash.replace("#", "").toUpperCase();
    if (!byAbbr.has(h)) return;
    const id = requestAnimationFrame(() => setCurrent(h));
    return () => cancelAnimationFrame(id);
  }, [byAbbr]);

  // Results and names for the open state and year.
  const key = current ? `${year}|${current}` : null;
  useEffect(() => {
    if (!key || !current || data.has(key)) return;
    let live = true;
    Promise.all([
      fetch(`/precincts/results/${current}/${year}.json`).then((r) => (r.ok ? (r.json() as Promise<StateResults>) : null)).catch(() => null),
      fetch(`/precincts/index/${current}.json`).then((r) => (r.ok ? (r.json() as Promise<StateIndex>) : null)).catch(() => null),
    ]).then(([results, index]) => { if (live) setData((prev) => new Map(prev).set(key, { results, index })); });
    return () => { live = false; };
  }, [key, current, year, data]);

  const shell = current ? byAbbr.get(current) : undefined;
  const cached = key ? data.get(key) : undefined;
  // Offices with precinct data this year: for the open state, or anywhere on the national map.
  const available = useMemo(() => {
    const pool = shell ? [shell] : states;
    return new Set(OFFICES.filter((o) => pool.some((s) => s.years[String(year)]?.[o])));
  }, [shell, states, year]);
  const shown: Office = available.has(office) ? office : (OFFICES.find((o) => available.has(o)) ?? office);

  const i = shell && selectedPid !== null ? selectedPid - shell.first : -1;
  const selName = i >= 0 ? cached?.index?.names[i] : undefined;
  const selCounty = i >= 0 && cached?.index ? cached.index.counties[cached.index.county[i]]?.[1] : undefined;
  const selRow = i >= 0 ? cached?.results?.offices[shown]?.[i] : undefined;
  const selMargin = marginOf(selRow);
  const stateSum = shell?.years[String(year)]?.[shown];
  const stateMargin = stateSum ? marginOf([stateSum.d, stateSum.r, stateSum.o]) : null;

  return (
    <div>
      {/* controls */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-text-muted)" }}>State</span>
          <select
            id="precinct-state"
            value={current ?? ""}
            onChange={(e) => openState(e.target.value || null)}
            className="px-2 py-1 text-sm"
            style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
          >
            <option value="">All states</option>
            {states.map((s) => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {OFFICES.map((o) => {
            const ok = available.has(o);
            return (
              <button key={o} id={`precinct-office-${o}`} disabled={!ok} onClick={() => setOffice(o)} className="px-2.5 py-1 text-xs font-semibold" style={pill(shown === o, ok)}>
                {OFFICE_LABEL[o]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {years.map((y) => (
            <button
              key={y.year}
              id={`precinct-year-${y.year}`}
              disabled={!y.loaded}
              title={y.loaded ? undefined : "Not loaded yet"}
              onClick={() => { setYear(y.year); setSelectedPid(null); }}
              className="px-2 py-1 text-xs font-semibold"
              style={pill(year === y.year, y.loaded)}
            >
              {y.year}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* map */}
        <div className="min-w-0">
          {shell ? (
            <div className="relative" style={{ height: "min(72vh, 680px)", minHeight: 400 }}>
              <PrecinctMap
                key={`${shell.abbr}-${darkMode ? "dark" : "light"}`}
                shell={shell}
                year={year}
                office={shown}
                darkMode={darkMode}
                results={cached?.results ?? null}
                index={cached?.index ?? null}
                selectedPid={selectedPid}
                onSelect={setSelectedPid}
                onMoved={setMoved}
                resetNonce={resetNonce}
              />
              <div className="absolute right-2 top-2 z-10 flex gap-1.5">
                {moved && (
                  <button onClick={() => setResetNonce((n) => n + 1)} className="rounded-lg px-2.5 py-1 text-xs font-semibold backdrop-blur-sm" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                    Reset view
                  </button>
                )}
                <button id="precinct-all-states" onClick={() => openState(null)} className="rounded-lg px-2.5 py-1 text-xs font-semibold backdrop-blur-sm" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  ← All states
                </button>
              </div>
            </div>
          ) : (
            <NationalMap states={states} year={year} office={shown} darkMode={darkMode} onPick={openState} />
          )}
          {/* legend, as on the Historical map */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 md:gap-x-4">
            {RATING_SCALE.map((r) => (
              <div key={r.label} className="flex items-center gap-1 md:gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full md:h-2.5 md:w-2.5" style={{ background: r.color }} />
                <span className="whitespace-nowrap text-[9px] font-medium md:text-[10px]" style={{ color: "var(--app-text-muted)" }}>{r.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 md:gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full md:h-2.5 md:w-2.5" style={{ background: darkMode ? "#39424f" : "#c9ced6" }} />
              <span className="whitespace-nowrap text-[9px] font-medium md:text-[10px]" style={{ color: "var(--app-text-muted)" }}>No contest or uncounted</span>
            </div>
          </div>
        </div>

        {/* panel */}
        <aside className="min-w-0">
          {shell && i >= 0 && cached?.results ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={KICKER} style={{ color: "var(--app-text-primary)", overflowWrap: "anywhere" }}>{selName || `Precinct ${selectedPid}`}</div>
                  <div className="mt-px text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{selCounty ? `${selCounty}, ` : ""}{shell.name}</div>
                </div>
                <button onClick={() => setSelectedPid(null)} aria-label="Close precinct details" className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[22px] leading-none hover:bg-[var(--app-tab-bg)]" style={{ color: "var(--app-text-muted)" }}>×</button>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <div className="tabular-nums" style={{ ...SERIF_FIGURE, fontSize: 30, color: marginColor(selMargin) }}>{selMargin === null ? "—" : fmtMargin(selMargin)}</div>
                  <div className={`mt-0.5 ${LABEL}`} style={{ color: "var(--app-text-muted)" }}>{OFFICE_LABEL[shown]} · {year}</div>
                </div>
                {selRow && selMargin !== null && (
                  <div className="text-right">
                    <div className="text-[13px] font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{(selRow[0] + selRow[1] + selRow[2]).toLocaleString()}</div>
                    <div className={LABEL} style={{ color: "var(--app-text-muted)" }}>Votes</div>
                  </div>
                )}
              </div>

              <div className="mt-5"><SectionHead>Every race here, {year}</SectionHead></div>
              <table className="w-full tabular-nums" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className={LABEL} style={{ color: "var(--app-text-muted)" }}>
                    <th className="py-1.5 text-left font-semibold">Office</th>
                    <th className="py-1.5 text-right font-semibold">Dem</th>
                    <th className="py-1.5 text-right font-semibold">Rep</th>
                    <th className="py-1.5 text-right font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {OFFICES.map((o) => {
                    const row = cached.results!.offices[o]?.[i];
                    if (!row) return null;
                    const m = marginOf(row);
                    const district = cached.results!.districts[o]?.[i];
                    return (
                      <tr key={o} onClick={() => setOffice(o)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-border)", background: o === shown ? "var(--app-tab-bg)" : undefined }}>
                        <td className="py-1.5 pr-2 text-[13px]" style={{ color: "var(--app-text-primary)" }}>
                          <span className="font-semibold">{OFFICE_LABEL[o]}</span>
                          {district && <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{district.replace(/^0+(?=\d)/, "")}</span>}
                        </td>
                        <td className="py-1.5 pl-1 text-right text-xs" style={{ color: "var(--party-dem)" }}>{m === null ? "" : row[0].toLocaleString()}</td>
                        <td className="py-1.5 pl-2 text-right text-xs" style={{ color: "var(--party-rep)" }}>{m === null ? "" : row[1].toLocaleString()}</td>
                        <td className="py-1.5 pl-2 text-right text-[13px] font-bold" style={{ color: marginColor(m), whiteSpace: "nowrap" }}>
                          {m === null ? <span className="text-[11px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>no contest</span> : fmtMargin(m)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                For president, Senate, governor and U.S. House the two sides are the leading candidates. Legislative rows are party totals.
              </p>
              <Link prefetch={false} href={`/states/${shell.abbr.toLowerCase()}`} className="mt-2 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Go to {shell.name} →</Link>
            </div>
          ) : shell ? (
            <div>
              <div className={KICKER} style={{ color: "var(--app-text-primary)" }}>{shell.name}</div>
              <div className="mt-px text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{shell.n.toLocaleString()} precincts</div>
              <div className="mt-2 tabular-nums" style={{ ...SERIF_FIGURE, fontSize: 30, color: marginColor(stateMargin) }}>{stateMargin === null ? "—" : fmtMargin(stateMargin)}</div>
              <div className={`mt-0.5 ${LABEL}`} style={{ color: "var(--app-text-muted)" }}>Statewide · {OFFICE_LABEL[shown]} · {year}</div>
              {stateSum?.note && <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{stateSum.note}</p>}
              <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>Hover a precinct for its result. Click one for every race on its ballot.</p>
              <Link prefetch={false} href={`/states/${shell.abbr.toLowerCase()}`} className="mt-2 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Go to {shell.name} →</Link>
            </div>
          ) : (
            <div>
              <div className={KICKER} style={{ color: "var(--app-text-primary)" }}>Pick a state</div>
              <p className="mt-2 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                Click a state on the map, or choose one above, to see its precincts. The map shows each state&rsquo;s
                statewide {OFFICE_LABEL[shown].toLowerCase()} result for {year}.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

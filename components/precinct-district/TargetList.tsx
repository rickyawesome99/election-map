"use client";

// The door-knocking list: every precinct ranked by Priority (net votes available to the
// Republican), filterable by competitiveness band (Safe R … Safe D), Priority category and area,
// sortable on every column. A table on desktop, cards on a phone, and a CSV of whatever is on
// screen for the walk list. Rows arrive precomputed from the page (lib/precinctDistrict/targets.ts).

import { useMemo, useState, type ReactNode } from "react";
import { fmtMargin } from "@/lib/colorScale";
import { PRIORITY_CATEGORIES, PRIORITY_CATEGORY_BY_KEY, fmtInt, marginColorVar, type PriorityCategory } from "@/lib/precinctDistrict/explorer";
import { BANDS, BAND_BY_KEY, type BandKey, type TargetList as TargetListData, type TargetRow } from "@/lib/precinctDistrict/targets";

type SortKey = "rank" | "name" | "area" | "band" | "category" | "avgMargin" | "sthouse" | "pres" | "projected" | "reg" | "ballots2026" | "persuadable" | "turnoutVotes" | "priority";
type SortDir = "asc" | "desc";

interface Col {
  key: SortKey;
  label: string;
  title?: string;
  align?: "left" | "right";
  defaultDir: SortDir;
  value: (r: TargetRow) => number | string | null;
  render: (r: TargetRow) => ReactNode;
  borderLeft?: boolean;
  hideBelowXl?: boolean;
}

const MOBILE_PAGE = 20;

const BAND_ORDER: Record<BandKey, number> = { safeR: 0, leanR: 1, swing: 2, leanD: 3, safeD: 4 };
const CAT_ORDER: Record<PriorityCategory, number> = { base: 0, turnout: 1, contested: 2, persuasion: 3, opponent: 4 };

const M = ({ v, bold }: { v: number | null; bold?: boolean }) => <span className="tabular-nums" style={{ color: marginColorVar(v), fontWeight: bold ? 700 : 400 }}>{v == null ? "—" : fmtMargin(v)}</span>;
const N = ({ v, bold, muted }: { v: number | null; bold?: boolean; muted?: boolean }) => <span className="tabular-nums" style={{ fontWeight: bold ? 700 : 400, color: muted ? "var(--app-text-muted)" : undefined }}>{fmtInt(v)}</span>;
const signedVotes = (v: number | null) => (v == null ? "—" : v === 0 ? "0" : `${v > 0 ? "+" : "−"}${fmtInt(Math.abs(v))}`);

function Swatch({ color }: { color: string }) {
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />;
}

function Chip({ color, children, title }: { color: string; children: ReactNode; title?: string }) {
  return <span title={title} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold" style={{ color: "var(--app-text-primary)" }}><Swatch color={color} />{children}</span>;
}

function FilterPill({ active, onClick, children, color, count }: { active: boolean; onClick: () => void; children: ReactNode; color?: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors"
      style={active
        ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
        : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid transparent" }}
    >
      {color && <Swatch color={color} />}
      {children}
      {count != null && <span className="tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{count}</span>}
    </button>
  );
}

function Select({ value, onChange, children, ariaLabel }: { value: string; onChange: (v: string) => void; children: ReactNode; ariaLabel: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} className="max-w-full rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
      {children}
    </select>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>{children}</span>;
}

export default function TargetList({ list, rName, districtName }: { list: TargetListData; rName: string; districtName: string }) {
  const { rows, year, presYear, midtermYear } = list;
  const presShort = presYear != null ? `${String(presYear).slice(2)} Pres` : "Pres";
  const [band, setBand] = useState<BandKey | "all">("all");
  const [category, setCategory] = useState<PriorityCategory | "all">("all");
  const [area, setArea] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [shown, setShown] = useState(MOBILE_PAGE);

  const areas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.sub)) seen.set(r.sub, r.subName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const cols: Col[] = useMemo(() => [
    { key: "rank", label: "#", title: "Priority rank: 1 = most net votes available", defaultDir: "asc", value: (r) => r.rank, render: (r) => <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.rank ?? "—"}</span> },
    { key: "name", label: "Precinct", align: "left", defaultDir: "asc", value: (r) => r.id, render: (r) => <span className="font-medium" style={{ color: "var(--app-text-primary)" }}>{r.id}{r.estimated && <span title="Some years estimated on today's precinct lines by 2020 block population" className="ml-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>≈</span>}</span> },
    { key: "area", label: "Area", align: "left", defaultDir: "asc", value: (r) => r.subName, render: (r) => <span style={{ color: "var(--app-text-muted)" }}>{r.subName}</span>, hideBelowXl: true },
    { key: "band", label: presShort, title: `Competitiveness band on the ${presYear ?? "latest"} presidential margin: Swing within 5, Lean 5–15, Safe 15+`, align: "left", defaultDir: "asc", borderLeft: true, value: (r) => (r.band ? BAND_ORDER[r.band] : null), render: (r) => (r.band ? <Chip color={BAND_BY_KEY[r.band].color} title={BAND_BY_KEY[r.band].describe}>{BAND_BY_KEY[r.band].short}</Chip> : "—") },
    { key: "category", label: "Task", title: "Priority category: what the precinct is for", align: "left", defaultDir: "asc", value: (r) => (r.category ? CAT_ORDER[r.category] : null), render: (r) => (r.category ? <Chip color={PRIORITY_CATEGORY_BY_KEY[r.category].color} title={PRIORITY_CATEGORY_BY_KEY[r.category].describe}>{PRIORITY_CATEGORY_BY_KEY[r.category].label}</Chip> : "—") },
    { key: "priority", label: "Net votes", title: "Priority: split-ticket votes + turnout votes where positive", defaultDir: "desc", borderLeft: true, value: (r) => r.priority, render: (r) => <N v={r.priority} bold /> },
    { key: "avgMargin", label: "Avg margin", title: "Average two-party margin across every race on file (2 × average R share − 100)", defaultDir: "desc", borderLeft: true, value: (r) => r.avgMargin, render: (r) => <M v={r.avgMargin} bold /> },
    { key: "sthouse", label: `${year} St. House`, title: `${year} State House margin, as counted`, defaultDir: "desc", value: (r) => r.sthouse, render: (r) => <M v={r.sthouse} /> },
    { key: "pres", label: `${year} Pres.`, title: `${year} presidential margin, as counted`, defaultDir: "desc", value: (r) => r.pres, render: (r) => <M v={r.pres} />, hideBelowXl: true },
    { key: "projected", label: "2026 proj.", title: "Projected 2026 State House margin in the precinct", defaultDir: "desc", value: (r) => r.projected, render: (r) => <M v={r.projected} />, hideBelowXl: true },
    { key: "reg", label: "Registered", defaultDir: "desc", borderLeft: true, value: (r) => r.reg, render: (r) => <N v={r.reg} muted />, hideBelowXl: true },
    { key: "ballots2026", label: "2026 ballots", title: "2026 turnout estimate: the precinct's mean midterm turnout rate × today's registration", defaultDir: "desc", value: (r) => r.ballots2026, render: (r) => <N v={r.ballots2026} /> },
    { key: "persuadable", label: "Split votes", title: `Split-ticket votes in ${year}: (R ceiling − R floor) × ballots`, defaultDir: "desc", borderLeft: true, value: (r) => r.persuadable, render: (r) => <N v={r.persuadable} /> },
    { key: "turnoutVotes", label: "Turnout votes", title: `Midterm drop-off ballots (${year} − ${midtermYear ?? "midterm"}) × average margin: net votes from turning drop-off voters out (negative where the precinct leans D)`, defaultDir: "desc", value: (r) => r.turnoutVotes, render: (r) => <span className="tabular-nums" style={{ color: r.turnoutVotes != null && r.turnoutVotes < 0 ? "var(--app-text-very-muted)" : undefined }}>{signedVotes(r.turnoutVotes == null ? null : Math.round(r.turnoutVotes))}</span> },
  ], [year, presYear, presShort, midtermYear]);

  const filtered = useMemo(() => rows.filter((r) => (band === "all" || r.band === band) && (category === "all" || r.category === category) && (area === "all" || r.sub === area)), [rows, band, category, area]);

  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey)!;
    return [...filtered].sort((a, b) => {
      const av = col.value(a), bv = col.value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" || typeof bv === "string" ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return (sortDir === "asc" ? cmp : -cmp) || (a.rank ?? 0) - (b.rank ?? 0);
    });
  }, [filtered, cols, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(cols.find((c) => c.key === key)?.defaultDir ?? "desc"); }
  }

  // Band tiles: how much of the district, and how many net votes, sit in each band.
  const bandStats = useMemo(() => BANDS.map((b) => {
    const rs = rows.filter((r) => r.band === b.key);
    return { ...b, n: rs.length, ballots: rs.reduce((s, r) => s + (r.ballots2026 ?? 0), 0), net: rs.reduce((s, r) => s + (r.priority ?? 0), 0) };
  }), [rows]);
  const catCounts = useMemo(() => Object.fromEntries(PRIORITY_CATEGORIES.map((c) => [c.key, rows.filter((r) => r.category === c.key).length])) as Record<PriorityCategory, number>, [rows]);
  const totals = useMemo(() => ({ n: filtered.length, ballots: filtered.reduce((s, r) => s + (r.ballots2026 ?? 0), 0), net: filtered.reduce((s, r) => s + (r.priority ?? 0), 0), all: rows.reduce((s, r) => s + (r.priority ?? 0), 0) }), [filtered, rows]);

  function downloadCsv() {
    const head = ["Rank", "Precinct", "Area", `${presYear ?? ""} Pres band`.trim(), "Task", "Avg margin", `${year} State House`, `${year} President`, "2026 projected", "Registered", "2026 est. ballots", "Split-ticket votes", "Turnout votes", "Net votes"];
    const m = (v: number | null) => (v == null ? "" : v.toFixed(1));
    const n = (v: number | null) => (v == null ? "" : String(Math.round(v)));
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = sorted.map((r) => [r.rank ?? "", q(r.id), q(r.subName), r.band ? BAND_BY_KEY[r.band].short : "", r.category ? PRIORITY_CATEGORY_BY_KEY[r.category].label : "", m(r.avgMargin), m(r.sthouse), m(r.pres), m(r.projected), r.reg, n(r.ballots2026), n(r.persuadable), n(r.turnoutVotes), n(r.priority)].join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const scope = [band !== "all" ? BAND_BY_KEY[band].short : null, category !== "all" ? PRIORITY_CATEGORY_BY_KEY[category].label : null, area !== "all" ? areas.find((x) => x[0] === area)?.[1] : null].filter(Boolean).join("-").replace(/\s+/g, "-").toLowerCase();
    a.href = url; a.download = `${districtName.replace(/\s+/g, "-").toLowerCase()}-targets${scope ? `-${scope}` : ""}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const arrow = (key: SortKey) => (sortKey === key ? <span className="ml-1 text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span> : null);
  const headRule = "2px solid var(--app-text-primary)";

  return (
    <div>
      {/* Band tiles */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {bandStats.map((b) => {
          const active = band === b.key;
          return (
            <button key={b.key} onClick={() => setBand(active ? "all" : b.key)} aria-pressed={active} className="text-left" style={{ borderTop: `3px solid ${b.color}`, paddingTop: 8, opacity: band !== "all" && !active ? 0.55 : 1 }}>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{b.label}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5"><span className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>{b.n}</span><span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>precinct{b.n === 1 ? "" : "s"}</span></div>
              <div className="mt-1 text-[11.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtInt(b.ballots)} ballots est. · <b style={{ color: "var(--app-text-primary)" }}>{fmtInt(b.net)}</b> net votes</div>
              <div className="text-[10.5px]" style={{ color: "var(--app-text-very-muted)" }}>{presYear} presidential {b.describe}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none"><Label>{presShort}</Label>
          <FilterPill active={band === "all"} onClick={() => setBand("all")} count={rows.length}>All</FilterPill>
          {bandStats.map((b) => <FilterPill key={b.key} active={band === b.key} onClick={() => setBand(band === b.key ? "all" : b.key)} color={b.color} count={b.n}>{b.short}</FilterPill>)}
        </div>
        <div className="hidden items-center gap-1 overflow-x-auto scrollbar-none md:flex"><Label>Task</Label>
          <FilterPill active={category === "all"} onClick={() => setCategory("all")}>All</FilterPill>
          {PRIORITY_CATEGORIES.map((c) => <FilterPill key={c.key} active={category === c.key} onClick={() => setCategory(category === c.key ? "all" : c.key)} color={c.color} count={catCounts[c.key]}>{c.label}</FilterPill>)}
        </div>
        <label className="flex items-center gap-1 md:hidden"><Label>Task</Label>
          <Select value={category} onChange={(v) => setCategory(v as PriorityCategory | "all")} ariaLabel="Task">
            <option value="all">All</option>
            {PRIORITY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label} ({catCounts[c.key]})</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-1"><Label>Area</Label>
          <Select value={area} onChange={setArea} ariaLabel="Area">
            <option value="all">All areas</option>
            {areas.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-1 md:hidden"><Label>Sort</Label>
          <Select value={`${sortKey}:${sortDir}`} onChange={(v) => { const [k, d] = v.split(":") as [SortKey, SortDir]; setSortKey(k); setSortDir(d); }} ariaLabel="Sort">
            <option value="rank:asc">Priority rank</option>
            <option value="priority:desc">Net votes, most first</option>
            <option value="avgMargin:desc">Avg margin, most Republican first</option>
            <option value="avgMargin:asc">Avg margin, most Democratic first</option>
            <option value="sthouse:desc">{year} State House margin</option>
            <option value="ballots2026:desc">2026 ballots, largest first</option>
            <option value="persuadable:desc">Split-ticket votes</option>
            <option value="turnoutVotes:desc">Turnout votes</option>
            <option value="name:asc">Precinct name</option>
          </Select>
        </label>
        <button onClick={downloadCsv} className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
          Download CSV
        </button>
      </div>

      {/* Readout */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
        <span className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>{fmtInt(totals.net)}</span>
        <span>net votes available to {rName} in {totals.n === rows.length ? `all ${rows.length} precincts` : `${totals.n} of ${rows.length} precincts`}{totals.n !== rows.length ? ` (${Math.round((totals.net / Math.max(1, totals.all)) * 100)}% of ${fmtInt(totals.all)})` : ""} · {fmtInt(totals.ballots)} ballots expected in 2026</span>
      </div>

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-auto md:block" style={{ maxHeight: 640 }}>
        <table className="w-full text-[13px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--app-bg)" }}>
              {cols.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  onClick={() => toggleSort(c.key)}
                  className={`cursor-pointer select-none whitespace-nowrap px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider ${c.align === "left" ? "text-left" : "text-right"} ${c.hideBelowXl ? "hidden xl:table-cell" : ""}`}
                  style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--app-bg)", color: sortKey === c.key ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: headRule, borderLeft: c.borderLeft ? "1px solid var(--app-border)" : undefined }}
                >
                  {c.label}{arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-2.5 py-2 ${c.align === "left" ? "text-left" : "text-right"} ${c.hideBelowXl ? "hidden xl:table-cell" : ""}`} style={{ borderBottom: "1px solid var(--app-border)", borderLeft: c.borderLeft ? "1px solid var(--app-border)" : undefined }}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={cols.length} className="py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No precincts match.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mt-4 md:hidden">
        {sorted.slice(0, shown).map((r) => (
          <div key={r.id} className="py-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <div className="flex items-baseline gap-2">
              <span className="w-7 shrink-0 text-right text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.rank ?? "—"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-semibold" style={{ color: "var(--app-text-primary)" }}>{r.id}{r.estimated && <span className="ml-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>≈</span>}</span>
                  <span className="shrink-0 text-[15px] font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{fmtInt(r.priority)}<span className="ml-1 text-[10px] font-semibold uppercase" style={{ color: "var(--app-text-very-muted)" }}>net</span></span>
                </div>
                <div className="text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{r.subName}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {r.band && <Chip color={BAND_BY_KEY[r.band].color}>{BAND_BY_KEY[r.band].short}</Chip>}
                  {r.category && <Chip color={PRIORITY_CATEGORY_BY_KEY[r.category].color}>{PRIORITY_CATEGORY_BY_KEY[r.category].label}</Chip>}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-x-3 text-[11.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  <div>Avg <M v={r.avgMargin} bold /></div>
                  <div>{year} StH <M v={r.sthouse} /></div>
                  <div>2026 est. <b style={{ color: "var(--app-text-primary)" }}>{fmtInt(r.ballots2026)}</b></div>
                  <div>Split <b style={{ color: "var(--app-text-primary)" }}>{fmtInt(r.persuadable)}</b></div>
                  <div>Turnout <b style={{ color: r.turnoutVotes != null && r.turnoutVotes < 0 ? "var(--app-text-very-muted)" : "var(--app-text-primary)" }}>{signedVotes(r.turnoutVotes == null ? null : Math.round(r.turnoutVotes))}</b></div>
                  <div>Reg. <b style={{ color: "var(--app-text-primary)" }}>{fmtInt(r.reg)}</b></div>
                </div>
              </div>
            </div>
          </div>
        ))}
        {sorted.length === 0 && <div className="py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No precincts match.</div>}
        {sorted.length > shown && (
          <button onClick={() => setShown((n) => n + MOBILE_PAGE)} className="mt-3 w-full rounded-full py-1.5 text-[12px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
            Show {Math.min(MOBILE_PAGE, sorted.length - shown)} more of {sorted.length}
          </button>
        )}
      </div>

      <div className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
        Net votes = split-ticket votes ({year}: R ceiling − R floor, × ballots) + turnout votes where positive (ballots lost from {year} to {midtermYear ?? "the midterm"} × average margin). Bands are cut on the {presYear} presidential margin (Safe 15+, Lean 5–15, Swing within 5); the average margin and the task category use every race on file, each year counting once, on today&apos;s precinct lines (≈ where older years are estimated). A Democratic-leaning precinct&apos;s turnout votes are negative, so its net votes are split-ticket votes only. Ranks hold across filters.
      </div>
    </div>
  );
}

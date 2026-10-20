"use client";

// The door-knocking list: every precinct ranked by Priority (net votes available to the
// Republican), filterable by competitiveness band (Safe R … Safe D), Priority category and area,
// sortable on every column. A table on desktop, cards on a phone, and a CSV of every precinct in
// Priority order (never filtered) for the walk list. Rows arrive precomputed from the page (lib/precinctDistrict/targets.ts).

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtMargin, getRatingColors } from "@/lib/colorScale";
import { PRIORITY_CATEGORIES, PRIORITY_CATEGORY_BY_KEY, fmtInt, marginColorVar, type PriorityCategory } from "@/lib/precinctDistrict/explorer";
import { BANDS, BAND_BY_KEY, type BandKey, type TargetList as TargetListData, type TargetRow } from "@/lib/precinctDistrict/targets";

type SortKey = "rank" | "name" | "rating" | "tpl" | "category" | "pres" | "sthouse" | "ballots2026" | "persuadable" | "turnoutVotes" | "priority";
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
  /** Plain-language definition shown in the "Column definitions" dropdown above the table.
   *  The dropdown is built from `cols` in column order, so adding, removing or reordering a
   *  column adds, removes or reorders its definition with it; a column without one is skipped. */
  define?: ReactNode;
}

const MOBILE_PAGE = 20;

const RATING_ORDER: Record<BandKey, number> = { safeR: 7, likelyR: 6, leanR: 5, tiltR: 4, tiltD: 3, leanD: 2, likelyD: 1, safeD: 0 };
const CAT_ORDER: Record<PriorityCategory, number> = { base: 0, turnout: 1, contested: 2, persuasion: 3, opponent: 4 };

const M = ({ v, bold }: { v: number | null; bold?: boolean }) => <span className="tabular-nums" style={{ color: marginColorVar(v), fontWeight: bold ? 700 : 400 }}>{v == null ? "—" : fmtMargin(v)}</span>;
const N = ({ v, bold, muted }: { v: number | null; bold?: boolean; muted?: boolean }) => <span className="tabular-nums" style={{ fontWeight: bold ? 700 : 400, color: muted ? "var(--app-text-muted)" : undefined }}>{fmtInt(v)}</span>;
const signedVotes = (v: number | null) => (v == null ? "—" : v === 0 ? "0" : `${v > 0 ? "+" : "−"}${fmtInt(Math.abs(v))}`);

function Swatch({ color }: { color: string }) {
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />;
}

/** The site's standard rating pill (as on the forecast ledgers), keyed by the band's short name. */
function RatingPill({ band, title }: { band: BandKey; title?: string }) {
  const label = BAND_BY_KEY[band].short;
  const { bg, text } = getRatingColors(label);
  return <span title={title} className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: bg, color: text }}>{label}</span>;
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
  const { rows, year, midtermYear } = list;
  const [band, setBand] = useState<BandKey | "all">("all");
  const [category, setCategory] = useState<PriorityCategory | "all">("all");
  const [area, setArea] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [shown, setShown] = useState(MOBILE_PAGE);
  // Cell feedback: the pointer's row and column tint lightly and the cell itself darker, like a
  // crosshair; a click pins the same on that cell (click again to clear).
  type Cell = { id: string; key: SortKey };
  const [hovered, setHovered] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const LIGHT = "color-mix(in srgb, var(--app-tab-bg) 55%, var(--app-bg))";
  const DARK = "var(--app-tab-bg)";
  const cellBg = (id: string, key: SortKey): string | undefined => {
    const hit = (c: Cell | null) => (c ? (c.id === id && c.key === key ? 2 : c.id === id || c.key === key ? 1 : 0) : 0);
    const level = Math.max(hit(hovered), hit(selected));
    return level === 2 ? DARK : level === 1 ? LIGHT : undefined;
  };
  const headBg = (key: SortKey): string => (hovered?.key === key || selected?.key === key ? LIGHT : "var(--app-bg)");

  const areas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.sub)) seen.set(r.sub, r.subName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const cols: Col[] = useMemo(() => [
    { key: "rank", label: "#", title: "Priority rank: 1 = most net votes available", defaultDir: "asc", value: (r) => r.rank, render: (r) => <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.rank ?? "—"}</span> },
    { key: "name", label: "Precinct", align: "left", defaultDir: "asc", value: (r) => r.id, render: (r) => <span className="font-medium" style={{ color: "var(--app-text-primary)" }}>{r.id}{r.estimated && <span title="Some years estimated on today's precinct lines by 2020 block population" className="ml-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>≈</span>}<span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>{r.subName}</span></span> },
    { key: "rating", label: "Rating", title: "Rating on the precinct TPL: Safe 15+, Likely 5–15, Lean 1–5, Tilt under 1", align: "left", defaultDir: "desc", borderLeft: true, value: (r) => (r.band ? RATING_ORDER[r.band] : null), render: (r) => (r.band ? <RatingPill band={r.band} title={BAND_BY_KEY[r.band].describe} /> : "—"), define: <>The precinct TPL read on the site&apos;s rating bands: Safe 15 points or more, Likely 5–15, Lean 1–5, Tilt under 1, each side.</> },
    { key: "tpl", label: "TPL", title: "Precinct TPL: the district's 2026 projection plus this precinct's lean relative to the district, recent races weighted most (two-year half-life)", align: "left", defaultDir: "desc", value: (r) => r.tpl, render: (r) => <M v={r.tpl} bold />, define: <>The precinct&apos;s projected 2026 State House margin: the district&apos;s 2026 projection plus this precinct&apos;s lean relative to the district across every race on file, recent races weighted most (two-year half-life), on today&apos;s precinct lines (≈ marks precincts where older years are estimated).</> },
    { key: "pres", label: `${String(year).slice(2)} Pres`, title: `${year} presidential margin, as counted`, defaultDir: "desc", borderLeft: true, value: (r) => r.pres, render: (r) => <M v={r.pres} />, define: <>The {year} presidential two-party margin in the precinct as counted.</> },
    { key: "sthouse", label: `${String(year).slice(2)} St. House`, title: `${year} State House margin, as counted`, defaultDir: "desc", value: (r) => r.sthouse, render: (r) => <M v={r.sthouse} />, define: <>The {year} State House two-party margin in the precinct as counted, the most recent result for this seat.</> },
    { key: "category", label: "Category", title: "Priority category: what the precinct is for, on the all-years average R share", align: "left", defaultDir: "asc", borderLeft: true, value: (r) => (r.category ? CAT_ORDER[r.category] : null), render: (r) => (r.category ? <Chip color={PRIORITY_CATEGORY_BY_KEY[r.category].color} title={PRIORITY_CATEGORY_BY_KEY[r.category].describe}>{PRIORITY_CATEGORY_BY_KEY[r.category].label}</Chip> : "—"), define: (
      <>What the precinct is for, from its average Republican share across every race on file (each year counting once, not weighted toward recent races like the TPL; it also sets the sign of the turnout votes):
        <ul className="mt-1 space-y-0.5 pl-4" style={{ listStyle: "disc" }}>
          {PRIORITY_CATEGORIES.map((c) => <li key={c.key}><span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--app-text-muted)" }}><Swatch color={c.color} />{c.label}</span> — {c.describe}</li>)}
        </ul>
      </>
    ) },
    { key: "ballots2026", label: "26 Ballots", title: "2026 turnout estimate: the precinct's mean midterm turnout rate × today's registration", defaultDir: "desc", borderLeft: true, value: (r) => r.ballots2026, render: (r) => <N v={r.ballots2026} />, define: <>The 2026 turnout estimate: the precinct&apos;s midterm turnout rates (ballots ÷ registration, on today&apos;s lines) averaged, × today&apos;s registration. It sizes the precinct; it does not move the margin.</> },
    { key: "persuadable", label: "Split Votes", title: `Split-ticket votes in ${year}: (R ceiling − R floor) × ballots`, defaultDir: "desc", borderLeft: true, value: (r) => r.persuadable, render: (r) => <N v={r.persuadable} />, define: <>Split-ticket votes in {year}: the gap between the Republican&apos;s best and worst two-party share across the offices on that ballot (R ceiling − R floor), × ballots cast. The minimum number of voters who picked different parties for different offices, so persuadable votes already shown to exist.</> },
    { key: "turnoutVotes", label: "Turnout Votes", title: `Midterm drop-off ballots (${year} − ${midtermYear ?? "midterm"}) × average margin: net votes from turning drop-off voters out (negative where the precinct leans D)`, defaultDir: "desc", value: (r) => r.turnoutVotes, render: (r) => <span className="tabular-nums" style={{ color: r.turnoutVotes != null && r.turnoutVotes < 0 ? "var(--app-text-very-muted)" : undefined }}>{signedVotes(r.turnoutVotes == null ? null : Math.round(r.turnoutVotes))}</span>, define: <>Net votes from turning out the voters who show up in a presidential year but not a midterm: ballots lost from {year} to {midtermYear ?? "the most recent midterm"} × the average margin. Positive where the precinct leans Republican, negative where it leans Democratic (turning those voters out would help the other side), and only the positive part counts toward net votes.</> },
    { key: "priority", label: "Net Votes", title: "Priority: split-ticket votes + turnout votes where positive", defaultDir: "desc", value: (r) => r.priority, render: (r) => <N v={r.priority} bold />, define: <>Net votes available to {rName} from working the precinct: split votes plus turnout votes where positive. A Democratic-leaning precinct&apos;s turnout votes are negative, so its net votes are its split votes alone. The # column ranks every precinct in the district on this number, and ranks hold across filters.</> },
  ], [year, midtermYear, rName]);

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
  // Category tiles: how much of the district, and how many net votes, sit in each Priority category.
  const catStats = useMemo(() => PRIORITY_CATEGORIES.map((c) => {
    const rs = rows.filter((r) => r.category === c.key);
    return { ...c, n: rs.length, ballots: rs.reduce((s, r) => s + (r.ballots2026 ?? 0), 0), net: rs.reduce((s, r) => s + (r.priority ?? 0), 0) };
  }), [rows]);
  const totals = useMemo(() => ({ n: filtered.length, ballots: filtered.reduce((s, r) => s + (r.ballots2026 ?? 0), 0), net: filtered.reduce((s, r) => s + (r.priority ?? 0), 0), all: rows.reduce((s, r) => s + (r.priority ?? 0), 0) }), [filtered, rows]);

  // Two downloads: the full district in Priority order (whatever is on screen), and the custom
  // list — exactly the precincts and order shown after the filters and sort.
  function downloadCsv(which: "all" | "filtered") {
    const head = ["Rank", "Precinct", "Area", "Rating", "Precinct TPL", `${year} President`, `${year} State House`, "Category", "Registered", "Avg margin", "2026 est. ballots", "Split-ticket votes", "Turnout votes", "Net votes"];
    const m = (v: number | null) => (v == null ? "" : v.toFixed(1));
    const n = (v: number | null) => (v == null ? "" : String(Math.round(v)));
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const source = which === "all" ? [...rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)) : sorted;
    const lines = source.map((r) => [r.rank ?? "", q(r.id), q(r.subName), r.band ? BAND_BY_KEY[r.band].short : "", m(r.tpl), m(r.pres), m(r.sthouse), r.category ? PRIORITY_CATEGORY_BY_KEY[r.category].label : "", r.reg, m(r.avgMargin), n(r.ballots2026), n(r.persuadable), n(r.turnoutVotes), n(r.priority)].join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const scope = which === "all" ? "" : "-" + ([category !== "all" ? PRIORITY_CATEGORY_BY_KEY[category].label : null, band !== "all" ? BAND_BY_KEY[band].short : null, area !== "all" ? areas.find((x) => x[0] === area)?.[1] : null].filter(Boolean).join("-") || "custom").replace(/\s+/g, "-").toLowerCase();
    a.href = url; a.download = `${districtName.replace(/\s+/g, "-").toLowerCase()}-targets${scope}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const arrow = (key: SortKey) => (sortKey === key ? <span className="ml-1 text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span> : null);
  const headRule = "2px solid var(--app-text-primary)";

  // The header sits outside the scroll box so elastic overscroll (the bounce at either end) moves
  // only the rows. The body table keeps an invisible copy of the header so both tables size their
  // columns from the same content; the visible header copies those widths.
  const bodyTableRef = useRef<HTMLTableElement>(null);
  const [fit, setFit] = useState<{ widths: number[]; headH: number } | null>(null);
  useLayoutEffect(() => {
    const table = bodyTableRef.current;
    if (!table) return;
    const measure = () => {
      const row = table.tHead?.rows[0];
      if (!row) return;
      const widths = Array.from(row.cells).map((c) => c.getBoundingClientRect().width);
      const headH = table.tHead!.getBoundingClientRect().height;
      setFit((prev) => (prev && prev.headH === headH && prev.widths.length === widths.length && prev.widths.every((x, i) => Math.abs(x - widths[i]) < 0.5) ? prev : { widths, headH }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(table);
    return () => ro.disconnect();
  }, [cols, sorted.length]);
  const cellBorder = (first: boolean) => ({ borderBottom: "1px solid var(--app-border)", borderLeft: first ? undefined : "1px solid var(--app-border)" });
  const renderHead = (widths: number[] | null, interactive: boolean) => (
    <tr style={{ background: "var(--app-bg)" }}>
      {cols.map((c, i) => (
        <th
          key={c.key}
          title={interactive ? c.title : undefined}
          onClick={interactive ? () => toggleSort(c.key) : undefined}
          className="cursor-pointer select-none whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider"
          style={{ background: interactive ? headBg(c.key) : "var(--app-bg)", transition: "background-color 90ms ease-out", color: sortKey === c.key ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: headRule, borderLeft: i === 0 ? undefined : "1px solid var(--app-border)", ...(widths?.[i] ? { width: widths[i], minWidth: widths[i], maxWidth: widths[i] } : {}) }}
        >
          {c.label}{arrow(c.key)}
        </th>
      ))}
    </tr>
  );

  const definitions = cols.filter((c) => c.define);

  return (
    <div>
      {/* Column definitions: built from `cols`, so they track the table's columns and their order */}
      <details className="mb-5 text-[12.5px]">
        <summary className="cursor-pointer select-none font-semibold" style={{ color: "var(--app-text-muted)" }}>Column definitions</summary>
        <dl className="mt-2 max-w-4xl space-y-2 text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
          {definitions.map((c) => (
            <div key={c.key}>
              <dt className="inline font-semibold" style={{ color: "var(--app-text-primary)" }}>{c.label}.</dt>{" "}
              <dd className="inline">{c.define}</dd>
            </div>
          ))}
        </dl>
      </details>

      {/* Category tiles */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {catStats.map((c) => {
          const active = category === c.key;
          return (
            <button key={c.key} onClick={() => setCategory(active ? "all" : c.key)} aria-pressed={active} className="self-start text-left" style={{ borderTop: `3px solid ${c.color}`, paddingTop: 8, opacity: category !== "all" && !active ? 0.55 : 1 }}>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{c.label}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5"><span className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>{c.n}</span><span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>precinct{c.n === 1 ? "" : "s"}</span></div>
              <div className="mt-1 text-[11.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtInt(c.ballots)} ballots est. · <b style={{ color: "var(--app-text-primary)" }}>{fmtInt(c.net)}</b> net votes</div>
              <div className="text-[10.5px]" style={{ color: "var(--app-text-very-muted)" }}>{c.describe}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none"><Label>Rating</Label>
          <FilterPill active={band === "all"} onClick={() => setBand("all")} count={rows.length}>All</FilterPill>
          {bandStats.map((b) => <FilterPill key={b.key} active={band === b.key} onClick={() => setBand(band === b.key ? "all" : b.key)} color={b.color} count={b.n}>{b.short}</FilterPill>)}
        </div>
        <div className="hidden items-center gap-1 overflow-x-auto scrollbar-none md:flex"><Label>Category</Label>
          <FilterPill active={category === "all"} onClick={() => setCategory("all")}>All</FilterPill>
          {PRIORITY_CATEGORIES.map((c) => <FilterPill key={c.key} active={category === c.key} onClick={() => setCategory(category === c.key ? "all" : c.key)} color={c.color} count={catCounts[c.key]}>{c.label}</FilterPill>)}
        </div>
        <label className="flex items-center gap-1 md:hidden"><Label>Category</Label>
          <Select value={category} onChange={(v) => setCategory(v as PriorityCategory | "all")} ariaLabel="Category">
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
            <option value="tpl:desc">Precinct TPL, most Republican first</option>
            <option value="tpl:asc">Precinct TPL, most Democratic first</option>
            <option value="pres:desc">{year} presidential margin</option>
            <option value="sthouse:desc">{year} State House margin</option>
            <option value="ballots2026:desc">2026 ballots, largest first</option>
            <option value="persuadable:desc">Split-ticket votes</option>
            <option value="turnoutVotes:desc">Turnout votes</option>
            <option value="name:asc">Precinct name</option>
          </Select>
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => downloadCsv("all")} title="Every precinct in Priority order, whatever is filtered here" className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
            Full CSV
          </button>
          <button onClick={() => downloadCsv("filtered")} disabled={filtered.length === 0} title="Only the precincts shown, in the order shown" className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold disabled:opacity-50" style={{ background: "transparent", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
            Custom CSV{filtered.length !== rows.length ? ` (${filtered.length})` : ""}
          </button>
        </div>
      </div>

      {/* Readout */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
        <span className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>{fmtInt(totals.net)}</span>
        <span>net votes available to {rName} in {totals.n === rows.length ? `all ${rows.length} precincts` : `${totals.n} of ${rows.length} precincts`}{totals.n !== rows.length ? ` (${Math.round((totals.net / Math.max(1, totals.all)) * 100)}% of ${fmtInt(totals.all)})` : ""} · {fmtInt(totals.ballots)} ballots expected in 2026</span>
      </div>

      {/* Desktop table */}
      <div className="mt-4 hidden md:block">
        <div className="overflow-hidden">
          <table className="w-full text-[13px]" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: fit ? "fixed" : undefined }}>
            <thead>{renderHead(fit?.widths ?? null, true)}</thead>
          </table>
        </div>
        <div className="overflow-auto" style={{ maxHeight: 640, overscrollBehavior: "contain" }}>
          <table ref={bodyTableRef} className="w-full text-[13px]" style={{ borderCollapse: "separate", borderSpacing: 0, marginTop: fit ? -fit.headH : undefined }}>
            <thead aria-hidden style={{ visibility: "hidden" }}>{renderHead(null, false)}</thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }}>
                  {cols.map((c, i) => {
                    const isSel = selected?.id === r.id && selected.key === c.key;
                    return (
                      <td
                        key={c.key}
                        aria-selected={isSel}
                        className="whitespace-nowrap px-2.5 py-2 text-left"
                        style={{ ...cellBorder(i === 0), background: cellBg(r.id, c.key), transition: "background-color 90ms ease-out" }}
                        onMouseEnter={() => setHovered({ id: r.id, key: c.key })}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setSelected(isSel ? null : { id: r.id, key: c.key })}
                      >
                        {c.render(r)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={cols.length} className="py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No precincts match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="mt-4 md:hidden">
        {sorted.slice(0, shown).map((r) => {
          const kv = (label: string, value: ReactNode) => (
            <div className="flex items-baseline justify-between gap-2 py-0.5">
              <span style={{ color: "var(--app-text-muted)" }}>{label}</span>
              <span className="tabular-nums font-semibold" style={{ color: "var(--app-text-primary)" }}>{value}</span>
            </div>
          );
          const active = selected?.id === r.id;
          return (
            <div key={r.id} className="-mx-2 px-2 py-3" style={{ borderBottom: "1px solid var(--app-border)", background: active ? DARK : undefined, transition: "background-color 90ms ease-out" }} onClick={() => setSelected(active ? null : { id: r.id, key: "name" })}>
              {/* Line 1: rank, name, area · net votes */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[16px] font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{r.rank ?? "—"}</span>
                    <span className="truncate text-[14px] font-semibold" style={{ color: "var(--app-text-primary)" }}>{r.id}{r.estimated && <span className="ml-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>≈</span>}</span>
                  </div>
                  <div className="text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{r.subName}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[17px] font-extrabold tabular-nums leading-none" style={{ color: "var(--app-text-primary)" }}>{fmtInt(r.priority)}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>net votes</div>
                </div>
              </div>
              {/* Line 2: rating + TPL · category */}
              <div className="mt-2 flex items-center justify-between gap-3">
                {r.band ? <span className="inline-flex items-center gap-2"><M v={r.tpl} bold /><RatingPill band={r.band} /></span> : <span />}
                {r.category && <Chip color={PRIORITY_CATEGORY_BY_KEY[r.category].color}>{PRIORITY_CATEGORY_BY_KEY[r.category].label}</Chip>}
              </div>
              {/* Figures: results on the left, votes on the right */}
              <div className="mt-2 grid grid-cols-2 gap-x-6 text-[12px]" style={{ borderTop: "1px solid var(--app-border)", paddingTop: 6 }}>
                <div>
                  {kv(`${String(year).slice(2)} Pres`, <M v={r.pres} />)}
                  {kv("Split votes", fmtInt(r.persuadable))}
                  {kv("26 Ballots", fmtInt(r.ballots2026))}
                </div>
                <div>
                  {kv(`${String(year).slice(2)} St. House`, <M v={r.sthouse} />)}
                  {kv("Turnout votes", <span style={{ color: r.turnoutVotes != null && r.turnoutVotes < 0 ? "var(--app-text-very-muted)" : undefined }}>{signedVotes(r.turnoutVotes == null ? null : Math.round(r.turnoutVotes))}</span>)}
                  {kv("Registered", fmtInt(r.reg))}
                </div>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No precincts match.</div>}
        {sorted.length > shown && (
          <button onClick={() => setShown(sorted.length)} className="mt-3 w-full rounded-full py-1.5 text-[12px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
            Show all {sorted.length}
          </button>
        )}
      </div>

      <div className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
        Net votes = split-ticket votes ({year}: R ceiling − R floor, × ballots) + turnout votes where positive (ballots lost from {year} to {midtermYear ?? "the midterm"} × average margin). Precinct TPL = the district&apos;s 2026 projection plus this precinct&apos;s lean relative to the district across every race on file, recent races weighted most (two-year half-life), on today&apos;s precinct lines (≈ where older years are estimated); its rating uses the site&apos;s bands (Safe 15+, Likely 5–15, Lean 1–5, Tilt under 1). The category and the average margin behind it count every year equally. A Democratic-leaning precinct&apos;s turnout votes are negative, so its net votes are split-ticket votes only. Ranks hold across filters.
      </div>
    </div>
  );
}

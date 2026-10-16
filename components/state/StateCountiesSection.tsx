"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StateCountyMap from "@/components/StateCountyMap";
import PastElectionCountyMap from "@/components/PastElectionCountyMap";
import type { CountyLayer, CountyRow } from "@/lib/statePage";

export const TPL_LAYER = "tpl";
const SHOW_FIRST = 8;

type SortKey = "name" | "tpl" | "pres2024" | "votes2024" | "est2026";

function fmtMargin(m: number | null): string {
  if (m == null) return "—";
  return `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`;
}
function marginColor(m: number | null): string {
  if (m == null) return "var(--app-text-very-muted)";
  return m > 0 ? "var(--party-rep)" : "var(--party-dem)";
}
function fmtVotes(n: number | null): string {
  return n == null ? "—" : Math.round(n).toLocaleString();
}

/**
 * The county map beside the state's counties as a table. The map's layer chips are owned by the
 * parent, because a statewide result card in the results section can select one too.
 */
export default function StateCountiesSection({
  stateAbbr,
  stateName,
  areaLabel,
  countyTpl,
  layers,
  rows,
  activeLayer,
  onLayer,
}: {
  stateAbbr: string;
  stateName: string;
  areaLabel: string;
  countyTpl: Record<string, number | null>;
  layers: CountyLayer[];
  rows: CountyRow[];
  activeLayer: string;
  onLayer: (key: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // Side by side, the table box is as tall as the map column; whether its rows overflow decides the toggle.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  // Where the expanded box is scrolled, for the header shadow and the "more below" fade.
  const [scrollPos, setScrollPos] = useState({ top: false, end: false });
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setScrollPos({ top: el.scrollTop > 0, end: el.scrollTop + el.clientHeight >= el.scrollHeight - 1 });
  };
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "votes2024", dir: -1 });
  const layer = layers.find((l) => l.key === activeLayer) ?? null;
  const countyVotes = useMemo(() => Object.fromEntries(rows.map((r) => [r.fips, r.votes2024])), [rows]);

  const sorted = useMemo(() => {
    const list = [...rows];
    const dir = sort.dir;
    list.sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
      const av = a[sort.key], bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
    return list;
  }, [rows, sort]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
  }, []);

  const chip = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onLayer(key)}
      className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors"
      style={activeLayer === key
        ? { background: "var(--app-text-primary)", color: "var(--app-bg)", border: "1px solid var(--app-text-primary)" }
        : { background: "transparent", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
    >
      {label}
    </button>
  );
  const header = (key: SortKey, label: string, align: "left" | "right" = "right") => {
    const active = sort.key === key;
    return (
      <th className={`pb-2 ${align === "left" ? "text-left" : "text-right"} text-[10px] uppercase tracking-wider font-semibold align-bottom md:whitespace-nowrap`} style={{ color: active ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
        <button type="button" className="hover:underline" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}>
          {label}{active ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
        </button>
      </th>
    );
  };

  return (
    <section id="counties" className="mt-10">
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Counties</h2>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          {rows.length} {areaLabel.toLowerCase() === "parish" ? "parishes" : areaLabel.toLowerCase() === "borough" ? "boroughs" : "counties"} · click a name to open its page
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {chip(TPL_LAYER, "County TPL")}
            {layers.map((l) => chip(l.key, l.label))}
          </div>
          {layer ? (
            <PastElectionCountyMap
              key={layer.key}
              stateAbbr={stateAbbr}
              stateName={stateName}
              counties={layer.entries}
              demName={layer.demName}
              repName={layer.repName}
              demParty={layer.demParty}
              repParty={layer.repParty}
              height={340}
              reservePanel
              caption={layer.caption ? <div className="px-1 pt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>{layer.caption}</div> : undefined}
            />
          ) : (
            <StateCountyMap stateAbbr={stateAbbr} stateName={stateName} showTpl showLabel={false} countyTpl={countyTpl} countyVotes={countyVotes} height={340} reservePanel />
          )}
        </div>

        {/* Side by side, every row is rendered in a box that ends with the map column (the map plus
            the county panel's reserved space): collapsed it clips, "Show all" only lets it scroll. Stacked on phones there is
            no map to match, so the list shows SHOW_FIRST rows and grows. Fixed column widths and a
            reserved scrollbar gutter keep the columns still either way. */}
        <div className="min-w-0 md:relative">
          <div
            ref={scrollRef}
            className={`scrollbar-visible overflow-x-auto md:absolute md:inset-x-0 md:top-0 md:bottom-9 ${showAll ? "md:overflow-y-auto" : "md:overflow-y-hidden"}`}
            onScroll={onScroll}
            style={{ scrollbarGutter: "stable" }}
          >
          <table className="w-full table-fixed text-[11px] md:text-sm">
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10" style={{ background: "var(--app-bg)", boxShadow: showAll && scrollPos.top ? "0 6px 6px -6px rgba(0,0,0,0.25)" : undefined }}>
              <tr>
                {header("name", areaLabel, "left")}
                {header("tpl", "County TPL")}
                {header("pres2024", "2024 Pres.")}
                {header("votes2024", "2024 votes")}
                {header("est2026", "2026 est.")}
                <th className="pb-2 text-right text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.fips} className={!showAll && i >= SHOW_FIRST ? "hidden md:table-row" : undefined} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="py-2 pr-2 text-left font-semibold">
                    <a href={`/historical/${r.fips}`} className="hover:underline" style={{ color: "var(--app-text-primary)" }}>{r.name}</a>
                  </td>
                  <td className="py-2 pr-2 text-right font-bold tabular-nums" style={{ color: marginColor(r.tpl) }}>{fmtMargin(r.tpl)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums" style={{ color: marginColor(r.pres2024) }}>{fmtMargin(r.pres2024)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtVotes(r.votes2024)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtVotes(r.est2026)}</td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{r.share == null ? "—" : `${r.share.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {showAll && overflows && !scrollPos.end && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-9 hidden h-12 md:block"
              style={{ background: "linear-gradient(to bottom, transparent, var(--app-bg))", marginRight: 8 }}
            />
          )}
          {(rows.length > SHOW_FIRST || overflows) && (
            <button
              type="button"
              onClick={() => {
                if (showAll) scrollRef.current?.scrollTo({ top: 0 });
                setScrollPos({ top: false, end: false });
                setShowAll((v) => !v);
              }}
              className={`mt-3 text-xs font-semibold hover:underline md:absolute md:bottom-0 md:left-0 ${rows.length > SHOW_FIRST ? "" : "hidden md:inline"} ${overflows || showAll ? "" : "md:hidden"}`}
              style={{ color: "var(--app-text-primary)" }}
            >
              {showAll ? "Show fewer" : `Show all ${rows.length} ↓`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

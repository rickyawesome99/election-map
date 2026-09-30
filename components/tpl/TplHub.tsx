"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { marginToRating } from "@/lib/colorScale";
import { OFFICE_LABELS, districtHref, fmt1, stateHref } from "./format";
import { MapLegend, TplMap } from "./TplMaps";
import type { ModelSummary } from "./types";
import { CandidateLink, Foot, M, Pills, Segmented, TD, TD_R, TH, TH_R, VERY_MUTED, WarChip } from "./ui";

// The map hub: one choropleth with a States/Districts toggle and a year lens, the ranked
// table beside it, then the distribution by band, the cycle's standout candidates and the
// section links. The lens recolors the map by one cycle's WRS instead of the blended TPL and
// re-ranks the table and the distribution with it.

type Geo = "states" | "districts";
type Lens = "all" | number;
type Sort = "d" | "r" | "c";

const BANDS = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"];
const BAND_COLOR: Record<string, string> = { "Safe D": "#1b408c", "Likely D": "#587ccc", "Lean D": "#8bafff", "Tilt D": "#959bb3", "Tilt R": "#cf8980", "Lean R": "#ff8b98", "Likely R": "#ff5864", "Safe R": "#be1c29" };

function DivergingBar({ v, width = 96 }: { v: number; width?: number }) {
  const half = width / 2;
  const px = (Math.min(Math.abs(v), 45) / 45) * half;
  return (
    <span className="relative inline-block h-2 align-middle" style={{ width, background: "var(--app-tab-bg)" }} aria-hidden>
      <span className="absolute top-0 h-full" style={{ left: v < 0 ? half - px : half, width: px, background: v < 0 ? "var(--party-dem)" : "var(--party-rep)" }} />
      <span className="absolute -top-0.5 h-3 w-px" style={{ left: half, background: "var(--app-text-primary)" }} />
    </span>
  );
}

export function TplHub({ summary }: { summary: ModelSummary }) {
  const [geo, setGeo] = useState<Geo>("states");
  const [lens, setLens] = useState<Lens>("all");
  const [sort, setSort] = useState<Sort>("c");
  const [showAll, setShowAll] = useState(false);

  // /model#districts (the old District Table's redirect) opens on the district map.
  useEffect(() => {
    // One-time sync from the URL after mount; the hash is not available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.hash === "#districts") setGeo("districts");
  }, []);

  const median = geo === "states" ? summary.medianStateTpl : summary.medianDistrictTpl;
  const valueLabel = lens === "all" ? "TPL" : `${lens} WRS`;

  const rows = useMemo(() => {
    const list = geo === "states"
      ? summary.states.map((s) => ({ key: s.name, name: s.name, sub: s.abbr, value: lens === "all" ? s.tpl : s.yearWrs[lens] ?? s.tpl, href: stateHref(s.id) }))
      : summary.districts.map((d) => ({ key: d.id, name: d.code, sub: d.stateName, value: lens === "all" ? d.tpl : d.yearWrs[lens] ?? d.tpl, href: districtHref(d.state, d.code) }));
    return list;
  }, [summary, geo, lens]);

  const ranked = useMemo(() => {
    const list = [...rows];
    if (sort === "c") list.sort((a, b) => Math.abs(a.value) - Math.abs(b.value));
    else if (sort === "d") list.sort((a, b) => a.value - b.value);
    else list.sort((a, b) => b.value - a.value);
    return list;
  }, [rows, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = Object.fromEntries(BANDS.map((b) => [b, 0]));
    for (const r of rows) c[marginToRating(r.value)]++;
    return c;
  }, [rows]);
  const maxCount = Math.max(...Object.values(counts), 1);
  const shown = showAll ? ranked : ranked.slice(0, 14);

  return (
    <div>
      <LedgerSectionHead
        label="Map"
        meta={lens === "all" ? "blended TPL · 8-band rating scale" : `${lens} weighted race score (WRS) · same scale`}
        right={
          <span className="flex flex-wrap items-center gap-3">
            <Segmented label="Geography" options={[{ key: "states", label: "States" }, { key: "districts", label: "Districts" }]} value={geo} onChange={(g) => { setGeo(g); setShowAll(false); }} />
            <MapLegend />
          </span>
        }
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Year lens</span>
        <Pills label="Year lens" size="xs" value={lens} onChange={setLens} options={[{ key: "all" as Lens, label: "TPL", title: "Blended, recency-weighted lean" }, ...summary.lensYears.map((y) => ({ key: y as Lens, label: String(y), title: `${y}'s weighted race score alone` }))]} />
        <span className="text-[11px]" style={VERY_MUTED}>{lens === "all" ? "Blended, recency-weighted lean." : "That cycle's WRS alone: its races' neutralized margins, weighted by office."}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <TplMap mode={geo} rows={rows} valueLabel={valueLabel} linkLabel={geo === "states" ? "Open state page" : "Open district"} />
          <Foot>Click a {geo === "states" ? "state" : "district"} for its {geo === "states" ? "page" : "pipeline inside its state page"}. Pinch or scroll to zoom.</Foot>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Ranked</span>
            <Pills label="Sort" size="xs" value={sort} onChange={setSort} options={[{ key: "d" as Sort, label: "Most D" }, { key: "r" as Sort, label: "Most R" }, { key: "c" as Sort, label: "Competitive" }]} />
          </div>
          <div className={showAll ? "max-h-[520px] overflow-y-auto" : ""}>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr style={{ borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-muted)" }}>
                  <th className={TH}>#</th>
                  <th className={TH}>{geo === "states" ? "State" : "District"}</th>
                  <th className={TH_R}>{valueLabel}</th>
                  <th className={`${TH} hidden sm:table-cell`} />
                  <th className={TH_R}>Centered</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className={TD} style={VERY_MUTED}>{i + 1}</td>
                    <td className={TD}>
                      <Link href={r.href} className="font-medium underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)" }}>{r.name}</Link>
                      <span className="ml-1.5 rounded px-1 py-px font-mono text-[9px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{r.sub}</span>
                    </td>
                    <td className={TD_R}><M v={r.value} digits={1} bold /></td>
                    <td className={`${TD} hidden sm:table-cell`}><DivergingBar v={r.value} /></td>
                    <td className={TD_R}><M v={r.value - median} digits={1} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot>
            Showing {shown.length} of {ranked.length} ·{" "}
            <button type="button" onClick={() => setShowAll((v) => !v)} className="underline">{showAll ? "Show fewer" : "Show all"}</button>
            {" "}· Centered subtracts the {geo === "states" ? "50-state" : "435-district"} median {fmt1(median)}.
          </Foot>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="min-w-0">
          <LedgerSectionHead label="Distribution" meta={`${rows.length} ${geo} by band${lens === "all" ? "" : ` · ${lens} WRS`}`} />
          <div className="flex flex-col gap-1.5">
            {BANDS.map((b) => (
              <div key={b} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: "64px 1fr 32px" }}>
                <span style={{ color: b.endsWith("D") && !b.startsWith("Tilt") ? "var(--party-dem)" : b.endsWith("R") && !b.startsWith("Tilt") ? "var(--party-rep)" : "var(--app-text-primary)" }}>{b}</span>
                <span className="block h-3" style={{ width: `${Math.max(1, (counts[b] / maxCount) * 100)}%`, background: BAND_COLOR[b] }} />
                <span className="text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{counts[b]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <LedgerSectionHead label="Candidates" meta={`largest ${summary.topWar.year} WAR`} right={<Link href="/model/candidates" className="text-xs hover:underline" style={{ color: "var(--app-text-muted)" }}>All candidates ›</Link>} />
          <div className="overflow-x-auto"><table className="w-full border-collapse text-xs">
            <tbody>
              {summary.topWar.rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className={TD}><CandidateLink name={r.candidate} party={r.party} /></td>
                  <td className={TD} style={{ color: "var(--app-text-muted)" }}>{r.state} {r.office === "H" ? r.race.replace(/^House /, "") : OFFICE_LABELS[r.office]} · {r.year}</td>
                  <td className={TD_R}><WarChip war={r.war} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="min-w-0">
          <LedgerSectionHead label="Go deeper" />
          <table className="w-full border-collapse text-xs">
            <tbody>
              {[
                ["/model/states", "States", "50 pages, each with the full pipeline and its districts"],
                ["/model#districts", "Districts", "435 on 2026 lines, inside their state pages"],
                ["/model/candidates", "Candidates", `${summary.racesScored.toLocaleString()} races · ${summary.performances.toLocaleString()} candidate-performances`],
                ["/methodology/county-tpl", "County TPL", "on every county page"],
                ["/methodology/state-tpl", "Methodology", "State · District · County · WAR"],
              ].map(([href, label, desc]) => (
                <tr key={href} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className={`${TD} font-semibold`}><Link href={href} className="hover:underline" onClick={href === "/model#districts" ? (e) => { e.preventDefault(); setGeo("districts"); window.scrollTo({ top: 0, behavior: "smooth" }); } : undefined}>{label}</Link></td>
                  <td className="px-2 py-1.5" style={{ color: "var(--app-text-muted)" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

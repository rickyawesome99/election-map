"use client";

// Nationwide precinct trends for the all-states sidebar on /precincts: groups of precincts followed
// through time (data/precincts/nationalTrends.json, scripts/precincts/build_national_trends.py). The
// same for every office and year picked above. Drawn with the site's margin-graph parts: lines in
// neutral ink, each named at its right end, since colour on this site means party.

import { useState } from "react";
import { MarginField, marginAxis, partyFill, smoothPath, useWidth } from "@/components/MarginGraphKit";
import { fmtMargin, marginColor } from "@/lib/colorScale";

export type NationalTrendsData = {
  years: number[];
  counts: Record<string, number>;
  series: Record<string, (number | null)[]>;
  regions: Record<string, string[]>;
};

type Line = { key: string; label: string; ref?: boolean };
type Chart = { id: string; title: string; note?: string; lines: Line[] };

const NATION: Line = { key: "all", label: "All precincts", ref: true };
const KICKER = "text-[10.5px] font-bold uppercase tracking-[0.07em]";
const TIP_W = 204;
const LABEL_GAP = 13; // least distance between two end labels

function TrendChart({ data, chart }: { data: NationalTrendsData; chart: Chart }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null); // index into years
  const [focus, setFocus] = useState<string | null>(null); // a line picked out by its label
  const years = data.years;
  const lines = chart.lines.filter((l) => data.series[l.key]?.some((v) => v != null));
  const values = lines.flatMap((l) => data.series[l.key].filter((v): v is number => v != null));
  const axis = marginAxis(values, { fit: true });
  const pad = { top: 10, right: 136, bottom: 22, left: 42 };
  // Tall enough that a 5-point move is visible whatever the range, and that the end labels fit.
  const H = Math.round(Math.min(300, Math.max(150, (axis.hi - axis.lo) * 1.9, lines.length * LABEL_GAP + 30))) + pad.top + pad.bottom;
  const iw = Math.max(0, width - pad.left - pad.right);
  const ih = H - pad.top - pad.bottom;
  const inset = 10;
  // Spaced by the calendar, so a state with odd-year elections keeps an even time scale.
  const x = (n: number) => pad.left + inset + (years.length < 2 ? 0.5 : (years[n] - years[0]) / (years[years.length - 1] - years[0])) * Math.max(0, iw - inset * 2);
  const crowded = years.length > 6; // then only even years are named on the axis
  const y = (v: number) => pad.top + ((axis.hi - v) / (axis.hi - axis.lo)) * ih;
  const last = years.length - 1;

  // End labels: at each line's last value, then pushed apart top to bottom so none overlap.
  const ends = lines.map((l) => ({ line: l, v: data.series[l.key][last] as number })).filter((e) => e.v != null).sort((a, b) => y(a.v) - y(b.v));
  const labelY: number[] = [];
  ends.forEach((e, n) => labelY.push(Math.max(y(e.v), n ? labelY[n - 1] + LABEL_GAP : pad.top + 2)));
  for (let n = ends.length - 1, floor = H - pad.bottom; n >= 0; n--) { labelY[n] = Math.min(labelY[n], floor); floor = labelY[n] - LABEL_GAP; }

  const nearest = (px: number) => years.reduce((a, _, n) => (Math.abs(x(n) - px) < Math.abs(x(a) - px) ? n : a), 0);
  const dim = (key: string) => focus !== null && focus !== key;

  return (
    <div id={`national-trend-${chart.id}`}>
      <div className={`${KICKER} mt-6 pb-1`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{chart.title}</div>
      <div ref={boxRef} className="relative mt-2" style={{ height: H }}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`${chart.title}: blended margin by year, ${years[0]} to ${years[last]}`} style={{ touchAction: "pan-y" }}
            onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = e.clientX - r.left; setHover(px <= pad.left + iw + 6 ? nearest(px) : null); }}
            onPointerLeave={() => { setHover(null); setFocus(null); }}>
            <MarginField x0={pad.left} x1={pad.left + iw} y={y} ticks={axis.ticks} lo={axis.lo} hi={axis.hi} compact />
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + ih} stroke="var(--app-text-muted)" strokeOpacity={0.5} />}
            {years.map((yr, n) => (crowded && yr % 2 !== 0 && n !== hover) ? null : (
              <text key={yr} x={x(n)} y={H - 5} textAnchor="middle" fontSize={10.5} fontWeight={n === hover ? 700 : 500} fill={n === hover ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums" }}>
                {`’${String(yr).slice(2)}`}
              </text>
            ))}
            {lines.map((l) => {
              const pts = data.series[l.key].map((v, n) => (v == null ? null : { x: x(n), y: y(v), v })).filter((p): p is { x: number; y: number; v: number } => p !== null);
              return (
                <g key={l.key} opacity={dim(l.key) ? 0.2 : 1}>
                  <path d={smoothPath(pts)} fill="none" stroke={l.ref ? "var(--app-text-muted)" : "var(--app-text-primary)"} strokeWidth={l.ref ? 1.25 : 1.75} strokeDasharray={l.ref ? "3 3" : undefined} strokeLinejoin="round" strokeLinecap="round" />
                  {!l.ref && pts.map((p, n) => <circle key={n} cx={p.x} cy={p.y} r={hover !== null && p.x === x(hover) ? 4 : 3} fill={partyFill(p.v)} stroke="var(--app-bg)" strokeWidth={1.5} />)}
                </g>
              );
            })}
            {ends.map((e, n) => (
              <g key={e.line.key} opacity={dim(e.line.key) ? 0.3 : 1} style={{ cursor: "default" }}
                onPointerEnter={() => setFocus(e.line.key)} onPointerLeave={() => setFocus(null)}>
                {/* leader from the line's end to its (possibly shifted) label */}
                <line x1={x(last) + 5} x2={pad.left + iw + 8} y1={y(e.v)} y2={labelY[n]} stroke="var(--app-border)" />
                <text x={pad.left + iw + 11} y={labelY[n]} dy="0.32em" fontSize={10.5} style={{ fontVariantNumeric: "tabular-nums" }}>
                  <tspan fill={e.line.ref ? "var(--app-text-muted)" : "var(--app-text-primary)"} fontWeight={600}>{e.line.label}</tspan>
                  <tspan dx={4} fill={marginColor(e.v)} fontWeight={700}>{fmtMargin(e.v)}</tspan>
                </text>
              </g>
            ))}
          </svg>
        )}
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 px-3 pb-2.5 pt-2 text-xs"
            style={{
              top: pad.top, width: TIP_W,
              left: x(hover) < width / 2 ? Math.min(x(hover) + 12, width - TIP_W) : Math.max(x(hover) - 12 - TIP_W, 0),
              background: "var(--app-bg)", border: "1px solid var(--app-border)", borderTop: "2px solid var(--app-text-primary)",
              boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)", color: "var(--app-text-primary)",
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{years[hover]}{hover > 0 ? ` · change from ${years[0]}` : ""}</div>
            <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-2.5 gap-y-0.5 whitespace-nowrap tabular-nums">
              {lines.map((l) => ({ l, v: data.series[l.key][hover], v0: data.series[l.key][0] })).filter((r) => r.v != null).sort((a, b) => (b.v as number) - (a.v as number)).map(({ l, v, v0 }) => (
                <div key={l.key} className="contents">
                  <span style={{ color: l.ref ? "var(--app-text-muted)" : "var(--app-text-primary)" }}>{l.label}</span>
                  <span className="text-right font-semibold" style={{ color: marginColor(v) }}>{fmtMargin(v)}</span>
                  <span className="text-right text-[10.5px]" style={{ color: hover > 0 && v0 != null ? marginColor((v as number) - v0) : "var(--app-text-very-muted)" }}>
                    {hover > 0 && v0 != null ? fmtMargin(Math.round(((v as number) - v0) * 10) / 10) : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {chart.note && <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{chart.note}</p>}
    </div>
  );
}

/** `data` is the national file, or one state's (public/precincts/trends/{ST}.json: no regions, and
 *  only the groups that state has enough precincts for). */
export default function NationalTrends({ data }: { data: NationalTrendsData }) {
  if (data.years.length < 2) return null;
  const charts: Chart[] = [
    { id: "area", title: "By area type", lines: [{ key: "urban", label: "Urban" }, { key: "suburban", label: "Suburban" }, { key: "exurban", label: "Exurban" }, { key: "rural", label: "Rural" }, NATION] },
    {
      id: "race", title: "By racial makeup", note: "Precincts where that share of residents is one group (2020 Census).",
      lines: [{ key: "white90", label: "90%+ White" }, { key: "black80", label: "80%+ Black" }, { key: "hisp80", label: "80%+ Hispanic" }, { key: "asian50", label: "50%+ Asian" }, { key: "native70", label: "70%+ Native" }, NATION],
    },
    {
      id: "age", title: "By age and housing", note: "Young: half of adults under 35. Senior: 40%+ of adults 65 or older. Renters: 80%+ of homes rented. Owners: 90%+ owned.",
      lines: [{ key: "young", label: "Young" }, { key: "senior", label: "Senior" }, { key: "renter", label: "Renters" }, { key: "owner", label: "Owners" }, NATION],
    },
    { id: "region", title: "By region", lines: [...Object.keys(data.regions).map((r) => ({ key: `region:${r}`, label: r })), NATION] },
  ];
  return (
    <div id="national-trends">
      <div className={KICKER} style={{ color: "var(--app-text-primary)" }}>Precinct trends, {data.years[0]}–{data.years[data.years.length - 1]}</div>
      <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
        The same precincts followed through each election: every year&rsquo;s races blended into one margin.
      </p>
      {/* A chart is drawn when it has a group to show beyond the all-precincts reference. */}
      {charts.filter((c) => c.lines.some((l) => !l.ref && data.series[l.key]?.some((v) => v != null))).map((c) => <TrendChart key={c.id} data={data} chart={c} />)}
    </div>
  );
}

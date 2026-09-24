"use client";

// Demographics × vote: every precinct as a dot, a census metric across, a result (or swing)
// up, dot area = ballots, color = which party led. The quartile table beneath answers the same
// question without the chart.

import { useMemo, useState } from "react";
import type { PrecinctDistrictData } from "@/lib/precinctDistrict/types";
import { marginOf, subdivisionName } from "@/lib/precinctDistrict/aggregate";
import { DEMO_METRICS, popWeightedMetric, type DemoMetricKey } from "@/lib/precinctDistrict/demographics";
import { officeShort, officesOf, precinctRows } from "@/lib/precinctDistrict/explorer";
import { fmtMargin } from "@/lib/colorScale";

const W = 640, H = 360, PL = 46, PR = 16, PT = 14, PB = 34;

export default function DemoScatter({ data }: { data: PrecinctDistrictData }) {
  const { config, results } = data;
  const years = useMemo(() => [...config.years].sort((a, b) => b - a), [config.years]);
  const latest = years[0];
  const [xKey, setXKey] = useState<DemoMetricKey>("pct_college");
  const [yYear, setYYear] = useState<number>(latest);
  const [yOffice, setYOffice] = useState<string>(results.years[String(latest)].offices.pres ? "pres" : officesOf(results.years[String(latest)])[0]);
  const [hover, setHover] = useState<string | null>(null);
  const xm = DEMO_METRICS.find((m) => m.key === xKey)!;
  const yr = results.years[String(yYear)];

  const points = useMemo(() => {
    const rows = precinctRows(data, yYear, "current");
    return rows.flatMap((r) => {
      const d = data.demographics.precincts[r.id];
      const x = d ? xm.value(d) : null;
      const y = r.races[yOffice] ? marginOf(r.races[yOffice]) : null;
      if (x == null || y == null) return [];
      return [{ id: r.id, sub: r.sub, x, y, ballots: r.ballots, estimated: !!r.estimated }];
    });
  }, [data, yYear, yOffice, xm]);

  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymax = Math.max(10, Math.ceil(Math.max(...ys.map(Math.abs)) / 10) * 10);
  const bmax = Math.max(...points.map((p) => p.ballots));
  const X = (v: number) => PL + ((v - xmin) / Math.max(1e-9, xmax - xmin)) * (W - PL - PR);
  const Y = (v: number) => PT + ((v + ymax) / (2 * ymax)) * (H - PT - PB);   // R-positive plotted downward → D above the line
  const R = (b: number) => 3 + 9 * Math.sqrt(b / bmax);

  // correlation for the caption
  const corr = useMemo(() => {
    const n = points.length; if (n < 3) return null;
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const p of points) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }, [points, xs, ys]);

  // quartiles of the x metric, ballot-weighted result in each
  const quartiles = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const q = 4, out: { label: string; range: string; n: number; ballots: number; margin: number | null; pop: number }[] = [];
    for (let i = 0; i < q; i++) {
      const slice = sorted.slice(Math.floor((i * sorted.length) / q), Math.floor(((i + 1) * sorted.length) / q));
      if (!slice.length) continue;
      const rows = precinctRows(data, yYear, "current").filter((r) => slice.some((s) => s.id === r.id));
      let d = 0, r = 0;
      for (const row of rows) { const v = row.races[yOffice]; if (v) { d += v.d; r += v.r; } }
      out.push({
        label: ["Lowest quarter", "Second", "Third", "Highest quarter"][i],
        range: `${xm.format(slice[0].x)} – ${xm.format(slice[slice.length - 1].x)}`,
        n: slice.length, ballots: slice.reduce((s, p) => s + p.ballots, 0), margin: d + r > 0 ? ((r - d) / (d + r)) * 100 : null,
        pop: popWeightedMetric(slice.map((s) => data.demographics.precincts[s.id]).filter(Boolean), xm) ?? 0,
      });
    }
    return out;
  }, [points, data, yYear, yOffice, xm]);

  const hp = hover ? points.find((p) => p.id === hover) : null;
  const pill = (active: boolean) => active
    ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
    : { color: "var(--app-text-muted)", border: "1px solid transparent" };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>Across</span>
          {DEMO_METRICS.map((m) => <button key={m.key} onClick={() => setXKey(m.key)} aria-pressed={xKey === m.key} className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={pill(xKey === m.key)}>{m.short}</button>)}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>Up</span>
          {years.map((y) => <button key={y} onClick={() => { setYYear(y); const ny = results.years[String(y)]; if (!ny.offices[yOffice]) setYOffice(ny.offices.pres ? "pres" : officesOf(ny)[0]); }} aria-pressed={yYear === y} className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={pill(yYear === y)}>{y}</button>)}
          <span className="mx-1" />
          {officesOf(yr).map((o) => <button key={o} onClick={() => setYOffice(o)} aria-pressed={yOffice === o} className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={pill(yOffice === o)}>{officeShort(yr, o)}</button>)}
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: "auto" }} role="img" aria-label={`${xm.label} against ${yYear} ${officeShort(yr, yOffice)} margin by precinct`} onMouseLeave={() => setHover(null)}>
            {[-ymax, -ymax / 2, ymax / 2, ymax].map((g) => <line key={g} x1={PL} x2={W - PR} y1={Y(g)} y2={Y(g)} stroke="var(--app-border)" />)}
            <line x1={PL} x2={W - PR} y1={Y(0)} y2={Y(0)} stroke="var(--app-text-muted)" />
            {[ymax, ymax / 2, 0, -ymax / 2, -ymax].map((g) => (
              <text key={g} x={PL - 6} y={Y(g) + 3.5} textAnchor="end" fontSize={10} fill="var(--app-text-muted)" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>{g === 0 ? "even" : g > 0 ? `D+${g}` : `R+${-g}`}</text>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = xmin + f * (xmax - xmin); return <text key={f} x={X(v)} y={H - 14} textAnchor="middle" fontSize={10} fill="var(--app-text-muted)" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>{xm.format(v)}</text>; })}
            <text x={(PL + W - PR) / 2} y={H - 2} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--app-text-muted)">{xm.label} · dot area = ballots</text>
            {points.map((p) => (
              <circle key={p.id} cx={X(p.x)} cy={Y(-p.y)} r={R(p.ballots)} fill={p.y > 0 ? "var(--party-rep)" : "var(--party-dem)"} fillOpacity={hover && hover !== p.id ? 0.35 : 0.72} stroke="var(--app-bg)" strokeWidth={hover === p.id ? 2 : 1} onMouseEnter={() => setHover(p.id)} />
            ))}
          </svg>
          {hp && (
            <div className="pointer-events-none absolute left-2 top-2 rounded-md px-2.5 py-1.5 text-[11px]" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
              <b>{hp.id}</b> <span style={{ color: "var(--app-text-muted)" }}>{subdivisionName(config, hp.sub)}</span><br />
              {xm.label} <b>{xm.format(hp.x)}</b> · {yYear} {officeShort(yr, yOffice)} <b style={{ color: hp.y > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>{fmtMargin(hp.y)}</b> · {hp.ballots.toLocaleString()} ballots{hp.estimated ? " · ≈" : ""}
            </div>
          )}
        </div>
        <div className="text-[12.5px]">
          <div className="pb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>Precincts grouped by {xm.label}</div>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {quartiles.map((q) => (
                <tr key={q.label} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="py-1.5 pr-2"><div className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{q.label}</div><div className="text-[10.5px]" style={{ color: "var(--app-text-very-muted)" }}>{q.range} · {q.n} pr. · {q.ballots.toLocaleString()} ballots</div></td>
                  <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: q.margin == null ? "var(--app-text-muted)" : q.margin > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>{fmtMargin(q.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
            {corr != null && <>Correlation across precincts: <b style={{ color: "var(--app-text-muted)" }}>{corr > 0 ? "+" : ""}{corr.toFixed(2)}</b> (positive = higher {xm.label} runs more Republican). </>}
            Margins are two-party; older years are on today&apos;s lines (≈).
          </div>
        </div>
      </div>
    </div>
  );
}

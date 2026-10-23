"use client";

import { NO_RECHARTS, useRecharts } from "@/lib/useRecharts";
import type { AtlasDistrict, AtlasProjectionRow } from "@/lib/stateLegAtlas";
import { niceAxisConfig } from "@/lib/chartAxis";

type Point = { year: number; lean: number; rows: AtlasProjectionRow[] };

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.05) return "Even";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`;
}
const partyColor = (v: number) => (Math.abs(v) < 0.05 ? "var(--app-text-primary)" : v > 0 ? "var(--party-rep)" : "var(--party-dem)");

/**
 * The district's TPL lean by year: every race in its lean ledger (President and legislative), each
 * carried onto today's lines with the national environment and incumbency taken out, combined per
 * year by the ledger's own weights. The dashed rule is the structural lean, the weighted average of
 * all of them, which is what the 2026 projection starts from. Republican up.
 */
export default function AtlasTrendChart({ district }: { district: AtlasDistrict }) {
  const recharts = useRecharts(); // loads after hydration (lib/useRecharts)
  const { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } = recharts ?? NO_RECHARTS;
  const pr = district.projection;
  const rows = pr?.rows ?? [];
  const byYear = new Map<number, AtlasProjectionRow[]>();
  for (const r of rows) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r]);
  const data: Point[] = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, rs]) => {
    const w = rs.reduce((s, r) => s + r.weight, 0);
    const lean = w > 0 ? rs.reduce((s, r) => s + r.weight * r.NM, 0) / w : rs.reduce((s, r) => s + r.NM, 0) / rs.length;
    return { year, lean, rows: rs };
  });
  if (data.length < 2) return <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>Not enough races on record to chart a trend.</p>;

  const lean = pr?.lean ?? null;
  const all = [...data.map((d) => d.lean), ...(lean != null ? [lean] : [])];
  const axis = niceAxisConfig(all);

  return (
    <div>
      <div style={{ width: "100%", height: 220 }}>
        {recharts && (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 14, right: 16, bottom: 4, left: -8 }}>
              <CartesianGrid stroke="var(--app-border)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} ticks={data.map((d) => d.year)} tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} axisLine={{ stroke: "var(--app-border)" }} tickLine={false} />
              <YAxis domain={axis.domain} ticks={axis.ticks} allowDataOverflow tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} tickFormatter={(v: number) => (v === 0 ? "Even" : `${v > 0 ? "R" : "D"}+${Math.abs(v)}`)} axisLine={false} tickLine={false} width={56} />
              <ReferenceLine y={0} stroke="var(--app-text-very-muted)" />
              {lean != null && (
                <ReferenceLine y={lean} stroke={partyColor(lean)} strokeDasharray="5 4" label={{ value: `Structural lean ${fmt(lean)}`, position: "insideTopLeft", fontSize: 10, fill: partyColor(lean) }} />
              )}
              <Tooltip
                cursor={{ stroke: "var(--app-border)" }}
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <div className="rounded-md px-2.5 py-1.5 text-xs" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                      <div className="flex items-baseline justify-between gap-4 font-bold">
                        <span>{p.year} lean</span>
                        <span style={{ color: partyColor(p.lean) }}>{fmt(p.lean)}</span>
                      </div>
                      {[...p.rows].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "P" ? -1 : 1)).map((r) => (
                        <div key={r.kind} className="flex items-baseline justify-between gap-4" style={{ color: "var(--app-text-muted)" }}>
                          <span>{r.label}{r.huber < 1 ? " ↓" : ""}</span>
                          <span className="tabular-nums" style={{ color: partyColor(r.NM) }}>{fmt(r.NM)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Line
                type="linear"
                dataKey="lean"
                stroke="var(--app-text-primary)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) => (
                  <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={props.payload ? partyColor(props.payload.lean) : "var(--app-text-primary)"} stroke="var(--app-bg)" strokeWidth={1.5} />
                )}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        Each point is that year&rsquo;s races (President and this seat) on today&rsquo;s lines, with the national environment and incumbency removed, weighted as in the Forecast Calculation. ↓ marks a race the model down-weights as an outlier.
      </p>
    </div>
  );
}

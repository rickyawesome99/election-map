"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { startPendingNav } from "@/lib/navPending";
import { Legend, MarginField, MarkerShape, RevealClip, Tip, marginAxis, partyFill, smoothPath, useSize, useTweened, type Marker } from "@/components/MarginGraphKit";

/**
 * The Graph tab of a race page's Vote History: the seat's margins over time in the state page
 * graph's style (party washes either side of Even, a smooth line, winner-coloured dots that pop
 * in by year). One series per office: a Senate or Governor seat has one, a House district adds
 * the statewide races it voted in. "vs. Nation" redraws every point as its lean against the
 * national result, gliding between the two views. Specials are hollow and stand off the line;
 * the 2026 forecast hangs off the end on a dashed tail. Clicking a year opens that election.
 */

export type HistoryPoint = {
  year: number;
  /** R-positive two-party margin. */
  margin: number;
  /** R-positive: how much more Republican than the nation. */
  natDiff: number | null;
  demPct: number;
  repPct: number;
  demName?: string;
  repName?: string;
  special?: boolean;
  href?: string;
};

export type HistorySeries = { key: string; label: string; points: HistoryPoint[]; on?: boolean };

const STYLES: { ink: string; marker: Marker; dash?: string }[] = [
  { ink: "var(--app-text-primary)", marker: "circle" },
  { ink: "var(--app-text-muted)", marker: "square", dash: "7 5" },
  { ink: "var(--app-text-muted)", marker: "diamond", dash: "1.5 5" },
  { ink: "var(--app-text-muted)", marker: "triangle", dash: "4 3 1 3" },
];

type Mode = "margin" | "nation";

const pk = (series: string, p: { year: number; special?: boolean }) => `${series}:${p.year}${p.special ? "s" : ""}`;
const lastName = (n?: string) => (n ? n.trim().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).pop() ?? n : undefined);

export default function RaceHistoryGraph({ series, forecast, subject }: {
  series: HistorySeries[];
  /** Attaches to the first series. */
  forecast?: { year: number; margin: number } | null;
  subject: string;
}) {
  const router = useRouter();
  const [hostRef, size] = useSize<HTMLDivElement>();
  const [mode, setMode] = useState<Mode>("margin");
  const withPoints = series.filter((s) => s.points.length > 0);
  const [on, setOn] = useState<Set<string>>(() => {
    const start = new Set(withPoints.filter((s, i) => s.on ?? i === 0).map((s) => s.key));
    if (start.size === 0 && withPoints[0]) start.add(withPoints[0].key);
    return start;
  });
  const [showNation, setShowNation] = useState(true);
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const lastPointer = useRef<{ type: string; wasHovered: boolean }>({ type: "mouse", wasHovered: false });
  const [pinned, setPinned] = useState(false);

  // A tapped year stays up on touch (lifting a finger fires pointerleave) until a tap lands
  // outside the graph.
  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => {
      if (hostRef.current?.contains(e.target as Node)) return;
      setPinned(false);
      setHoverYear(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pinned, hostRef]);

  const styleOf = (key: string) => STYLES[Math.max(0, series.findIndex((s) => s.key === key)) % STYLES.length];
  const hasNational = withPoints.some((s) => s.points.some((p) => p.natDiff != null));
  const single = withPoints.length === 1;
  const primary = withPoints[0]?.key;

  const visible = withPoints.filter((s) => on.has(s.key));
  const valueOf = (p: HistoryPoint) => (mode === "nation" ? p.natDiff : p.margin);
  // The nation's own margin each year, as a faint reference under a single seat's line.
  const nationRef = single && mode === "margin" && showNation
    ? withPoints[0].points.filter((p) => !p.special && p.natDiff != null).map((p) => ({ year: p.year, margin: Math.round((p.margin - p.natDiff!) * 10) / 10 }))
    : [];
  const fc = mode === "margin" && forecast && primary && on.has(primary) ? forecast : null;

  const years = [...new Set([...withPoints.flatMap((s) => s.points.map((p) => p.year)), ...(forecast ? [forecast.year] : [])])].sort((a, b) => a - b);

  // Every number the drawing depends on, eased together when the view changes.
  const target: Record<string, number> = {};
  for (const s of visible) for (const p of s.points) { const v = valueOf(p); if (v != null) target[pk(s.key, p)] = v; }
  for (const r of nationRef) target[`nat:${r.year}`] = r.margin;
  if (fc) target.fc = fc.margin;
  const axis = marginAxis(Object.values(target).length ? Object.values(target) : [0]);
  target.__lo = axis.lo;
  target.__hi = axis.hi;
  const tw = useTweened(target);

  if (years.length === 0 || withPoints.length === 0) return null;

  const width = size.width;
  const compact = width > 0 && width < 520;
  const H = Math.max(220, size.height);
  // Multi-series graphs label each line in a right gutter; on a phone the legend does that job.
  const gutter = !single && !compact;
  const M = { top: 14, right: gutter ? 62 : 18, bottom: fc ? 36 : 28, left: compact ? 42 : 52 };
  const iw = Math.max(0, width - M.left - M.right);
  const ih = H - M.top - M.bottom;
  const y0 = years[0];
  const y1 = years[years.length - 1];
  const xPad = Math.min(28, iw / (years.length * 2.4));
  const x = (yr: number) => M.left + xPad + (y1 === y0 ? (iw - 2 * xPad) / 2 : ((yr - y0) / (y1 - y0)) * (iw - 2 * xPad));
  const lo = tw.__lo ?? axis.lo;
  const hi = tw.__hi ?? axis.hi;
  const y = (v: number) => M.top + ((hi - v) / (hi - lo || 1)) * ih;
  const ticks = axis.ticks.filter((t) => t >= lo - 1e-6 && t <= hi + 1e-6);

  const lines = visible.map((s) => {
    const regular = s.points.filter((p) => !p.special && target[pk(s.key, p)] != null).sort((a, b) => a.year - b.year);
    const pts = regular.map((p) => ({ x: x(p.year), y: y(tw[pk(s.key, p)] ?? target[pk(s.key, p)]) }));
    const last = regular[regular.length - 1];
    const tail = s.key === primary && fc && last && fc.year > last.year
      ? `M${x(last.year)},${y(tw[pk(s.key, last)] ?? target[pk(s.key, last)])} L${x(fc.year)},${y(tw.fc ?? fc.margin)}`
      : "";
    return { s, path: smoothPath(pts), tail, lastY: last ? pts[pts.length - 1].y : null };
  });

  // Direct labels in the right gutter, nudged apart so they never collide.
  const labels = !gutter ? [] : lines.filter((l) => l.lastY != null).map((l) => ({ key: l.s.key, text: l.s.label, ink: styleOf(l.s.key).ink, y: l.lastY! })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;

  const nearestYear = (px: number) => years.reduce((best, yr) => (Math.abs(x(yr) - px) < Math.abs(x(best) - px) ? yr : best), years[0]);
  const hovered = hoverYear == null ? [] : visible.flatMap((s) => s.points.filter((p) => p.year === hoverYear && target[pk(s.key, p)] != null).map((p) => ({ s, p })));
  const hoverHref = hovered.find((h) => h.p.href)?.p.href;
  const hoverFc = fc && hoverYear === fc.year ? fc : null;
  const delay = (yr: number) => `${120 + ((yr - y0) / Math.max(1, y1 - y0)) * 520}ms`;

  const toggle = (key: string) => setOn((cur) => {
    const n = new Set(cur);
    if (n.has(key)) { if (n.size > 1) n.delete(key); } else n.add(key);
    return n;
  });

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2">
        {hasNational ? (
          <div role="radiogroup" aria-label="Graph view" className="vh-seg relative flex rounded-full p-0.5 text-[11px] font-semibold" style={{ background: "var(--app-tab-bg)" }}>
            <span aria-hidden className="vh-seg-thumb absolute inset-y-0.5 left-0.5 rounded-full" style={{ width: "calc(50% - 2px)", transform: mode === "nation" ? "translateX(100%)" : "none", background: "var(--app-panel)" }} />
            {(["margin", "nation"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className="ix-press relative z-[1] w-[5.5rem] rounded-full py-1 transition-colors" style={{ color: mode === m ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
                {m === "margin" ? "Margin" : "vs. Nation"}
              </button>
            ))}
          </div>
        ) : <span />}
        <Legend
          items={[
            ...(!single ? withPoints.map((s) => {
              const st = styleOf(s.key);
              return {
                key: s.key,
                label: s.label,
                off: !on.has(s.key),
                onToggle: () => toggle(s.key),
                swatch: (
                  <>
                    <line x1={1} x2={25} y1={6} y2={6} stroke={st.ink} strokeWidth={2} strokeDasharray={st.dash} strokeLinecap="round" />
                    <MarkerShape shape={st.marker} x={13} y={6} r={3.4} fill="var(--app-text-muted)" stroke="var(--app-bg)" strokeWidth={1.5} />
                  </>
                ),
              };
            }) : []),
            ...(single && hasNational && mode === "margin" ? [{
              key: "nation",
              label: "Nation",
              off: !showNation,
              onToggle: () => setShowNation((v) => !v),
              swatch: <line x1={1} x2={25} y1={6} y2={6} stroke="var(--app-text-very-muted)" strokeWidth={2} strokeDasharray="1.5 4" strokeLinecap="round" />,
            }] : []),
            ...(fc ? [{
              key: "fc",
              label: `${fc.year} forecast`,
              swatch: <MarkerShape shape="circle" x={13} y={6} r={3.6} fill="var(--app-bg)" stroke="var(--app-text-muted)" strokeWidth={1.75} />,
            }] : []),
          ]}
        />
      </div>

      <div ref={hostRef} className="relative min-h-0 flex-1" style={{ minHeight: 220 }}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`${subject} margins by year${mode === "nation" ? ", relative to the nation" : ""}`}
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const yr = nearestYear(e.clientX - r.left);
              lastPointer.current = { type: e.pointerType, wasHovered: yr === hoverYear };
              setPinned(e.pointerType !== "mouse");
              setHoverYear(yr);
            }}
            onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoverYear(nearestYear(e.clientX - r.left)); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setHoverYear(null); }}
            onClick={() => {
              // A tap on touch first shows the year; a second tap on it opens the election.
              const { type, wasHovered } = lastPointer.current;
              if (!hoverHref || (type !== "mouse" && !wasHovered)) return;
              startPendingNav(hoverHref);
              router.push(hoverHref);
            }}
            style={{ display: "block", overflow: "visible", touchAction: "pan-y", cursor: hoverHref ? "pointer" : "default" }}
          >
            <defs><RevealClip id="rh-clip" x={M.left} y={M.top} w={iw} h={ih} /></defs>
            <MarginField x0={M.left} x1={M.left + iw} y={y} ticks={ticks} lo={lo} hi={hi} compact={compact} zeroLabel={mode === "nation" ? "Nation" : undefined} />

            {hoverYear != null && <line x1={x(hoverYear)} x2={x(hoverYear)} y1={M.top} y2={M.top + ih} stroke="var(--app-text-muted)" strokeOpacity={0.45} strokeWidth={1} />}

            {years.map((yr) => {
              const isFc = fc?.year === yr && !withPoints.some((s) => s.points.some((p) => p.year === yr));
              return (
                <g key={yr}>
                  <text x={x(yr)} y={H - (fc ? 18 : 8)} textAnchor="middle" fontSize={compact ? 11 : 12} fontWeight={yr === hoverYear ? 700 : 500} fill={yr === hoverYear ? "var(--app-text-primary)" : "var(--app-text-muted)"} style={{ fontVariantNumeric: "tabular-nums", transition: "fill 160ms" }}>
                    {yr}
                  </text>
                  {isFc && <text x={x(yr)} y={H - 5} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--app-text-very-muted)" style={{ letterSpacing: "0.04em" }}>FORECAST</text>}
                </g>
              );
            })}

            <g clipPath="url(#rh-clip)">
              {nationRef.length > 1 && (
                <path className="rh-fade-in" d={smoothPath(nationRef.map((r) => ({ x: x(r.year), y: y(tw[`nat:${r.year}`] ?? r.margin) })))} fill="none" stroke="var(--app-text-very-muted)" strokeWidth={2} strokeDasharray="1.5 5" strokeLinecap="round" />
              )}
              {lines.map((l) => {
                const st = styleOf(l.s.key);
                return (
                  <g key={l.s.key} className="rh-fade-in">
                    {l.path && <path d={l.path} fill="none" stroke={st.ink} strokeWidth={l.s.key === primary ? 2.5 : 2} strokeDasharray={st.dash} strokeLinecap="round" strokeLinejoin="round" />}
                    {l.tail && <path d={l.tail} fill="none" stroke={st.ink} strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" opacity={0.7} />}
                  </g>
                );
              })}
            </g>

            {nationRef.map((r) => (
              <circle key={`nat-${r.year}`} className="rg-pop" style={{ animationDelay: delay(r.year), opacity: hoverYear != null && hoverYear !== r.year ? 0.35 : 1, transition: "opacity 160ms" }} cx={x(r.year)} cy={y(tw[`nat:${r.year}`] ?? r.margin)} r={3} fill="var(--app-bg)" stroke="var(--app-text-very-muted)" strokeWidth={1.5} />
            ))}

            {visible.flatMap((s) => s.points.filter((p) => target[pk(s.key, p)] != null).map((p) => {
              const st = styleOf(s.key);
              const v = tw[pk(s.key, p)] ?? target[pk(s.key, p)];
              const isHover = hoverYear === p.year;
              const dim = hoverYear != null && !isHover;
              const fillBy = valueOf(p)!;
              return (
                <g key={pk(s.key, p)} style={{ opacity: dim ? 0.35 : 1, transition: "opacity 160ms" }}>
                  <g className="rg-pop" style={{ animationDelay: delay(p.year) }}>
                    {isHover && <circle cx={x(p.year)} cy={y(v)} r={11} fill={fillBy > 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)"} className="rh-halo" />}
                    <MarkerShape
                      shape={st.marker}
                      x={x(p.year)}
                      y={y(v)}
                      r={isHover ? 6.5 : s.key === primary ? 5.5 : 4.5}
                      fill={p.special ? "var(--app-bg)" : partyFill(fillBy)}
                      stroke={p.special ? partyFill(fillBy) : "var(--app-bg)"}
                      strokeWidth={2}
                      style={{ transition: "r 160ms" }}
                    />
                  </g>
                </g>
              );
            }))}

            {fc && (
              <g className="rg-pop" style={{ animationDelay: delay(fc.year), opacity: hoverYear != null && hoverYear !== fc.year ? 0.35 : 1, transition: "opacity 160ms" }}>
                <circle cx={x(fc.year)} cy={y(tw.fc ?? fc.margin)} r={hoverYear === fc.year ? 6.5 : 5.5} fill="var(--app-bg)" stroke={partyFill(fc.margin)} strokeWidth={2} strokeDasharray="3 2" style={{ transition: "r 160ms" }} />
              </g>
            )}

            {labels.map((l) => (
              <text key={l.key} className="rg-fade" x={M.left + iw + 10} y={l.y} dy="0.32em" fontSize={compact ? 10.5 : 11.5} fontWeight={600} fill={l.ink}>
                {l.text}
              </text>
            ))}
          </svg>
        )}

        {hoverYear != null && (hovered.length > 0 || hoverFc) && (
          <Tip x={x(hoverYear)} width={width} top={M.top} minWidth={single ? 130 : 150}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
              <span>{hoverYear}</span>
              {hoverHref && <span className="font-semibold normal-case tracking-normal" style={{ color: "var(--app-text-very-muted)" }}>Details →</span>}
            </div>
            <div className="flex flex-col gap-0.5 tabular-nums">
              {hovered.map(({ s, p }) => {
                const st = styleOf(s.key);
                const v = valueOf(p)!;
                // A single seat names its winner; several lines name the office.
                const winner = p.margin > 0 ? { name: lastName(p.repName) ?? "Republican", ink: "var(--party-rep)" } : { name: lastName(p.demName) ?? "Democrat", ink: "var(--party-dem)" };
                return (
                  <div key={pk(s.key, p)} className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 font-semibold" style={single ? { color: winner.ink } : undefined}>
                      {!single && <svg width={12} height={12} aria-hidden><MarkerShape shape={st.marker} x={6} y={6} r={3.4} fill={p.special ? "var(--app-panel)" : partyFill(v)} stroke={partyFill(v)} strokeWidth={1.5} /></svg>}
                      {single ? winner.name : s.label}{p.special ? " (sp.)" : ""}
                    </span>
                    <b style={{ color: marginColor(v) }}>{fmtMargin(v)}</b>
                  </div>
                );
              })}
              {hoverFc && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">Forecast</span><b style={{ color: marginColor(hoverFc.margin) }}>{fmtMargin(hoverFc.margin)}</b>
                </div>
              )}
            </div>
            {mode === "nation" && <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>vs. the national result</div>}
          </Tip>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { fmtLean, fmtMargin, leanColor, marginColor } from "@/lib/colorScale";
import { AXIS_TICKS, Mark, pctOf, tickLabel, type MarkKind } from "./editorialAxis";

// The editorial page's interactive pieces. Each one keeps a single "active" item: a mouse
// highlights it on hover, a tap toggles it (tap again or anywhere else to clear), and keyboard
// focus does the same. Props are plain numbers and strings: nothing here imports the data hub.

const SERIF: CSSProperties = { fontFamily: "var(--font-serif)" };
const BOARD = "Editorial Board";

function useActive<K extends string>() {
  const [active, setActive] = useState<K | null>(null);
  const pointer = useRef("mouse");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active == null) return;
    const away = (e: globalThis.PointerEvent) => { if (!root.current?.contains(e.target as Node)) setActive(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [active]);
  const bind = (k: K) => ({
    onPointerEnter: (e: PointerEvent) => { if (e.pointerType === "mouse") setActive(k); },
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType === "mouse") setActive(null); },
    onPointerDown: (e: PointerEvent) => { pointer.current = e.pointerType; },
    onClick: () => setActive((a) => (pointer.current === "mouse" ? k : a === k ? null : k)),
    // Keyboard focus only: a tap focuses the button too, and its click already toggles.
    onFocus: (e: FocusEvent<HTMLElement>) => { if (e.currentTarget.matches(":focus-visible")) setActive(k); },
    onBlur: () => setActive(null),
  });
  return { active, bind, root };
}

// A dark pill above (or, on the margin strips, below: clear of the figures) a point on a bar, kept inside the bar near either end.
function Tip({ pct, below = false, children }: { pct: number; below?: boolean; children: ReactNode }) {
  const align = pct < 14 ? "left-0" : pct > 86 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className={`ed-tip pointer-events-none absolute z-20 whitespace-nowrap ${below ? "top-full mt-1.5" : "bottom-full mb-2"} rounded-md px-2 py-1 text-[11px] font-bold tabular-nums ${align}`} style={{ background: "var(--app-text-primary)", color: "var(--app-bg)" }}>
      {children}
    </span>
  );
}

const LABELS: Record<MarkKind, string> = { model: "Model", rcp: "RCP average", pick: BOARD };

/** The Model / RCP / board figures over a margin strip, sharing one highlight: point at a figure
 *  or a mark and both light up, with the value spelled out above the mark. `figures: false` draws
 *  the strip alone (the at-a-glance rows). */
export function MarginReadout({ model, rcp, pick, modelHref, modelLabel = "Model", figures = true, ticks = true, height = 34 }: {
  model: number; rcp: number | null; pick: number; modelHref?: string; modelLabel?: string; figures?: boolean; ticks?: boolean; height?: number;
}) {
  const { active, bind, root } = useActive<MarkKind>();
  const value = (k: MarkKind) => (k === "model" ? fmtMargin(model) : k === "rcp" ? (rcp == null ? "N/A" : fmtLean(rcp)) : fmtMargin(pick).replace(".0", ""));
  const dim = (k: MarkKind) => (active != null && active !== k ? 0.4 : 1);
  const marks: { k: MarkKind; v: number; z: number; size: number }[] = [
    { k: "model", v: model, z: 1, size: 12 },
    ...(rcp != null ? [{ k: "rcp" as const, v: rcp, z: 2, size: 12 }] : []),
    { k: "pick", v: pick, z: 3, size: 14 },
  ];
  const label = (k: MarkKind, v: number, text: string) => (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}><Mark kind={k} v={v} size={9} />{text}</div>
  );
  const fig = (k: MarkKind, children: ReactNode, extra = "") => (
    <button type="button" {...bind(k)} aria-pressed={active === k} className={`ed-fig block w-full min-w-0 rounded-md text-left ${extra}`} style={{ opacity: dim(k) }} data-active={active === k || undefined}>
      {children}
    </button>
  );

  return (
    <div ref={root}>
      {figures && (
        <div className="mb-4 grid grid-cols-[1fr_1fr_1.4fr] items-end gap-3 sm:gap-6">
          <div className="min-w-0">
            {fig("model", <>
              {label("model", model, modelLabel)}
              <div className="mt-1 text-[22px] font-bold tabular-nums leading-none sm:text-[28px]" style={{ color: marginColor(model) }}>{fmtMargin(model)}</div>
            </>)}
            {modelHref && <Link href={modelHref} prefetch={false} className="mt-1.5 block w-fit text-[11px] font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>Full forecast →</Link>}
          </div>
          <div className="min-w-0">
            {fig("rcp", <>
              {label("rcp", rcp ?? 0, "RCP average")}
              <div className="mt-1 text-[22px] font-bold tabular-nums leading-none sm:text-[28px]" style={{ color: rcp == null ? "var(--app-text-very-muted)" : leanColor(rcp) }}>{rcp == null ? "N/A" : fmtLean(rcp)}</div>
            </>)}
            <div className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{rcp == null ? "No average" : " "}</div>
          </div>
          <div className="min-w-0 pl-3 sm:pl-6" style={{ borderLeft: "2px solid var(--app-text-primary)" }}>
            {fig("pick", <>
              {label("pick", pick, BOARD)}
              <div className="mt-1 font-bold tabular-nums leading-[0.9]" style={{ ...SERIF, fontSize: "clamp(1.8rem, 5vw, 2.6rem)", letterSpacing: "-0.03em", color: marginColor(pick) }}>{fmtMargin(pick).replace(".0", "")}</div>
            </>)}
          </div>
        </div>
      )}
      <div className="relative rounded-sm" style={{ height, background: "linear-gradient(90deg, color-mix(in srgb, var(--party-dem) 16%, var(--app-bg)) 0%, var(--app-bg) 50%, color-mix(in srgb, var(--party-rep) 16%, var(--app-bg)) 100%)" }}>
        <span className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--app-text-very-muted)" }} />
        {[-10, -5, 5, 10].map((t) => <span key={t} className="absolute inset-y-[30%] w-px" style={{ left: `${pctOf(t)}%`, background: "var(--app-border)" }} />)}
        {marks.map(({ k, v, z, size }) => (
          <button
            key={k}
            type="button"
            {...bind(k)}
            aria-label={`${LABELS[k]} ${value(k)}`}
            className="ed-mark absolute top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${pctOf(v)}%`, zIndex: active === k ? 10 : z, opacity: dim(k) }}
            data-active={active === k || undefined}
          >
            <span className="ed-mark-inner leading-none"><Mark kind={k} v={v} size={size} /></span>
            {active === k && <Tip pct={pctOf(v)} below>{LABELS[k]} · <span style={{ color: k === "pick" ? "inherit" : undefined }}>{value(k)}</span></Tip>}
          </button>
        ))}
      </div>
      {ticks && (
        <div className="relative mt-1 h-4 text-[10px] font-semibold tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
          {AXIS_TICKS.map((t) => <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pctOf(t)}%` }}>{tickLabel(t)}</span>)}
        </div>
      )}
    </div>
  );
}

export type Segment = { key: string; width: number; color: string; tip?: string };

/** A stacked bar whose segments answer to hover / tap with their own tooltip; `marker` draws a
 *  labeled rule across it (the House's 218). */
export function SegmentBar({ segments, height = 16, marker, ariaLabel }: { segments: Segment[]; height?: number; marker?: { pct: number; label: string }; ariaLabel: string }) {
  const { active, bind, root } = useActive<string>();
  const placed = segments.map((s, i) => ({ ...s, start: segments.slice(0, i).reduce((n, x) => n + x.width, 0) }));
  return (
    <div ref={root} className="relative" aria-label={ariaLabel} role="group">
      <div className="flex overflow-visible rounded-sm" style={{ height }}>
        {placed.map((s) => {
          const mid = s.start + s.width / 2;
          const body = <span className="block h-full w-full" style={{ background: s.color }} />;
          if (!s.tip) return <span key={s.key} className="relative" style={{ width: `${s.width}%`, opacity: active ? 0.4 : 1 }}>{body}</span>;
          return (
            <button key={s.key} type="button" {...bind(s.key)} aria-label={s.tip} className="ed-seg relative" style={{ width: `${s.width}%`, opacity: active && active !== s.key ? 0.4 : 1 }} data-active={active === s.key || undefined}>
              {body}
              {active === s.key && <Tip pct={mid}>{s.tip}</Tip>}
            </button>
          );
        })}
      </div>
      {marker && (
        <>
          <span className="pointer-events-none absolute w-[2px]" style={{ left: `${marker.pct}%`, top: -6, height: height + 12, background: "var(--app-text-primary)" }} />
          <div className="relative mt-1 h-4 text-[10px] font-bold tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            <span className="absolute -translate-x-1/2" style={{ left: `${marker.pct}%` }}>{marker.label}</span>
          </div>
        </>
      )}
    </div>
  );
}

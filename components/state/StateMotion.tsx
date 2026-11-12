"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The race pages' tab and toggle motion (components/VoteHistoryTabbedSection.tsx,
 * RaceHistoryGraph.tsx) for the state page: an underline that slides between tabs, and a
 * two-way toggle whose thumb slides.
 */

export function SlidingTabs<K extends string>({ tabs, active, onChange, size = "sm", right }: {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  size?: "sm" | "xs";
  right?: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Measured so it can slide; until then (and on the server) the active tab draws its own border.
  const [line, setLine] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const btn = row.querySelector<HTMLButtonElement>('button[aria-selected="true"]');
      if (btn) setLine({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [active, tabs.length]);
  return (
    <div className="flex items-end justify-between gap-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div ref={rowRef} role="tablist" className="relative flex min-w-0 flex-wrap items-end gap-x-4 gap-y-1 sm:gap-x-5">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.key)}
              className={`ix-press whitespace-nowrap pb-2.5 font-semibold transition-colors hover:text-[var(--app-text-primary)] ${size === "sm" ? "text-sm" : "text-xs"}`}
              style={{ color: on ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: `2px solid ${on && !line ? "var(--app-text-primary)" : "transparent"}`, marginBottom: "-1px" }}
            >
              {t.label}
            </button>
          );
        })}
        {line && (
          <span aria-hidden className="vh-tab-line pointer-events-none absolute left-0 h-[2px] rounded-full" style={{ bottom: "-1px", width: line.width, transform: `translateX(${line.left}px)`, background: "var(--app-text-primary)" }} />
        )}
      </div>
      {right}
    </div>
  );
}

// Short enough (with -my-1) to sit in a section heading's line without making the heading taller.
export function SegToggle<K extends string>({ options, value, onChange, label }: { options: [{ key: K; label: string }, { key: K; label: string }]; value: K; onChange: (key: K) => void; label: string }) {
  const second = value === options[1].key;
  return (
    <div role="radiogroup" aria-label={label} className="relative -my-1 inline-flex w-max self-start rounded-full p-0.5 text-[11px] font-semibold" style={{ background: "var(--app-tab-bg)" }}>
      <span aria-hidden className="vh-seg-thumb absolute inset-y-0.5 left-0.5 rounded-full" style={{ width: "calc(50% - 2px)", transform: second ? "translateX(100%)" : "none", background: "var(--app-panel)" }} />
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)} className="ix-press relative z-[1] w-[4.5rem] rounded-full py-[3px] leading-[14px] transition-colors" style={{ color: value === o.key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A row of pills whose filled highlight slides to the chosen one (the chamber explorer's "Color by"). */
export function SlidingPills<K extends string>({ options, value, onChange, label }: { options: { key: K; label: string }[]; value: K; onChange: (key: K) => void; label: string }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Measured so it can slide; until then (and on the server) the chosen pill fills itself.
  const [thumb, setThumb] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const btn = row.querySelector<HTMLButtonElement>('button[aria-selected="true"]');
      setThumb(btn ? { left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div ref={rowRef} role="tablist" aria-label={label} className="relative flex flex-wrap items-center gap-1">
      {thumb && (
        <span aria-hidden className="vh-tab-line pointer-events-none absolute left-0 top-0 z-0 rounded-full" style={{ width: thumb.width, height: thumb.height, transform: `translate(${thumb.left}px, ${thumb.top}px)`, background: "var(--app-text-primary)" }} />
      )}
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            className="ix-press rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ color: on ? "var(--app-bg)" : "var(--app-text-muted)", background: on ? (thumb ? "transparent" : "var(--app-text-primary)") : "var(--app-tab-bg)", transitionDuration: "260ms" }}
          >
            {/* The button stays unpositioned so the thumb paints over the other pills' fill as it passes; the label sits above it. */}
            <span className="relative z-[1]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

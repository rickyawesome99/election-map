"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Text tabs, uppercase as /enight's, over one underline that slides (and resizes) to the chosen tab. */
export default function LineTabs<K extends string>({ label, options, value, onChange }: { label: string; options: [K, string][]; value: K; onChange: (k: K) => void }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  // Measured so it can slide; until then (and on the server) the chosen tab draws its own underline.
  const [line, setLine] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const btn = row.querySelector<HTMLButtonElement>('button[aria-selected="true"]');
      setLine(btn ? { left: btn.offsetLeft, width: btn.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div ref={rowRef} role="tablist" aria-label={label} className="relative flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider sm:gap-4">
      {line && <span aria-hidden className="vh-tab-line pointer-events-none absolute bottom-0 left-0 h-[2px]" style={{ width: line.width, transform: `translateX(${line.left}px)`, background: "var(--app-text-primary)" }} />}
      {options.map(([k, text]) => {
        const on = k === value;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)}
            className="whitespace-nowrap pb-0.5 uppercase transition-colors duration-300 hover:text-[var(--app-text-primary)]"
            style={{ color: on ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: `2px solid ${on && !line ? "var(--app-text-primary)" : "transparent"}` }}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

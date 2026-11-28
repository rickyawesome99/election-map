"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The Years page's section pills (user, 2026-11-28: pills, not line tabs): a dark pill slides to
// whichever section is on screen as the page scrolls. A pill scrolls to its section
// without touching the URL's hash, which holds the state picked in the state boxes.

export default function YearSectionNav({ sections, status }: { sections: { id: string; label: string }[]; /** "Final results", or "As of …". */ status: string }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [line, setLine] = useState<{ left: number; width: number } | null>(null);
  const ids = sections.map((s) => s.id).join(",");

  // The section whose top has passed a line a third of the way down the window.
  useEffect(() => {
    const list = ids.split(",");
    let frame = 0;
    const read = () => {
      frame = 0;
      const mark = window.innerHeight * 0.33;
      let current = list[0];
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= mark) current = id;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, [ids]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const btn = row.querySelector<HTMLButtonElement>('button[aria-current="true"]');
      setLine(btn ? { left: btn.offsetLeft, width: btn.offsetWidth } : null);
      // On a phone the row scrolls sideways: keep the current tab in view.
      if (btn && row.scrollWidth > row.clientWidth) row.scrollTo({ left: btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2, behavior: "smooth" });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [active, ids]);

  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="mb-6 flex items-center gap-3">
      <div ref={rowRef} role="navigation" aria-label="On this page" className="scrollbar-none relative flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {/* The dark pill slides to the section on screen; the buttons sit over it. */}
        {line && <span aria-hidden className="vh-tab-line pointer-events-none absolute left-0 top-0.5 bottom-0.5 rounded-full" style={{ width: line.width, transform: `translateX(${line.left}px)`, background: "var(--app-text-primary)" }} />}
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <button key={s.id} type="button" aria-current={on ? "true" : undefined} onClick={() => go(s.id)}
              className="ix-press relative shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-300"
              style={{ color: on ? "var(--app-bg)" : "var(--app-text-muted)", background: on && !line ? "var(--app-text-primary)" : line && on ? "transparent" : "var(--app-tab-bg)" }}>
              {s.label}
            </button>
          );
        })}
      </div>
      <span className="hidden shrink-0 text-[11px] tabular-nums sm:block" style={{ color: "var(--app-text-very-muted)" }}>{status}</span>
    </div>
  );
}

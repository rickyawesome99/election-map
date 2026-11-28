"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PAGE_CONTAINER, PAGE_HERO_BG, PAGE_HERO_TOP, PAGE_TITLE_STYLE } from "@/lib/pageLayout";
import { YEAR_PAGE_YEARS, yearKind, yearPagePath } from "@/lib/yearPageTypes";

// The Years page's frame (app/years/layout.tsx): the title and the year switcher stay mounted
// while the year under them changes, as the Overview's state boxes do, so a switch swaps only the
// page segment and keeps the scroll position. ‹ › and the arrow keys step one year; the strip
// jumps to any, its white thumb sliding to the pressed year at once. The old year stays up, dimmed,
// until the new one arrives, and the title's year rolls in.

const ARROW = "ix-press ix-rail-btn grid h-8 w-8 shrink-0 place-items-center rounded-full text-base disabled:opacity-30";

export default function YearsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const fromPath = Number(pathname.split("/")[2]);
  const year = YEAR_PAGE_YEARS.includes(fromPath) ? fromPath : YEAR_PAGE_YEARS[0];
  // Oldest on the left, newest on the right: ‹ goes back in time.
  const years = [...YEAR_PAGE_YEARS].reverse();
  const at = years.indexOf(year);
  const older = years[at - 1] ?? null, newer = years[at + 1] ?? null;
  const [switching, startSwitch] = useTransition();
  const stripRef = useRef<HTMLDivElement | null>(null);
  // The year just pressed: the strip's thumb slides to it at once, ahead of the page arriving.
  const [picked, setPicked] = useState<number | null>(null);
  const shown = switching && picked != null ? picked : year;
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const measure = () => {
      const on = strip.querySelector<HTMLElement>('[aria-current="page"]');
      setThumb(on ? { left: on.offsetLeft, width: on.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [shown]);

  const go = (y: number | null) => {
    if (y == null || y === year) return;
    // The picked state (#FL) carries over to the new year's boxes.
    const href = `${yearPagePath(y)}${window.location.hash}`;
    setPicked(y);
    startSwitch(() => router.push(href, { scroll: false }));
  };
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowLeft") goRef.current(older);
      else if (e.key === "ArrowRight") goRef.current(newer);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [older, newer]);

  // On a phone the strip scrolls sideways: keep the chosen year in view.
  useEffect(() => {
    const strip = stripRef.current;
    const on = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (strip && on) strip.scrollTo({ left: on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2, behavior: "smooth" });
  }, [shown]);

  const prefetchNeighbours = () => { for (const y of [older, newer]) if (y != null) router.prefetch(yearPagePath(y)); };

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", overflowAnchor: "none" }}>
      <section style={{ background: PAGE_HERO_BG }}>
        <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} pb-3 sm:pb-4`}>
          {/* The year rolls in when it changes (globals.css rc-tick). */}
          <h1 style={PAGE_TITLE_STYLE}><span key={year} className="rc-tick">{year}</span> Elections</h1>
          <nav aria-label="Election year" className="mt-4 flex items-center gap-1.5" onPointerEnter={prefetchNeighbours} onFocus={prefetchNeighbours}>
            <button type="button" className={ARROW} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} disabled={older == null} onClick={() => go(older)} aria-label={older != null ? `Previous: ${older}` : "Previous year"}>‹</button>
            <div ref={stripRef} className="scrollbar-none relative flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto rounded-full p-0.5 sm:justify-between" style={{ background: "var(--app-tab-bg)" }}>
              {/* The white thumb slides between years; until it is measured the chosen year paints its own. */}
              {thumb && <span aria-hidden className="vh-tab-line pointer-events-none absolute bottom-0.5 left-0 top-0.5 rounded-full" style={{ width: thumb.width, transform: `translateX(${thumb.left}px)`, background: "var(--app-panel)", boxShadow: "0 1px 2px rgba(0,0,0,0.14)" }} />}
              {years.map((y) => {
                const on = y === shown, major = y % 2 === 0;
                return (
                  <button key={y} type="button" onClick={() => go(y)} onPointerEnter={() => router.prefetch(yearPagePath(y))} aria-current={on ? "page" : undefined} title={`${y}: ${yearKind(y).toLowerCase()}`}
                    className={`ix-press relative shrink-0 rounded-full px-2.5 py-1 tabular-nums transition-colors duration-300 hover:text-[var(--app-text-primary)] sm:flex-1 sm:px-1 ${major ? "text-sm font-bold" : "text-xs font-semibold"}`}
                    style={{ background: on && !thumb ? "var(--app-panel)" : "transparent", color: on ? "var(--app-text-primary)" : major ? "var(--app-text-muted)" : "var(--app-text-very-muted)" }}>
                    {y}
                  </button>
                );
              })}
            </div>
            <button type="button" className={ARROW} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} disabled={newer == null} onClick={() => go(newer)} aria-label={newer != null ? `Next: ${newer}` : "Next year"}>›</button>
          </nav>
        </div>
      </section>
      <div aria-busy={switching || undefined} style={{ opacity: switching ? 0.55 : 1, transition: "opacity 120ms" }}>
        {children}
      </div>
    </div>
  );
}

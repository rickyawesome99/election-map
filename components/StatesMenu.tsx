"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { statesData } from "@/data/statesData";

// Geographic tile grid: 11 columns × 8 rows, [abbr, column, row].
const TILES: [string, number, number][] = [
  ["AK", 0, 0], ["ME", 10, 0],
  ["VT", 9, 1], ["NH", 10, 1],
  ["WA", 0, 2], ["ID", 1, 2], ["MT", 2, 2], ["ND", 3, 2], ["MN", 4, 2], ["WI", 5, 2], ["MI", 7, 2], ["NY", 8, 2], ["MA", 9, 2], ["RI", 10, 2],
  ["OR", 0, 3], ["NV", 1, 3], ["WY", 2, 3], ["SD", 3, 3], ["IA", 4, 3], ["IL", 5, 3], ["IN", 6, 3], ["OH", 7, 3], ["PA", 8, 3], ["NJ", 9, 3], ["CT", 10, 3],
  ["CA", 0, 4], ["UT", 1, 4], ["CO", 2, 4], ["NE", 3, 4], ["MO", 4, 4], ["KY", 5, 4], ["WV", 6, 4], ["VA", 7, 4], ["MD", 8, 4], ["DE", 9, 4],
  ["AZ", 1, 5], ["NM", 2, 5], ["KS", 3, 5], ["AR", 4, 5], ["TN", 5, 5], ["NC", 7, 5],
  ["OK", 3, 6], ["LA", 4, 6], ["MS", 5, 6], ["AL", 6, 6], ["SC", 7, 6],
  ["HI", 0, 7], ["TX", 3, 7], ["GA", 6, 7], ["FL", 7, 7],
];
const COLS = 11;
const ROWS = 8;
const BY_ABBR = new Map(statesData.map((s) => [s.abbr, s]));
const GAP = 8; // px between the tab and the popup, and the popup and the viewport edge
const MAX_WIDTH = 560;

function matches(query: string, abbr: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = BY_ABBR.get(abbr)?.name.toLowerCase() ?? "";
  return abbr.toLowerCase() === q || name.startsWith(q) || name.split(" ").some((w) => w.startsWith(q));
}

/** The States tab: a button that opens a geographic grid of state tiles linking to /states/[id]. */
export default function StatesMenu({
  className, active, buttonRef,
}: { className: string; active: boolean; buttonRef: (el: HTMLElement | null) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  // Open on a path: navigating anywhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const currentId = /^\/states\/([^/]+)/.exec(pathname)?.[1] ?? null;

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(MAX_WIDTH, vw - GAP * 2);
    const left = Math.max(GAP, Math.min(r.left, vw - width - GAP));
    setPos({ top: r.bottom + 1, left, width });
  }, []);

  const close = useCallback(() => { setOpenOn(null); setQuery(""); }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  // Focus the box as it mounts, with a mouse only: on touch it would throw the keyboard over the grid.
  const attachInput = useCallback((el: HTMLInputElement | null) => {
    if (el && window.matchMedia("(pointer: fine)").matches) el.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); btnRef.current?.focus(); }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [open, close, place]);

  const hits = TILES.filter(([abbr]) => matches(query, abbr));

  const popup = open && pos && (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Choose a state"
      className="fixed z-[60] rounded-md p-3 shadow-lg sm:p-4"
      style={{
        top: pos.top, left: pos.left, width: pos.width,
        maxHeight: `calc(100dvh - ${pos.top + GAP}px)`, overflowY: "auto",
        background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)",
      }}
    >
      <input
        ref={attachInput}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim() && hits.length > 0) {
            const s = BY_ABBR.get(hits[0][0]);
            if (s) { router.push(`/states/${s.id}`); close(); }
          }
        }}
        placeholder="Type a state"
        aria-label="Type a state"
        autoComplete="off"
        className="mb-3 w-full rounded-md px-3 py-2 text-base outline-none sm:text-sm"
        style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}
      />
      <div
        className="grid gap-[3px] sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${ROWS}, auto)` }}
      >
        {TILES.map(([abbr, col, row]) => {
          const s = BY_ABBR.get(abbr);
          if (!s) return null;
          const hit = matches(query, abbr);
          const current = s.id === currentId;
          return (
            <Link
              key={abbr}
              href={`/states/${s.id}`}
              prefetch={false}
              title={s.name}
              onClick={close}
              aria-current={current ? "page" : undefined}
              className="flex aspect-square items-center justify-center text-[11px] font-semibold transition-colors duration-100 hover:bg-[var(--app-tab-bg)] sm:text-[13px]"
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                border: current ? "2px solid var(--app-text-primary)" : "1px solid var(--app-border)",
                color: "var(--app-text-muted)",
                opacity: hit ? 1 : 0.25,
              }}
            >
              {abbr}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={(el) => { btnRef.current = el; buttonRef(el); }}
        type="button"
        onClick={() => (open ? close() : (setQuery(""), setOpenOn(pathname)))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        className={`${className} -mr-1.5 flex cursor-pointer items-center gap-0.5 lg:-mr-0.5 xl:-mr-1.5`}
        style={{ color: "var(--app-text-primary)" }}
      >
        States
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}>
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      {popup && createPortal(popup, document.body)}
    </>
  );
}

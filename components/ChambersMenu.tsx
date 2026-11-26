"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The four chamber pages. Legislatures keeps its own URL; its tab moved in here (user, 2026-11-25).
export const CHAMBER_LINKS: { href: string; label: string; note: string }[] = [
  { href: "/house", label: "House", note: "435 districts" },
  { href: "/senate", label: "Senate", note: "100 seats" },
  { href: "/governor", label: "Governor", note: "50 states" },
  { href: "/legislatures", label: "Legislatures", note: "99 state chambers" },
];

const GAP = 8; // px between the popup and the viewport edge
const WIDTH = 232;

/** The chamber a path belongs to: its index page, a race or seat page under it, or a state's legislative chamber. */
export function chamberLinkFor(pathname: string): string | null {
  if (pathname === "/legislatures" || /^\/states\/[^/]+\/legislature(\/|$)/.test(pathname)) return "/legislatures";
  const first = `/${pathname.split("/")[1]}`;
  return first === "/house" || first === "/senate" || first === "/governor" ? first : null;
}

/** The Chambers tab: a button that opens the list of chamber pages, built like the States tab (StatesMenu). */
export default function ChambersMenu({
  className, active, buttonRef,
}: { className: string; active: boolean; buttonRef: (el: HTMLElement | null) => void }) {
  const pathname = usePathname();
  // Open on a path: navigating anywhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const current = chamberLinkFor(pathname);

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(WIDTH, vw - GAP * 2);
    setPos({ top: r.bottom + 1, left: Math.max(GAP, Math.min(r.left, vw - width - GAP)), width });
  }, []);

  const close = useCallback(() => setOpenOn(null), []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

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

  const popup = open && pos && (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Choose a chamber"
      className="fixed z-[60] rounded-md p-1.5 shadow-lg"
      style={{ top: pos.top, left: pos.left, width: pos.width, background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}
    >
      {CHAMBER_LINKS.map(({ href, label, note }) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          onClick={() => { close(); window.scrollTo({ top: 0, behavior: "auto" }); }}
          aria-current={current === href ? "page" : undefined}
          className="flex items-baseline justify-between gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors duration-100 hover:bg-[var(--app-tab-bg)]"
          style={current === href ? { background: "var(--app-tab-bg)" } : undefined}
        >
          {label}
          <span className="text-xs font-normal" style={{ color: "var(--app-text-very-muted)" }}>{note}</span>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <button
        ref={(el) => { btnRef.current = el; buttonRef(el); }}
        type="button"
        onClick={() => (open ? close() : setOpenOn(pathname))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        className={`${className} -mr-1.5 flex cursor-pointer items-center gap-0.5 lg:-mr-0.5 xl:-mr-1.5`}
        style={{ color: "var(--app-text-primary)" }}
      >
        Chambers
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const TABS: { key: string; label: string; href?: string }[] = [
  { key: "overview",         label: "Overview" },
  { key: "forecast",         label: "2026 Forecast" },
  { key: "states",           label: "States" },
  { key: "counties",         label: "Counties" },
  { key: "model",            label: "TPL" },
  { key: "analysis",         label: "Analysis",        href: "/analysis" },
  { key: "district-finder",  label: "District Finder" },
];

function getActiveTab(pathname: string): string | null {
  if (pathname === "/house" || pathname === "/senate" || pathname === "/governor"
    || pathname.startsWith("/house/") || pathname.startsWith("/senate/") || pathname.startsWith("/governor/")) return "forecast";
  if (pathname === "/states" || pathname.startsWith("/states/")) return "states";
  if (pathname === "/counties" || pathname.startsWith("/counties/")) return "counties";
  if (pathname === "/model" || pathname.startsWith("/model/")) return "model";
  if (pathname === "/district-finder") return "district-finder";
  if (pathname.startsWith("/analysis")) return "analysis";
  if (pathname === "/overview" || pathname === "/") return "overview";
  return null;
}

export default function SubNavBar() {
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname);
  const activeTabRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map());
  const navRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const updateIndicator = useCallback(() => {
    const el = activeTab ? tabRefs.current.get(activeTab) : null;
    const nav = navRef.current;
    if (!el || !nav) { setIndicator(null); return; }
    const navRect = nav.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setIndicator({ left: elRect.left - navRect.left + nav.scrollLeft, width: elRect.width });
  }, [activeTab]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(updateIndicator);
    return () => window.cancelAnimationFrame(frame);
  }, [updateIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  useEffect(() => {
    if (!activeTab || !window.matchMedia("(max-width: 767px)").matches) return;
    activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeTab]);

  const commonClass = "relative z-10 shrink-0 px-3 py-3 text-sm font-semibold transition-colors duration-150 sm:px-3.5";

  return (
    <div
      className="px-3 sm:px-6"
      style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }}
    >
      <nav
        ref={navRef}
        className="scrollbar-none relative flex min-w-0 gap-1 overflow-x-auto overflow-y-hidden"
      >
        {indicator && (
          <div
            className="absolute bottom-0 h-[2px] rounded-full pointer-events-none"
            style={{
              left: indicator.left,
              width: indicator.width,
              background: "var(--app-text-primary)",
              transition: "left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        )}

        {TABS.map(({ key, label, href }) => {
          const isActive = activeTab === key;

          const setRef = (el: HTMLElement | null) => {
            if (el) tabRefs.current.set(key, el);
            else tabRefs.current.delete(key);
            if (isActive) activeTabRef.current = el;
          };

          const style = {
            color: isActive ? "var(--app-text-primary)" : "var(--app-text-muted)",
          };

          const targetHref = href ?? (key === "forecast" ? "/senate" : `/${key}`);

          return (
            <Link
              key={key}
              ref={setRef}
              href={targetHref}
              onClick={() => window.scrollTo({ top: 0, behavior: "auto" })}
              className={commonClass}
              style={style}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

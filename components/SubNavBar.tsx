"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

const TABS: { key: string; label: string; href?: string }[] = [
  { key: "overview",         label: "Overview" },
  { key: "forecast",         label: "Forecast" },
  { key: "historical",       label: "Historical" },
  { key: "model",            label: "TPL" },
  { key: "states",           label: "States" },
  { key: "analysis",         label: "Analysis",        href: "/analysis" },
  { key: "methodology",      label: "Methodology" },
  { key: "district-finder",  label: "District Finder" },
];

function getActiveTab(pathname: string): string | null {
  if (pathname === "/house" || pathname === "/senate" || pathname === "/governor"
    || pathname.startsWith("/house/") || pathname.startsWith("/senate/") || pathname.startsWith("/governor/")) return "forecast";
  if (pathname === "/states" || pathname.startsWith("/states/")) return "states";
  if (pathname === "/historical" || pathname.startsWith("/historical/")) return "historical";
  if (pathname === "/model" || pathname.startsWith("/model/")) return "model";
  if (pathname === "/district-finder") return "district-finder";
  if (pathname.startsWith("/analysis")) return "analysis";
  if (pathname === "/methodology" || pathname.startsWith("/methodology/")) return "methodology";
  if (pathname === "/overview" || pathname === "/") return "overview";
  return null;
}

type Chamber = "house" | "senate" | "governor";
const FORECAST_TAB_KEY = "raceType"; // written by ForecastMap's persistRaceType

function chamberOfPath(pathname: string): Chamber | null {
  const first = pathname.split("/")[1];
  return first === "house" || first === "senate" || first === "governor" ? first : null;
}

function readSavedChamber(): Chamber {
  try {
    const saved = window.localStorage.getItem(FORECAST_TAB_KEY);
    return saved === "house" || saved === "senate" || saved === "governor" ? saved : "senate";
  } catch {
    return "senate"; // storage unavailable (private mode)
  }
}

function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export default function SubNavBar() {
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname);
  // The Forecast tab returns to the chamber last viewed. The saved preference is re-read on
  // every render (SubNavBar lives in the root layout and re-renders on each navigation); the
  // server snapshot is "senate", so hydration agrees before the stored value takes over.
  const savedChamber = useSyncExternalStore(subscribeToStorage, readSavedChamber, () => "senate" as Chamber);
  const forecastChamber = chamberOfPath(pathname) ?? savedChamber;
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

  // A chamber reached through a race page (/governor/nv) counts as the last one viewed too.
  useEffect(() => {
    const here = chamberOfPath(pathname);
    if (!here) return;
    try { window.localStorage.setItem(FORECAST_TAB_KEY, here); } catch { /* storage unavailable */ }
  }, [pathname]);

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

          const targetHref = href ?? (key === "forecast" ? `/${forecastChamber}` : `/${key}`);

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

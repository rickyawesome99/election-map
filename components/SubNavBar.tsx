"use client";

import { usePathname, useSearchParams } from "next/navigation";
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

function getSavedForecastTab(): "house" | "senate" | "governor" | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem("raceType");
  return saved === "house" || saved === "senate" || saved === "governor" ? saved : null;
}

function getActiveTab(pathname: string, queryTab: string | null): string | null {
  const tplSubTabs = ["state", "district", "table", "districtTable"];
  if (pathname === "/") {
    if (tplSubTabs.includes(queryTab ?? "")) return "model";
    if (queryTab === "house" || queryTab === "senate" || queryTab === "governor" || queryTab === "forecast" || queryTab === "map") return "forecast";
    return TABS.some(({ key }) => key === queryTab) ? queryTab : "overview";
  }
  if (pathname.startsWith("/house/")) return "forecast";
  if (pathname.startsWith("/senate/")) return "forecast";
  if (pathname.startsWith("/governor/")) return "forecast";
  if (pathname.startsWith("/states/")) return "states";
  if (pathname.startsWith("/analysis")) return "analysis";
  return null;
}

export default function SubNavBar({
  initialForecastTab = null,
}: {
  initialForecastTab?: "house" | "senate" | "governor" | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlActiveTab = getActiveTab(pathname, searchParams.get("tab"));
  const [clientTab, setClientTab] = useState<{ pathname: string; key: string } | null>(null);
  const [savedForecastTab, setSavedForecastTab] = useState<"house" | "senate" | "governor">(initialForecastTab ?? "senate");
  const effectiveSavedForecastTab = getSavedForecastTab() ?? savedForecastTab;
  const activeTab = clientTab?.pathname === pathname ? clientTab.key : urlActiveTab;
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSavedForecastTab(getSavedForecastTab() ?? "senate");
    });

    function handleSavedForecastTabChange(event: Event) {
      const nextTab = (event as CustomEvent<string>).detail;
      if (nextTab === "house" || nextTab === "senate" || nextTab === "governor") {
        setSavedForecastTab(nextTab);
      }
    }

    window.addEventListener("forecast-race-type-change", handleSavedForecastTabChange);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("forecast-race-type-change", handleSavedForecastTabChange);
    };
  }, []);

  const commonClass = "relative z-10 shrink-0 px-4 py-2 text-sm font-semibold transition-colors duration-150";

  return (
    <div
      className="flex items-stretch overflow-hidden rounded-xl border px-1 py-1.5 backdrop-blur-xl md:w-fit md:max-w-full"
      style={{
        background: "color-mix(in srgb, var(--app-panel) 76%, transparent)",
        borderColor: "var(--app-border)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}
    >
      <nav
        ref={navRef}
        className="scrollbar-none relative flex min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden"
      >
        {indicator && (
          <div
            className="absolute inset-y-0 rounded-full pointer-events-none"
            style={{
              left: indicator.left,
              width: indicator.width,
              background: "var(--app-tab-bg)",
              boxShadow: "inset 0 0 0 1px var(--app-border)",
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

          if (href) {
            return (
              <a
                key={key}
                ref={setRef}
                href={href}
                onClick={() => window.scrollTo({ top: 0, behavior: "auto" })}
                className={commonClass}
                style={style}
              >
                {label}
              </a>
            );
          }

          const nextTab = key === "forecast" ? effectiveSavedForecastTab : key;

          return (
            <a
              key={key}
              ref={setRef}
              href={`/?tab=${nextTab}`}
              onClick={(event) => {
                window.scrollTo({ top: 0, behavior: "auto" });
                if (pathname !== "/") {
                  if (key === "forecast") {
                    event.preventDefault();
                    window.location.assign(`/?tab=${getSavedForecastTab() ?? savedForecastTab}`);
                  }
                  return;
                }
                event.preventDefault();
                window.history.pushState({}, "", `/?tab=${nextTab}`);
                setClientTab({ pathname, key });
                window.dispatchEvent(new CustomEvent("forecast-tab-change", { detail: nextTab }));
              }}
              className={commonClass}
              style={style}
            >
              {label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TABS: { key: string; label: string; href?: string }[] = [
  { key: "forecast",         label: "2026 Forecast" },
  { key: "states",           label: "States" },
  { key: "counties",         label: "Counties" },
  { key: "model",            label: "TPL" },
  { key: "analysis",         label: "Analysis",        href: "/analysis" },
  { key: "district-finder",  label: "District Finder" },
];

function getActiveTab(pathname: string, queryTab: string | null): string | null {
  const tplSubTabs = ["state", "district", "table", "districtTable"];
  if (pathname === "/") {
    if (tplSubTabs.includes(queryTab ?? "")) return "model";
    return TABS.some(({ key }) => key === queryTab) ? queryTab : "forecast";
  }
  if (pathname.startsWith("/house/")) return "forecast";
  if (pathname.startsWith("/senate/")) return "forecast";
  if (pathname.startsWith("/governor/")) return "forecast";
  if (pathname.startsWith("/states/")) return "states";
  if (pathname.startsWith("/analysis")) return "analysis";
  return null;
}

export default function SubNavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlActiveTab = getActiveTab(pathname, searchParams.get("tab"));
  const [clientTab, setClientTab] = useState<{ pathname: string; key: string } | null>(null);
  const activeTab = clientTab?.pathname === pathname ? clientTab.key : urlActiveTab;
  const activeTabRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!activeTab || !window.matchMedia("(max-width: 767px)").matches) return;
    activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeTab]);

  const tabStyle = (isActive: boolean) => ({
    color: isActive ? "var(--app-text-primary)" : "var(--app-text-muted)",
    background: isActive ? "var(--app-tab-bg)" : "transparent",
    boxShadow: isActive ? "inset 0 0 0 1px var(--app-border)" : "none",
    display: "inline-block" as const,
  });

  const commonClass = "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all";

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
      <nav className="scrollbar-none flex min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden">
        {TABS.map(({ key, label, href }) => {
          const isActive = activeTab === key;
          if (href) {
            return (
              <a
                key={key}
                ref={(el) => { if (isActive) activeTabRef.current = el; }}
                href={href}
                onClick={() => window.scrollTo({ top: 0, behavior: "auto" })}
                className={commonClass}
                style={tabStyle(isActive)}
              >
                {label}
              </a>
            );
          }

          return (
            <button
              key={key}
              ref={(el) => { if (isActive) activeTabRef.current = el; }}
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "auto" });
                if (pathname !== "/") {
                  window.location.assign(`/?tab=${key}`);
                  return;
                }
                window.history.pushState({}, "", `/?tab=${key}`);
                setClientTab({ pathname, key });
                window.dispatchEvent(new CustomEvent("forecast-tab-change", { detail: key }));
              }}
              className={commonClass}
              style={tabStyle(isActive)}
            >
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

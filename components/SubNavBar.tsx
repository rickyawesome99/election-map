"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS = [
  { key: "overview",  label: "Overview" },
  { key: "house",     label: "House" },
  { key: "senate",    label: "Senate" },
  { key: "governor",  label: "Governor" },
  { key: "states",    label: "States" },
  { key: "counties",  label: "Counties" },
];

function getActiveTab(pathname: string, queryTab: string | null): string | null {
  if (pathname === "/") {
    return TABS.some(({ key }) => key === queryTab) ? queryTab : "overview";
  }
  if (pathname.startsWith("/house/")) return "house";
  if (pathname.startsWith("/senate/")) return "senate";
  if (pathname.startsWith("/governor/")) return "governor";
  if (pathname.startsWith("/states/")) return "states";
  return null;
}

export default function SubNavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = getActiveTab(pathname, searchParams.get("tab"));
  const activeTabRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!activeTab || !window.matchMedia("(max-width: 767px)").matches) return;
    activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeTab]);

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
        {TABS.map(({ key, label }) => (
          <Link
            key={key}
            ref={activeTab === key ? activeTabRef : null}
            href={`/?tab=${key}`}
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "auto" });
              window.dispatchEvent(new CustomEvent("forecast-tab-change", { detail: key }));
            }}
            className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all"
            style={{
              color: activeTab === key ? "var(--app-text-primary)" : "var(--app-text-muted)",
              background: activeTab === key ? "var(--app-tab-bg)" : "transparent",
              boxShadow: activeTab === key ? "inset 0 0 0 1px var(--app-border)" : "none",
              display: "inline-block",
            }}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

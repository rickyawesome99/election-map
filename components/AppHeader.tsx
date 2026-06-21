"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import SearchBar from "@/components/SearchBar";

export default function AppHeader({
  analysisActive = false,
  back,
}: {
  analysisActive?: boolean;
  back?: React.ReactNode;
}) {
  return (
    <header
      className="flex h-14 flex-nowrap items-center gap-2 px-3 backdrop-blur-xl sm:px-6 md:gap-4"
      style={{
        borderBottom: "1px solid var(--app-border)",
        background: "color-mix(in srgb, var(--app-panel) 76%, transparent)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}
    >
      <div className="flex h-full shrink-0 flex-nowrap items-center gap-2.5 md:gap-4">
        <Link
          href="/?tab=overview"
          prefetch={false}
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "auto" });
            window.dispatchEvent(new CustomEvent("forecast-tab-change", { detail: "overview" }));
          }}
          onNavigate={(event) => {
            event.preventDefault();
            window.location.assign("/?tab=overview");
          }}
          className="shrink-0 text-lg font-bold leading-none tracking-tight sm:text-xl"
          style={{ color: "var(--app-text-primary)" }}
        >
          CT Strategies
        </Link>
        <div className="h-5 w-px shrink-0" style={{ background: "var(--app-border)" }} />
        <nav className="flex h-full items-center">
          <Link
            href="/analysis"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "auto" });
            }}
            className="rounded-md px-1 py-1 text-sm font-medium leading-none transition-colors md:px-3"
            style={
              analysisActive
                ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                : { color: "var(--app-text-muted)" }
            }
          >
            Analysis
          </Link>
        </nav>
      </div>
      <span className="hidden md:block text-xs" style={{ color: "var(--app-text-muted)" }}>Updated Jun 21, 2026</span>
      <div className="ml-auto flex h-full shrink-0 flex-nowrap items-center gap-2">
        {back}
        <SearchBar />
        <ThemeToggle />
      </div>
    </header>
  );
}

"use client";

import ThemeToggle from "@/components/ThemeToggle";
import SearchBar from "@/components/SearchBar";

export default function AppHeader({
  back,
}: {
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
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "auto" });
            window.location.assign("/?tab=overview");
          }}
          className="shrink-0 cursor-pointer text-left text-lg font-bold leading-none tracking-tight sm:text-xl"
          style={{ color: "var(--app-text-primary)" }}
        >
          CT Strategies
        </button>
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

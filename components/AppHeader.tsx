"use client";

import ThemeToggle from "@/components/ThemeToggle";
import SearchBar from "@/components/SearchBar";

export default function AppHeader({
  nav,
  darkMode,
}: {
  /** The section tabs, shown inline after the wordmark from lg up. */
  nav?: React.ReactNode;
  darkMode: boolean;
}) {
  return (
    <header
      data-app-header
      className="flex h-14 flex-nowrap items-center gap-2 px-3 backdrop-blur-xl sm:px-6 md:gap-4"
      style={{
        borderBottom: "1px solid var(--app-border)",
        backgroundColor: darkMode ? "#0d1117" : "#f9f8f5",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}
    >
      <div className="flex h-full shrink-0 flex-nowrap items-center gap-2.5 md:gap-4">
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "auto" });
            window.location.assign("/overview");
          }}
          className="shrink-0 cursor-pointer text-left text-lg font-bold leading-none tracking-tight sm:text-xl"
          style={{ color: "var(--app-text-primary)", fontFamily: "var(--font-serif)" }}
        >
          CT Strategies
        </button>
      </div>
      {nav && <div className="hidden h-full min-w-0 self-stretch lg:ml-1 lg:block xl:ml-4">{nav}</div>}
      <div className="ml-auto flex h-full shrink-0 flex-nowrap items-center gap-2">
        <SearchBar />
        <ThemeToggle />
      </div>
    </header>
  );
}

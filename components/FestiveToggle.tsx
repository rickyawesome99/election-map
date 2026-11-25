"use client";

import { setFestive, useFestive } from "@/lib/useDarkMode";

/** The tree button: turns the page forest green, and back to the reader's light or dark theme. */
export default function FestiveToggle() {
  const festive = useFestive();
  const label = festive ? "Switch off the festive theme" : "Switch to the festive theme";

  return (
    <button
      onClick={() => setFestive(!festive)}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
      style={{ background: "var(--app-tab-bg)", color: festive ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
      title={label}
      aria-label={label}
      aria-pressed={festive}
    >
      {/* Christmas tree outline: three tiers and a trunk */}
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M12 2.5 7.5 8.5H10L5.5 14H9l-4.5 5.5h15L15 14h3.5L14 8.5h2.5L12 2.5zM12 19.5V22"
        />
      </svg>
    </button>
  );
}

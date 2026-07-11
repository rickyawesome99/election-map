"use client";

import { useBackNavigation } from "@/lib/useBackNavigation";

export default function BackButton() {
  const goBack = useBackNavigation();

  return (
    <button
      onClick={goBack}
      className="flex shrink-0 items-center justify-center gap-2 py-2 px-2 -mx-2 text-sm transition-colors rounded-lg max-sm:px-0 max-sm:mx-0"
      style={{ color: "var(--app-text-muted)" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--app-tab-bg)"; e.currentTarget.style.color = "var(--app-text-primary)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "var(--app-text-muted)"; }}
      onMouseDown={e => { e.currentTarget.style.opacity = "0.7"; }}
      onMouseUp={e => { e.currentTarget.style.opacity = ""; }}
      aria-label="Back to Map"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span className="hidden sm:inline">Back to Map</span>
    </button>
  );
}

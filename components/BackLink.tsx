"use client";

import { useBackNavigation } from "@/lib/useBackNavigation";

export default function BackLink({ fallbackHref, label }: { fallbackHref: string; label: string }) {
  const goBack = useBackNavigation(fallbackHref);

  return (
    <a
      href={fallbackHref}
      onClick={(e) => { e.preventDefault(); goBack(); }}
      className="inline-flex items-center gap-1.5 text-sm hover:underline"
      style={{ color: "var(--app-text-muted)" }}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </a>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function getLabel(from: string | null): string {
  if (!from) return "Back";
  if (from === "/senate") return "Back to Senate";
  if (from === "/house") return "Back to House";
  if (from === "/governor") return "Back to Governor";
  if (from.startsWith("/states/")) {
    const slug = from.split("/")[2] ?? "";
    const abbr = slug.charAt(0).toUpperCase() + slug.slice(1);
    return `Back to ${abbr}`;
  }
  if (from === "/") return "Back to Map";
  return "Back";
}

function BackButtonInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const label = getLabel(from);

  return (
    <button
      onClick={() => from ? router.push(from) : router.back()}
      className="flex items-center gap-2 text-sm transition-colors shrink-0"
      style={{ color: "var(--app-text-muted)" }}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {label}
    </button>
  );
}

export default function BackButton() {
  return (
    <Suspense fallback={
      <span className="flex items-center gap-2 text-sm shrink-0" style={{ color: "var(--app-text-muted)" }}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back
      </span>
    }>
      <BackButtonInner />
    </Suspense>
  );
}

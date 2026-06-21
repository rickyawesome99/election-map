"use client";

import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

function getLabel(from: string | null): string {
  if (!from) return "Back";
  if (from === "/") return "Back to Map";
  return "Back to Map";
}

function resolveFrom(from: string | null, pathname: string): string {
  if (from === "/house") return "/?tab=house";
  if (from === "/senate") return "/?tab=senate";
  if (from === "/governor") return "/?tab=governor";
  if (from === "/states") return "/?tab=states";
  if (from) return from;

  if (pathname.startsWith("/house/")) return "/?tab=house";
  if (pathname.startsWith("/senate/")) return "/?tab=senate";
  if (pathname.startsWith("/governor/")) return "/?tab=governor";
  if (pathname.startsWith("/states/")) return "/?tab=states";
  if (pathname.startsWith("/analysis/")) return "/analysis";
  return from;
}

function BackButtonInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const label = getLabel(from);

  return (
    <button
      onClick={() => router.push(resolveFrom(from, pathname) ?? "/?tab=overview")}
      className="flex h-8 shrink-0 items-center justify-center gap-2 px-1 text-sm transition-colors max-sm:w-8 max-sm:px-0"
      style={{ color: "var(--app-text-muted)" }}
      aria-label={label}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function BackButton() {
  return (
    <Suspense fallback={
      <span
        className="flex h-8 shrink-0 items-center justify-center gap-2 px-1 text-sm max-sm:w-8 max-sm:px-0"
        style={{ color: "var(--app-text-muted)" }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span className="hidden sm:inline">Back</span>
      </span>
    }>
      <BackButtonInner />
    </Suspense>
  );
}

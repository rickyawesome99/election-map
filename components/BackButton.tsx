"use client";

import { useSearchParams } from "next/navigation";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

function getLabel(from: string | null): string {
  if (!from) return "Back";
  if (from.startsWith("/?tab=model") || from.startsWith("/?tab=state") || from.startsWith("/?tab=district") || from.startsWith("/?tab=table") || from.startsWith("/?tab=districtTable")) return "Back to TPL";
  if (from === "/") return "Back to Map";
  return "Back to Map";
}

function resolveFrom(from: string | null, pathname: string): string {
  if (from === "/house") return "/?tab=house";
  if (from === "/senate") return "/?tab=senate";
  if (from === "/governor") return "/?tab=governor";
  if (from === "/states") return "/?tab=states";
  if (from?.startsWith("/") && !from.startsWith("//")) return from;

  if (pathname.startsWith("/house/")) return "/?tab=house";
  if (pathname.startsWith("/senate/")) return "/?tab=senate";
  if (pathname.startsWith("/governor/")) return "/?tab=governor";
  if (pathname.startsWith("/states/")) return "/?tab=states";
  if (pathname.startsWith("/counties/")) return "/?tab=counties";
  if (pathname.startsWith("/analysis/")) return "/analysis";
  return "/";
}

function BackButtonInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const label = getLabel(from);

  function handleBack() {
    if (from) {
      window.location.assign(resolveFrom(from, pathname));
      return;
    }

    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer?.origin === window.location.origin) {
      window.location.assign(`${referrer.pathname}${referrer.search}${referrer.hash}`);
      return;
    }

    window.location.assign(resolveFrom(null, pathname));
  }

  return (
    <button
      onClick={handleBack}
      className="flex shrink-0 items-center justify-center gap-2 py-2 px-2 -mx-2 text-sm transition-colors rounded-lg max-sm:px-0 max-sm:mx-0"
      style={{ color: "var(--app-text-muted)" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--app-tab-bg)"; e.currentTarget.style.color = "var(--app-text-primary)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "var(--app-text-muted)"; }}
      onMouseDown={e => { e.currentTarget.style.opacity = "0.7"; }}
      onMouseUp={e => { e.currentTarget.style.opacity = ""; }}
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
        className="flex shrink-0 items-center justify-center gap-2 py-2 px-1 text-sm max-sm:px-0"
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

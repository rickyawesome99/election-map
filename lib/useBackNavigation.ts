"use client";

import { useRouter, usePathname } from "next/navigation";

// The sensible parent page for a detail route when there's no history to go back
// to (e.g. a direct link, a shared URL, or a link opened in a new tab).
export function resolveDefaultBackHref(pathname: string): string {
  if (pathname.startsWith("/house/")) return "/house";
  if (pathname.startsWith("/senate/")) return "/senate";
  if (pathname.startsWith("/governor/")) return "/governor";
  if (pathname.startsWith("/states/")) return "/states";
  if (pathname.startsWith("/counties/")) return "/counties";
  if (pathname.startsWith("/analysis/")) return "/analysis";
  if (pathname.startsWith("/model/")) return "/model";
  return "/overview";
}

// Prefers real browser-history back navigation (works correctly for any depth of
// in-app clicking, with no URL parameter needed, and correctly excludes tabs with
// no navigation history — e.g. a link opened in a new tab). Falls back to a fixed
// destination only when this page was reached without any prior navigation.
export function useBackNavigation(fallbackHref?: string) {
  const router = useRouter();
  const pathname = usePathname();

  return function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref ?? resolveDefaultBackHref(pathname));
  };
}

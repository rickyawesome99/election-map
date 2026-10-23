"use client";

import { useSyncExternalStore } from "react";

// The page a click is navigating to, set before the router fetches and renders it so the tab
// strip and the page area can switch at once. AppShell sets it from any in-site link click and
// clears it when the pathname changes. A client navigation that has not landed by
// HARD_NAV_AFTER_MS is finished as a full page load instead: on the deployed site iPhone Safari
// can leave a router navigation hanging under the placeholder until the reader refreshes.

/** Which placeholder layout (components/PendingPage) stands in for the page while it loads. */
export type PendingKind =
  | "overview" | "forecast" | "legislatures" | "historical" | "model" | "analysis" | "finder"
  | "race" | "past" | "chamber" | "state" | "candidate" | "county";
/** `href` is the full destination (query and hash included) for the full-load fallback. */
export type PendingNav = { kind: PendingKind; path: string; href?: string };

const HARD_NAV_AFTER_MS = 6000;

let pending: PendingNav | null = null;
let timeout: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function setPendingNav(nav: PendingNav | null) {
  if (pending?.path === nav?.path) return;
  pending = nav;
  clearTimeout(timeout);
  if (nav) timeout = setTimeout(() => hardNavigate(nav), HARD_NAV_AFTER_MS);
  listeners.forEach((l) => l());
}

function hardNavigate(nav: PendingNav) {
  if (pending !== nav) return;
  if (window.location.pathname === nav.path) { setPendingNav(null); return; }
  console.warn(`[nav] client navigation to ${nav.path} stalled for ${HARD_NAV_AFTER_MS} ms; loading it in full`);
  window.location.assign(nav.href ?? nav.path);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

export function usePendingNav(): PendingNav | null {
  return useSyncExternalStore(subscribe, () => pending, () => null);
}

const TAB_KINDS: Record<string, PendingKind> = {
  "/overview": "overview",
  "/house": "forecast",
  "/senate": "forecast",
  "/governor": "forecast",
  "/legislatures": "legislatures",
  "/historical": "historical",
  "/model": "model",
  "/analysis": "analysis",
  "/district-finder": "finder",
};

/** The placeholder for a destination page that gets one; null for pages that load without. */
export function pendingKindFor(pathname: string): PendingKind | null {
  if (TAB_KINDS[pathname]) return TAB_KINDS[pathname];
  if (/^\/(house|senate|governor|president)\/[^/]+\/\d{4}$/.test(pathname)) return "past";
  if (/^\/(house|senate|governor)\/[^/]+$/.test(pathname)) return "race";
  if (/^\/states\/[^/]+\/legislature\/[^/]+$/.test(pathname)) return "chamber";
  // The bare /legislature route forwards to the state page's legislature section.
  if (/^\/states\/[^/]+(\/legislature)?$/.test(pathname)) return "state";
  if (/^\/candidates\/[^/]+$/.test(pathname)) return "candidate";
  if (/^\/historical\/\d{5}$/.test(pathname)) return "county";
  return null;
}

/** Shows the placeholder for a navigation to `href`, if its page has one. */
export function startPendingNav(href: string) {
  const url = new URL(href, window.location.href);
  if (url.pathname === window.location.pathname) return;
  const kind = pendingKindFor(url.pathname);
  if (kind) setPendingNav({ kind, path: url.pathname, href: url.href });
}

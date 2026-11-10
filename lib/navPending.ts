"use client";

import { useSyncExternalStore } from "react";

// The page a click is navigating to, set before the router fetches and renders it so the tab
// strip and the page area can switch at once. AppShell sets it from any in-site link click and
// clears it when the pathname changes.
//
// Every in-site navigation is also watched, placeholder or not: one the router has not rendered
// by STALL_MS is finished as a full page load instead. On the deployed site a router navigation
// can hang (first seen on iPhone Safari), leaving the reader on the old page or under the
// placeholder until they refresh. "Rendered" means AppShell saw the pathname change; the address
// bar is no test, since it can already show the new URL while the screen has not moved.

/** Which placeholder layout (components/PendingPage) stands in for the page while it loads. */
export type PendingKind =
  | "overview" | "forecast" | "legislatures" | "historical" | "model" | "analysis" | "finder"
  | "race" | "past" | "chamber" | "state" | "candidate" | "county" | "results";
/** `href` is the full destination (query and hash included) for the full-load fallback. */
export type PendingNav = { kind: PendingKind; path: string; href?: string };

// A page compiles on first visit in development, which can take longer than a stall does.
const STALL_MS = process.env.NODE_ENV === "development" ? 15000 : 3000;
/** How long a full load gets before it is tried again (the page is still here, so it has not started). */
const RETRY_MS = 5000;
const MAX_FULL_LOADS = 3;
/** A navigation that rendered, but only after this long, is logged too. */
const SLOW_MS = 1500;
/** An uncaught error this soon after a navigation began is logged against it. */
const ERROR_WINDOW_MS = 10000;
/** Errors that leave a rendered page broken: its data was cut short in transit, or a script for it would not load. */
const BROKEN_RENDER = /Connection closed|ChunkLoadError|Loading (CSS )?chunk|dynamically imported module/i;
/** What this browser has seen go wrong with navigations, newest last, for /debug/nav. */
export const NAV_STALLS_KEY = "navStalls";
const RELOADED_KEY = "navReloaded";

let pending: PendingNav | null = null;
const listeners = new Set<() => void>();

type Watch = { href: string; from: string; at: number; perfAt: number; fullLoads: number; renderedAt: number | null };
/** The navigation in flight, and the most recent one (in flight or rendered) for errors that follow it. */
let watch: Watch | null = null;
let last: Watch | null = null;
let timeout: ReturnType<typeof setTimeout> | undefined;
let shownAt = 0;
let longestTask = 0;
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") shownAt = Date.now(); });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onError);
  // The longest stretch the page was too busy to respond during a navigation (Chromium only).
  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) longestTask = Math.max(longestTask, e.duration); }).observe({ type: "longtask" });
  }
}

/** Watches a navigation to `href`: if the router has not rendered it in time, it is loaded in full. */
export function watchNav(href: string) {
  const url = new URL(href, window.location.href);
  // Only pages: a file or an API link may download and leave the reader here, which is not a stall.
  if (url.origin !== window.location.origin || /^\/(api|_next)\//.test(url.pathname) || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return;
  if (watch?.href === url.href) return;
  clearTimeout(timeout);
  watch = last = { href: url.href, from: window.location.pathname, at: Date.now(), perfAt: performance.now(), fullLoads: 0, renderedAt: null };
  longestTask = 0;
  timeout = setTimeout(recover, STALL_MS);
}

/** Shows (or with null, drops) the placeholder. Null also means the navigation is over: rendered, or abandoned for another. */
export function setPendingNav(nav: PendingNav | null) {
  if (nav) watchNav(nav.href ?? nav.path);
  else { clearTimeout(timeout); watch = null; }
  if (pending?.path === nav?.path) return;
  pending = nav;
  listeners.forEach((l) => l());
}

/** AppShell saw the pathname change: the router rendered the navigation. */
export function navRendered() {
  const w = watch;
  if (w) {
    w.renderedAt = Date.now();
    if (w.renderedAt - w.at > SLOW_MS) record("slow", w, {});
  }
  setPendingNav(null);
}

/** Keeps what is known about a navigation that went wrong where a phone can show it (/debug/nav):
 *  whether the router's own requests for the page finished tells a hung request from a hung render. */
function record(what: "stall" | "slow" | "error", w: Watch, more: Record<string, unknown>) {
  try {
    const target = new URL(w.href);
    const requests = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((e) => e.startTime >= w.perfAt - 50 && e.name.includes("_rsc="))
      .map((e) => `${new URL(e.name).pathname} ${Math.round(e.duration)}ms ${e.responseStatus ?? ""} ${e.transferSize}B`);
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null;
    const entry = {
      what, at: new Date().toISOString(), from: w.from, to: target.pathname + target.search + target.hash, msSinceClick: Date.now() - w.at, ...more,
      urlAlreadyChanged: window.location.pathname === target.pathname, longestTaskMs: Math.round(longestTask), requestsFinished: requests,
      online: navigator.onLine, connection, pageOpenForMs: Math.round(performance.now()), backInViewForMs: shownAt ? Date.now() - shownAt : null, userAgent: navigator.userAgent,
    };
    const list = JSON.parse(window.localStorage.getItem(NAV_STALLS_KEY) ?? "[]") as unknown[];
    window.localStorage.setItem(NAV_STALLS_KEY, JSON.stringify([...list, entry].slice(-30)));
  } catch { /* storage blocked or full: the recovery still runs */ }
}

function recover() {
  const w = watch;
  if (!w) return;
  const target = new URL(w.href);
  // Out of tries: uncover the page so the reader is not left under the placeholder.
  const givenUp = w.fullLoads >= MAX_FULL_LOADS;
  if (!givenUp) w.fullLoads++;
  record("stall", w, { fullLoadTry: givenUp ? "gave up" : w.fullLoads });
  if (givenUp) { setPendingNav(null); return; }
  console.warn(`[nav] navigation to ${target.pathname} has not rendered after ${Date.now() - w.at} ms; loading it in full (try ${w.fullLoads})`);
  timeout = setTimeout(recover, RETRY_MS);
  const here = window.location;
  if (here.pathname === target.pathname && here.search === target.search) {
    // The address bar is already there, so assigning it would be a no-op or a jump to the hash.
    if (here.hash !== target.hash) here.replace(target.href);
    here.reload();
  } else if (w.fullLoads === 1) here.assign(target.href);
  else here.replace(target.href);
}

/** An uncaught error soon after a navigation: logged against it, and where it means the page the
 *  router rendered is broken, the page is reloaded (once a minute at most, so a page that keeps
 *  failing cannot loop). One still in flight goes straight to the full load. */
function onError(evt: ErrorEvent | PromiseRejectionEvent) {
  const w = last;
  if (!w || Date.now() - w.at > ERROR_WINDOW_MS) return;
  const err: unknown = "reason" in evt ? evt.reason : evt.error ?? evt.message;
  const message = String((err as { message?: unknown } | null)?.message ?? err).slice(0, 300);
  record("error", w, { message, rendered: w.renderedAt != null });
  if (!BROKEN_RENDER.test(message)) return;
  // Still in flight and its data is already lost: no point waiting out the stall timer.
  if (w === watch && w.fullLoads === 0) { clearTimeout(timeout); recover(); return; }
  if (w.renderedAt == null || window.location.pathname !== new URL(w.href).pathname) return;
  try {
    const before = JSON.parse(window.sessionStorage.getItem(RELOADED_KEY) ?? "null") as { href: string; at: number } | null;
    if (before && before.href === w.href && Date.now() - before.at < 60000) return;
    window.sessionStorage.setItem(RELOADED_KEY, JSON.stringify({ href: w.href, at: Date.now() }));
  } catch { return; } // no way to remember the reload, so no reload
  console.warn(`[nav] ${new URL(w.href).pathname} rendered with an error (${message}); reloading it`);
  window.location.reload();
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
  "/results": "results",
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

/** For a router.push to `href`: shows the placeholder if its page has one, and watches the navigation either way. */
export function startPendingNav(href: string) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
  const kind = pendingKindFor(url.pathname);
  if (kind) setPendingNav({ kind, path: url.pathname, href: url.href });
  else watchNav(url.href);
}

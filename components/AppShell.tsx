"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";
import SubNavBar, { NavTabs } from "./SubNavBar";
import PendingPage from "./PendingPage";
import { refreshSafariChrome, syncThemeColor, useDarkMode } from "@/lib/useDarkMode";
import { pendingKindFor, setPendingNav, usePendingNav } from "@/lib/navPending";

export default function AppShell() {
  const pathname = usePathname();
  const darkMode = useDarkMode();
  const pending = usePendingNav();

  // The new page has landed (or a back/forward moved elsewhere): drop the loading cover.
  useEffect(() => { setPendingNav(null); }, [pathname]);

  // Any in-site link to a page with a placeholder layout (the top tabs, race, past result,
  // chamber, state, candidate) puts that placeholder up on click, wherever the link sits.
  // Capture phase, so it runs before handlers that stop propagation.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      const kind = pendingKindFor(url.pathname);
      if (kind) setPendingNav({ kind, path: url.pathname });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The sticky header's height, so the loading placeholder starts where page content does.
  const chromeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const sync = () => document.documentElement.style.setProperty("--app-chrome-h", `${el.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    syncThemeColor(darkMode);
    refreshSafariChrome();
  }, [darkMode]);

  useEffect(() => {
    const refresh = () => {
      syncThemeColor(document.documentElement.classList.contains("dark"));
      refreshSafariChrome();
    };
    window.addEventListener("pageshow", refresh);
    window.addEventListener("orientationchange", refresh);
    return () => {
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("orientationchange", refresh);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/" && !pathname.startsWith("/analysis")) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [pathname]);

  return (
    <>
      <div aria-hidden="true" className="safari-top-tint" />
      {/* Safari samples the sticky element itself for the status-bar tint. */}
      <div
        ref={chromeRef}
        data-browser-chrome
        className="sticky top-0 z-50"
        style={{
          backgroundColor: "var(--app-bg)",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="relative z-10">
          <AppHeader
            darkMode={darkMode}
            nav={<Suspense fallback={null}><NavTabs variant="header" /></Suspense>}
          />
        </div>
        <Suspense fallback={null}>
          <SubNavBar />
        </Suspense>
      </div>
      {/* SubNavBar overlays this space so hiding it never shifts the page. From lg up the tabs
          sit in the header and the bar (and this space) is gone. */}
      <div aria-hidden="true" className="h-[45px] lg:hidden" />
      {/* While the next page loads, a greyed outline of it covers the old one so the switch
          reads as immediate. Sits under the sticky header (z-50), which stays live. */}
      {pending && <PendingPage nav={pending} />}
    </>
  );
}


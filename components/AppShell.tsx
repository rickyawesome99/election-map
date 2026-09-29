"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";
import SubNavBar from "./SubNavBar";
import BackButton from "./BackButton";
import { refreshSafariChrome, syncThemeColor, useDarkMode } from "@/lib/useDarkMode";

export default function AppShell() {
  const pathname = usePathname();
  const isForecastDetailPage = pathname.startsWith("/house/") || pathname.startsWith("/senate/") || pathname.startsWith("/governor/") || pathname.startsWith("/president/") || pathname.startsWith("/states/") || pathname.startsWith("/historical/");
  const showBack = !isForecastDetailPage && pathname.split("/").filter(Boolean).length > 1;
  const darkMode = useDarkMode();

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
            back={showBack ? <BackButton /> : undefined}
          />
        </div>
        <Suspense fallback={null}>
          <SubNavBar />
        </Suspense>
      </div>
      {/* SubNavBar overlays this space so hiding it never shifts the page. */}
      <div aria-hidden="true" className="h-[45px]" />
    </>
  );
}

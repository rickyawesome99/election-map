"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";
import SubNavBar from "./SubNavBar";
import BackButton from "./BackButton";
import { syncThemeColor, useDarkMode } from "@/lib/useDarkMode";

export default function AppShell({
  initialForecastTab = null,
}: {
  initialForecastTab?: "house" | "senate" | "governor" | null;
}) {
  const pathname = usePathname();
  const isForecastDetailPage = pathname.startsWith("/house/") || pathname.startsWith("/senate/") || pathname.startsWith("/governor/") || pathname.startsWith("/states/") || pathname.startsWith("/counties/");
  const showBack = !isForecastDetailPage && pathname.split("/").filter(Boolean).length > 1;
  const darkMode = useDarkMode();

  useEffect(() => {
    syncThemeColor(darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (pathname !== "/" && !pathname.startsWith("/analysis")) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [pathname]);

  return (
    <>
      <div
        aria-hidden="true"
        data-browser-chrome
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[env(safe-area-inset-top,0px)]"
        style={{ backgroundColor: darkMode ? "#000000" : "#ffffff" }}
      />
      <div className="sticky top-0 z-50">
        <AppHeader
          darkMode={darkMode}
          back={showBack ? <BackButton /> : undefined}
        />
      </div>
      <Suspense fallback={<div className="h-[45px]" style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }} />}>
        <SubNavBar initialForecastTab={initialForecastTab} />
      </Suspense>
    </>
  );
}

"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";
import SubNavBar from "./SubNavBar";
import BackButton from "./BackButton";

export default function AppShell() {
  const pathname = usePathname();
  const showBack = pathname.split("/").filter(Boolean).length > 1;
  const showSubNav = !pathname.startsWith("/analysis");

  useEffect(() => {
    if (pathname !== "/" && pathname !== "/analysis") return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [pathname]);

  return (
    <div className="sticky top-0 z-50">
      <AppHeader
        analysisActive={pathname.startsWith("/analysis")}
        back={showBack ? <BackButton /> : undefined}
      />
      {showSubNav && (
        <div className="px-2 pb-2 pt-2 sm:px-4 md:flex md:justify-center md:px-6">
          <Suspense fallback={<div className="h-[42px] rounded-xl border" style={{ background: "var(--app-panel)", borderColor: "var(--app-border)" }} />}>
            <SubNavBar />
          </Suspense>
        </div>
      )}
    </div>
  );
}

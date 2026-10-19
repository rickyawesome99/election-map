"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePendingNav } from "@/lib/navPending";

// prefetch: false on the heaviest pages (their RSC payloads are 100-250 KB each) so every page
// view does not download them for links the reader may never click; they prefetch on hover instead.
const TABS: { key: string; label: string; href?: string; prefetch?: false }[] = [
  { key: "overview",         label: "Overview" },
  { key: "forecast",         label: "Forecast" },
  { key: "legislatures",     label: "Legislatures", prefetch: false },
  { key: "historical",       label: "Historical" },
  { key: "model",            label: "TPL", prefetch: false },
  { key: "analysis",         label: "Analysis",        href: "/analysis" },
  { key: "district-finder",  label: "District Finder" },
];

function getActiveTab(pathname: string): string | null {
  if (pathname === "/house" || pathname === "/senate" || pathname === "/governor"
    || pathname.startsWith("/house/") || pathname.startsWith("/senate/") || pathname.startsWith("/governor/")) return "forecast";
  // The national board and every state's chamber pages (/states/ks/legislature/house).
  if (pathname === "/legislatures" || /^\/states\/[^/]+\/legislature(\/|$)/.test(pathname)) return "legislatures";
  if (pathname === "/historical" || pathname.startsWith("/historical/")) return "historical";
  if (pathname === "/model" || pathname.startsWith("/model/")) return "model";
  if (pathname === "/district-finder") return "district-finder";
  if (pathname.startsWith("/analysis")) return "analysis";
  if (pathname === "/overview" || pathname === "/") return "overview";
  return null;
}

const NAV_HEIGHT = 45; // px, including the bottom rule; AppShell reserves the same space in flow
const PIN_RELEASE_PX = 80;

type Chamber = "house" | "senate" | "governor";
const FORECAST_TAB_KEY = "raceType"; // written by ForecastMap's persistRaceType

function chamberOfPath(pathname: string): Chamber | null {
  const first = pathname.split("/")[1];
  return first === "house" || first === "senate" || first === "governor" ? first : null;
}

function readSavedChamber(): Chamber {
  try {
    const saved = window.localStorage.getItem(FORECAST_TAB_KEY);
    return saved === "house" || saved === "senate" || saved === "governor" ? saved : "senate";
  } catch {
    return "senate"; // storage unavailable (private mode)
  }
}

function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The tab strip: in the sub-bar under the header below xl, inline in the header from xl up. */
export function NavTabs({ variant }: { variant: "bar" | "header" }) {
  const pathname = usePathname();
  const router = useRouter();
  // The tab of a page being navigated to shows as active straight away, before it has loaded.
  const pending = usePendingNav();
  const activeTab = getActiveTab(pending?.path ?? pathname);
  // The Forecast tab returns to the chamber last viewed. The saved preference is re-read on
  // every render (the tabs live in the root layout and re-render on each navigation); the
  // server snapshot is "senate", so hydration agrees before the stored value takes over.
  const savedChamber = useSyncExternalStore(subscribeToStorage, readSavedChamber, () => "senate" as Chamber);
  const forecastChamber = chamberOfPath(pathname) ?? savedChamber;
  const activeTabRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map());
  const navRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const updateIndicator = useCallback(() => {
    const el = activeTab ? tabRefs.current.get(activeTab) : null;
    const nav = navRef.current;
    if (!el || !nav) { setIndicator(null); return; }
    const navRect = nav.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setIndicator({ left: elRect.left - navRect.left + nav.scrollLeft, width: elRect.width });
  }, [activeTab]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(updateIndicator);
    return () => window.cancelAnimationFrame(frame);
  }, [updateIndicator]);

  // resize also covers crossing the xl breakpoint, where the hidden copy measured zero.
  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  useEffect(() => {
    if (variant !== "bar" || !activeTab || !window.matchMedia("(max-width: 767px)").matches) return;
    activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeTab, variant]);

  const navClass = variant === "header"
    ? "relative hidden h-full min-w-0 items-stretch gap-0.5 xl:flex"
    : "scrollbar-none relative flex min-w-0 gap-1 overflow-x-auto overflow-y-hidden";
  const tabClass = variant === "header"
    ? "relative z-10 flex shrink-0 items-center whitespace-nowrap px-3 text-sm font-semibold transition-colors duration-150"
    : "relative z-10 shrink-0 px-3 py-3 text-sm font-semibold transition-colors duration-150 sm:px-3.5";

  return (
    <nav ref={navRef} className={navClass}>
      {indicator && (
        <div
          className="absolute bottom-0 h-[2px] rounded-full pointer-events-none"
          style={{
            left: indicator.left,
            width: indicator.width,
            background: "var(--app-text-primary)",
            transition: "left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}

      {TABS.map(({ key, label, href, prefetch }) => {
        const isActive = activeTab === key;

        const setRef = (el: HTMLElement | null) => {
          if (el) tabRefs.current.set(key, el);
          else tabRefs.current.delete(key);
          if (isActive) activeTabRef.current = el;
        };

        const targetHref = href ?? (key === "forecast" ? `/${forecastChamber}` : `/${key}`);

        return (
          <Link
            key={key}
            ref={setRef}
            href={targetHref}
            prefetch={prefetch}
            aria-current={isActive ? "page" : undefined}
            onMouseEnter={prefetch === false ? () => router.prefetch(targetHref) : undefined}
            onTouchStart={prefetch === false ? () => router.prefetch(targetHref) : undefined}
            onClick={() => window.scrollTo({ top: 0, behavior: "auto" })}
            className={tabClass}
            style={{ color: isActive ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Below xl: the tab bar under the sticky header. Hidden from xl up, where the header carries the tabs. */
export default function SubNavBar() {
  const pathname = usePathname();

  // A chamber reached through a race page (/governor/nv) counts as the last one viewed too.
  useEffect(() => {
    const here = chamberOfPath(pathname);
    if (!here) return;
    try { window.localStorage.setItem(FORECAST_TAB_KEY, here); } catch { /* storage unavailable */ }
  }, [pathname]);

  // The bar sits under the sticky header and slides up behind it once the page scrolls past it,
  // coming back at the top. The chevron tab reopens it mid-page; a pinned bar stays open until
  // the reader scrolls on down another PIN_RELEASE_PX.
  const [atTop, setAtTop] = useState(true);
  const [pinned, setPinned] = useState(false);
  const pinnedAt = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setAtTop(y < NAV_HEIGHT);
      if (y > pinnedAt.current + PIN_RELEASE_PX) setPinned(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setPinned(false); }, [pathname]);

  const open = atTop || pinned;
  const toggle = () => {
    pinnedAt.current = window.scrollY;
    setPinned(!open);
  };

  return (
    <div
      className="absolute inset-x-0 top-full z-0 xl:hidden"
      style={{
        transform: open ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
    <div
      inert={!open}
      className="px-3 sm:px-6"
      style={{ height: NAV_HEIGHT, borderBottom: "1px solid var(--app-border)", background: "var(--app-bg)" }}
    >
      <NavTabs variant="bar" />
    </div>
      {!atTop && (
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? "Hide navigation" : "Show navigation"}
          aria-expanded={open}
          className="absolute left-3 top-full flex h-4 w-7 cursor-pointer items-center justify-center rounded-b-md text-[var(--app-text-muted)] opacity-50 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 sm:left-6"
          style={{ background: "var(--app-bg)" }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 220ms" }}
          >
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </button>
      )}
    </div>
  );
}

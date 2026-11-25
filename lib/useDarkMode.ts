"use client";

import { useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "darkMode";
const LIGHT_APP_BG = "#f9f8f5";
const DARK_APP_BG = "#0d1117";
// The festive theme: dark mode's text and party colors on a forest-green page. It always rides on
// the `dark` class, so everything that asks "is it dark?" keeps answering yes.
const FESTIVE_STORAGE_KEY = "festive";
const FESTIVE_CLASS = "festive";
export const FESTIVE_APP_BG = "#0c2117";

// Sets every tag of this name and never removes one. React owns the tags the layout's viewport
// renders, and in dark mode there are two: the server's (which React won't adopt once its content
// reads dark) and the one React adds in its place. Removing React's made every later navigation
// throw as React tried to take it out again ("Cannot read properties of null (reading 'removeChild')").
function syncMeta(name: string, content: string, options: { removeMedia?: boolean } = {}): void {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`));
  if (!metas.length) {
    const meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
    metas.push(meta);
  }
  for (const meta of metas) {
    if (meta.content !== content) meta.content = content;
    if (options.removeMedia) meta.removeAttribute("media");
  }
}

export function syncThemeColor(darkMode: boolean): void {
  const festive = darkMode && document.documentElement.classList.contains(FESTIVE_CLASS);
  const appBg = festive ? FESTIVE_APP_BG : darkMode ? DARK_APP_BG : LIGHT_APP_BG;
  const color = appBg;
  const colorScheme = darkMode ? "dark" : "light";

  document.documentElement.dataset.theme = colorScheme;
  document.documentElement.style.setProperty("--browser-chrome-bg", color);
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = colorScheme;
  if (document.body) {
    document.body.dataset.theme = colorScheme;
    document.body.style.backgroundColor = color;
  }

  syncMeta("theme-color", color, { removeMedia: true });
  syncMeta("color-scheme", colorScheme);
  syncMeta("apple-mobile-web-app-status-bar-style", darkMode ? "black" : "default");

  document
    .querySelectorAll<HTMLElement>("[data-browser-chrome]")
    .forEach((element) => {
      element.style.backgroundColor = color;
    });
  document
    .querySelectorAll<HTMLElement>("[data-app-header]")
    .forEach((element) => {
      element.style.backgroundColor = appBg;
    });
}

let chromeSyncFrame: number | undefined;

export function refreshSafariChrome(): void {
  if (chromeSyncFrame !== undefined) window.cancelAnimationFrame(chromeSyncFrame);
  // Keep the geometry change for a painted frame so Safari invalidates its edge tint.
  // A same-frame layout flush does not reliably invalidate the browser UI.
  document.documentElement.setAttribute("data-chrome-refresh", "");
  chromeSyncFrame = window.requestAnimationFrame(() => {
    chromeSyncFrame = window.requestAnimationFrame(() => {
      document.documentElement.removeAttribute("data-chrome-refresh");
      chromeSyncFrame = undefined;
    });
  });
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(() => {
    syncThemeColor(getSnapshot());
    onStoreChange();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Another tab changed the theme: re-read both keys, since either one can move the page.
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== FESTIVE_STORAGE_KEY) return;
    const festive = localStorage.getItem(FESTIVE_STORAGE_KEY) === "true";
    const darkMode = festive || localStorage.getItem(THEME_STORAGE_KEY) === "true";
    document.documentElement.classList.toggle(FESTIVE_CLASS, festive);
    document.documentElement.classList.toggle("dark", darkMode);
    syncThemeColor(darkMode);
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    observer.disconnect();
    window.removeEventListener("storage", handleStorage);
  };
}

/** The light/dark button. Choosing either one leaves the festive theme. */
export function setDarkMode(darkMode: boolean): void {
  document.documentElement.classList.remove(FESTIVE_CLASS);
  localStorage.setItem(FESTIVE_STORAGE_KEY, "false");
  document.documentElement.classList.toggle("dark", darkMode);
  syncThemeColor(darkMode);
  refreshSafariChrome();
  localStorage.setItem(THEME_STORAGE_KEY, String(darkMode));
}

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The tree button. Turning it off goes back to whichever of light or dark was chosen before. */
export function setFestive(festive: boolean): void {
  const darkMode = festive || localStorage.getItem(THEME_STORAGE_KEY) === "true";
  document.documentElement.classList.toggle(FESTIVE_CLASS, festive);
  document.documentElement.classList.toggle("dark", darkMode);
  syncThemeColor(darkMode);
  refreshSafariChrome();
  localStorage.setItem(FESTIVE_STORAGE_KEY, String(festive));
}

function getFestiveSnapshot(): boolean {
  return document.documentElement.classList.contains(FESTIVE_CLASS);
}

export function useFestive(): boolean {
  return useSyncExternalStore(subscribe, getFestiveSnapshot, getServerSnapshot);
}

/** The page background as a hex color, for map strokes and canvases that can't read a CSS variable. */
export function usePageBg(): string {
  const darkMode = useDarkMode();
  const festive = useFestive();
  return festive ? FESTIVE_APP_BG : darkMode ? DARK_APP_BG : LIGHT_APP_BG;
}

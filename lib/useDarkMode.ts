"use client";

import { useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "darkMode";
const LIGHT_APP_BG = "#f6f8fa";
const DARK_APP_BG = "#0d1117";

function syncMeta(name: string, content: string, options: { removeMedia?: boolean } = {}): void {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`));
  const [primary, ...duplicates] = metas;
  const meta = primary ?? document.createElement("meta");

  meta.name = name;
  meta.content = content;
  if (options.removeMedia) meta.removeAttribute("media");
  if (!primary) document.head.appendChild(meta);

  duplicates.forEach((duplicate) => duplicate.remove());
}

export function syncThemeColor(darkMode: boolean): void {
  const appBg = darkMode ? DARK_APP_BG : LIGHT_APP_BG;
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

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const darkMode = event.newValue === "true";
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

export function setDarkMode(darkMode: boolean): void {
  document.documentElement.classList.toggle("dark", darkMode);
  syncThemeColor(darkMode);
  refreshSafariChrome();
  localStorage.setItem(THEME_STORAGE_KEY, String(darkMode));
}

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

"use client";

import { useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "darkMode";
const LIGHT_THEME_COLOR = "#f6f8fa";
const DARK_THEME_COLOR = "#0d1117";

function syncThemeColor(darkMode: boolean): void {
  const color = darkMode ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
  let metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
    metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  }
  metas.forEach((meta) => {
    meta.removeAttribute("media");
    meta.content = color;
  });
}

function ensureAppleStatusBarMeta(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "apple-mobile-web-app-status-bar-style";
    document.head.appendChild(meta);
  }
  meta.content = "black-translucent";
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
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
  ensureAppleStatusBarMeta();
  localStorage.setItem(THEME_STORAGE_KEY, String(darkMode));
}

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

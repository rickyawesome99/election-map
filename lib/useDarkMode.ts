"use client";

import { useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "darkMode";
const LIGHT_THEME_COLOR = "#f6f8fa";
const DARK_THEME_COLOR = "#0d1117";

function syncThemeColor(darkMode: boolean): void {
  const color = darkMode ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
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
  localStorage.setItem(THEME_STORAGE_KEY, String(darkMode));
}

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

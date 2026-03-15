"use client";

import { useState, useEffect } from "react";

function readDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("darkMode") === "true";
}

export default function ThemeToggle() {
  // Lazy initializer: on client-side navigation this reads the correct value
  // immediately (no flash). On hard load, falls back to false and the body
  // script handles the html.dark class before React hydrates.
  const [darkMode, setDarkMode] = useState<boolean>(readDarkMode);

  // Sync html.dark class whenever darkMode changes (including on first mount)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  function toggle() {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("darkMode", String(next));
  }

  return (
    <button
      onClick={toggle}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
      title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {darkMode ? (
        /* Sun icon */
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        /* Moon icon */
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}

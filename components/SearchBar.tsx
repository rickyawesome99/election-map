"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { queryIndex, type SearchEntry } from "@/lib/searchIndex";

export default function SearchBar({ inputStyle }: { inputStyle?: React.CSSProperties }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateDropdownRect = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setDropdownRect({
      left: rect.left,
      top: rect.bottom + 4,
      width: rect.width,
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    const hits = queryIndex(val);
    setResults(hits);
    setActiveIndex(-1);
    setOpen(hits.length > 0);
    if (hits.length > 0) updateDropdownRect();
  };

  const navigate = useCallback((entry: SearchEntry) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    window.location.assign(entry.href);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      navigate(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;

    updateDropdownRect();
    window.addEventListener("resize", updateDropdownRect);
    window.addEventListener("scroll", updateDropdownRect, true);

    return () => {
      window.removeEventListener("resize", updateDropdownRect);
      window.removeEventListener("scroll", updateDropdownRect, true);
    };
  }, [open, updateDropdownRect]);

  return (
    <div ref={containerRef} className="relative flex h-8 items-center">
      {/* Search icon */}
      <svg
        className="absolute left-2.5 w-3.5 h-3.5 pointer-events-none z-10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--app-text-very-muted)" }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length === 0) return;
          updateDropdownRect();
          setOpen(true);
        }}
        placeholder="Search races..."
        className="h-8 w-[5.5rem] rounded-lg pl-8 pr-2 outline-none max-sm:placeholder:text-transparent min-[420px]:w-24 sm:w-44 sm:pr-3"
        style={{
          fontSize: 16,
          background: "var(--app-bg)",
          border: "1px solid var(--app-border)",
          color: "var(--app-text-primary)",
          ...inputStyle,
        }}
        autoComplete="off"
      />
      {!query && (
        <span
          className="pointer-events-none absolute left-8 right-1 truncate whitespace-nowrap text-sm sm:hidden"
          style={{ color: "var(--app-text-muted)" }}
        >
          Search
        </span>
      )}

      {open && results.length > 0 && dropdownRect && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="fixed rounded-xl overflow-hidden shadow-2xl"
          style={{
            left: dropdownRect.left,
            top: dropdownRect.top,
            width: dropdownRect.width,
            zIndex: 1000,
            background: "var(--app-panel)",
            border: "1px solid var(--app-border)",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {results.map((entry, i) => (
            <button
              key={entry.href}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(entry);
              }}
              className="w-full text-left px-3 py-1.5 flex flex-col transition-colors"
              style={{
                background: i === activeIndex ? "var(--app-tab-bg)" : "transparent",
                borderBottom: i < results.length - 1 ? "1px solid var(--app-border)" : "none",
              }}
            >
              <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                {entry.label}
              </span>
              <span className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                {entry.sublabel}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

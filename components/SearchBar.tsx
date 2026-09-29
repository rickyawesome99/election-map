"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { queryIndex, type SearchEntry } from "@/lib/searchQuery";
import { loadStaticJson } from "@/lib/useStaticJson";

// The index is built at build time (app/api/search-index) and fetched once, on first focus, so
// the forecast dataset it is derived from never enters the page bundle.
const SEARCH_INDEX_URL = "/api/search-index";

export default function SearchBar({ inputStyle }: { inputStyle?: React.CSSProperties }) {
  const listId = useId();
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const entriesRef = useRef<SearchEntry[] | null>(null);
  const pendingQueryRef = useRef("");

  const ensureIndex = useCallback(() => {
    if (entriesRef.current) return;
    setLoadError(false);
    loadStaticJson<SearchEntry[]>(SEARCH_INDEX_URL).then((loaded) => {
      entriesRef.current = loaded;
      setEntries(loaded);
    }, () => { setLoadError(true); });
  }, []);

  const updateDropdownRect = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setDropdownRect({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(420, window.innerWidth - 16) - 8)),
      top: rect.bottom + 4,
      width: Math.min(420, window.innerWidth - 16),
    });
  }, []);

  const showHits = useCallback((val: string) => {
    const hits = entriesRef.current ? queryIndex(entriesRef.current, val) : [];
    setResults(hits);
    setActiveIndex(-1);
    setOpen(val.trim().length > 0);
    updateDropdownRect();
  }, [updateDropdownRect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    pendingQueryRef.current = val;
    ensureIndex();
    showHits(val);
  };

  // A query typed before the index arrived is answered as soon as it does.
  useEffect(() => {
    if (entries && pendingQueryRef.current && document.activeElement === inputRef.current) showHits(pendingQueryRef.current);
  }, [entries, showHits]);

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
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      navigate(results[Math.max(0, activeIndex)]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

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
          ensureIndex();
          if (!query.trim()) return;
          updateDropdownRect();
          setOpen(true);
        }}
        placeholder="Search"
        aria-label="Search states, seats, races, and candidates"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        className="h-8 w-28 rounded-lg pl-8 pr-2 outline-none max-sm:placeholder:text-transparent min-[420px]:w-28 sm:w-56 sm:pr-3"
        style={{
          fontSize: 16,
          fontFamily: "var(--font-serif)",
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
          style={{ color: "var(--app-text-muted)", fontFamily: "var(--font-serif)" }}
        >
          Search
        </span>
      )}

      {open && dropdownRect && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="fixed rounded-xl overflow-hidden shadow-2xl"
          style={{
            left: dropdownRect.left,
            top: dropdownRect.top,
            width: dropdownRect.width,
            zIndex: 1000,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
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
          {results.length === 0 && <div role="status" className="px-3 py-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
            {loadError ? "Search could not load. Type again to retry." : !entries ? "Loading search…" : "No matches. Try a state, district, candidate, or election year."}
          </div>}
          {results.map((entry, i) => (
            <a
              key={entry.href}
              href={entry.href}
              role="option"
              aria-selected={i === activeIndex}
              id={`${listId}-${i}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
            </a>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

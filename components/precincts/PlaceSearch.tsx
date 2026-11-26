"use client";

// Address / place search for /precincts: finds a place and hands back its state and point, so the
// explorer can open that state and fly the map there. It does not look up the precinct; the reader
// sees the place on the map, with roads and towns drawn at that zoom. Suggestions come from Photon as
// the reader types (lib/geocode); a typed search goes to Nominatim, then the Census address geocoder.

import { useEffect, useRef, useState } from "react";
import { fetchSuggestions, nominatimSearch, type Suggestion } from "@/lib/geocode";
import type { DistrictsResponse } from "@/app/api/districts/route";
import type { StateShell } from "./types";

export type PlaceHit = { abbr: string; lat: number; lng: number; zoom: number };

// How close to fly in, by what was found: a house or street to street level, a town to the town.
const ZOOM_BY_KIND: Record<string, number> = { house: 15, street: 14.5, locality: 13, district: 13, city: 12, county: 9.5 };

/** The Census geocoder (behind /api/districts): street addresses only. */
async function censusSearch(address: string): Promise<{ lat: number; lng: number; fips: string } | null> {
  try {
    const res = await fetch(`/api/districts?${new URLSearchParams({ address })}`);
    if (!res.ok) return null;
    const data = (await res.json()) as DistrictsResponse;
    const fips = data.result?.geographies?.["States"]?.[0]?.STATE;
    return data.match && fips ? { lat: data.match.lat, lng: data.match.lng, fips } : null;
  } catch {
    return null;
  }
}

export default function PlaceSearch({ states, onFound }: { states: StateShell[]; onFound: (hit: PlaceHit) => void }) {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLFormElement>(null);
  const skipNext = useRef(false); // the text was set by picking a suggestion: don't suggest for it again

  const byName = (name: string | null) => states.find((s) => s.name.toLowerCase() === name?.toLowerCase());
  const byAbbr = (abbr: string | null) => states.find((s) => s.abbr === abbr);
  const byFips = (fips: string) => states.find((s) => s.fips === fips);

  useEffect(() => {
    const text = q.trim();
    if (skipNext.current) { skipNext.current = false; return; }
    if (text.length < 3) { setSuggestions([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetchSuggestions(text, ctl.signal).then((s) => {
        if (ctl.signal.aborted) return;
        setSuggestions(s.filter((x) => Number.isFinite(x.lat) && byName(x.state)));
        setActive(-1);
      }).catch(() => {});
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
    // byName reads `states`, which is fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pick(s: Suggestion) {
    const st = byName(s.state);
    if (!st) return;
    skipNext.current = true;
    setQ(s.shortName);
    setOpen(false);
    setSuggestions([]);
    setError(null);
    // A whole state as the answer: open it at its full extent.
    if (s.kind === "state") onFound({ abbr: st.abbr, lat: s.lat, lng: s.lng, zoom: 0 });
    else onFound({ abbr: st.abbr, lat: s.lat, lng: s.lng, zoom: ZOOM_BY_KIND[s.kind ?? ""] ?? 13 });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    if (open && active >= 0 && suggestions[active]) return pick(suggestions[active]);
    setOpen(false);
    setBusy(true);
    setError(null);
    const street = /^\d/.test(text);
    // A street address goes to the Census first (the authority on US addresses), anything else to Nominatim.
    const viaCensus = async () => { const c = await censusSearch(text); const st = c && byFips(c.fips); return st ? { abbr: st.abbr, lat: c.lat, lng: c.lng, zoom: 15 } : null; };
    const viaOsm = async () => { const n = await nominatimSearch(text); const st = n && byAbbr(n.state); return st ? { abbr: st.abbr, lat: n.lat, lng: n.lng, zoom: street ? 15 : 12 } : null; };
    const hit = street ? ((await viaCensus()) ?? (await viaOsm())) : ((await viaOsm()) ?? (await viaCensus()));
    setBusy(false);
    if (hit) onFound(hit);
    else setError("Not found. Try adding the city and state.");
  }

  const showList = open && suggestions.length > 0;
  return (
    <form ref={wrap} onSubmit={submit} className="relative" role="search">
      <input
        id="precinct-search"
        type="search"
        value={q}
        placeholder={busy ? "Searching…" : "Search an address"}
        autoComplete="off"
        aria-label="Search an address or place"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setError(null); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, suggestions.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="w-44 px-2 py-1 text-sm"
        style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
      />
      {showList && (
        <ul className="absolute left-0 right-0 top-full z-30 text-sm" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", borderTop: "none", boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)" }}>
          {suggestions.map((s, n) => (
            <li key={s.shortName}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setActive(n)}
                className="block w-full truncate px-2 py-1.5 text-left"
                style={{ background: n === active ? "var(--app-tab-bg)" : undefined, color: "var(--app-text-primary)" }}
              >
                {s.shortName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="absolute left-0 top-full z-30 mt-1 whitespace-nowrap text-[11px]" style={{ color: "var(--app-text-muted)" }}>{error}</div>}
    </form>
  );
}

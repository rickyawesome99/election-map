"use client";

import { useEffect, useState } from "react";

// Each topology is fetched and parsed once per page load and handed to <Geographies> as an
// object, so toggling a map's geography or navigating between tabs never re-downloads or
// re-parses it. The cache is module-level, so it survives client-side route changes.
const topoCache = new Map<string, Promise<object | null>>();

export function loadTopo(url: string): Promise<object | null> {
  let p = topoCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    topoCache.set(url, p);
  }
  return p;
}

export function useTopo(url: string): object | null {
  const [topo, setTopo] = useState<object | null>(null);
  useEffect(() => {
    let live = true;
    loadTopo(url).then((t) => { if (live) setTopo(t); });
    return () => { live = false; };
  }, [url]);
  return topo;
}

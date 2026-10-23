"use client";

import { useEffect, useState } from "react";

// Recharts is the site's largest client library (~110 KB compressed) and draws nothing on the
// server: every chart measures its box after mount before plotting. So the charts load it here,
// after the page has hydrated, instead of making every page that carries a chart download and
// run it before becoming interactive. A chart renders its box at full size while this returns
// null, so nothing shifts when the lines arrive.

export type RechartsParts = typeof import("./rechartsParts");

let loaded: RechartsParts | null = null;
let loading: Promise<RechartsParts> | null = null;

/** The Recharts components, or null until they have loaded (always null on the server and at hydration). */
export function useRecharts(): RechartsParts | null {
  // Starts null even when already loaded, so the first client render matches the server's.
  const [parts, setParts] = useState<RechartsParts | null>(null);
  useEffect(() => {
    if (loaded) { setParts(loaded); return; }
    let live = true;
    (loading ??= import("./rechartsParts")).then((m) => { loaded = m; if (live) setParts(m); });
    return () => { live = false; };
  }, []);
  return parts;
}

/** Stand-in for destructuring before the parts arrive; nothing reads it while charts are gated on the hook. */
export const NO_RECHARTS = {} as RechartsParts;

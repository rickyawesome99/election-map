"use client";

import { useSyncExternalStore } from "react";
import { NAV_STALLS_KEY } from "@/lib/navPending";

const CHANGED = "nav-stalls-changed";
const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
};
const read = () => {
  try { return window.localStorage.getItem(NAV_STALLS_KEY) ?? "[]"; } catch { return "[]"; }
};

/** /debug/nav: the stalled navigations this browser has recorded, newest first, as copyable text. */
export default function NavStallLog() {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  if (stored == null) return null;
  let list: unknown[] = [];
  try { list = JSON.parse(stored) as unknown[]; } catch { /* not ours */ }
  const clear = () => {
    try { window.localStorage.removeItem(NAV_STALLS_KEY); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(CHANGED));
  };
  return (
    <div className="mt-3 space-y-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
      <p>{list.length ? "Page switches that stalled (and were finished as a full page load), were slow, or hit an error, newest first." : "No stalled, slow or failed page switches recorded in this browser."}</p>
      {list.length > 0 && (
        <>
          <button type="button" onClick={clear} className="rounded px-3 py-1 text-xs font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>Clear</button>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed" style={{ color: "var(--app-text-primary)" }}>{JSON.stringify([...list].reverse(), null, 2)}</pre>
        </>
      )}
    </div>
  );
}

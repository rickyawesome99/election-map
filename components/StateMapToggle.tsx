"use client";

import { useState } from "react";

type MapView = "county" | "districts";

export default function StateMapToggle({
  abbr,
  stateName,
}: {
  abbr: string;
  stateName: string;
}) {
  const [view, setView] = useState<MapView>("county");

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      {/* Toggle header */}
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--app-text-muted)" }}
        >
          Map
        </span>
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--app-border)" }}
        >
          {(["county", "districts"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1 text-xs font-medium transition-colors"
              style={
                view === v
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                  : { background: "transparent", color: "var(--app-text-muted)" }
              }
            >
              {v === "county" ? "County" : "Congressional Districts"}
            </button>
          ))}
        </div>
      </div>

      {/* Map placeholder */}
      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ height: 280, background: "var(--app-bg)" }}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-10 h-10"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          style={{ color: "var(--app-border)" }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
        <p className="text-sm font-medium" style={{ color: "var(--app-text-very-muted)" }}>
          {stateName} &middot; {view === "county" ? "County" : "Congressional District"} Map
        </p>
        <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          Coming soon
        </p>
      </div>
    </section>
  );
}

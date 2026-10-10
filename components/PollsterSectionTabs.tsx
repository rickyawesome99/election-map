"use client";

import { useEffect, useState, type ReactNode } from "react";

// The first section of /analysis/pollsters: a section head whose label is a tab switch
// (Ratings | Polls). Panels are rendered on the server and only shown or hidden here; the
// open tab is mirrored in the URL hash (#ratings / #polls) so it can be linked to.

export type SectionTab = { key: string; label: string; meta: ReactNode; content: ReactNode };

export default function PollsterSectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const [active, setActive] = useState(tabs[0].key);
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (tabs.some((t) => t.key === h)) setActive(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);
  const pick = (key: string) => {
    setActive(key);
    window.history.replaceState(null, "", `#${key}`);
  };
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <div role="tablist" aria-label="Pollster ratings or recent polls" className="flex items-baseline gap-4">
          {tabs.map((t) => {
            const on = t.key === current.key;
            return (
              <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={on} aria-controls={`panel-${t.key}`} onClick={() => pick(t.key)}
                className="text-[11px] font-bold uppercase tracking-wider underline-offset-[6px] hover:underline"
                style={{ color: on ? "var(--app-text-primary)" : "var(--app-text-very-muted)", textDecorationLine: on ? "underline" : undefined, textDecorationThickness: 2 }}>
                {t.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{current.meta}</span>
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={t.key !== current.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}

"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

type VoteHistoryTab = {
  key: string;
  label: string;
  content: ReactNode;
};

export default function VoteHistoryTabbedSection({
  tabs,
  className = "",
  defaultTabKey,
  height,
  maxHeight,
  variant = "panel",
}: {
  tabs: VoteHistoryTab[];
  className?: string;
  defaultTabKey?: string;
  height?: string;
  maxHeight?: string;
  variant?: "panel" | "plain";
}) {
  const availableTabs = tabs.filter((tab) => tab.content != null);
  const [activeKey, setActiveKey] = useState(() => {
    const defaultTab = availableTabs.find((tab) => tab.key === defaultTabKey);
    return defaultTab?.key ?? availableTabs[0]?.key ?? "";
  });
  const activeTab = availableTabs.find((tab) => tab.key === activeKey) ?? availableTabs[0];
  const sectionRef = useRef<HTMLElement | null>(null);
  const tabRowRef = useRef<HTMLDivElement | null>(null);
  // The underline under the active tab, measured so it can slide between tabs. Until it is
  // measured (and on the server) the active tab draws its own border instead.
  const [line, setLine] = useState<{ left: number; width: number } | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const row = tabRowRef.current;
    if (!row) return;
    const measure = () => {
      const btn = row.querySelector<HTMLButtonElement>('button[aria-selected="true"]');
      if (btn) setLine({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [activeTab?.key]);

  // Rows hold their entrance (data-vh="wait") until the section is on screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!activeTab) return null;

  if (variant === "plain") {
    return (
      <section
        ref={sectionRef}
        data-vh={inView ? "go" : "wait"}
        className={`flex min-w-0 min-h-0 flex-col ${className}`}
        style={{ ...(height ? { height } : {}), ...(maxHeight ? { maxHeight } : {}) }}
      >
        <div className="mb-3 flex shrink-0 flex-col items-start gap-3">
          <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
            Vote History
          </h2>
          {availableTabs.length > 1 && (
            <div ref={tabRowRef} role="tablist" className="relative flex items-end gap-4 w-full" style={{ borderBottom: "1px solid var(--app-border)" }}>
              {availableTabs.map((tab) => {
                const active = tab.key === activeTab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveKey(tab.key)}
                    className="ix-press whitespace-nowrap pb-2 text-xs font-semibold hover:text-[var(--app-text-primary)]"
                    style={{
                      color: active ? "var(--app-text-primary)" : "var(--app-text-muted)",
                      borderBottom: `2px solid ${active && !line ? "var(--app-text-primary)" : "transparent"}`,
                      marginBottom: "-1px",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
              {line && (
                <span
                  aria-hidden
                  className="vh-tab-line pointer-events-none absolute left-0 h-[2px] rounded-full"
                  style={{ bottom: "-1px", width: line.width, transform: `translateX(${line.left}px)`, background: "var(--app-text-primary)" }}
                />
              )}
            </div>
          )}
        </div>
        {/* Scrolls only inside a fixed height; without one (Senate, Governor) the list runs its full length. */}
        <div className={`min-h-0 min-w-0 flex-1 ${height || maxHeight ? "overflow-x-hidden overflow-y-auto pr-1" : ""}`}>
          <div key={activeTab.key} className="vh-tab-in h-full">
            {activeTab.content}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      data-vh={inView ? "go" : "wait"}
      className={`rounded-xl p-3 mb-0 flex min-h-0 flex-col ${className}`}
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", ...(height ? { height } : {}), ...(maxHeight ? { maxHeight } : {}) }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
          Vote History
        </h2>
        {availableTabs.length > 1 && (
          <div className="flex rounded-md p-0.5" style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}>
            {availableTabs.map((tab) => {
              const active = tab.key === activeTab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveKey(tab.key)}
                  className="ix-press rounded px-2.5 py-1 text-[10px] font-semibold"
                  style={
                    active
                      ? { background: "var(--app-panel)", color: "var(--app-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.12)" }
                      : { background: "transparent", color: "var(--app-text-muted)" }
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
        <div key={activeTab.key} className="vh-tab-in h-full">
          {activeTab.content}
        </div>
      </div>
    </section>
  );
}

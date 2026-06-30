"use client";

import { ReactNode, useState } from "react";

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
}: {
  tabs: VoteHistoryTab[];
  className?: string;
  defaultTabKey?: string;
  height?: string;
  maxHeight?: string;
}) {
  const availableTabs = tabs.filter((tab) => tab.content != null);
  const [activeKey, setActiveKey] = useState(() => {
    const defaultTab = availableTabs.find((tab) => tab.key === defaultTabKey);
    return defaultTab?.key ?? availableTabs[0]?.key ?? "";
  });
  const activeTab = availableTabs.find((tab) => tab.key === activeKey) ?? availableTabs[0];

  if (!activeTab) return null;

  return (
    <section
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
                  className="rounded px-2.5 py-1 text-[10px] font-semibold transition-colors"
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
        {activeTab.content}
      </div>
    </section>
  );
}

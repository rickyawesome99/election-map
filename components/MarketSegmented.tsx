"use client";

/** The pill-row filter the /analysis/markets table and charts share. */
export default function MarketSegmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap rounded-md p-0.5" style={{ background: "var(--app-tab-bg)" }} role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={String(key)} type="button" onClick={() => onChange(key)} aria-pressed={value === key} className="rounded px-2.5 py-1 text-xs font-semibold"
          style={{ background: value === key ? "var(--app-panel)" : "transparent", color: value === key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
          {text}
        </button>
      ))}
    </div>
  );
}

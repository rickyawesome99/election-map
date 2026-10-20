"use client";

/** The pill-row filter the /analysis/markets table and charts share. `scroll` keeps a long row on one line, scrolling sideways on narrow screens instead of wrapping. */
export default function MarketSegmented<T extends string | number>({ label, value, options, onChange, scroll = false }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; scroll?: boolean }) {
  const pills = (
    <div className={`${scroll ? "flex w-max flex-nowrap" : "flex flex-wrap"} rounded-md p-0.5`} style={{ background: "var(--app-tab-bg)" }} role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={String(key)} type="button" onClick={() => onChange(key)} aria-pressed={value === key} className="whitespace-nowrap rounded px-2.5 py-1 text-xs font-semibold"
          style={{ background: value === key ? "var(--app-panel)" : "transparent", color: value === key ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
          {text}
        </button>
      ))}
    </div>
  );
  return scroll ? <div className="max-w-full overflow-x-auto [scrollbar-width:none]">{pills}</div> : pills;
}

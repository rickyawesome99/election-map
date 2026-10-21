"use client";

/** A labelled select for a map or table control row, styled like the state picker on /analysis/polling-misses. */
export default function Dropdown({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="rounded px-1.5 py-1 text-xs font-semibold"
        style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

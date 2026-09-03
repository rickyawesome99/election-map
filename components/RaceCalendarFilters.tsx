"use client";

import { useRouter } from "next/navigation";
import { ALL, CALENDAR_PATH, RACE_KINDS, RACE_KIND_LABEL, RACE_TABLE_ID, filterHref, type RaceCalendarFilter } from "@/lib/raceCalendarQuery";

type Option = { value: string; label: string };

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg px-2.5 py-1.5 text-sm font-semibold"
        style={{
          background: "var(--app-tab-bg)",
          color: "var(--app-text-primary)",
          border: "1px solid var(--app-border)",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function RaceCalendarFilters({
  filter,
  states,
  years,
}: {
  filter: RaceCalendarFilter;
  states: { abbr: string; name: string }[];
  years: number[];
}) {
  const router = useRouter();
  const go = (changes: Partial<RaceCalendarFilter>) => router.push(filterHref(filter, changes), { scroll: false });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select
        label="State"
        value={filter.state}
        onChange={(state) => go({ state })}
        options={[{ value: ALL, label: "All states" }, ...states.map((s) => ({ value: s.abbr, label: s.name }))]}
      />
      <Select
        label="Office"
        value={filter.kind}
        onChange={(kind) => go({ kind })}
        options={[{ value: ALL, label: "All offices" }, ...RACE_KINDS.map((k) => ({ value: k, label: `${k} — ${RACE_KIND_LABEL[k]}` }))]}
      />
      <Select
        label="Year"
        value={filter.year}
        onChange={(year) => go({ year })}
        options={[{ value: ALL, label: "All years" }, ...[...years].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }))]}
      />
      <Select
        label="Type"
        value={filter.cls}
        onChange={(cls) => go({ cls })}
        options={[
          { value: ALL, label: "All types" },
          { value: "Regular", label: "Regular" },
          { value: "Special", label: "Special" },
          { value: "Runoff", label: "Runoff" },
        ]}
      />
      <a
        href={`${CALENDAR_PATH}#${RACE_TABLE_ID}`}
        onClick={(e) => { e.preventDefault(); router.push(`${CALENDAR_PATH}#${RACE_TABLE_ID}`, { scroll: false }); }}
        className="rounded-lg px-2.5 py-1.5 text-sm font-semibold hover:underline"
        style={{ color: "var(--app-text-muted)" }}
      >
        Reset
      </a>
    </div>
  );
}

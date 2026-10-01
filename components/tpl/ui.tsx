"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { WAR_BAD, WAR_GOOD, marginColor } from "./format";

// Small building blocks in the site's flat language: pills, a segmented control, the stat row
// under a hero, a WAR chip. No panels, no cards.

/** A line-drawn ↗ for "opens something": iOS renders the U+2197 character as an emoji. */
export function ArrowOut({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" width="0.7em" height="0.7em" aria-hidden className={`inline-block align-baseline ${className}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.5 7.5 2.5M3.5 2.5h4v4" />
    </svg>
  );
}

export const MUTED = { color: "var(--app-text-muted)" } as const;
export const VERY_MUTED = { color: "var(--app-text-very-muted)" } as const;

export function Pills<T extends string | number>({ options, value, onChange, label, size = "sm" }: {
  options: { key: T; label: string; title?: string }[]; value: T; onChange: (v: T) => void; label?: string; size?: "sm" | "xs";
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={String(o.key)} type="button" onClick={() => onChange(o.key)} aria-pressed={on} title={o.title}
            className={`rounded-full font-semibold ${size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
            style={{ border: "1px solid var(--app-border)", background: on ? "var(--app-tab-bg)" : "transparent", color: on ? "var(--app-text-primary)" : "var(--app-text-muted)", boxShadow: on ? "inset 0 0 0 1px var(--app-border)" : undefined }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex gap-0.5 rounded-full p-0.5" style={{ border: "1px solid var(--app-border)" }} role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={on} className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ background: on ? "var(--app-tab-bg)" : "transparent", color: on ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The row of figures under a hero: value over an uppercase label, separated by rules. */
export function StatRow({ items }: { items: { value: ReactNode; label: ReactNode; color?: string; onClick?: () => void; title?: string; href?: string }[] }) {
  return (
    <div className="mt-6 flex flex-wrap gap-x-7 gap-y-4 pt-4" style={{ borderTop: "1px solid var(--app-border)" }}>
      {items.map((it, i) => {
        const value = (
          <div className={`text-xl font-extrabold tabular-nums ${it.onClick || it.href ? "cursor-pointer underline decoration-dotted underline-offset-4" : ""}`} style={{ color: it.color ?? "var(--app-text-primary)" }} title={it.title}>
            {it.value}
          </div>
        );
        return (
          <div key={i} className={i < items.length - 1 ? "pr-7" : ""} style={i < items.length - 1 ? { borderRight: "1px solid var(--app-border)" } : undefined}>
            {it.href ? <Link href={it.href}>{value}</Link> : it.onClick ? <button type="button" onClick={it.onClick} className="text-left">{value}</button> : value}
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={VERY_MUTED}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Wins Above Replacement, as a tinted chip. */
export function WarChip({ war, size = "xs" }: { war: number | null | undefined; size?: "xs" | "sm" }) {
  if (war == null) return null;
  const tone = war > 0.05 ? "good" : war < -0.05 ? "bad" : "zero";
  const color = tone === "good" ? WAR_GOOD : tone === "bad" ? WAR_BAD : "var(--app-text-muted)";
  return (
    <span className={`inline-flex items-center rounded-full font-bold tabular-nums ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-1.5 py-px text-[11px]"}`}
      style={{ color, background: tone === "zero" ? "var(--app-tab-bg)" : `color-mix(in srgb, ${color} 14%, transparent)` }} title="Wins Above Replacement">
      {war > 0 ? "+" : war < 0 ? "−" : ""}{Math.abs(war).toFixed(1)}
    </span>
  );
}

/** A candidate name that opens their record in the candidates view. */
export function CandidateLink({ name, party, war, className = "" }: { name: string | undefined; party?: string; war?: number | null; className?: string }) {
  if (!name) return <span style={VERY_MUTED}>—</span>;
  const p = party === "D" || party === "R" ? party : party ? "I" : undefined;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <Link href={`/model/candidates?c=${encodeURIComponent(slug(name))}`} className="underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)" }}>{name}</Link>
      {p && <span className="text-[11px] font-bold" style={{ color: p === "R" ? "var(--party-rep)" : p === "D" ? "var(--party-dem)" : "var(--party-ind)" }}>{p}</span>}
      <WarChip war={war} />
    </span>
  );
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** A margin colored by party. */
export function M({ v, digits = 2, bold }: { v: number | null | undefined; digits?: 1 | 2; bold?: boolean }) {
  const text = v == null ? "—" : Math.abs(v) < (digits === 2 ? 0.005 : 0.05) ? "EVEN" : `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(digits)}`;
  return <span className={`tabular-nums ${bold ? "font-bold" : ""}`} style={{ color: marginColor(v) }}>{text}</span>;
}

/** Notes under a table. */
export function Foot({ children }: { children: ReactNode }) {
  return <div className="mt-2 max-w-4xl text-[11px] leading-relaxed" style={VERY_MUTED}>{children}</div>;
}

/** The thin secondary rule head used inside a section. */
export function SubHead({ label, meta, right }: { label: ReactNode; meta?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-5 mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <h3 className="text-[11px] font-bold uppercase tracking-wider" style={MUTED}>{label}</h3>
      {meta && <span className="text-xs" style={VERY_MUTED}>{meta}</span>}
      {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
    </div>
  );
}

export const TH = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-left";
export const TH_R = `${TH} text-right`;
export const TD = "whitespace-nowrap px-2 py-1.5 tabular-nums";
export const TD_R = `${TD} text-right`;

/** The races-table toggle, independent of the matrix: it sets what the table shows when no
 *  cell is picked (every race, or nothing). A picked cell always shows its races; clearing the
 *  pick returns to this view. Clicking it also clears any pick, so the result matches its label. */
export function AllRacesButton({ count, hidden, onToggle }: { count: number; hidden: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={hidden} className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
      {hidden ? `Show all ${count} races` : "Hide races"}
    </button>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMapTooltip } from "@/lib/useMapTooltip";
import type { Chamber } from "@/data/stateLegDistricts";
import { shortDistrictName } from "@/lib/stateLegAtlas";
import { flipBackground } from "@/components/FlipStripes";

export type BoxItem = {
  key: string;
  fill: string;
  /** Light text on dark fills; the caller decides per bucket. */
  darkText?: boolean;
  title: string;
  dimmed?: boolean;
  /** Projected to change hands: drawn with the flip stripes over `fill`. */
  flip?: boolean;
  /** Hover card content for the current color mode. */
  tip?: BoxTip;
};

export type BoxTipLine = { label: string; value?: string; color?: string; sub?: string };
export type BoxTip = {
  heading: string;
  lines: BoxTipLine[];
  /** The bottom line under a rule: the margin, the projection, the result. */
  total?: { label: string; value: string; color?: string };
  note?: string;
};

/**
 * One box per district, the atlas's primary selector. Boxes are laid out by district key order so
 * neighbours by number sit together; the color mode is the caller's (seat party, presidential
 * margin, last result, projection). A filtered-out district stays in place but recedes, so the
 * grid never reflows under the reader's eye.
 */
export default function DistrictBoxGrid({
  chamber,
  items,
  selectedKey,
  onSelect,
}: {
  chamber: Chamber;
  items: BoxItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  // Named districts (VT, MA, NH codes) need wider boxes than two-digit numbers; the width follows
  // the longest key so "Chittenden-Central" and "1st Essex" fit without truncation.
  const longest = useMemo(() => Math.max(0, ...items.map((i) => i.key.length)), [items]);
  const wide = useMemo(() => items.some((i) => !/^\d{1,3}[A-Za-z]?$/.test(i.key)), [items]);
  const minWidth = !wide ? 34 : longest > 14 ? 128 : longest > 9 ? 100 : 72;
  const [hovered, setHovered] = useState<string | null>(null);
  const { onMouseMove, tooltipRef } = useMapTooltip(14, 8);
  const hoveredTip = hovered ? items.find((i) => i.key === hovered)?.tip : undefined;
  return (
    <div className="relative" onMouseMove={onMouseMove} onMouseLeave={() => setHovered(null)}>
    <div
      role="listbox"
      aria-label={`${chamber === "house" ? "House" : "Senate"} districts`}
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}
    >
      {items.map((it) => {
        const selected = it.key === selectedKey;
        return (
          <button
            key={it.key}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={it.title}
            title={it.tip ? undefined : it.title}
            onClick={() => onSelect(it.key)}
            onMouseEnter={() => setHovered(it.key)}
            onFocus={() => setHovered(it.key)}
            onBlur={() => setHovered(null)}
            className="h-[26px] rounded-[3px] text-[10px] font-semibold tabular-nums truncate px-0.5 transition-opacity"
            style={{
              background: it.flip ? flipBackground(it.fill) : it.fill,
              color: it.darkText ? "#1d1f22" : "#fff",
              opacity: it.dimmed ? 0.22 : 1,
              outline: selected || it.key === hovered ? "2px solid var(--app-text-primary)" : "none",
              outlineOffset: 1,
              cursor: "pointer",
            }}
          >
            {wide ? it.key : shortDistrictName(chamber, it.key).replace(/^[HS]D /, "")}
          </button>
        );
      })}
    </div>
    {hoveredTip && (
      <div
        ref={tooltipRef}
        className="hidden md:block absolute z-20 pointer-events-none rounded-lg backdrop-blur-sm"
        style={{ width: 240, padding: "6px 8px", background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}
      >
        <div className="font-bold text-xs mb-1.5">{hoveredTip.heading}</div>
        <div className="flex flex-col gap-0.5">
          {hoveredTip.lines.map((l, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2" style={{ fontSize: 11 }}>
              <span className="min-w-0 truncate" style={{ color: l.color ?? "var(--app-text-muted)" }}>
                {l.label}
                {l.sub && <span className="ml-1" style={{ fontSize: 9, color: "var(--app-text-very-muted)" }}>{l.sub}</span>}
              </span>
              {l.value && <span className="shrink-0 font-semibold tabular-nums" style={{ color: l.color ?? "var(--app-text-primary)" }}>{l.value}</span>}
            </div>
          ))}
        </div>
        {hoveredTip.total && (
          <div className="mt-1 pt-1 flex items-baseline justify-between gap-2" style={{ borderTop: "1px solid var(--app-border)", fontSize: 11 }}>
            <span style={{ color: "var(--app-text-muted)" }}>{hoveredTip.total.label}</span>
            <span className="font-bold tabular-nums" style={{ color: hoveredTip.total.color ?? "var(--app-text-primary)" }}>{hoveredTip.total.value}</span>
          </div>
        )}
        {hoveredTip.note && <div className="mt-1 italic" style={{ fontSize: 9, color: "var(--app-text-very-muted)" }}>{hoveredTip.note}</div>}
      </div>
    )}
    </div>
  );
}

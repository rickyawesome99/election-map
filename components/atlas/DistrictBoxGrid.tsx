"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapTooltip } from "@/lib/useMapTooltip";
import type { Chamber } from "@/data/stateLegDistricts";
import { shortDistrictName } from "@/lib/stateLegAtlas";
import { flipBackground } from "@/components/FlipStripes";
import { HOVER_LABEL, HoverBox, HoverFoot, HoverRow, HoverRows, HoverTitle, HoverTotal } from "@/components/StateLegHoverCard";

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

// One labeled box, in both the district grid and the seat strip.
const BOX_W = 36;
const BOX_H = 30;
const GAP = 4;

export type BoxTipLine = { label: string; value?: string; color?: string; sub?: string };
export type BoxTip = {
  heading: string;
  lines: BoxTipLine[];
  /** The bottom line under a rule: the margin, the projection, the result. */
  total?: { label: string; value: string; color?: string };
  note?: string;
};

/** The hover card shared by the box grid and the seat strip. */
function BoxTooltip({ tip, tooltipRef }: { tip: BoxTip; tooltipRef: React.Ref<HTMLDivElement> }) {
  return (
    <HoverBox boxRef={tooltipRef}>
      <HoverTitle>{tip.heading}</HoverTitle>
      <HoverRows>
        {tip.lines.map((l, i) => <HoverRow key={i} label={l.label} value={l.value} color={l.color} sub={l.sub} />)}
      </HoverRows>
      {tip.total && (
        <HoverTotal
          left={<span className={HOVER_LABEL} style={{ color: "var(--app-text-muted)" }}>{tip.total.label}</span>}
          right={<span className="text-[13px] font-bold" style={{ color: tip.total.color ?? "var(--app-text-primary)" }}>{tip.total.value}</span>}
        />
      )}
      {tip.note && <HoverFoot>{tip.note}</HoverFoot>}
    </HoverBox>
  );
}

/**
 * One box per district, the atlas's primary selector. Boxes are laid out by district key order so
 * neighbours by number sit together; the color mode is the caller's (seat party, presidential
 * margin, last result, projection). A filtered-out district stays in place but recedes, so the
 * grid never reflows under the reader's eye. Big chambers (NH's 203 districts, MA, VT) scroll
 * inside a box about the map's height, with a fade at the bottom while there is more below.
 */
export default function DistrictBoxGrid({
  chamber,
  items,
  selectedKey,
  onSelect,
  onHover,
}: {
  chamber: Chamber;
  items: BoxItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** The hovered district's key, or null when the pointer leaves (the atlas outlines it on the map). */
  onHover?: (key: string | null) => void;
}) {
  // Named districts (VT, MA, NH codes) need wider boxes than two-digit numbers; the width follows
  // the longest key so "Chittenden-Central" and "1st Essex" fit without truncation.
  const longest = useMemo(() => Math.max(0, ...items.map((i) => i.key.length)), [items]);
  const wide = useMemo(() => items.some((i) => !/^\d{1,3}[A-Za-z]?$/.test(i.key)), [items]);
  const minWidth = !wide ? BOX_W : longest > 14 ? 128 : longest > 9 ? 100 : 72;
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => { onHover?.(hovered); }, [hovered, onHover]);
  const { onMouseMove, tooltipRef } = useMapTooltip(14, 8);
  const hoveredTip = hovered ? items.find((i) => i.key === hovered)?.tip : undefined;
  const scroller = useRef<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMore = useCallback(() => {
    const el = scroller.current;
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);
  useEffect(() => {
    checkMore();
    window.addEventListener("resize", checkMore);
    return () => window.removeEventListener("resize", checkMore);
  }, [checkMore, items.length]);
  return (
    <div className="relative" onMouseMove={onMouseMove} onMouseLeave={() => setHovered(null)}>
    <div className="relative">
    <div ref={scroller} onScroll={checkMore} className="max-h-[20rem] overflow-y-auto overscroll-contain p-[3px] lg:max-h-[34rem]" style={{ scrollbarWidth: "thin" }}>
    <div
      role="listbox"
      aria-label={`${chamber === "house" ? "House" : "Senate"} districts`}
      className="grid"
      // Numbered boxes are a fixed size, the same as the seat strip's; named ones stretch to fit.
      style={{ gap: GAP, gridTemplateColumns: wide ? `repeat(auto-fill, minmax(${minWidth}px, 1fr))` : `repeat(auto-fill, ${BOX_W}px)`, gridAutoRows: `${BOX_H}px` }}
    >
      {items.map((it, i) => {
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
            className="ab-box rounded-[3px] text-[11px] font-semibold tabular-nums truncate px-0.5"
            style={{
              // Pops in row by row on load (globals.css .ab-box); a long chamber stops staggering by ~0.5 s.
              animationDelay: `${Math.min(i, 160) * 3}ms`,
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
    </div>
    {moreBelow && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: "linear-gradient(to bottom, transparent, var(--app-bg))" }} />}
    </div>
    {hoveredTip && <BoxTooltip tip={hoveredTip} tooltipRef={tooltipRef} />}
    </div>
  );
}

export type SeatBox = BoxItem & {
  /** The district's key twice over in a multi-member district, so React needs its own. */
  id: string;
  /** Printed in the square where the district has a short number; long names go unlabeled. */
  label: string | null;
};


/**
 * The chamber one square per seat, already ordered D to R by the caller, read like text: most
 * Democratic top left, most Republican bottom right.
 * A multi-member district has a square for each seat, and hovering one outlines them all. Columns
 * follow the width.
 */
export function SeatStrip({ items, onSelect, onHover }: { items: SeatBox[]; onSelect: (key: string) => void; onHover?: (key: string | null) => void }) {
  const labeled = items.every((i) => i.label != null && i.label.length <= 3);
  const cw = labeled ? BOX_W : 18, ch = labeled ? BOX_H : 18;
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => { onHover?.(hovered); }, [hovered, onHover]);
  const { onMouseMove, tooltipRef } = useMapTooltip(14, 8);
  const hoveredTip = hovered ? items.find((i) => i.key === hovered)?.tip : undefined;

  const n = items.length;
  const fit = width ? Math.max(1, Math.floor((width + GAP) / (cw + GAP))) : 1;
  const cols = Math.min(fit, n);
  return (
    <div ref={ref} className="relative" onMouseMove={onMouseMove} onMouseLeave={() => setHovered(null)}>
      {width != null && n > 0 ? (
        <div className="flex justify-start pb-2">
          <div className="relative">
            <div
              role="listbox"
              aria-label="Seats, Democratic to Republican"
              className="grid"
              style={{ gap: GAP, gridTemplateColumns: `repeat(${cols}, ${cw}px)`, gridAutoRows: `${ch}px` }}
            >
              {items.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  aria-label={it.title}
                  onClick={() => onSelect(it.key)}
                  onMouseEnter={() => setHovered(it.key)}
                  onFocus={() => setHovered(it.key)}
                  onBlur={() => setHovered(null)}
                  className="ab-box rounded-[3px] text-[11px] font-semibold tabular-nums"
                  style={{
                    animationDelay: `${Math.min(i, 160) * 3}ms`,
                    background: it.flip ? flipBackground(it.fill) : it.fill,
                    color: it.darkText ? "#1d1f22" : "#fff",
                    opacity: it.dimmed ? 0.22 : 1,
                    outline: it.key === hovered ? "2px solid var(--app-text-primary)" : "none",
                    outlineOffset: 1,
                    cursor: "pointer",
                  }}
                >
                  {labeled ? it.label : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ height: 2 * ch + GAP + 8 }} />
      )}
      {hoveredTip && <BoxTooltip tip={hoveredTip} tooltipRef={tooltipRef} />}
    </div>
  );
}

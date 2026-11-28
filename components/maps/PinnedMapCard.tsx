"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { startPendingNav } from "@/lib/navPending";

// A map's hover card, pinned by a tap. A phone has no hover, so a tap on a state, district or
// county shows the same card a mouse sees on hover, where the press landed, with a close button
// and a button to the place's page. Every map draws one card and uses it for both, so a change to
// the hover card is a change to the phone's card too (there is no separate panel under the map).
//
//   <div className="relative" data-map-pin="">          ← the box presses are measured in
//     …map…
//     {pin && <PinnedMapCard pin={pin} label={title}>   ← positions; the child draws the box
//       <CountyTooltip {...card} variant="pinned" aside={<CountyCardClose small … />} footer={<PinnedCardLink …/>} />
//     </PinnedMapCard>}
//   </div>
//
// Put data-map-pin on a box that does not clip (no overflow-hidden), so a card taller than the
// space under a press can hang past the map's edge instead of being cut off.

/** Where a press landed inside the map's box, and the box's size then. */
export type MapPin = { x: number; y: number; w: number; h: number };

/** The press's place in the nearest `data-map-pin` box; null when the target sits in none. */
export function pinFromEvent(e: { clientX: number; clientY: number; target: EventTarget | null }): MapPin | null {
  const box = (e.target as Element | null)?.closest?.("[data-map-pin]")?.getBoundingClientRect();
  return box ? { x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, h: box.height } : null;
}

const GAP = 10;
const PAD = 4;

/** Centred on the press and kept inside the map's width; under the press when it fits, else above it. */
export default function PinnedMapCard({ pin, width = 228, label, className = "", children }: {
  pin: MapPin; /** The card's width in px (the child draws at this width). */ width?: number;
  /** The place's name, for screen readers. */ label: string; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const H = node.offsetHeight;
    const below = pin.y + GAP;
    const above = pin.y - GAP - H;
    const top = below + H + PAD <= pin.h ? below : above >= PAD ? above : pin.y > pin.h / 2 ? Math.max(PAD, above) : below;
    node.style.top = `${top}px`;
    node.style.visibility = "visible";
  });
  const left = Math.max(PAD, Math.min(pin.x - width / 2, pin.w - width - PAD));
  return (
    <div ref={ref} role="dialog" aria-label={label} className={`absolute z-30 ${className}`} style={{ left, top: pin.y + GAP, width, visibility: "hidden" }}>
      {children}
    </div>
  );
}

/** The pinned card's button to the place's page, for `footer`. */
export function PinnedCardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link prefetch={false} href={href} onClick={() => startPendingNav(href)} className="ix-lift mt-1 flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-center text-xs font-bold" style={{ background: "var(--app-text-primary)", color: "var(--app-bg)" }}>
      <span>{children}</span><span aria-hidden>→</span>
    </Link>
  );
}

/** The pinned card's close button, for `aside`. */
export function PinnedCardClose({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" className="-mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-[var(--app-tab-bg)]" style={{ color: "var(--app-text-muted)" }}>
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  );
}

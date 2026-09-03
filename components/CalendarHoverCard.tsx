"use client";

import { useState, type MouseEvent, type ReactNode } from "react";

type Tip = {
  head: string;
  office: string;
  result: string;
  note: string;
  lean: string;
  /** Viewport coordinates of the badge being described. */
  x: number;
  top: number;
  bottom: number;
};

/** Shows a hover card for the Election Calendar's badges the moment the pointer reaches one,
 *  in place of the browser's native title tooltip and its delay.
 *
 *  A single delegated mouseover covers the whole grid, so the ~1,500 badges carry only data
 *  attributes and there is ever only one card in the DOM. */
export default function CalendarHoverCard({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<Tip | null>(null);

  const onMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const badge = (event.target as HTMLElement).closest("[data-tip-head]");
    if (!(badge instanceof HTMLElement)) {
      setTip(null);
      return;
    }
    const box = badge.getBoundingClientRect();
    setTip({
      head: badge.dataset.tipHead ?? "",
      office: badge.dataset.tipOffice ?? "",
      result: badge.dataset.tipResult ?? "",
      note: badge.dataset.tipNote ?? "",
      lean: badge.dataset.tipLean ?? "",
      x: box.left + box.width / 2,
      top: box.top,
      bottom: box.bottom,
    });
  };

  // Near the top of the viewport there is no room above the badge, so the card drops below it.
  const below = tip != null && tip.top < 140;

  return (
    <div onMouseOver={onMouseOver} onMouseLeave={() => setTip(null)}>
      {children}
      {tip && (
        <div
          role="tooltip"
          className="cal-tip"
          data-lean={tip.lean || undefined}
          style={{
            left: tip.x,
            top: below ? tip.bottom + 8 : tip.top - 8,
            transform: `translate(-50%, ${below ? "0" : "-100%"})`,
          }}
        >
          <div className="head">{tip.head}</div>
          {tip.office && <div className="office">{tip.office}</div>}
          {tip.result && <div className="result">{tip.result}</div>}
          {tip.note && <div className="note">{tip.note}</div>}
        </div>
      )}
    </div>
  );
}

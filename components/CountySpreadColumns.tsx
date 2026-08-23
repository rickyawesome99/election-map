"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Two-column "ledger spread" for the county page: identity/context on the left, the
// past-results ledger on the right, divided by a literal rule. The right column's
// results list is capped to end exactly where the left column ends (so the spread
// reads as one fixed-size page rather than a runaway list) and scrolls internally
// past that. On mobile it is capped at roughly four result rows.
const BREAKPOINT = 768;
const MOBILE_RESULTS_MAX_HEIGHT = 480;

export default function CountySpreadColumns({
  left,
  rightHead,
  rightBody,
}: {
  left: ReactNode;
  rightHead: ReactNode;
  rightBody: ReactNode;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [fadeBottom, setFadeBottom] = useState(false);

  useEffect(() => {
    // scrollHeight reflects the ledger's full content height regardless of the maxHeight
    // style applied below, so fadeBottom can be derived from the same measurement pass
    // instead of waiting for a follow-up effect once the cap actually paints.
    const sync = () => {
      const leftEl = leftRef.current;
      const scrollEl = scrollRef.current;
      if (!leftEl || !scrollEl) return;
      if (window.innerWidth < BREAKPOINT) {
        setMaxHeight(MOBILE_RESULTS_MAX_HEIGHT);
        setFadeBottom(scrollEl.scrollHeight > MOBILE_RESULTS_MAX_HEIGHT + 1);
        return;
      }
      const leftBottom = leftEl.getBoundingClientRect().bottom;
      const scrollTop = scrollEl.getBoundingClientRect().top;
      const nextMaxHeight = Math.max(200, Math.round(leftBottom - scrollTop));
      setMaxHeight(nextMaxHeight);
      setFadeBottom(scrollEl.scrollHeight > nextMaxHeight + 1);
    };

    sync();
    const ro = new ResizeObserver(sync);
    if (leftRef.current) ro.observe(leftRef.current);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div className="county-spread">
      <div ref={leftRef} className="col-left">{left}</div>
      <div className="rule" />
      <div className="col-right flex flex-col min-h-0">
        {rightHead}
        <div
          ref={scrollRef}
          className={fadeBottom ? "county-spread-fade" : undefined}
          style={maxHeight != null ? { maxHeight, overflowY: "auto", paddingRight: 6 } : undefined}
          onScroll={(e) => {
            const t = e.currentTarget;
            setFadeBottom(t.scrollHeight - t.scrollTop > t.clientHeight + 1);
          }}
        >
          {rightBody}
        </div>
      </div>
    </div>
  );
}

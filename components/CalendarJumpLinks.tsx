"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Wraps the Election Calendar so that picking a cell both re-filters the Race Calendar and
 *  brings it into view, instead of leaving the reader where they were while the table below
 *  quietly changed.
 *
 *  Also wraps the pager under the table. One delegated handler covers every link that opts in
 *  with data-jump — roughly 700 in the grid — because giving each its own client component
 *  would put that many client references in the payload. Modified and middle clicks fall
 *  through to the browser so links still open in a new tab. */
export default function CalendarJumpLinks({
  targetId,
  children,
}: {
  targetId: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        // Only links that opt in — a candidate or seat link inside the same wrapper must
        // still navigate to its own page rather than re-filtering this one.
        const link = (event.target as HTMLElement).closest("a[data-jump]");
        if (!(link instanceof HTMLAnchorElement)) return;

        event.preventDefault();
        // scroll: false leaves the scrolling to us, so the router's own jump doesn't fight
        // the smooth scroll — and the target is already on the page either way. The section's
        // scroll-mt keeps it clear of the sticky app header.
        router.push(link.getAttribute("href") ?? "", { scroll: false });
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </div>
  );
}

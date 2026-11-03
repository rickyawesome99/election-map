"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Holds a block's entrance animations until it scrolls into view (globals.css: `[data-vh="wait"]`
 * pauses `.vh-row` and the `.vh-bar-*` reveals). Spread `{ ref, "data-vh": vh }` on the block.
 */
export function useRevealOnce<T extends HTMLElement = HTMLDivElement>(threshold = 0.12) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return { ref, vh: seen ? "go" : "wait" } as const;
}

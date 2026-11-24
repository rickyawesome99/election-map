"use client";

import type { ReactNode } from "react";
import { useRevealOnce } from "@/lib/useRevealOnce";

/** A section of the candidate page whose rows and bars hold their entrance until it scrolls into
 *  view (globals.css: `[data-vh="wait"]`). The page itself is a server component, so the observer
 *  lives here. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, vh } = useRevealOnce<HTMLElement>(0.01);
  return <section ref={ref} data-vh={vh} className={className}>{children}</section>;
}

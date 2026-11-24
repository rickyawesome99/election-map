"use client";

import { useState, type ReactNode } from "react";

// A race on a candidate page that opens its WAR calculation, working like a row of the WAR tab:
// the whole row is the control (a click on a link inside it follows the link instead), it tints
// under the pointer and darkens while pressed (globals.css: .vh-tint, .vh-press), and the chevron
// the row draws turns over while it is open (`group` + data-open). The page is a server
// component, so the open/closed state lives here; the row and the panel arrive already rendered.
export function ExpandableRace({ children, panel, label }: { children: ReactNode; panel: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((v) => !v);
  return (
    <div className="group" data-open={open}>
      <div role="button" tabIndex={0} aria-expanded={open} aria-label={`${label}: ${open ? "hide" : "show"} the WAR calculation`} className="vh-press cursor-pointer rounded-[10px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-text-primary)]"
        onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) toggle(); }}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); toggle(); } }}>
        {children}
      </div>
      {open && <div className="pb-6 pt-2">{panel}</div>}
    </div>
  );
}

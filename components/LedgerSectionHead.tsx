import type { ReactNode } from "react";

// A section heading shared by the race pages (server) and a few client charts. It lives in its
// own file so a client component can import it without dragging RaceDetailSections.tsx — and the
// compute hub that file imports — into the browser bundle.
// rightClassName overrides the right slot's placement (default: pushed to the far right).
export function LedgerSectionHead({ label, meta, right, rightClassName = "ml-auto" }: { label: string; meta?: ReactNode; right?: ReactNode; rightClassName?: string }) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-1.5 sm:gap-3 pb-3 mb-3"
      style={{ borderBottom: "2px solid var(--app-text-primary)" }}
    >
      <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </h2>
      {meta && <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{meta}</span>}
      {right && <span className={rightClassName}>{right}</span>}
    </div>
  );
}

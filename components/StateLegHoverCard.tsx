import type { ReactNode, Ref } from "react";

// The state-leg map and seat-box hover cards, dressed as the site's county card (CountyTooltip's
// tooltip variant): the same box, padding and shadow, the name as a small uppercase title, 12px
// rows with the figure right-aligned, and ruled footer lines. Content is the caller's.

export const HOVER_LABEL = "text-[10px] font-semibold uppercase tracking-[0.06em]";

export function HoverBox({ boxRef, width = 228, children }: { boxRef?: Ref<HTMLDivElement>; width?: number; children: ReactNode }) {
  return (
    <div
      ref={boxRef}
      className="hidden md:block absolute z-20 pointer-events-none rounded-lg"
      style={{ width, padding: "10px 12px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", color: "var(--app-text-primary)" }}
    >
      {children}
    </div>
  );
}

export function HoverTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em]" style={{ textWrap: "balance" }}>{children}</div>;
}

export function HoverRows({ children }: { children: ReactNode }) {
  return <div className="grid gap-[3px] text-[12px] tabular-nums">{children}</div>;
}

/** A label and its figure; a coloured row (a party, a candidate) is set heavier, as on the county card. */
export function HoverRow({ label, value, color, labelColor, valueColor, sub, aside }: { label: ReactNode; value?: ReactNode; color?: string; labelColor?: string; valueColor?: string; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid items-baseline gap-x-2.5" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
      <span className="truncate" style={{ color: labelColor ?? color ?? "var(--app-text-muted)", fontWeight: color ? 600 : 500 }}>
        {label}
        {sub && <span className="ml-1 text-[10px] font-medium" style={{ color: "var(--app-text-very-muted)" }}>{sub}</span>}
      </span>
      <span className="flex items-baseline gap-1.5 text-right">
        {aside}
        {value != null && value !== "" && <span className="font-bold" style={{ color: valueColor ?? color ?? "var(--app-text-primary)" }}>{value}</span>}
      </span>
    </div>
  );
}

/** The bottom line under a rule: a figure on the left (the margin), a note or second figure right. */
export function HoverTotal({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-1.5 grid items-baseline gap-x-2.5 border-t pt-1.5 tabular-nums" style={{ gridTemplateColumns: "minmax(0,1fr) auto", borderColor: "var(--app-border)" }}>
      <span className="min-w-0">{left}</span>
      {right != null && <span className="text-right">{right}</span>}
    </div>
  );
}

/** A sentence in place of figures (vacant, no result on file). */
export function HoverNote({ children }: { children: ReactNode }) {
  return <div className="text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{children}</div>;
}

/** Fine print under a rule (when the seat was last elected, whether it is up). */
export function HoverFoot({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 border-t pt-1.5 text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-very-muted)" }}>{children}</div>;
}

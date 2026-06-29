"use client";
import { useState } from "react";
import type { ReactNode } from "react";

export function InfoTooltip({
  label,
  labelStyle,
  children,
}: {
  label: string;
  labelStyle?: React.CSSProperties;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle ?? { color: "var(--app-text-muted)" }}>
        {label}
      </span>
      <span
        className="text-[10px] cursor-pointer select-none"
        style={{ color: "var(--app-text-very-muted)" }}
        onClick={() => setOpen((o) => !o)}
      >
        ⓘ
      </span>
      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 w-64 rounded-lg px-3 py-2 text-[11px] leading-relaxed z-20"
          style={{
            background: "var(--app-panel)",
            border: "1px solid var(--app-border)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            color: "var(--app-text-muted)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

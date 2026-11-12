"use client";

import { useState, type ReactNode } from "react";

/**
 * A table body that shows its first `first` rows and a toggle for the rest. Rows come in
 * pre-rendered (and keyed), so a server-rendered table can use it as-is.
 */
export default function ExpandableTbody({ rows, first = 15, colSpan, noun = "rows", pill = false }: {
  rows: ReactNode[]; first?: number; colSpan: number; noun?: string;
  /** The state pages' centered "Show all N districts" button; open, it hides the extra rows again. */
  pill?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const collapsible = rows.length > first;
  return (
    <tbody>
      {collapsible && !showAll ? rows.slice(0, first) : rows}
      {collapsible && pill && (
        <tr>
          <td colSpan={colSpan} className="pt-3.5 text-center">
            <button type="button" onClick={() => setShowAll((v) => !v)} className="ix-press rounded-full px-4 py-1.5 text-[13px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
              {showAll ? `Hide ${rows.length - first} ${noun}` : `Show all ${rows.length} ${noun}`}
            </button>
          </td>
        </tr>
      )}
      {collapsible && !pill && (
        <tr>
          <td colSpan={colSpan} className="pt-3">
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>
              {showAll ? "Show fewer" : `Show all ${rows.length} ${noun} ↓`}
            </button>
          </td>
        </tr>
      )}
    </tbody>
  );
}

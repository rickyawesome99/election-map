"use client";

import { useState, type ReactNode } from "react";

/**
 * A table body that shows its first `first` rows and a toggle for the rest. Rows come in
 * pre-rendered (and keyed), so a server-rendered table can use it as-is.
 */
export default function ExpandableTbody({ rows, first = 15, colSpan, noun = "rows" }: { rows: ReactNode[]; first?: number; colSpan: number; noun?: string }) {
  const [showAll, setShowAll] = useState(false);
  const collapsible = rows.length > first;
  return (
    <tbody>
      {collapsible && !showAll ? rows.slice(0, first) : rows}
      {collapsible && (
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

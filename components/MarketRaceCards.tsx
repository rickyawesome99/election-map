import Link from "next/link";
import MarketCallChips from "@/components/MarketCallChips";
import { KIND_LABEL, fmtWinMargin, nameOf, partyColor, partyOf, type MarketRaceRow } from "@/lib/predictionMarketDisplay";

/** Phone-width stand-in for the five-column race tables: race and margin, then the result, then each venue's call. */
export default function MarketRaceCards({ rows, className = "" }: { rows: MarketRaceRow[]; className?: string }) {
  return (
    <ul className={className}>
      {rows.map((r) => {
        const color = partyColor(partyOf(r, r.winner));
        return (
          <li key={r.raceId} className="py-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                {r.href ? <Link prefetch={false} href={r.href} className="font-semibold hover:underline">{r.place}</Link> : <span className="font-semibold">{r.place}</span>}
                <span className="ml-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>{KIND_LABEL[r.kind]}{r.runoff ? " runoff" : ""} · {r.year}</span>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color }}>{fmtWinMargin(r)}</span>
            </div>
            <div className="mt-0.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              <span className="font-semibold" style={{ color }}>{nameOf(r, r.winner)}</span> def. {nameOf(r, r.winner === "D" ? "R" : "D")}
            </div>
            <div className="mt-2"><MarketCallChips row={r} /></div>
          </li>
        );
      })}
    </ul>
  );
}

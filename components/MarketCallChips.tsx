import { SOURCE_LABEL, fmtPct, nameOf, partyColor, partyOf, surname, type MarketRaceRow } from "@/lib/predictionMarketDisplay";

/** Each venue's election-eve call on one race: venue, favorite, price, and whether it held. */
export default function MarketCallChips({ row }: { row: MarketRaceRow }) {
  return (
    <div className="flex flex-col gap-0.5">
      {row.markets.map((m) => (
        <div key={m.source} className="flex items-baseline gap-2 whitespace-nowrap text-xs">
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="w-[4.75rem] shrink-0 hover:underline" style={{ color: "var(--app-text-muted)" }}>{SOURCE_LABEL[m.source]}</a>
          {m.favorite == null ? (
            <span style={{ color: "var(--app-text-muted)" }}>50–50, no favorite</span>
          ) : (
            <>
              <span className="font-semibold" style={{ color: partyColor(partyOf(row, m.favorite)) }}>{surname(nameOf(row, m.favorite))}</span>
              <span className="tabular-nums font-semibold">{fmtPct(m.favProb)}</span>
              {m.correct
                ? <span aria-label="Called correctly" title="The favorite won" style={{ color: "var(--app-text-very-muted)" }}>✓</span>
                : <span className="rounded px-1 text-[10px] font-bold uppercase tracking-wider" title="The favorite lost" style={{ background: "var(--app-text-primary)", color: "var(--app-bg)" }}>Miss</span>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

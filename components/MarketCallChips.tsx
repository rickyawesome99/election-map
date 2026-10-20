import { SOURCE_LABEL, fmtPct, nameOf, partyColor, partyOf, surname, type MarketRaceRow } from "@/lib/predictionMarketDisplay";

/** Each venue's election-eve call on one race: venue, favorite, price, and whether it held. */
export default function MarketCallChips({ row }: { row: MarketRaceRow }) {
  const paired = row.markets.length > 1;
  return (
    // One grid for every venue line, so venue, favorite, price and result stack in columns when a race has two.
    // A lone line sits in a 20px row, level with the race name beside it. Two lines split the row into thirds:
    // the table rows are 53px (8px padding + name + subtitle + 8px), so two 16px lines with 7px above, between
    // and below. The negative margins tuck the grid into the cell padding (-1px top for the 7px gap; -2px bottom so it
    // never makes the row taller than the race cell, whose content is a hair under 37px).
    <div
      className="grid w-max items-center gap-x-2 whitespace-nowrap text-xs"
      style={{
        gridTemplateColumns: "4.75rem auto auto auto",
        ...(paired ? { gridTemplateRows: "16px 16px", rowGap: 7, marginTop: -1, marginBottom: -2 } : { gridTemplateRows: "20px" }),
      }}
    >
      {row.markets.map((m) => {
        const lead = paired ? "leading-4" : "leading-5";
        return (
          <div key={m.source} className="contents">
            <a href={m.url} target="_blank" rel="noopener noreferrer" className={`${lead} hover:underline`} style={{ color: "var(--app-text-muted)" }}>{SOURCE_LABEL[m.source]}</a>
            {m.favorite == null ? (
              <span className={`${lead} col-span-3`} style={{ color: "var(--app-text-muted)" }}>50–50, no favorite</span>
            ) : (
              <>
                <span className={`${lead} font-semibold`} style={{ color: partyColor(partyOf(row, m.favorite)) }}>{surname(nameOf(row, m.favorite))}</span>
                <span className={`${lead} text-right tabular-nums font-semibold`}>{fmtPct(m.favProb)}</span>
                {m.correct
                  ? <span className={lead} aria-label="Called correctly" title="The favorite won" style={{ color: "var(--app-text-very-muted)" }}>✓</span>
                  : <span className="justify-self-start rounded px-1 text-[10px] leading-4 font-bold uppercase tracking-wider" title="The favorite lost" style={{ background: "var(--app-text-primary)", color: "var(--app-bg)" }}>Miss</span>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

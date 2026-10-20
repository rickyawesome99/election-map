import MarketAccuracyTable from "@/components/MarketAccuracyTable";
import MarketBoard from "@/components/MarketBoard";
import MarketGapTable from "@/components/MarketGapTable";
import MarketMissTable from "@/components/MarketMissTable";
import MarketConfidenceCharts from "@/components/MarketConfidenceCharts";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { electionYear } from "@/data/forecastData";
import type { MarketSource } from "@/data/predictionMarkets";
import { POLYMARKET_2026_READ, marketBoard } from "@/lib/marketBoard";
import type { MarketBoardRace } from "@/lib/marketBoardDisplay";
import { KIND_LABEL, SOURCE_LABEL, fmtPct, worstMiss } from "@/lib/predictionMarketDisplay";
import { byRace, calibration, droppedQuotes, marketDots, marketRaceRows, scoredMarkets, tally, type Tally } from "@/lib/predictionMarkets";

export const metadata = {
  title: `Prediction Markets — ${electionYear} Forecast`,
  description: "Polymarket's current price on every 2026 Senate, governor and House race, bucketed, and how Polymarket, Kalshi and PredictIt priced every race they listed on the eve of the 2018, 2020, 2022 and 2024 elections.",
};

const KINDS = ["P", "S", "G", "H"] as const;
const th = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
const thStyle = { color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" };
const rowStyle = { borderBottom: "1px solid var(--app-border)" };
// Tighter cells below sm, so the record tables' six columns fit a phone without scrolling.
const thTight = "whitespace-nowrap px-1 py-2 text-[10px] font-bold uppercase tracking-normal sm:px-2 sm:tracking-wider";
const tdTight = "whitespace-nowrap px-1 py-1.5 text-left tabular-nums sm:px-2";
const note = "mt-4 max-w-3xl text-xs leading-relaxed";

const share = (right: number, n: number) => (n ? fmtPct(right / n) : "—");
/** Which side the prices leaned toward, against what happened: "D+6.7%" = Democrats overpriced by 6.7 points of win probability. */
const fmtBias = (v: number) => (Math.abs(v) < 0.05 ? "Even" : `${v > 0 ? "D" : "R"}+${Math.abs(v).toFixed(1)}%`);
const biasColor = (v: number) => (Math.abs(v) < 0.05 ? "var(--app-text-primary)" : v > 0 ? "var(--party-dem)" : "var(--party-rep)");
const fmtEve = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function RecordTable({ rows, firstHead }: { rows: { key: string; label: string; sub?: string; t: Tally; total?: boolean }[]; firstHead: string }) {
  // [desktop label, phone label, tooltip]
  const heads: [string, string, string][] = [
    ["Markets", "Mkts", "Markets with a favorite (two sat at exactly 50–50 and are left out)"],
    ["Favorite won", "Fav. won", "How often the side priced higher on election eve won"],
    ["Favorites under 90%", "Under 90%", "The same, counting only races the market did not treat as settled"],
    ["Brier score", "Brier", "Mean squared error of the price against the result. 0 is perfect; pricing everything at 50% scores 0.25"],
    ["Overpriced side", "Lean", "Average price on the Democratic side minus how often it won, in points"],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-4xl border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${thTight} text-left`} style={thStyle}><span className="sm:hidden">{firstHead.replace(/^(Year|Election) and /, "").replace(/^./, (c) => c.toUpperCase())}</span><span className="hidden sm:inline">{firstHead}</span></th>
            {heads.map(([h, short, title]) => (
              <th key={h} scope="col" title={title} className={`${thTight} text-left`} style={thStyle}>
                <span className="sm:hidden">{short}</span><span className="hidden sm:inline">{h}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, sub, t, total }) => (
            <tr key={key} style={total ? { borderTop: "2px solid var(--app-text-primary)" } : rowStyle}>
              <th scope="row" className={`${tdTight} font-semibold`}><span className="whitespace-pre-line sm:hidden">{label.replace(/^(\d{4}) /, "$1\n")}</span><span className="hidden sm:inline">{label}</span>{sub && <span className="ml-2 hidden text-xs font-normal sm:inline" style={{ color: "var(--app-text-very-muted)" }}>{sub}</span>}</th>
              <td className={tdTight}>{t.n}</td>
              <td className={tdTight}><span className="font-semibold">{share(t.right, t.n)}</span> <span className="hidden sm:inline" style={{ color: "var(--app-text-very-muted)" }}>{t.right}/{t.n}</span></td>
              <td className={tdTight}><span className="font-semibold">{share(t.contestedRight, t.contestedN)}</span> <span className="hidden sm:inline" style={{ color: "var(--app-text-very-muted)" }}>{t.contestedRight}/{t.contestedN}</span></td>
              <td className={tdTight}>{t.brier.toFixed(3)}</td>
              <td className={`${tdTight} font-semibold`} style={{ color: biasColor(t.demBias) }}>{fmtBias(t.demBias)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MarketAccuracyPage() {
  const all = scoredMarkets;
  const races = marketRaceRows(all);
  const total = tally(all);
  const years = [...new Set(all.map((r) => r.year))].sort((a, b) => b - a);

  const venueYears = [...new Set(all.map((r) => `${r.year}|${r.source}`))].sort().reverse().map((key) => {
    const [year, source] = key.split("|") as [string, MarketSource];
    const rows = all.filter((r) => r.year === Number(year) && r.source === source);
    const eve = rows.map((r) => r.asOf).sort().at(-1)!;
    return { key, label: `${year} ${SOURCE_LABEL[source]}`, sub: `read ${fmtEve(eve)} ET`, t: tally(rows) };
  });
  const offices = KINDS.map((k) => ({ key: k, label: KIND_LABEL[k], t: tally(all.filter((r) => r.kind === k)) }));

  const missed = races.filter((r) => worstMiss(r) > 0).sort((a, b) => worstMiss(b) - worstMiss(a));
  const locks = all.filter((r) => r.favProb >= 0.9);
  const lockMisses = locks.filter((r) => r.correct === false).length;
  const topMiss = all.filter((r) => r.correct === false).sort((a, b) => b.favProb - a.favProb)[0];

  // Two venues on the races both listed in one year.
  const versus = (year: number, a: MarketSource, b: MarketSource) => {
    const shared = byRace(all.filter((r) => r.year === year && (r.source === a || r.source === b))).filter((x) => x.markets.length === 2);
    return {
      year, shared: shared.length,
      rows: [a, b].map((source) => ({ key: `${year}-${source}`, label: `${year} ${SOURCE_LABEL[source]}`, t: tally(shared.map((x) => x.markets.find((m) => m.source === source)!)) })),
      split: shared.filter((x) => x.markets[0].favorite !== x.markets[1].favorite).length,
      gap: (shared.reduce((sum, x) => sum + Math.abs(x.markets[0].pDem - x.markets[1].pDem), 0) / shared.length) * 100,
    };
  };
  const v24 = versus(2024, "polymarket", "kalshi");
  const v22 = versus(2022, "polymarket", "predictit");
  // Favorites the market itself called uncertain-to-likely: did they win as often as their price said?
  const mid = calibration(all).filter((b) => b.label !== "50–60%" && !b.label.startsWith("9")).reduce((sum, b) => ({ n: sum.n + b.n, right: sum.right + b.right, exp: sum.exp + b.expected * b.n }), { n: 0, right: 0, exp: 0 });

  const boardRaces = marketBoard.reduce((n, o) => n + o.races.length, 0);
  // Market vs. this site: gap > 0 means the market prices Democrats below the forecast.
  const gapRaces = marketBoard.flatMap((o) => o.races);
  const gap = (r: MarketBoardRace) => r.modelPDem - r.pDem;
  // Only gaps of 10 points or more; rounded first so a 9.6-point gap shown as "10%" still makes the cut.
  const pts = (r: MarketBoardRace) => Math.round(gap(r) * 100);
  const demUnder = gapRaces.filter((r) => pts(r) >= 10).sort((a, b) => gap(b) - gap(a));
  const repUnder = gapRaces.filter((r) => pts(r) <= -10).sort((a, b) => gap(a) - gap(b));
  const fmtRead = new Date(`${POLYMARKET_2026_READ}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const fmtReadShort = new Date(`${POLYMARKET_2026_READ}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });


  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Markets" title="Prediction Markets">
        As of {fmtReadShort}, Polymarket is pricing <Fig>{boardRaces}</Fig> Senate, governor and House races this year. In the <Fig>{all.length}</Fig> markets
        we could score since {years.at(-1)}, the election-eve favorite won <Fig>{share(total.right, total.n)}</Fig> of the time, but
        only <Fig>{share(total.contestedRight, total.contestedN)}</Fig> when priced under 90%, and at least one market backed the loser in <Fig>{missed.length}</Fig> races.
      </StandfirstHeader>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 sm:pt-8">
        <section className="mb-12">
          <LedgerSectionHead label={`${electionYear} on the Board`} meta={`Polymarket's price on each race as of ${fmtRead}. Each race sits in the column of its favorite's price, most contested first.`} />
          <MarketBoard offices={marketBoard} />
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Market Against Model" meta={`Where Polymarket and this site's forecast differ by 10 points or more, as of ${fmtRead}`} />
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <MarketGapTable side="R" rows={repUnder} />
            <MarketGapTable side="D" rows={demUnder} />
          </div>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="The Record" meta="By election and venue, then by office" />
          <RecordTable firstHead="Election and venue" rows={[...venueYears, { key: "all", label: "All markets", t: total, total: true }]} />
          <div className="mt-8"><RecordTable firstHead="Office" rows={offices} /></div>
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Each market&rsquo;s election-eve price against the result. Favorites priced at 90% or more went{" "}
            {locks.length - lockMisses} for {locks.length}, so the under-90% column is the fairer test.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Were the Prices Honest?" meta="How often the favorite won, by how heavily it was favored" />
          <MarketConfidenceCharts markets={marketDots(all)} years={years} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            <span className="hidden sm:inline">Hover a point or a square for the detail; a square links to its race. </span>Across all {mid.n} favorites priced
            from 60% to 90%, the average price was {fmtPct(mid.exp / mid.n)} and {fmtPct(mid.right / mid.n)} of them won.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="The Misses" meta={`${missed.length} races where at least one market's favorite lost, most confident first`} />
          <MarketMissTable rows={missed} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            {topMiss && <>The most confident miss on file is {topMiss.place} in {topMiss.year}, where {SOURCE_LABEL[topMiss.source]} had the loser at {fmtPct(topMiss.favProb)}. </>}
            {lockMisses === 0 ? "No favorite priced at 90% or better has lost." : `${lockMisses} favorites priced at 90% or better lost.`} Races decided in a runoff are scored on the runoff, which is what the contracts paid on.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Venue Against Venue" meta="The same races, priced on two exchanges the same night" />
          <RecordTable firstHead="Year and venue" rows={[...v24.rows, ...v22.rows]} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            On shared races, Polymarket and Kalshi were {v24.gap.toFixed(1)} points apart in 2024 and picked different
            favorites in {v24.split}; Polymarket and PredictIt were {v22.gap.toFixed(1)} points apart in 2022 and split on {v22.split}.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Every Race" meta="Column headings sort; the default order runs from toss-ups to locks" />
          <MarketAccuracyTable rows={races} years={years} />
        </section>

        <section>
          <LedgerSectionHead label="What This Covers" />
          <div className="overflow-x-auto">
            <table className="w-full max-w-4xl border-collapse text-sm">
              <thead>
                <tr>{["Year", "Venues", "Where the price comes from"].map((h, i) => (
                  <th key={h} scope="col" className={`${th} text-left ${i === 1 ? "hidden sm:table-cell" : ""}`} style={thStyle}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[
                  [String(electionYear), "Polymarket", <>Its public API, read {fmtRead}. A snapshot, not scored until the election is over.</>],
                  ["2024", "Polymarket, Kalshi", "Each venue’s price history: the last price before midnight Eastern as Election Day began."],
                  ["2022", "Polymarket, PredictIt", "Polymarket: the last trade on its old blockchain exchange before midnight Eastern. PredictIt: ElectionBettingOdds.com’s election-eve archive."],
                  [`2020, ${years.at(-1)}`, "PredictIt", "The Internet Archive’s election-eve captures of its feed."],
                ].map(([year, venues, source]) => (
                  <tr key={year as string} style={rowStyle}>
                    <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left align-top font-semibold">{year}</th>
                    <td className="hidden whitespace-nowrap px-2 py-1.5 align-top sm:table-cell">{venues}</td>
                    <td className="px-2 py-1.5 align-top" style={{ color: "var(--app-text-muted)" }}>
                      <div className="font-semibold sm:hidden" style={{ color: "var(--app-text-primary)" }}>{venues}</div>
                      {source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            PredictIt prices are rescaled so the two parties sum to 100%. In a three-way race the Democratic side is the chance
            the Republican loses, and an independent in a party&rsquo;s slot (Sanders, King, Osborn) is scored on that side.{" "}
            {droppedQuotes.length} PredictIt incumbent markets on members who retired or lost a primary are left out.
          </p>
        </section>
      </main>
    </div>
  );
}

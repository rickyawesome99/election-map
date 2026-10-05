import BackButton from "@/components/BackButton";
import MarketAccuracyTable from "@/components/MarketAccuracyTable";
import MarketCallChips from "@/components/MarketCallChips";
import MarketConfidenceCharts from "@/components/MarketConfidenceCharts";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
import { electionYear } from "@/data/forecastData";
import type { MarketSource } from "@/data/predictionMarkets";
import { KIND_LABEL, SOURCE_LABEL, fmtPct, fmtWinMargin, nameOf, partyColor, partyOf, worstMiss, type MarketRaceRow } from "@/lib/predictionMarketDisplay";
import { byRace, calibration, droppedQuotes, marketDots, marketRaceRows, scoredMarkets, tally, type Tally } from "@/lib/predictionMarkets";

export const metadata = {
  title: `Prediction Market Accuracy — ${electionYear} Forecast`,
  description: "How Polymarket, Kalshi and PredictIt priced every presidential state, Senate, governor and House race they listed on the eve of the 2018, 2020, 2022 and 2024 elections, and which ones they got wrong.",
};

const KINDS = ["P", "S", "G", "H"] as const;
const th = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
const thStyle = { color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" };
const rowStyle = { borderBottom: "1px solid var(--app-border)" };
const note = "mt-4 max-w-3xl text-xs leading-relaxed";

const share = (right: number, n: number) => (n ? fmtPct(right / n) : "—");
/** Which side the prices leaned toward, against what happened: "D +6.7" = Democrats overpriced by 6.7 points. */
const fmtBias = (v: number) => (Math.abs(v) < 0.05 ? "Even" : `${v > 0 ? "D" : "R"} +${Math.abs(v).toFixed(1)}`);
const biasColor = (v: number) => (Math.abs(v) < 0.05 ? "var(--app-text-primary)" : v > 0 ? "var(--party-dem)" : "var(--party-rep)");
const fmtEve = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function RecordTable({ rows, firstHead }: { rows: { key: string; label: string; sub?: string; t: Tally; total?: boolean }[]; firstHead: string }) {
  const heads: [string, string][] = [
    ["Markets", "Markets with a favorite (two sat at exactly 50–50 and are left out)"],
    ["Favorite won", "How often the side priced higher on election eve won"],
    ["Favorites under 90%", "The same, counting only races the market did not treat as settled"],
    ["Brier score", "Mean squared error of the price against the result. 0 is perfect; pricing everything at 50% scores 0.25"],
    ["Overpriced side", "Average price on the Democratic side minus how often it won, in points"],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-4xl border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${th} text-left`} style={thStyle}>{firstHead}</th>
            {heads.map(([h, title]) => <th key={h} scope="col" title={title} className={`${th} text-right`} style={thStyle}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, sub, t, total }) => (
            <tr key={key} style={total ? { borderTop: "2px solid var(--app-text-primary)" } : rowStyle}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{label}{sub && <span className="ml-2 text-xs font-normal" style={{ color: "var(--app-text-very-muted)" }}>{sub}</span>}</th>
              <td className="px-2 py-1.5 text-right tabular-nums">{t.n}</td>
              <td className="px-2 py-1.5 text-right tabular-nums"><span className="font-semibold">{share(t.right, t.n)}</span> <span style={{ color: "var(--app-text-very-muted)" }}>{t.right}/{t.n}</span></td>
              <td className="px-2 py-1.5 text-right tabular-nums"><span className="font-semibold">{share(t.contestedRight, t.contestedN)}</span> <span style={{ color: "var(--app-text-very-muted)" }}>{t.contestedRight}/{t.contestedN}</span></td>
              <td className="px-2 py-1.5 text-right tabular-nums">{t.brier.toFixed(3)}</td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: biasColor(t.demBias) }}>{fmtBias(t.demBias)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RaceCell({ r }: { r: MarketRaceRow }) {
  return (
    <>
      {r.href ? <a href={r.href} className="font-semibold hover:underline">{r.place}</a> : <span className="font-semibold">{r.place}</span>}
      <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{KIND_LABEL[r.kind]}{r.runoff ? " · runoff" : ""}</div>
    </>
  );
}

function MissTable({ rows }: { rows: MarketRaceRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>{["Year", "Race", "Election-eve market", "Winner", "Margin"].map((h, i) => (
            <th key={h} scope="col" className={`${th} ${i === 4 ? "text-right" : "text-left"}`} style={thStyle}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.raceId} style={rowStyle}>
              <td className="px-2 py-2 align-top tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
              <td className="px-2 py-2 align-top"><RaceCell r={r} /></td>
              <td className="px-2 py-2 align-top"><MarketCallChips row={r} /></td>
              <td className="px-2 py-2 align-top">
                <span className="font-semibold" style={{ color: partyColor(partyOf(r, r.winner)) }}>{nameOf(r, r.winner)}</span>
                <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>def. {nameOf(r, r.winner === "D" ? "R" : "D")}</div>
              </td>
              <td className="px-2 py-2 text-right align-top font-semibold tabular-nums" style={{ color: partyColor(partyOf(r, r.winner)) }}>{fmtWinMargin(r)}</td>
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
      split: shared.filter((x) => x.markets[0].favorite !== x.markets[1].favorite).map((x) => x.markets[0].place),
      gap: (shared.reduce((sum, x) => sum + Math.abs(x.markets[0].pDem - x.markets[1].pDem), 0) / shared.length) * 100,
      ids: new Set(shared.map((x) => x.raceId)),
    };
  };
  const v24 = versus(2024, "polymarket", "kalshi");
  const v22 = versus(2022, "polymarket", "predictit");
  const kalshiOnly = tally(all.filter((r) => r.source === "kalshi" && !v24.ids.has(r.raceId)));
  const kalshiAll = tally(all.filter((r) => r.source === "kalshi"));
  // Favorites the market itself called uncertain-to-likely: did they win as often as their price said?
  const mid = calibration(all).filter((b) => b.label !== "50–60%" && !b.label.startsWith("9")).reduce((sum, b) => ({ n: sum.n + b.n, right: sum.right + b.right, exp: sum.exp + b.expected * b.n }), { n: 0, right: 0, exp: 0 });
  const listNames = (names: string[]) => (names.length ? names.join(", ") : "none");

  const stats = [
    { value: all.length, label: "Markets scored" },
    { value: races.length, label: "Races priced" },
    { value: share(total.right, total.n), label: "Favorite won" },
    { value: share(total.contestedRight, total.contestedN), label: "When under 90%" },
    { value: missed.length, label: "Races missed" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-3 sm:px-6 sm:pb-10">
          <div className="-ml-2 mb-5"><BackButton /></div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 4rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Prediction Market Accuracy</h1>
          <div className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            What Polymarket, Kalshi and PredictIt were charging for each side of a race the night before the election, set
            against who won. Every presidential state, Senate, governor and House market whose election-eve price can still
            be recovered is here: PredictIt in {years.at(-1)}, 2020 and 2022, Polymarket in 2022 and 2024, Kalshi in 2024. A price is read as a
            probability, and the side priced higher is the market&rsquo;s call.
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            {stats.map((stat, i, list) => (
              <div key={stat.label} className={i < list.length - 1 ? "pr-8" : ""} style={i < list.length - 1 ? { borderRight: "1px solid var(--app-border)" } : undefined}>
                <div className="text-2xl font-extrabold tabular-nums">{stat.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6">
        <section className="mb-12">
          <LedgerSectionHead label="The Record" meta="By election and venue, then by office" />
          <RecordTable firstHead="Election and venue" rows={[...venueYears, { key: "all", label: "All markets", t: total, total: true }]} />
          <div className="mt-8"><RecordTable firstHead="Office" rows={offices} /></div>
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Most markets are on races nobody doubted, so the headline rate flatters: favorites priced at 90% or more
            went {locks.length - lockMisses} for {locks.length}. The middle column is the fairer test. A venue that
            listed more toss-up House districts (Kalshi in 2024, PredictIt in {years.at(-1)} and 2020) had more chances to
            be wrong than one that mostly listed states, so the rows compare what was asked as much as who answered.
            PredictIt&rsquo;s 2024 row is the four race markets left in its feed that week.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Were the Prices Honest?" meta="How often the favorite won, by how heavily it was favored" />
          <MarketConfidenceCharts markets={marketDots(all)} years={years} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            A 60% favorite is supposed to lose four times in ten, so a colored square in the top rows is the market
            working, not failing; the test is whether each band&rsquo;s favorites won about as often as they were priced.
            Across all {mid.n} favorites priced from 60% to 90%, the average price was {fmtPct(mid.exp / mid.n)} and{" "}
            {fmtPct(mid.right / mid.n)} of them won. Hover a point or a square for the detail; a square links to its race.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="The Misses" meta={`${missed.length} races where at least one market's favorite lost, most confident first`} />
          <MissTable rows={missed} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            {topMiss && <>The most confident miss on file is {topMiss.place} in {topMiss.year}, where {SOURCE_LABEL[topMiss.source]} had the loser at {fmtPct(topMiss.favProb)}. </>}
            {lockMisses === 0 ? "No favorite priced at 90% or better has lost." : `${lockMisses} favorites priced at 90% or better lost.`} Races decided in a runoff are scored on the runoff, which is what the contracts paid on.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Venue Against Venue" meta="The same races, priced on two exchanges the same night" />
          <RecordTable firstHead="Year and venue" rows={[...v24.rows, ...v22.rows]} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            In 2024, on the {v24.shared} races both listed, Polymarket and Kalshi sat {v24.gap.toFixed(1)} points apart on
            average and picked different favorites in {v24.split.length} ({listNames(v24.split)}). The gap between them in the
            first table is the menu, not the venue: the {kalshiOnly.n} races only Kalshi listed, nearly all House districts,
            account for {kalshiOnly.n - kalshiOnly.right} of its {kalshiAll.n - kalshiAll.right} misses. In 2022, on{" "}
            {v22.shared} shared Senate and governor races, Polymarket and PredictIt were {v22.gap.toFixed(1)} points apart and
            split on {v22.split.length} ({listNames(v22.split)}).
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Every Race" meta="Column headings sort; the default order runs from toss-ups to locks" />
          <MarketAccuracyTable rows={races} years={years} />
        </section>

        <section>
          <LedgerSectionHead label="What This Covers" />
          <div className="max-w-3xl space-y-3 text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            <p>
              <strong style={{ color: "var(--app-text-primary)" }}>2024.</strong> Polymarket and Kalshi both publish price
              history for settled markets. Each price is the last one at or before midnight Eastern as Election Day began.
              PredictIt&rsquo;s few 2024 markets come from an archived copy of its public feed.
            </p>
            <p>
              <strong style={{ color: "var(--app-text-primary)" }}>2020 and {years.at(-1)}.</strong> PredictIt does not serve
              history for closed markets, so these are the last traded prices in the Internet Archive&rsquo;s election-eve
              captures of its all-markets feed. Its contracts routinely summed to more than a dollar, so each
              price is rescaled so the two parties sum to 100%. Markets that asked whether a named incumbent would be
              re-elected are read as a price on that candidate; {droppedQuotes.length} on members who retired or lost a
              primary are left out.
            </p>
            <p>
              <strong style={{ color: "var(--app-text-primary)" }}>2022.</strong> Neither venue&rsquo;s own archive covers it.
              Polymarket&rsquo;s Senate and governor markets ran on its old exchange, which settled every trade on the Polygon
              blockchain, so each price here is the last trade recorded there before midnight Eastern. PredictIt&rsquo;s feed
              was not archived that week; its state prices are taken from ElectionBettingOdds.com, which republished them
              rescaled to 100% and was archived at 10:23 pm (Senate) and 8:04 pm (governor) Eastern on election eve. No
              2022 House market could be recovered, and Kalshi was not yet permitted to list elections.
            </p>
            <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              Results are this site&rsquo;s. An independent the site files with a party&rsquo;s slot (Sanders, King, Osborn) is
              scored on that side. Rebuild with <code>scripts/fetch-prediction-markets.py</code>; the scoring is in{" "}
              <code>lib/predictionMarkets.ts</code>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

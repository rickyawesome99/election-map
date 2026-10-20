import { electionYear, presPastResults } from "@/data/forecastData";
import { TplHub } from "@/components/tpl/TplHub";
import { TplGeoProvider } from "@/components/tpl/TplGeo";
import { TplViewSwitch } from "@/components/tpl/TplSubNav";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { buildModelSummary } from "@/lib/modelSlices";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";

export const metadata = {
  title: `True Partisan Lean — ${electionYear} Model`,
  description: "Every state's and district's neutral partisan lean, with the races, years and candidates behind each number.",
};

// The TPL tab's landing page: the national map with the ranked table, then the distribution,
// the cycle's standout candidates and the section links. Everything is computed at build time
// in lib/modelSlices.ts; the map's year lens and sorts run on the summary alone.
export default function ModelHubPage() {
  const summary = buildModelSummary();
  // Electoral votes per unit on the current apportionment, for the map's EV split: ME/NE's
  // district votes are keyed by district code, and DC (no TPL) carries its latest presidential
  // margin as the fallback lean.
  const evUnits = Object.values(presPastResults).map((rows) => {
    const latest = rows.reduce((a, b) => (b.year > a.year ? b : a));
    return { key: latest.stateAbbr, ev: latest.electoralVotes, fallback: latest.margin };
  });
  return (
    <TplGeoProvider>
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: PAGE_HERO_BG }}>
        <div className={PAGE_CONTAINER}>
          <div className={`pb-6 sm:pb-1 ${PAGE_HERO_TOP}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
              <div className="min-w-0">
                <h1 style={PAGE_TITLE_STYLE}>True Partisan Lean</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed sm:min-h-[4lh] md:min-h-[3lh]" style={{ color: "var(--app-text-muted)" }}>
                  Each state&apos;s and district&apos;s partisan lean from every race {summary.fitYears[0]}–{summary.fitYears[summary.fitYears.length - 1]}, with candidate and national effects stripped out. Each year counts {summary.yearDecay.toFixed(2)}× as much as the year after it.
                </p>
              </div>
              <div className="flex shrink-0 items-end justify-between gap-6 sm:justify-end sm:gap-8">
              <div className="sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>50-state median</div>
                <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1, color: marginColor(summary.medianStateTpl) }}>{fmtMargin(summary.medianStateTpl)}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>435-district median <span style={{ color: marginColor(summary.medianDistrictTpl) }}>{fmtMargin(summary.medianDistrictTpl)}</span></div>
              </div>
              <TplViewSwitch to="candidates" layout="inline" />
              </div>
            </div>
            <TplViewSwitch to="candidates" />
          </div>
        </div>
      </div>
      <main className={`${PAGE_CONTAINER} pb-14 pt-6`}>
        <TplHub summary={summary} evUnits={evUnits} />
      </main>
    </div>
    </TplGeoProvider>
  );
}

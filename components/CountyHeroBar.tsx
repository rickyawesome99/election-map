import { calculateCountyModel } from "@/lib/tplCompute";
import { fmtMargin, marginColor, marginToRating, getRatingColors } from "@/lib/colorScale";
import type { DetailPastResult } from "@/components/RaceDetailSections";

function Sparkline({ points }: { points: { year: number; wrs: number | null }[] }) {
  const known = points.filter((p): p is { year: number; wrs: number } => p.wrs != null);
  if (known.length < 2) return null;

  const width = 176;
  const height = 40;
  const padX = 6;
  const padY = 6;
  const vals = known.map((p) => p.wrs);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const range = max - min || 1;

  const xFor = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2);
  const yFor = (v: number) => height - padY - ((v - min) / range) * (height - padY * 2);

  const segments: { x1: number; y1: number; x2: number; y2: number; stroke: string }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i].wrs;
    const b = points[i + 1].wrs;
    if (a == null || b == null) continue;
    const avg = (a + b) / 2;
    segments.push({
      x1: xFor(i), y1: yFor(a), x2: xFor(i + 1), y2: yFor(b),
      stroke: Math.abs(avg) < 0.05 ? "var(--party-ind-muted)" : avg >= 0 ? "var(--party-rep-muted)" : "var(--party-dem-muted)",
    });
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {segments.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={2} strokeLinecap="round" />
      ))}
      {points.map((p, i) =>
        p.wrs == null ? null : (
          <circle key={p.year} cx={xFor(i)} cy={yFor(p.wrs)} r={3} fill={marginColor(p.wrs)} />
        )
      )}
      {points.map((p, i) => (
        <text key={`label-${p.year}`} x={xFor(i)} y={height} fontSize={8} fill="var(--app-text-very-muted)" textAnchor="middle">
          &apos;{String(p.year).slice(2)}
        </text>
      ))}
    </svg>
  );
}

// wrap=true lets the value flow onto multiple lines instead of clipping to one - needed
// for District, which can list many codes for a county spanning several congressional
// districts (e.g. Cook County, IL spans 10) and would otherwise overflow the card.
function StatCell({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 flex flex-col justify-center ${wrap ? "w-full min-w-0" : "min-w-[104px]"}`}
      style={{ background: "var(--app-bg)" }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold truncate" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </div>
      <div className={`text-sm font-bold ${wrap ? "break-words" : "truncate"}`} style={{ color: "var(--app-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

export default function CountyHeroBar({
  fips,
  results,
}: {
  fips: string;
  results: DetailPastResult[];
}) {
  const calc = calculateCountyModel(fips);
  if (!calc || calc.races.every((r) => r.NM == null)) return null;

  const { tpl, yearAggregations } = calc;
  const rating = marginToRating(tpl);
  const { bg, text } = getRatingColors(rating);

  const sortedYears = yearAggregations
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((agg) => ({ year: agg.year, wrs: agg.racesPresent.length > 0 ? agg.WRS : null }));

  const knownYears = sortedYears.filter((p): p is { year: number; wrs: number } => p.wrs != null);
  const swing =
    knownYears.length >= 2
      ? parseFloat((knownYears[knownYears.length - 1].wrs - knownYears[knownYears.length - 2].wrs).toFixed(1))
      : null;
  const swingFromYear = knownYears.length >= 2 ? knownYears[knownYears.length - 2].year : null;

  const sortedResults = results.slice().sort((a, b) => b.year - a.year);
  const latestWithVotes = sortedResults.find((r) => r.demVotes != null && r.repVotes != null);
  const turnout = latestWithVotes ? (latestWithVotes.demVotes ?? 0) + (latestWithVotes.repVotes ?? 0) : null;

  const latestHouse = sortedResults.find((r) => r.electionType === "House" && r.districtLabel);

  return (
    <section
      className="rounded-xl mb-3 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 flex-wrap px-4 py-4 sm:px-6"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
    >
      <div className="shrink-0">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
          County TPL
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-3xl font-bold tabular-nums" style={{ color: marginColor(tpl) }}>
            {fmtMargin(tpl)}
          </span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: bg, color: text }}>
            {rating}
          </span>
        </div>
      </div>

      {knownYears.length >= 2 && (
        <>
          <div className="hidden sm:block self-stretch w-px" style={{ background: "var(--app-border)" }} />
          <div className="shrink-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
              Lean by Cycle
            </div>
            <Sparkline points={sortedYears} />
          </div>
        </>
      )}

      {(swing != null || turnout != null || latestHouse) && (
        <>
          <div className="hidden sm:block self-stretch w-px" style={{ background: "var(--app-border)" }} />
          <div className="flex flex-wrap gap-2 grow">
            {swing != null && swingFromYear != null && (
              <StatCell label={`Swing since '${String(swingFromYear).slice(2)}`} value={`${swing > 0 ? "→R" : swing < 0 ? "←D" : "="}${Math.abs(swing).toFixed(1)}`} />
            )}
            {turnout != null && latestWithVotes && (
              <StatCell label={`${latestWithVotes.year} Turnout`} value={`${turnout.toLocaleString()} votes`} />
            )}
            {latestHouse && (
              <StatCell label="District" value={latestHouse.districtLabel!} wrap />
            )}
          </div>
        </>
      )}
    </section>
  );
}

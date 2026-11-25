import { calculateCountyModel, calculateStateTpl, getMedianStateTpl } from "@/lib/tplCompute";
import { countyTplForState } from "@/lib/countyTpl";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { fmtLean } from "@/lib/colorScale";

/**
 * "How X compares": the county's TPL beside its state's and the median state's, as three serif
 * figures, then a strip placing it among every county in the state — the state's counties as
 * faint dots, the state and median state as rules, and the gap from the state to this county
 * shaded. Server component (reads the TPL model directly).
 */

const partyColor = (m: number) => (Math.abs(m) < 0.05 ? "var(--party-ind)" : m > 0 ? "var(--party-rep)" : "var(--party-dem)");
const partyWord = (m: number) => (m >= 0 ? "Republican" : "Democratic");

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

// A fixed vertical offset per county, so dots that share a lean don't stack into one: counties
// taken in lean order step through the golden-ratio sequence, which spreads neighbours apart evenly.
const GOLDEN = 0.6180339887;
const jitterAt = (i: number) => ((i * GOLDEN) % 1) * 2 - 1; // -1..1

function Figure({ label, glyph, value, caption }: { label: React.ReactNode; glyph: React.ReactNode; value: number; caption: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
        {glyph}
        <span className="truncate">{label}</span>
      </div>
      <div className="tabular-nums mt-0.5" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.35rem, 4vw, 1.9rem)", fontWeight: 700, lineHeight: 1.1, color: partyColor(value) }}>
        {fmtLean(value)}
      </div>
      <div className="mt-1 text-xs leading-snug" style={{ color: "var(--app-text-muted)", textWrap: "pretty" }}>{caption}</div>
    </div>
  );
}

const STRIP_H = 64; // px — the dot band; the axis labels sit under it

export default function CountyCompareCard({
  fips,
  stateAbbr,
  stateName,
  name,
  areaLabel,
}: {
  fips: string;
  stateAbbr: string;
  stateName: string;
  /** The county's bare name ("Millard"). */
  name: string;
  /** County / Parish / Borough. */
  areaLabel: string;
}) {
  const calc = calculateCountyModel(fips);
  if (!calc || calc.races.every((r) => r.NM == null)) return null;

  const countyTpl = calc.tpl;
  const stateTpl = calculateStateTpl(stateAbbr, stateName);
  const nationalTpl = getMedianStateTpl();

  const peers = Object.entries(countyTplForState(stateAbbr))
    .filter((e): e is [string, number] => e[1] != null)
    .map(([f, tpl]) => ({ fips: f, tpl, name: countyPresidentialData[f]?.countyName ?? f }))
    .sort((a, b) => a.tpl - b.tpl)
    .map((p, i) => ({ ...p, jitter: jitterAt(i) }));
  const n = peers.length;
  // Rank on the county's own side: most Republican for an R-leaning county, most Democratic for a D one.
  const rank = 1 + peers.filter((p) => (countyTpl >= 0 ? p.tpl > countyTpl : p.tpl < countyTpl)).length;
  const plural = areaLabel === "Parish" ? "parishes" : areaLabel === "Borough" ? "boroughs" : "counties";
  const rankText = n > 1
    ? `${rank === 1 ? "Most" : `${ordinal(rank)} most`} ${countyTpl >= 0 ? "R" : "D"} out of ${n} ${plural}`
    : null;

  // Symmetric domain around EVEN, wide enough for every county in the state.
  const extent = Math.max(Math.abs(countyTpl), Math.abs(stateTpl), Math.abs(nationalTpl), ...peers.map((p) => Math.abs(p.tpl)), 10);
  const domainMax = Math.ceil(extent / 10) * 10;
  const pos = (m: number) => 50 + (Math.max(-domainMax, Math.min(domainMax, m)) / domainMax) * 50;
  const ticks = [-domainMax, -domainMax / 2, 0, domainMax / 2, domainMax];

  const vsCaption = (other: number, otherName: string) => {
    const d = countyTpl - other;
    if (Math.abs(d) < 0.1) return <>{name} matches {otherName}</>;
    return <>{name} is <b className="tabular-nums" style={{ color: partyColor(d) }}>{Math.abs(d).toFixed(1)} pts</b> more {partyWord(d)}</>;
  };

  const countyColor = partyColor(countyTpl);
  const gapLeft = Math.min(pos(stateTpl), pos(countyTpl));
  const gapWidth = Math.abs(pos(countyTpl) - pos(stateTpl));

  return (
    <div>
      <div className="grid grid-cols-3 gap-x-4 sm:gap-x-8">
        <Figure
          // Phones show the bare name ("Door"): three columns leave no room for "Door County" on one line.
          label={<>{name}<span className="hidden sm:inline"> {areaLabel}</span></>}
          glyph={
            // The ring is the span's own border (not a box-shadow), so nothing around it can clip it.
            <span className="inline-grid place-items-center rounded-full shrink-0" style={{ width: 14, height: 14, border: `1.5px solid ${countyColor}` }}>
              <span className="block rounded-full" style={{ width: 8, height: 8, background: countyColor }} />
            </span>
          }
          value={countyTpl}
          caption={rankText}
        />
        <Figure
          label={stateName}
          glyph={<span className="inline-block shrink-0" style={{ width: 2, height: 11, background: "var(--app-text-primary)" }} />}
          value={stateTpl}
          caption={vsCaption(stateTpl, stateName)}
        />
        <Figure
          label="Median state"
          glyph={<span className="inline-block shrink-0" style={{ width: 0, height: 11, borderLeft: "2px dotted var(--app-text-muted)" }} />}
          value={nationalTpl}
          caption={vsCaption(nationalTpl, "the median state")}
        />
      </div>

      {/* The strip: D on the left, R on the right, tinted toward each end. */}
      <div className="mt-6">
        <div
          className="relative rounded-md"
          style={{
            height: STRIP_H,
            background: "linear-gradient(to right, color-mix(in srgb, var(--party-dem) 13%, transparent), transparent 50%, color-mix(in srgb, var(--party-rep) 13%, transparent))",
          }}
          role="img"
          aria-label={`${name} ${areaLabel} ${fmtLean(countyTpl)} among ${n} ${plural}; ${stateName} ${fmtLean(stateTpl)}; median state ${fmtLean(nationalTpl)}`}
        >
          {/* EVEN */}
          <div className="absolute top-0 bottom-0" style={{ left: "50%", width: 1, background: "var(--app-border)" }} />

          {/* The gap from the state to this county. */}
          {gapWidth > 0.5 && (
            <div
              className="absolute rounded-full"
              style={{ left: `${gapLeft}%`, width: `${gapWidth}%`, top: "50%", height: 6, transform: "translateY(-50%)", background: `color-mix(in srgb, ${countyColor} 28%, transparent)` }}
            />
          )}

          {/* Every other county in the state. */}
          {peers.filter((p) => p.fips !== fips).map((p) => (
            <div
              key={p.fips}
              className="absolute rounded-full"
              title={`${p.name} ${fmtLean(p.tpl)}`}
              style={{
                left: `${pos(p.tpl)}%`,
                top: `calc(50% + ${(p.jitter * (STRIP_H / 2 - 9)).toFixed(1)}px)`,
                width: 7, height: 7, transform: "translate(-50%, -50%)",
                background: partyColor(p.tpl), opacity: 0.3,
              }}
            />
          ))}

          {/* Median state and state rules. */}
          <div className="absolute top-1 bottom-1" style={{ left: `${pos(nationalTpl)}%`, borderLeft: "2px dotted var(--app-text-muted)", transform: "translateX(-1px)" }} title={`Median state ${fmtLean(nationalTpl)}`} />
          <div className="absolute top-1 bottom-1" style={{ left: `${pos(stateTpl)}%`, width: 2, background: "var(--app-text-primary)", transform: "translateX(-1px)" }} title={`${stateName} ${fmtLean(stateTpl)}`} />

          {/* This county. */}
          <div
            className="absolute rounded-full"
            title={`${name} ${fmtLean(countyTpl)}`}
            style={{
              left: `${pos(countyTpl)}%`, top: "50%", width: 16, height: 16, transform: "translate(-50%, -50%)",
              background: countyColor, boxShadow: `0 0 0 2.5px var(--app-bg), 0 0 0 4px ${countyColor}`,
            }}
          />
        </div>

        {/* Axis */}
        <div className="relative h-4 mt-1.5 text-[10.5px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute whitespace-nowrap"
              style={{
                left: `${pos(t)}%`,
                transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                fontWeight: t === 0 ? 700 : undefined,
              }}
            >
              {t === 0 ? "EVEN" : `${t < 0 ? "D" : "R"}+${Math.abs(t)}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { ChamberMapInfo } from "@/data/stateLegMapInfo";
import type { ChamberSeats } from "@/lib/stateLegSeats";

export type ChamberAboutData = {
  label: string;
  mapInfo: ChamberMapInfo | null;
  totalSeats: number | null;
  seats: ChamberSeats | null;
};

// A chamber's `source` reads "Georgia General Assembly (HB 1EX)" — the body that drew the map,
// then the instrument that enacted it. The two chambers almost always share the body and differ
// only in the bill, so those are resolved separately: the body heads the hero, the bill stays
// with its own chamber.
function splitSource(source: string): { body: string; cite: string | null } {
  const m = source.match(/^(.*?)\s*\((.*)\)$/);
  return m ? { body: m[1], cite: m[2] } : { body: source, cite: null };
}

type AuthorityMode = "none" | "cite" | "full";

function resolveAuthority(blocks: ChamberAboutData[]): { hero: string | null; mode: AuthorityMode } {
  const sources = blocks.map((b) => b.mapInfo?.source ?? null);
  if (sources.some((s) => s == null)) return { hero: null, mode: "full" };

  const present = sources as string[];
  // Identical down to the bill number: one line in the hero says everything.
  if (present.every((s) => s === present[0])) return { hero: present[0], mode: "none" };

  // Same body, different instruments: the body heads the hero, each bill sits with its chamber.
  const bodies = present.map((s) => splitSource(s).body);
  if (bodies.every((b) => b === bodies[0])) return { hero: bodies[0], mode: "cite" };

  // Genuinely different authorities (New York's Senate map came from a court-appointed special
  // master, its Assembly map from the legislature) — the hero can't speak for both.
  return { hero: null, mode: "full" };
}

// The whole authority story on one line: the body that drew the maps and, where the two chambers
// were enacted separately, each chamber's instrument.
//
// NOT RENDERED ANYWHERE — the line was deliberately taken off the legislature page. This is kept
// (with splitSource/resolveAuthority above it) because `source` is still carried per chamber in
// data/stateLegMapInfo.ts and this is the resolved reading of it, so putting the line back is a
// matter of calling this rather than re-deriving how two chambers' authorities combine.
export function authorityText(blocks: ChamberAboutData[]): string | null {
  if (blocks.every((b) => !b.mapInfo?.source)) return null;

  const { hero, mode } = resolveAuthority(blocks);
  if (mode === "none") return hero;

  if (mode === "cite") {
    const parts = blocks.map((b) => {
      const src = b.mapInfo?.source;
      return `${b.label} ${src ? splitSource(src).cite ?? src : "TBD"}`;
    });
    return `${hero} · ${parts.join(" · ")}`;
  }

  return blocks.map((b) => `${b.label}: ${b.mapInfo?.source ?? "TBD"}`).join(" · ");
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-lg font-extrabold tabular-nums leading-tight" style={{ color: "var(--app-text-primary)" }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: "var(--app-text-very-muted)" }}>
        {label}
      </div>
    </div>
  );
}

// One labelled sentence — "ELECTIONS  All 118 seats every 2 years". The frequency strings run
// long (Illinois' Senate is 117 characters), so they get their own full-width line rather than
// a grid column that would wrap them to three lines.
function FactLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs" style={{ color: "var(--app-text-muted)" }}>
      <span className="text-[10px] uppercase tracking-wider font-semibold mr-2" style={{ color: "var(--app-text-very-muted)" }}>
        {label}
      </span>
      {value}
    </div>
  );
}

export type MajorityStatus = { text: string; color: string | null };

// Which threshold the larger caucus has cleared. Says in a word what the bar shows in space, and
// labels a seat split the same way wherever one is shown — the chamber band here, and the history
// cards in StateLegCompositionBox.
export function majorityStatus(
  dem: number,
  rep: number,
  majority: number,
  supermajority: number | null,
): MajorityStatus {
  // An even split is its own outcome, not a failed majority for whichever party reads first.
  if (dem === rep) return { text: "Tie", color: null };

  const leadIsD = dem > rep;
  const party = leadIsD ? "D" : "R";
  const color = leadIsD ? "var(--party-dem)" : "var(--party-rep)";
  const held = Math.max(dem, rep);

  if (supermajority != null && held >= supermajority) return { text: `${party} Supermajority`, color };
  if (held >= majority) return { text: `${party} Majority`, color };
  // Third-party, independent or vacant seats can leave the largest caucus short of the threshold.
  return { text: "No majority", color: null };
}

export function MajorityPill({ status, className = "" }: { status: MajorityStatus; className?: string }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}
      style={{
        color: status.color ?? "var(--app-text-muted)",
        background: status.color ? `color-mix(in srgb, ${status.color} 14%, transparent)` : "var(--app-tab-bg)",
      }}
    >
      {status.text}
    </span>
  );
}

// Seat bar with the majority and supermajority marks drawn on it, so the thresholds read as the
// scale the split is measured on rather than as two loose numbers. Democrats fill from the left,
// Republicans from the right; the gap between them is vacant/independent seats.
//
// The marks are counted from the leading party's own end of the bar, so the caucus that could
// actually cross them grows toward them: in a Democratic chamber they sit N seats from the left,
// in a Republican one N seats from the right. Measuring both from the left would put the marks
// behind a Republican majority's back, where clearing them looks like nothing.
function ThresholdBar({
  seats,
  totalSeats,
  majority,
  supermajority,
}: {
  seats: ChamberSeats;
  totalSeats: number;
  majority: number;
  supermajority: number | null;
}) {
  // Composition history can disagree with the verified chamber size; widen the denominator so the
  // segments never overflow the track and the marks stay on the same scale as the segments.
  const denom = Math.max(totalSeats, seats.dem + seats.rep);
  const width = (n: number) => `${((n / denom) * 100).toFixed(2)}%`;

  const fromRight = seats.rep > seats.dem;
  // Where a mark N seats into the leading caucus falls, as a distance from the bar's left edge.
  const mark = (n: number) => `${((fromRight ? 1 - n / denom : n / denom) * 100).toFixed(2)}%`;

  // Each label hangs off the side of its tick that keeps it clear of the other one: majority
  // toward the leading party's end, supermajority away from it.
  const label = (value: number, text: string, hangLeft: boolean) => (
    <span
      className="absolute top-0 text-[9.5px] font-semibold uppercase tracking-wider whitespace-nowrap"
      style={{
        left: mark(value),
        color: "var(--app-text-muted)",
        ...(hangLeft ? { transform: "translateX(-100%)", paddingRight: "6px" } : { paddingLeft: "6px" }),
      }}
    >
      {value} {text}
    </span>
  );

  return (
    <div className="relative mt-4 pt-4">
      {label(majority, "Majority", !fromRight)}
      {supermajority != null && label(supermajority, "Supermajority", fromRight)}

      <div className="relative flex h-3 overflow-hidden" style={{ borderRadius: "2px", background: "var(--app-tab-bg)" }}>
        <div style={{ width: width(seats.dem), background: "var(--party-dem)" }} />
        <div style={{ width: width(seats.rep), background: "var(--party-rep)", marginLeft: "auto" }} />
        <span className="absolute inset-y-0 w-px" style={{ left: mark(majority), background: "var(--app-text-primary)", opacity: 0.75 }} />
        {supermajority != null && (
          <span className="absolute inset-y-0 w-px" style={{ left: mark(supermajority), background: "var(--app-text-primary)", opacity: 0.45 }} />
        )}
      </div>
    </div>
  );
}

function ChamberPanel({ block }: { block: ChamberAboutData }) {
  const { label, mapInfo, totalSeats, seats } = block;
  const majority = totalSeats != null ? Math.floor(totalSeats / 2) + 1 : null;
  const supermajority = mapInfo?.supermajoritySeats ?? null;
  // The bar can only be drawn against a known chamber size; without one the thresholds fall back
  // to plain numerals so nothing is lost.
  const showBar = seats != null && totalSeats != null && majority != null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
          {label}
          {totalSeats != null && ` · ${totalSeats} seats`}
        </h3>
        {/* Reference detail, so it rides the chamber's own head line rather than taking a row of
            its own under the bar — the band is tall enough already. */}
        <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
          <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
            Current map
          </span>
          {mapInfo?.firstCycle ?? "TBD"}
        </span>
      </div>

      {seats && majority != null && (
        <div className="mt-2.5 flex items-baseline gap-3 flex-wrap">
          <div
            className="tabular-nums"
            style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.6rem, 3.2vw, 2.35rem)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.01em" }}
          >
            <span style={{ color: "var(--party-dem)" }}>{seats.dem}D</span>
            <span style={{ color: "var(--app-text-very-muted)", fontWeight: 400 }}>–</span>
            <span style={{ color: "var(--party-rep)" }}>{seats.rep}R</span>
          </div>
          <MajorityPill status={majorityStatus(seats.dem, seats.rep, majority, supermajority)} />
        </div>
      )}

      {showBar && (
        <ThresholdBar seats={seats} totalSeats={totalSeats} majority={majority} supermajority={supermajority} />
      )}

      {/* Without a bar to carry them, the thresholds fall back to plain numerals. */}
      {!showBar && (
        <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
          <StatCell value={majority != null ? String(majority) : "TBD"} label="Majority" />
          <StatCell value={supermajority != null ? String(supermajority) : "TBD"} label="Supermajority" />
        </div>
      )}

      <div className="mt-4">
        <FactLine label="Elections" value={mapInfo?.electionFrequency ?? "TBD"} />
      </div>
    </div>
  );
}

// The legislature page's chamber band: one panel per chamber, split by a hairline, each headed by
// its seat split in the display serif the way the state overview banner heads with its TPL figure.
// "Current Map Enacted" is deliberately omitted — the first cycle run under the map is the figure
// that matters for reading the district results below it.
export default function StateLegAboutSection({ blocks }: { blocks: ChamberAboutData[] }) {
  return (
    <div className={blocks.length > 1 ? "grid gap-y-8 md:grid-cols-2" : ""}>
      {blocks.map((block, i) => (
        <div
          key={block.label}
          className={i === 0 ? "md:pr-10" : "md:pl-10 md:border-l"}
          style={{ borderColor: "var(--app-border)" }}
        >
          <ChamberPanel block={block} />
        </div>
      ))}
    </div>
  );
}

import Link from "next/link";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { FlipSwatch, flipBackground } from "@/components/FlipStripes";
import YearMap from "@/components/years/YearMap";
import { callSideColor, fmtCall, fmtInt } from "@/lib/resultsFormat";
import type { Tally, YearFlip, YearOfficeSummary } from "@/lib/yearPageTypes";

// The Years page's office sections: one summary per office on the ballot (lib/yearPage.ts builds
// them). Flat sections on the page background. The National Environment above them is YearEnvironment.tsx.

const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };
const serif = { fontFamily: "var(--font-serif)" };
const LABEL = "text-[11px] font-bold uppercase tracking-wider";

const signed = (n: number) => (n === 0 ? "±0" : `${n > 0 ? "+" : "−"}${fmtInt(Math.abs(n))}`);

const Margin = ({ value }: { value: number | null }) => <span className="tabular-nums" style={{ ...serif, fontWeight: 700, color: value == null ? "var(--app-text-very-muted)" : callSideColor(value) }}>{fmtCall(value)}</span>;

// ── Seat composition ─────────────────────────────────────────────────────────

/** One bar for the seats after the election: each party's solid run from its end, and the seats
 *  it gained since `before` striped at its inner edge with the gain written inside. */
function Strip({ after, before, total, open, majority }: { after: Tally; before: Tally | null; total: number; open: number; majority: number | null }) {
  const pct = (n: number) => (Math.max(0, n) / total) * 100;
  const gainD = before ? Math.max(0, after.dem - before.dem) : 0, gainR = before ? Math.max(0, after.rep - before.rep) : 0;
  const rest = Math.max(0, total - after.dem - after.rep - after.oth);
  const stripes = flipBackground("linear-gradient(transparent, transparent)", 2, "rgba(255,255,255,0.4)");
  const gain = (n: number, color: string, name: string) => n > 0 && (
    <div className="rc-progress grid place-items-center overflow-hidden text-[11px] font-bold leading-none text-white tabular-nums" title={`${name} gained ${fmtInt(n)}`} style={{ width: `${pct(n)}%`, backgroundColor: color, backgroundImage: stripes }}>
      {pct(n) >= 5.5 && <span style={{ textShadow: "0 0 3px rgba(0,0,0,0.55)" }}>+{fmtInt(n)}</span>}
    </div>
  );
  return (
    <div className="relative flex h-6 overflow-hidden rounded-[3px]">
      <div className="rc-progress" style={{ width: `${pct(after.dem - gainD)}%`, background: "var(--party-dem-fill)" }} />
      {gain(gainD, "var(--party-dem-fill)", "Democrats")}
      <div className="rc-progress" style={{ width: `${pct(after.oth)}%`, background: "var(--party-ind-fill)" }} />
      <div className="rc-progress" title={open > 0 ? undefined : rest > 0 ? "Vacant" : undefined} style={{ width: `${pct(rest)}%`, background: "var(--app-tab-bg)" }} />
      {gain(gainR, "var(--party-rep-fill)", "Republicans")}
      <div className="rc-progress" style={{ width: `${pct(after.rep - gainR)}%`, background: "var(--party-rep-fill)" }} />
      {majority != null && <div className="absolute inset-y-0 w-0.5 -translate-x-1/2" style={{ left: "50%", background: "var(--app-bg)" }} />}
    </div>
  );
}

function PartyCount({ name, now, was, wasLabel, color, align }: { name: string; now: number; was: number | null; /** "before", or "in 2016". */ wasLabel: string; color: string; align: "left" | "right" }) {
  const change = was == null ? null : now - was;
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <div className="leading-none tabular-nums" style={{ ...serif, fontWeight: 700, fontSize: 34, color }}>{fmtInt(now)}</div>
      <div className="mt-1 text-xs font-semibold" style={{ color }}>{name}</div>
      {was != null && change != null && (
        <div className="text-xs tabular-nums" style={muted}>{fmtInt(was)} {wasLabel} · <b style={{ color: change === 0 ? undefined : color }}>{signed(change)}</b></div>
      )}
    </div>
  );
}

function SeatChange({ o }: { o: YearOfficeSummary }) {
  const wasLabel = o.beforeLabel === "Before" ? "before" : `in ${o.beforeLabel}`;
  return (
    <div>
      <div className={LABEL} style={muted}>{o.unit}</div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <PartyCount name="Democrats" now={o.after.dem} was={o.before?.dem ?? null} wasLabel={wasLabel} color="var(--party-dem)" align="left" />
        <PartyCount name="Republicans" now={o.after.rep} was={o.before?.rep ?? null} wasLabel={wasLabel} color="var(--party-rep)" align="right" />
      </div>
      <div className="mt-3" role="img" aria-label={`${o.title} ${o.unit}: ${o.after.dem} Democratic, ${o.after.rep} Republican${o.before ? `; ${o.before.dem} and ${o.before.rep} ${wasLabel}` : ""}`}>
        <Strip after={o.after} before={o.before} total={o.total} open={o.open} majority={o.majority} />
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[11px] tabular-nums" style={veryMuted}>
        <span className="inline-flex items-center gap-1.5">{o.before && (o.after.dem > o.before.dem || o.after.rep > o.before.rep) && <><FlipSwatch size={10} />Gained {o.beforeLabel === "Before" ? "in the election" : `since ${o.beforeLabel}`}</>}</span>
        {o.majority != null && <span>{fmtInt(o.majority)} {o.key === "president" ? "to win" : "for a majority"}</span>}
      </div>
      {(o.after.oth > 0 || o.open > 0) && (
        <div className="mt-1 text-[11px] tabular-nums" style={muted}>
          {o.after.oth > 0 && <>{fmtInt(o.after.oth)} {o.key === "legislature" ? "tied or run by a coalition" : "other"}{o.before && o.before.oth !== o.after.oth ? ` (${fmtInt(o.before.oth)} before)` : ""}</>}
          {o.after.oth > 0 && o.open > 0 && " · "}
          {o.open > 0 && <>{fmtInt(o.open)} {o.map.legend.find((l) => l.cls === "open")?.label.toLowerCase() ?? "not called"}</>}
        </div>
      )}
      {o.second && (
        <div className="mt-3 pt-3 text-xs tabular-nums" style={{ borderTop: "1px solid var(--app-border)" }}>
          <div className={LABEL} style={muted}>{o.second.unit}</div>
          {([["dem", "Democrats", "var(--party-dem)"], ["rep", "Republicans", "var(--party-rep)"]] as const).map(([k, name, color]) => {
            const now = o.second!.after[k], was = o.second!.before?.[k] ?? null;
            return (
              <div key={k} className="mt-1 flex items-baseline justify-between gap-2">
                <span className="font-semibold" style={{ color }}>{name}</span>
                <span style={muted}>{was != null && <>{fmtInt(was)} → </>}<b style={{ color: "var(--app-text-primary)" }}>{fmtInt(now)}</b>{was != null && <b className="ml-1.5" style={{ color }}>{signed(now - was)}</b>}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Flips ────────────────────────────────────────────────────────────────────

const FLIP_GROUPS: { to: YearFlip["to"]; name: string; color: string }[] = [
  { to: "D", name: "To Democrats", color: "var(--party-dem)" }, { to: "R", name: "To Republicans", color: "var(--party-rep)" },
  { to: "I", name: "To independents", color: "var(--party-ind)" }, { to: null, name: "To a tie or coalition", color: "var(--app-text-muted)" },
];

function Flips({ o }: { o: YearOfficeSummary }) {
  if (!o.flips.length) return null;
  return (
    <div className="mt-5">
      <div className="flex items-baseline gap-2">
        <span className={LABEL} style={muted}>{o.flipsLabel}</span>
        <span className="text-xs tabular-nums" style={veryMuted}>{o.flips.length}</span>
      </div>
      {FLIP_GROUPS.map((g) => {
        const list = o.flips.filter((f) => f.to === g.to);
        if (!list.length) return null;
        return (
          <div key={g.name} className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold tabular-nums" style={{ color: g.color }}>{g.name} · {list.length}</span>
            {list.map((f) => {
              const cls = "rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums";
              const style = { background: `color-mix(in srgb, ${g.color} 13%, var(--app-bg))`, color: g.color };
              return f.href
                ? <Link key={f.label} prefetch={false} href={f.href} title={f.name ?? undefined} className={`${cls} hover:underline`} style={style}>{f.label}</Link>
                : <span key={f.label} title={f.name ?? undefined} className={cls} style={style}>{f.label}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── One office ───────────────────────────────────────────────────────────────

export function YearOfficeSection({ o, year }: { o: YearOfficeSummary; year: number }) {
  return (
    <section id={o.key} className="mt-12 scroll-mt-24">
      <LedgerSectionHead label={o.title} meta={o.meta}
        right={o.more && <Link prefetch={false} href={o.more.href} className="text-xs font-semibold hover:underline" style={muted}>{o.more.label} →</Link>} />
      <p className="max-w-3xl text-xl font-bold leading-snug sm:text-2xl" style={serif}>{o.headline}</p>
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1fr)_250px]">
        <div className="md:order-last">
          <SeatChange o={o} />
          {(o.vote.raw != null || o.vote.adjusted != null) && (
            <div className="mt-4 pt-3 text-xs" style={{ borderTop: "1px solid var(--app-border)" }}>
              <div className={LABEL} style={muted}>Popular vote</div>
              <div className="mt-1 flex items-baseline justify-between"><span style={muted}>As cast</span><span className="text-lg leading-none"><Margin value={o.vote.raw} /></span></div>
              <div className="mt-0.5 flex items-baseline justify-between"><span style={muted}>Adjusted</span><span className="text-lg leading-none"><Margin value={o.vote.adjusted} /></span></div>
            </div>
          )}
        </div>
        <YearMap map={o.map} label={`${year} ${o.title} map: ${o.headline}`} />
      </div>
      <Flips o={o} />
      {o.notes.length > 0 && <p className="mt-3 max-w-3xl text-[11px] leading-relaxed" style={veryMuted}>{o.notes.join(" ")}</p>}
    </section>
  );
}

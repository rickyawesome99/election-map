"use client";

import Link from "next/link";
import { LedgerSectionHead, LedgerSubhead } from "@/components/LedgerSectionHead";
import { tiltCard, untiltCard } from "@/components/post-election/StateRaceCards";
import { callSideColor, fmtCall } from "@/lib/resultsFormat";
import type { YearEnvironment } from "@/lib/yearPageTypes";

// The Years page's National Environment: three headline cards, then a card per office with its
// popular vote as cast and adjusted and its weight in the blend. Each is a neutral card on
// the light panel with its figures in the colour of the party ahead; the motion is the Overview's race cards' (globals.css rc-*): the cards rise in staggered when the year changes, a figure rolls in
// when it changes, and a card tilts toward the pointer (a finger's tilt comes from the state
// boxes' useTouchHover, registered once for the page).

const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };
const LABEL = "text-[10px] font-bold uppercase tracking-wider";
const SMALL = "text-[10px] font-semibold uppercase tracking-[0.06em]";
const serif = { fontFamily: "var(--font-serif)", fontWeight: 700 } as const;
const APPROVE = "var(--count-done, #22c55e)", DISAPPROVE = "#ef4444";

const tilt = {
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => { if (e.pointerType === "mouse") tiltCard(e.currentTarget, e.clientX, e.clientY); },
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => { if (e.pointerType === "mouse") untiltCard(e.currentTarget); },
};

/** A neutral card on the light panel; its figures carry the party colour. */
function Card({ index, children, title }: { index: number; children: React.ReactNode; title?: string }) {
  return (
    <div {...tilt} data-touch-hover="" title={title} className="rc-card h-full px-3 py-2" style={{ animationDelay: `${index * 45}ms`, borderRadius: 6, background: "var(--app-tab-bg)" }}>
      {children}
    </div>
  );
}

/** A figure that rolls in whenever its text changes. */
function Figure({ text, color, size }: { text: string; color?: string; size: string | number }) {
  return (
    // Line height 1.2: the serif's old-style 3, 4, 5 and 9 hang below the baseline, and the box clips for the roll.
    <div className="overflow-hidden whitespace-nowrap tabular-nums" style={{ ...serif, fontSize: size, lineHeight: 1.2 }}>
      <span key={text} className="rc-tick" style={{ color }}>{text}</span>
    </div>
  );
}

const marginColor = (v: number | null) => (v == null ? "var(--app-text-very-muted)" : callSideColor(v));

export default function YearEnvironmentSection({ year, env }: { year: number; env: YearEnvironment }) {
  const p = env.president;
  const net = p ? p.approve - p.disapprove : null;
  const big = "clamp(22px, 4.2vw, 28px)";
  const n = env.offices.length;
  return (
    <section id="environment" className="scroll-mt-24">
      <LedgerSectionHead label="National Environment" meta={String(year)} />
      {/* Keyed on the year: a switch replays the cards' rise. */}
      <div key={year} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Card index={0} title="Each office's adjusted vote, weighted by the shares below">
          <div className={LABEL} style={muted}>Blended national vote</div>
          <div className="mt-1"><Figure text={fmtCall(env.blended)} color={marginColor(env.blended)} size={big} /></div>
        </Card>
        <Card index={1} title={`The national swing the TPL model takes out of ${year}'s results`}>
          <div className={LABEL} style={muted}>TPL environment</div>
          <div className="mt-1"><Figure text={fmtCall(env.env)} color={marginColor(env.env)} size={big} /></div>
        </Card>
        {p && net != null && (
          <div className="col-span-2 sm:col-span-1">
            <Card index={2} title={`President ${p.name} (${p.party}) on election day`}>
              <div className={LABEL} style={muted}>{p.name} approval</div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <Figure text={`${net > 0 ? "+" : net < 0 ? "−" : ""}${Math.abs(net).toFixed(1)}`} color={net >= 0 ? APPROVE : DISAPPROVE} size={big} />
                <div className="whitespace-nowrap text-right text-[11px] font-semibold leading-tight tabular-nums">
                  <div style={{ color: APPROVE }}>{p.approve.toFixed(1)}% approve</div>
                  <div style={{ color: DISAPPROVE }}>{p.disapprove.toFixed(1)}% disapprove</div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      <LedgerSubhead label="Popular vote by office" top="mt-4" />
      {/* As many columns as offices from lg up (from sm up with four or fewer), so a midterm's four cards fill one row. */}
      <div key={`offices-${year}`} className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(var(--m),minmax(0,1fr))] lg:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ "--n": n, "--m": n <= 4 ? n : 3 } as React.CSSProperties}>
        {env.offices.map((o, i) => {
          // The vote as cast leads; the adjusted figure sits under it a step smaller.
          const row = (label: string, v: number | null, size: number) => (
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className={SMALL} style={muted}>{label}</span>
              <Figure text={fmtCall(v)} color={marginColor(v)} size={size} />
            </div>
          );
          return (
            <Card key={o.key} index={3 + i} title={o.states != null ? `Adjusted across ${o.states} state${o.states === 1 ? "" : "s"}` : undefined}>
              <div className="truncate text-sm font-semibold">{o.label}</div>
              {row("As cast", o.raw, 21)}
              {row("Adjusted", o.adjusted, 15)}
              {o.share != null && <div className="mt-1 whitespace-nowrap text-[10.5px] font-semibold tabular-nums" style={veryMuted} title={`${Math.round(o.share * 100)}% of the blended national vote`}>{Math.round(o.share * 100)}% of blend</div>}
            </Card>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed" style={veryMuted}>
        Adjusted is the <Link prefetch={false} href="/model#national" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">TPL model&rsquo;s</Link> reading of each vote; the blend weighs the adjusted figures.
      </p>
    </section>
  );
}

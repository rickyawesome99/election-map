import Link from "next/link";
import type { ReactNode } from "react";
import { fmtLean, formatProjectedMargin, leanColor, projectedMarginColor } from "@/lib/colorScale";
import { candidatePageHref } from "@/lib/candidatePages";
import { PAGE_CONTAINER } from "@/lib/pageLayout";

/**
 * The header of a race page (House, Senate, Governor). Pill row with the race switcher at its
 * right end (under the title on a phone); the title; under it, the matchup and one small line of
 * the model's checks — projected margin, polling average, markets. House pages add the district
 * locator map at the far end of the title line. The projected margin also tints the header's
 * background.
 */

export type HeroCandidate = { name: string; party: string };

/** The leader's win chance, rounded the way the Forecast Calculation card rounds it (">99%" from 99.5%). */
export function winChanceLabel(probabilityD: number): { text: string; party: "D" | "R" } {
  const d = probabilityD >= 0.5;
  const p = d ? probabilityD : 1 - probabilityD;
  return { text: `${p >= 0.995 ? ">99" : Math.round(p * 100)}% ${d ? "D" : "R"}`, party: d ? "D" : "R" };
}

// The title's size: House titles ("OK-05") get the full size. A statewide title ("New Hampshire
// U.S. Senate") is sized to its length so it fills at most the content column on one line —
// short ones stay near the full size, long ones shrink, and only on a phone (2rem floor) does
// one wrap. emPerChar is the office's widest title's Georgia-bold width per character, with a
// little slack (Senate titles measure ≤ 0.56, "New Hampshire Governor" 0.60). The column is the
// page container's 896px less its 24px side padding, minus any seat arrows.
const TITLE_MAX = "clamp(2.25rem, 6.5vw, 4.75rem)";
export function titleSize(fit?: { chars: number; emPerChar: number; reservePx: number }): string {
  if (!fit) return TITLE_MAX;
  return `clamp(2rem, min(6.5vw, calc((min(100vw, 896px) - ${48 + fit.reservePx}px) / ${(fit.chars * fit.emPerChar).toFixed(1)})), 4.75rem)`;
}

const partyColor = (p: "D" | "R") => (p === "D" ? "var(--party-dem)" : "var(--party-rep)");

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      {label} {children}
    </span>
  );
}

export default function RaceHero({
  pills, nav, map, title, fitTitle, candidates, state, fallbackSub, projectedMargin, pollMargin, pollsters, marketDemProb, mapBesideTitle,
}: {
  pills: ReactNode;
  nav?: ReactNode;
  /** The locator map; House only (Senate and Governor headers go without). */
  map?: ReactNode;
  title: ReactNode;
  /** Size a long statewide title to fit one line: its character count, the office's width per character, and the px of any controls set inside it (seat arrows). */
  fitTitle?: { chars: number; emPerChar: number; reservePx: number };
  /** Dem-slot and Rep-slot nominees; null when not set yet (fallbackSub shows instead). */
  candidates: [HeroCandidate, HeroCandidate] | null;
  state: string;
  fallbackSub: string;
  projectedMargin: number;
  pollMargin: number | null;
  pollsters: number | null;
  marketDemProb: number | null;
  /** Put the map at the right end of the title line (short House titles) instead of beside the matchup. */
  mapBesideTitle?: boolean;
}) {
  const mkt = marketDemProb == null ? null : winChanceLabel(marketDemProb);
  const b = (color: string, text: string) => <b className="font-bold tabular-nums" style={{ color }}>{text}</b>;
  return (
    <div
      style={{
        background: `linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(135deg, color-mix(in srgb, ${projectedMarginColor(projectedMargin)} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
      }}
    >
      <div className={`${PAGE_CONTAINER} pt-6 pb-8`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 flex-wrap">{pills}</div>
          {nav && <div className="hidden sm:block">{nav}</div>}
        </div>

        {/* House: the map at the right, its top on the title's cap line; the title and the matchup under it stay together on the left. */}
        <div className={mapBesideTitle ? "mt-2 flex items-start justify-between gap-4" : "mt-2"}>
        <div className="min-w-0">
        <h1
          className="min-w-0"
          style={{ fontFamily: "var(--font-serif)", fontSize: titleSize(fitTitle), fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance", color: "var(--app-text-primary)" }}
        >
          {title}
        </h1>
        {/* On a phone the switcher sits under the title instead of wrapping under the pills. */}
        {nav && <div className="mt-3 sm:hidden">{nav}</div>}

        {/* Under the title: the locator map, with the matchup and the model's checks beside it. The
            projected margin itself leads the Forecast Calculation section below. */}
        <div className="mt-4 flex items-center gap-4 sm:gap-5">
          {map && !mapBesideTitle && <div className="w-16 sm:w-24 shrink-0">{map}</div>}
          <div className="min-w-0">
            <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>
              {candidates ? (
                <>
                  {candidates.map((c, i) => {
                    const href = candidatePageHref(c.name, state);
                    const name = <span style={{ color: "var(--app-text-primary)" }}>{c.name}</span>;
                    return (
                      <span key={c.name}>
                        {i > 0 && " vs. "}
                        {href ? <Link prefetch={false} href={href} className="hover:underline">{name}</Link> : name} ({c.party})
                      </span>
                    );
                  })}
                </>
              ) : fallbackSub}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              <Stat label="Proj. margin">{b(projectedMarginColor(projectedMargin), formatProjectedMargin(projectedMargin))}</Stat>
              <Stat label="Polling avg.">
                {pollMargin == null ? b("var(--app-text-very-muted)", "—") : b(leanColor(pollMargin), fmtLean(pollMargin))}
                {pollsters ? ` · ${pollsters} pollster${pollsters === 1 ? "" : "s"}` : ""}
              </Stat>
              <Stat label="Markets">{mkt ? b(partyColor(mkt.party), mkt.text) : b("var(--app-text-very-muted)", "—")}</Stat>
            </div>
          </div>
        </div>
        </div>
        {map && mapBesideTitle && <div className="w-28 sm:w-44 shrink-0" style={{ marginTop: `calc(${TITLE_MAX} * 0.15)` }}>{map}</div>}
        </div>
      </div>
    </div>
  );
}

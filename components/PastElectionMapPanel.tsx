"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import LineTabs from "@/components/LineTabs";
import PastElectionCountyMap, { bubbleColor, type CountyMapEntry } from "@/components/PastElectionCountyMap";
import HouseDistrictCountyMap from "@/components/HouseDistrictCountyMap";
import { fmtLean, fmtMargin, getRaceColor, leanColor, marginColor } from "@/lib/colorScale";
import { countyDisplayName } from "@/lib/countyName";
import { countyHref } from "@/lib/countyHref";
import { lastName } from "@/lib/personName";

// The past-election page's county map with its three views, switched by the tabs under it:
//   Results  each county filled by its margin.
//   Bubbles  a circle per county over plain land, its area the county's net vote lead (as /enight's
//            Remaining view draws votes left).
//   Swing    each county's margin less its margin the last time THIS seat was up (not the last
//            presidential race), filled on the same rating scale.
// The tabs sit over the map; a clicked county shows as one line under it instead of a panel, so the
// map never shrinks and nothing moves; on desktop the hover card still follows the pointer.
// With `race` (the 2026 race pages) the map is full width at a set height and keeps its own
// click panel, which, like the hover card, shows the chosen view's figure; on a phone a tap pins
// the hover card itself instead (components/maps/PinnedMapCard).

type Party = "D" | "R" | "I";
type Side = { name: string; party: Party };
type View = "results" | "bubbles" | "swing";

export type PastMapCounty = {
  fips: string;
  name: string;
  result: { demVotes: number; repVotes: number; totalVotes: number; demPct: number; repPct: number; margin: number };
  /** R-positive margin the last time this seat was up, in this county; null when not on file. */
  prevMargin: number | null;
};

type Props = {
  stateAbbr: string;
  stateName: string;
  dem: Side;
  rep: Side;
  counties: PastMapCounty[];
  /** The seat's previous election: the Swing view's baseline. Null leaves the view out. */
  previous: { year: number; isSpecial: boolean } | null;
  house: { piecesUrl: string; district: number; label: string; linesChanged: boolean } | null;
  /** Uncontested or same-party: no two-party margin to swing. */
  noSwing: boolean;
  areaSingular: string;
  areaPlural: string;
  /** The race-page layout: the line under the map (source, as-of) and the map's height. */
  race?: { footnote: ReactNode; height: number };
};

const SWATCH_MARGINS = [-20, -10, -3, -0.5, 0.5, 3, 10, 20];
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
// A county's own margin at ±100 is an uncontested race there: no swing to speak of.
const contested = (m: number | null): m is number => m != null && Math.abs(m) < 99.9;

export default function PastElectionMapPanel({ stateAbbr, stateName, dem, rep, counties, previous, house, noSwing, areaSingular, areaPlural, race }: Props) {
  const [view, setView] = useState<View>("results");
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ fips: string | null; name: string; n: number } | null>(null);
  const onSelectedChange = useCallback((fips: string | null) => setSelected(fips), []);
  const clear = () => { setSelected(null); setFocus((f) => ({ fips: null, name: "", n: (f?.n ?? 0) + 1 })); };

  const swingOf = (c: PastMapCounty) => (contested(c.result.margin) && contested(c.prevMargin) ? c.result.margin - c.prevMargin : null);
  const canSwing = !!previous && !noSwing && counties.some((c) => swingOf(c) != null);
  const shown: View = view === "swing" && !canSwing ? "results" : view;
  const prevLabel = previous ? `${previous.year}${previous.isSpecial ? " special" : ""}` : "";

  const entries = useMemo((): CountyMapEntry[] => counties.flatMap((c) => {
    if (shown === "swing") {
      const s = swingOf(c);
      if (s == null) return [];
      return [{ fips: c.fips, name: c.name, result: { ...c.result, margin: s, figure: { label: `Swing vs ${prevLabel}`, value: fmtLean(s), color: leanColor(s) } } }];
    }
    return [{ fips: c.fips, name: c.name, result: shown === "bubbles" ? { ...c.result, net: c.result.repVotes - c.result.demVotes } : c.result }];
  }), [counties, shown, prevLabel]);

  const maxNet = useMemo(() => Math.max(0, ...counties.map((c) => Math.abs(c.result.repVotes - c.result.demVotes))), [counties]);
  const sel = selected ? counties.find((c) => c.fips === selected) ?? null : null;
  const muted = { color: "var(--app-text-muted)" };
  const veryMuted = { color: "var(--app-text-very-muted)" };

  const tabs: View[] = canSwing ? ["results", "bubbles", "swing"] : ["results", "bubbles"];
  const key = shown === "bubbles" ? (
    <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] tabular-nums" style={muted}>
      <span className="flex items-center gap-1" aria-hidden="true">
        <i className="block h-2 w-2 rounded-full" style={{ background: bubbleColor(-1, dem.party, rep.party), opacity: 0.72 }} />
        <i className="block h-3 w-3 rounded-full" style={{ background: bubbleColor(1, dem.party, rep.party), opacity: 0.72 }} />
      </span>
      Largest {fmtInt(maxNet)}
    </span>
  ) : (
    <span className="flex shrink-0 items-center gap-px" aria-hidden="true">
      {SWATCH_MARGINS.map((m) => <i key={m} className="block h-2 w-3.5" style={{ background: getRaceColor(m) }} />)}
    </span>
  );

  const note = shown === "bubbles"
    ? `Circle area is each ${areaSingular}'s net vote lead.`
    : shown === "swing"
      ? `Each ${areaSingular}'s margin minus its margin in ${prevLabel}, the last time this seat was up${house?.linesChanged ? " (on the old lines)" : ""}.`
      : "";

  // The selected county, one line: name, the view's figure, its votes, its page.
  const readout = sel && (() => {
    const lead = sel.result.repVotes - sel.result.demVotes;
    const s = swingOf(sel);
    const winner = lead > 0 ? rep : dem;
    const serif = (color: string) => ({ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.5rem", lineHeight: 1.1, color });
    // Line one: the county's name, its page and the close; line two: the view's figures, serif.
    return (
      <div className="min-w-0 flex-1 tabular-nums">
        <div className="flex min-w-0 items-baseline gap-3">
          <span title={countyDisplayName(sel.fips, sel.name)} className="min-w-0 truncate text-[14px] font-semibold" style={{ color: "var(--app-text-primary)" }}>{countyDisplayName(sel.fips, sel.name)}</span>
          <span className="ml-auto flex shrink-0 items-baseline gap-3 text-[12px]">
            <Link prefetch={false} href={countyHref(sel.fips)} className="font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>{areaSingular[0].toUpperCase() + areaSingular.slice(1)} page →</Link>
            <button type="button" onClick={clear} aria-label="Clear selection" className="text-[15px] leading-none hover:text-[var(--app-text-primary)]" style={muted}>×</button>
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          {shown === "swing" ? (
            <>
              <span className="whitespace-nowrap" style={serif(leanColor(s))}>{s != null ? fmtLean(s) : "No swing"}</span>
              <span className="whitespace-nowrap text-[13px]" style={muted}>{s != null ? `swing since ${prevLabel} · ` : ""}{fmtMargin(sel.prevMargin)} → {fmtMargin(sel.result.margin)}</span>
            </>
          ) : (
            <>
              {/* Results leads with the margin, Bubbles with the net votes the circle stands for. */}
              {shown === "bubbles" ? (
                <>
                  <span className="whitespace-nowrap" style={serif(lead !== 0 ? marginColor(lead) : "var(--app-text-primary)")}>{lead !== 0 ? `${lastName(winner.name)} +${fmtInt(Math.abs(lead))}` : "Tied"}</span>
                  <span className="whitespace-nowrap text-[13px]" style={muted}>net votes of {fmtInt(sel.result.totalVotes)} cast</span>
                </>
              ) : (
                <>
                  <span className="whitespace-nowrap" style={serif(marginColor(sel.result.margin))}>{fmtMargin(sel.result.margin)}</span>
                  <span className="whitespace-nowrap text-[13px]" style={muted}>{fmtInt(sel.result.totalVotes)} votes</span>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  })();

  // Tabs and key on one row, then a line that is the view's note or the selected county; both
  // lines keep their height, so nothing below moves as views or selections change.
  // Over the map: the view tabs and the colour key. Under it: one line that is the view's note
  // or the selected county, which keeps its height so nothing below moves.
  const tabRow = (
    <div className="mb-2 flex items-center justify-between gap-3">
      <LineTabs label={`Map of ${areaPlural}`} options={tabs.map((v) => [v, v === "results" ? "Results" : v === "bubbles" ? "Bubbles" : "Swing"])} value={shown} onChange={setView} />
      {key}
    </div>
  );
  const strip = (
    <div className="mt-1.5 flex min-h-[84px] items-start pt-2">
      {readout ?? (note && <p className="text-[11px]" style={veryMuted}>{note}</p>)}
    </div>
  );

  if (race) {
    const raceCommon = { counties: entries, demName: dem.name, repName: rep.name, demParty: dem.party, repParty: rep.party, height: race.height, panelSize: "wide" as const, pinTaps: "phone" as const, bubbles: shown === "bubbles",
      caption: <div className="px-1">{note && <p className="mt-2 text-[11px]" style={veryMuted}>{note}</p>}{race.footnote}</div> };
    return (
      <div>
        {tabRow}
        {house ? (
          <HouseDistrictCountyMap {...raceCommon} stateContext piecesUrl={house.piecesUrl} district={house.district} districtLabel={house.label} stateAbbr={stateAbbr} />
        ) : (
          <PastElectionCountyMap {...raceCommon} stateAbbr={stateAbbr} stateName={stateName} />
        )}
      </div>
    );
  }

  const common = { counties: entries, demName: dem.name, repName: rep.name, demParty: dem.party, repParty: rep.party, height: 300, caption: strip, panelSize: "small" as const, fill: true, bubbles: shown === "bubbles", panel: false, onSelectedChange };
  // On desktop the map fills what is left of the column under the tabs (the column's height is set by the page).
  return (
    <div className="md:flex md:h-full md:flex-col">
      {tabRow}
      <div className="md:min-h-0 md:flex-1">
        {house ? (
          <HouseDistrictCountyMap {...common} piecesUrl={house.piecesUrl} district={house.district} districtLabel={house.label} stateAbbr={stateAbbr} focus={focus} />
        ) : (
          <PastElectionCountyMap {...common} stateAbbr={stateAbbr} stateName={stateName} focus={focus} />
        )}
      </div>
    </div>
  );
}

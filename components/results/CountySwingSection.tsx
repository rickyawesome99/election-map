"use client";

import { useMemo, useState } from "react";
import type { MapRow } from "@/components/tpl/TplMaps";
import { fmtLean, fmtMargin, getRaceColor, leanColor, marginColor } from "@/lib/colorScale";
import { R26_COUNTIES_URL, R26_OFFICES, type R26County, type R26CountySlice, type R26Office } from "@/lib/results2026Types";
import { useStaticJson } from "@/lib/useStaticJson";
import { LazyMount, MarginFig, Notes, Picked, PickedFig, Reveal, ScaleLegend, Seg, Stat, StatRow, SwingFig, TplMap, fmtInt, swingColor } from "./ui";
import { countyHref } from "@/lib/countyHref";

// Section 1: every county's 2026 House, Senate or governor vote and its swing from the 2024
// presidential vote. The counties come from one static slice, fetched when the map nears the screen.

type View = "swing" | "result";
const VIEWS: [View, string][] = [["swing", "Swing vs. President '24"], ["result", "2026 margin"]];
const OFFICE_NAME: Record<R26Office, string> = { house: "House", senate: "Senate", governor: "Governor" };

const margin = (c: R26County) => ((c[4] - c[3]) / c[5]) * 100;
const swing = (c: R26County) => (c[6] == null ? null : margin(c) - c[6]);

function CountyMap({ office, view, onPick, picked }: { office: R26Office; view: View; onPick: (fips: string | null) => void; picked: string | null }) {
  const { data } = useStaticJson<R26CountySlice>(R26_COUNTIES_URL);
  const counties = data?.[office];
  const rows = useMemo<MapRow[]>(() => (counties ?? []).flatMap((c) => {
    const value = view === "swing" ? swing(c) : margin(c);
    return value == null ? [] : [{ key: c[0], name: `${c[1]}, ${c[2]}`, value, href: countyHref(c[0]) }];
  }), [counties, view]);
  const stats = useMemo(() => {
    const s = (counties ?? []).map(swing).filter((v): v is number => v != null).sort((a, b) => a - b);
    return { n: s.length, dem: s.filter((v) => v < 0).length, rep: s.filter((v) => v > 0).length, median: s.length ? s[Math.floor(s.length / 2)] : null };
  }, [counties]);
  const sel = picked ? counties?.find((c) => c[0] === picked) ?? null : null;
  const selSwing = sel ? swing(sel) : null;
  return (
    <>
      {/* Keyed by office so the figures rise in again when it changes. */}
      <StatRow key={office}>
        <Stat value={counties ? fmtInt(stats.n) : "…"} label={<>counties with a Democrat-versus-Republican {OFFICE_NAME[office]} vote</>} />
        <Stat delay={60} value={counties ? fmtInt(stats.dem) : "…"} color="var(--party-dem)" label="voted more Democratic than for president in 2024" />
        <Stat delay={120} value={counties ? fmtInt(stats.rep) : "…"} color="var(--party-rep)" label="voted more Republican" />
        <Stat delay={180} value={counties ? <SwingFig v={stats.median} size="inherit" /> : "…"} label="swing in the median county" />
      </StatRow>
      <TplMap mode="counties" rows={rows} valueLabel={view === "swing" ? "Swing vs. Pres. '24" : `${OFFICE_NAME[office]} 2026`} linkLabel="Open county page"
        colorOf={view === "swing" ? swingColor : getRaceColor} formatValue={view === "swing" ? fmtLean : fmtMargin} valueColor={view === "swing" ? leanColor : marginColor}
        onSelect={(r) => onPick(r ? r.key : null)} selectedKey={picked} panel={false} wide />
      {sel && (
        <Picked id={sel[0]} title={<>{sel[1]}, {sel[2]}</>} href={countyHref(sel[0])} linkLabel="County page" onClose={() => onPick(null)}>
          <PickedFig label={`${OFFICE_NAME[office]} 2026`} note={<>D {fmtInt(sel[3])} · R {fmtInt(sel[4])} · {fmtInt(sel[5])} votes</>}><MarginFig v={margin(sel)} size="1.5rem" /></PickedFig>
          <PickedFig label="President 2024"><MarginFig v={sel[6]} size="1.5rem" /></PickedFig>
          <PickedFig label="Swing"><SwingFig v={selSwing} size="1.5rem" /></PickedFig>
        </Picked>
      )}
    </>
  );
}

export default function CountySwingSection() {
  const [office, setOffice] = useState<R26Office>("house");
  const [view, setView] = useState<View>("swing");
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Reveal>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Seg label="Office" value={office} onChange={(v) => { setOffice(v); setPicked(null); }} options={R26_OFFICES} />
        <Seg label="Show" value={view} onChange={setView} options={VIEWS} />
        <div className="sm:ml-auto"><ScaleLegend label={view === "swing" ? "Swing" : "Margin"} /></div>
      </div>
      <LazyMount><CountyMap office={office} view={view} picked={picked} onPick={setPicked} /></LazyMount>
      <Notes>
        <p><strong>Swing:</strong> the county&rsquo;s 2026 margin for the office minus its 2024 presidential margin, both as Republican minus Democrat in points of all votes cast. D+10 means the county voted ten points more Democratic than it did for president.</p>
        <p><strong>House:</strong> a county split between districts shows the sum of its pieces. A county is left grey where part or all of its House vote was a seat with no Democrat-versus-Republican race (unopposed seats, California&rsquo;s same-party finals, Alaska&rsquo;s independent), since that vote has no two-party margin to compare.</p>
        <p><strong>Senate and governor:</strong> states with no race for the office are grey, as are the four Senate races where an independent stood in for the Democrat (Idaho, Montana, Nebraska, South Dakota). Florida and Ohio show their special Senate elections.</p>
      </Notes>
    </Reveal>
  );
}

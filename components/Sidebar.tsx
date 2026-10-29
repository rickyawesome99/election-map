"use client";

import type { NoElectionEntry, RaceType } from "@/data/forecastData";
import type { ForecastSummary } from "@/lib/forecastTypes";
import { getRatingColors, marginToRating } from "@/lib/colorScale";
import CountyTooltip, { CountyCardClose, CountyCardLink, type CountyTooltipProps } from "./CountyTooltip";
import { Theme } from "./ForecastMap";

// The forecast map's popups, built on the county maps' CountyTooltip so every map on the site
// shares one card: the hover tooltip, the floating selected-race card, and the same pair for a
// state with no election this cycle.

export function raceHref(raceType: RaceType, race: { name: string; id: string }) {
  return `/${raceType}/${(raceType === "house" ? race.name : race.id).toLowerCase().replace(/-2$/, "2")}`;
}

export function ForecastRatingPill({ margin }: { margin: number }) {
  const rating = marginToRating(margin);
  const { bg, text } = getRatingColors(rating);
  return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal" style={{ background: bg, color: text }}>{rating}</span>;
}

/** A race's card: the projected margin as the headline, the two-party shares as the rows. */
export function forecastCard(race: ForecastSummary): Extract<CountyTooltipProps, { kind: "result" }> {
  const demPct = Math.max(0, Math.min(100, 50 - race.margin / 2));
  const repPct = 100 - demPct;
  const c = race.candidates;
  return {
    kind: "result",
    title: race.name,
    subtitle: "Projected margin",
    margin: race.margin,
    projected: true,
    totalVotes: null,
    dem: { name: c?.dem.name ?? "Democrat", state: race.state, party: "D", pct: demPct, votes: null, note: c?.dem.incumbent ? "Inc." : undefined },
    rep: { name: c?.rep.name ?? "Republican", state: race.state, party: "R", pct: repPct, votes: null, note: c?.rep.incumbent ? "Inc." : undefined },
  };
}

/** A state with no election: the incumbent as the headline, the next election as the message. */
export function noElectionCard(entry: NoElectionEntry): Extract<CountyTooltipProps, { kind: "message" }> {
  return {
    kind: "message",
    title: entry.state,
    subtitle: "No election this cycle",
    headline: { text: entry.incumbent, party: entry.party },
    message: `Incumbent · next election ${entry.nextElection}`,
  };
}

/** The floating box the selected cards sit in, bottom-right of the map (the national county map's). */
export function ForecastCardBox({ theme: t, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div className="absolute z-30 hidden rounded-xl backdrop-blur-sm md:block"
      style={{ bottom: "1rem", right: "1rem", width: 210, padding: "8px 10px", background: t.legendBg, border: `1px solid ${t.border}`, boxShadow: "0 12px 28px rgba(0,0,0,0.25)" }}>
      {children}
    </div>
  );
}

type Props = {
  selected: ForecastSummary | null;
  raceType: RaceType;
  onClose: () => void;
  theme: Theme;
};

export default function Sidebar({ selected, raceType, onClose, theme }: Props) {
  if (!selected) return null;
  return (
    <ForecastCardBox theme={theme}>
      <CountyTooltip
        {...forecastCard(selected)}
        variant="card"
        aside={<span className="flex items-center gap-1"><ForecastRatingPill margin={selected.margin} /><CountyCardClose onClick={onClose} label="Close selected race" /></span>}
        footer={<CountyCardLink href={raceHref(raceType, selected)}>Race page →</CountyCardLink>}
      />
    </ForecastCardBox>
  );
}

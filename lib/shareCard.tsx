import "server-only";
import { ImageResponse } from "next/og";
import { electionYear } from "@/data/forecastData";
import { forecastsFor, getChamberSimulations, decidedFor, type ForecastedRace } from "@/lib/forecast";
import type { RaceType } from "@/data/forecastData";

// The preview card a link shows when it is shared (text messages, X, Slack…): 1200×630, drawn at
// build time from the live forecast, so it is current as of each deploy. The site-wide card leads
// with the chamber odds; a race page's card with that race. Colors are the light theme's.

export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

const INK = "#1f2328", MUTED = "#656d76", BG = "#f6f8fa", RULE = "#d0d7de";
const DEM = "#1b408c", REP = "#be1c29";

const pct = (p: number) => (p < 0.01 ? "<1%" : p > 0.99 ? ">99%" : `${Math.round(p * 100)}%`);
const margin = (m: number) => `${m < 0 ? "D" : "R"}+${Math.abs(m).toFixed(1)}`;

function Frame({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BG, color: INK, padding: "56px 72px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: MUTED }}>
        <span>CT STRATEGIES</span>
        <span>{`${electionYear} FORECAST`}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>{children}</div>
      <div style={{ display: "flex", borderTop: `3px solid ${INK}`, paddingTop: 22, fontSize: 26, color: MUTED }}>{footer}</div>
    </div>
  );
}

/** The site-wide card: projected control of each chamber. */
export function siteShareCard() {
  const sims = getChamberSimulations();
  const chamber = (label: string, p: number | null, sub: string) => {
    const dem = (p ?? 0) >= 0.5;
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: MUTED, letterSpacing: 2 }}>{label.toUpperCase()}</span>
        <span style={{ fontSize: 96, fontWeight: 800, color: dem ? DEM : REP, lineHeight: 1.05 }}>{`${dem ? "D" : "R"} ${pct(dem ? p! : 1 - p!)}`}</span>
        <span style={{ fontSize: 26, color: MUTED }}>{sub}</span>
      </div>
    );
  };
  return new ImageResponse(
    (
      <Frame footer={<span>House, Senate and governor forecasts, polls and results</span>}>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 800, letterSpacing: -1 }}>{`${electionYear} Midterm Outlook`}</div>
        <div style={{ display: "flex", marginTop: 44, gap: 48 }}>
          {chamber("House", sims.house.pDemControl, "chance of control")}
          {chamber("Senate", sims.senate.pDemControl, "chance of control")}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: MUTED, letterSpacing: 2 }}>GOVERNORS</span>
            <span style={{ fontSize: 96, fontWeight: 800, color: sims.governor.meanDem >= 25 ? DEM : REP, lineHeight: 1.05 }}>{`${sims.governor.meanDem.toFixed(1)} D`}</span>
            <span style={{ fontSize: 26, color: MUTED }}>expected of 50</span>
          </div>
        </div>
      </Frame>
    ),
    SHARE_CARD_SIZE,
  );
}

const TITLE: Record<RaceType, (r: ForecastedRace) => string> = {
  house: (r) => `${r.name} House`,
  senate: (r) => `${r.state} Senate${r.electionType?.toLowerCase() === "special" ? " Special" : ""}`,
  governor: (r) => `${r.state} Governor`,
};

/** A race page's card; the site-wide card when the URL names no 2026 race (a seat not up this year). */
export function raceShareCard(raceType: RaceType, match: (r: ForecastedRace) => boolean) {
  const race = forecastsFor(raceType).find(match);
  if (!race) return siteShareCard();
  const decided = decidedFor(race.contest);
  const pD = race.probability;
  const leaderDem = race.margin <= 0;
  const c = race.candidates;
  const nominee = (side: "dem" | "rep") => {
    const n = c?.[side];
    if (!n || /^(Democratic|Republican) Candidate$/.test(n.name.trim())) return null;
    return <span style={{ color: n.party === "D" ? DEM : n.party === "R" ? REP : INK, fontWeight: 700 }}>{`${n.name} (${n.party})`}</span>;
  };
  const dem = nominee("dem"), rep = nominee("rep");
  return new ImageResponse(
    (
      <Frame footer={<span>{decided ? `Decided: only one party on the ballot` : `${leaderDem ? "Democrats" : "Republicans"} win ${pct(leaderDem ? pD : 1 - pD)} of simulations`}</span>}>
        <div style={{ display: "flex", fontSize: 80, fontWeight: 800, letterSpacing: -1 }}>{TITLE[raceType](race)}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 36, marginTop: 14, color: MUTED }}>
          {dem}{dem && rep && <span>vs</span>}{rep}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 32, marginTop: 40 }}>
          <span style={{ fontSize: 132, fontWeight: 800, color: leaderDem ? DEM : REP, lineHeight: 1 }}>{margin(race.margin)}</span>
          <span style={{ fontSize: 48, fontWeight: 700 }}>{race.rating}</span>
        </div>
        {/* Win probability as a bar: Democratic share from the left. */}
        <div style={{ display: "flex", height: 16, marginTop: 36, borderRadius: 8, overflow: "hidden", background: RULE }}>
          <div style={{ width: `${pD * 100}%`, background: DEM }} />
          <div style={{ flex: 1, background: REP }} />
        </div>
      </Frame>
    ),
    SHARE_CARD_SIZE,
  );
}

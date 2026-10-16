import "server-only";
import { ImageResponse } from "next/og";
import { electionYear, houseData, senateData, governorData, type RaceForecast, type RaceType } from "@/data/forecastData";

// The preview card a link shows when it is shared (text messages, X, Slack…): 1200×630. The cards
// name the page, not the numbers on it: the site-wide card is a static PNG (app/opengraph-image.png,
// drawn by scripts/buildSiteShareCard.tsx from siteShareCard below) and a race page's card carries
// the race and its nominees. Nothing here reads the model, so the image routes stay tiny: a card
// that imported lib/forecast used to pull the whole model into every page's server function.
// Colors are the light theme's.

export const SHARE_CARD_SIZE = { width: 1200, height: 630 };
export const SITE_CARD_ALT = `CT Strategies ${electionYear} election forecast: House, Senate, governor and state legislative races, polls and past results`;

const INK = "#1f2328", MUTED = "#656d76", BG = "#f9f8f5";
const DEM = "#1b408c", REP = "#be1c29";

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

/** The site-wide card: what the site is. Rendered once by scripts/buildSiteShareCard.tsx. */
export function siteShareCard() {
  return new ImageResponse(
    (
      <Frame footer={<span>Forecasts, polls, fundraising and results since 2016</span>}>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 800, letterSpacing: -1, lineHeight: 1.05 }}>{`${electionYear} Election Forecast`}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 36, fontSize: 38, color: MUTED, lineHeight: 1.35 }}>
          <span>House, Senate and governor races</span>
          <span>State legislatures, counties and districts</span>
        </div>
      </Frame>
    ),
    SHARE_CARD_SIZE,
  );
}

const RACES: Record<RaceType, RaceForecast[]> = { house: houseData, senate: senateData, governor: governorData };

const TITLE: Record<RaceType, (r: RaceForecast) => string> = {
  house: (r) => `${r.name} House`,
  senate: (r) => `${r.state} Senate${r.electionType?.toLowerCase() === "special" ? " Special" : ""}`,
  governor: (r) => `${r.state} Governor`,
};

/** A race page's card: the race and its nominees; the site-wide card when the URL names no 2026 race. */
export function raceShareCard(raceType: RaceType, match: (r: RaceForecast) => boolean) {
  const race = RACES[raceType].find(match);
  if (!race) return siteShareCard();
  const c = race.candidates;
  const nominee = (side: "dem" | "rep") => {
    const n = c?.[side];
    if (!n || /^(Democratic|Republican) Candidate$/.test(n.name.trim())) return null;
    return <span style={{ color: n.party === "D" ? DEM : n.party === "R" ? REP : INK, fontWeight: 700 }}>{`${n.name} (${n.party})`}</span>;
  };
  const dem = nominee("dem"), rep = nominee("rep");
  return new ImageResponse(
    (
      <Frame footer={<span>Forecast, polls, fundraising and past results</span>}>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: -1, lineHeight: 1.05 }}>{TITLE[raceType](race)}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 40, marginTop: 28, color: MUTED }}>
          {dem}{dem && rep && <span>vs</span>}{rep}
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 32, color: MUTED }}>{`${electionYear} race page`}</div>
      </Frame>
    ),
    SHARE_CARD_SIZE,
  );
}

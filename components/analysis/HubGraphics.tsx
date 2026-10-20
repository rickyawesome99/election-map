// The still graphic at the right of each /analysis hub row: one small inline SVG per page that
// abstracts what the page shows, drawn in the site's tokens so it follows the theme. Decorative
// (aria-hidden): the row's title and description carry the meaning. No data, no script.
import type { ReactNode } from "react";

export type HubGraphicId = "forecasts" | "markets" | "pollsters" | "misses" | "popularVote" | "turnout" | "precincts" | "delegation" | "calendar";

const DEM = "var(--party-dem)";
const REP = "var(--party-rep)";
const IND = "var(--party-ind)";
const BORDER = "var(--app-border)";
const MUTED = "var(--app-text-muted)";
const VERY_MUTED = "var(--app-text-very-muted)";
const INK = "var(--app-text-primary)";
const BG = "var(--app-bg)";
const TOSSUP = "var(--rating-tossup)";
const REDRAW = "var(--redistrict-cd)";

function Frame({ children, viewBox = "0 0 360 84" }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} className="hub-graphic" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Five races: each outside forecaster's call as a dot, ours as a square, the toss-up line dashed. */
function Forecasts() {
  const rows = [12, 27, 42, 57, 72];
  const dots: [number, number][] = [[40, 12], [66, 12], [90, 12], [122, 12], [212, 27], [242, 27], [282, 27], [314, 27], [150, 42], [168, 42], [202, 42], [226, 42], [28, 57], [52, 57], [78, 57], [262, 72], [292, 72], [328, 72], [344, 72]];
  const ours: [number, number, string][] = [[96, 7, DEM], [266, 22, REP], [180, 37, TOSSUP], [56, 52, DEM], [306, 67, REP]];
  return (
    <Frame>
      <line x1="180" y1="2" x2="180" y2="82" stroke={TOSSUP} strokeWidth="1.5" strokeDasharray="3 4" />
      <g stroke={BORDER} strokeWidth="1.5">{rows.map((y) => <line key={y} x1="10" y1={y} x2="350" y2={y} />)}</g>
      <g fill={VERY_MUTED}>{dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" />)}</g>
      {ours.map(([x, y, fill]) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="10" fill={fill} />)}
    </Frame>
  );
}

/** Both sides of one market's price moving toward election day, across a dashed 50¢ line. */
function Markets() {
  return (
    <Frame>
      <line x1="8" y1="42" x2="352" y2="42" stroke={VERY_MUTED} strokeWidth="1" strokeDasharray="3 4" />
      <polyline points="8,60 48,54 88,66 128,46 168,40 208,50 248,30 288,24 328,18 352,14" fill="none" stroke={DEM} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points="8,24 48,30 88,18 128,38 168,44 208,34 248,54 288,60 328,66 352,70" fill="none" stroke={REP} strokeWidth="2.5" strokeOpacity=".55" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="352" cy="14" r="4.5" fill={DEM} />
      <circle cx="352" cy="70" r="4.5" fill={REP} fillOpacity=".55" />
      <text x="10" y="80" fontSize="10" fontWeight="700" fill={MUTED}>50¢</text>
    </Frame>
  );
}

/** Pollsters as dots, placed by which party they lean toward. */
function Pollsters() {
  const dem: [number, number, number][] = [[48, 40, 4], [72, 56, 3], [98, 28, 5], [118, 50, 3.5], [140, 60, 3], [156, 36, 4], [86, 46, 2.5], [168, 54, 3]];
  const rep: [number, number, number][] = [[194, 48, 3], [214, 30, 5], [238, 58, 3.5], [262, 42, 4], [286, 24, 3], [308, 52, 4.5], [330, 38, 3], [226, 44, 2.5], [276, 60, 3]];
  return (
    <Frame>
      <line x1="12" y1="66" x2="348" y2="66" stroke={BORDER} strokeWidth="1.5" />
      <line x1="180" y1="8" x2="180" y2="72" stroke={MUTED} strokeWidth="1" strokeDasharray="2 3" />
      <g fill={DEM} fillOpacity=".8">{dem.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}</g>
      <g fill={REP} fillOpacity=".8">{rep.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}</g>
      <text x="12" y="82" fontSize="10" fontWeight="700" fill={DEM}>Leans D</text>
      <text x="348" y="82" fontSize="10" fontWeight="700" fill={REP} textAnchor="end">Leans R</text>
    </Frame>
  );
}

/** A grid of states shaded by which party beat its polls and by how much. */
function Misses() {
  // "R" or "D" plus the opacity, 13 columns by 3 rows, reading left to right.
  const cells = "R.6 R.3 D.3 R.7 R.45 R.2 D.5 R.35 R.6 R.25 D.25 R.5 R.8 R.3 R.55 R.4 D.2 R.3 R.7 R.4 R.2 D.4 R.6 R.3 R.75 R.5 R.25 D.3 R.5 R.35 R.6 R.2 D.6 R.45 R.3 R.7 R.4 D.25 R.55".split(" ");
  return (
    <Frame>
      {cells.map((c, i) => (
        <rect key={i} x={6 + (i % 13) * 27} y={6 + Math.floor(i / 13) * 27} width="22" height="22" rx="2" fill={c[0] === "D" ? DEM : REP} fillOpacity={c.slice(1)} />
      ))}
    </Frame>
  );
}

/** Paired party bars for each national election since 2016. */
function PopularVote() {
  const pairs: [number, number, number][] = [[2016, 36, 34], [2018, 52, 42], [2020, 40, 38], [2022, 34, 38], [2024, 32, 38]];
  return (
    <Frame>
      {pairs.map(([year, d, r], i) => {
        const x = 36 + i * 64;
        return (
          <g key={year}>
            <rect x={x} y={66 - d} width="18" height={d} fill={DEM} />
            <rect x={x + 20} y={66 - r} width="18" height={r} fill={REP} fillOpacity=".85" />
            <text x={x + 19} y="80" fontSize="10" fontWeight="700" fill={MUTED} textAnchor="middle">{year}</text>
          </g>
        );
      })}
      <line x1="24" y1="66" x2="344" y2="66" stroke={MUTED} strokeWidth="1.5" />
    </Frame>
  );
}

/** Turnout bars since 2016: presidential years full, midterms lighter, the next midterm dashed. */
function Turnout() {
  const bars: [number, number, boolean][] = [[2016, 48, true], [2018, 36, false], [2020, 53, true], [2022, 34, false], [2024, 49, true]];
  return (
    <Frame>
      {bars.map(([year, h, pres], i) => {
        const x = 30 + i * 54;
        return (
          <g key={year}>
            <rect x={x} y={66 - h} width="36" height={h} fill={IND} fillOpacity={pres ? ".85" : ".45"} />
            <text x={x + 18} y="80" fontSize="10" fontWeight="700" fill={MUTED} textAnchor="middle">{year}</text>
          </g>
        );
      })}
      <rect x="300" y="31" width="36" height="35" fill="none" stroke={DEM} strokeWidth="2" strokeDasharray="5 4" />
      <text x="318" y="80" fontSize="10" fontWeight="700" fill={DEM} textAnchor="middle">2026</text>
      <line x1="18" y1="66" x2="346" y2="66" stroke={MUTED} strokeWidth="1.5" />
    </Frame>
  );
}

/** Precincts of one district, shaded by lean. */
function Precincts() {
  const cells: [string, string, string][] = [
    ["30,8 100,4 106,40 36,44", REP, ".5"], ["100,4 180,8 176,36 106,40", DEM, ".35"], ["180,8 260,4 256,42 176,36", REP, ".3"], ["260,4 334,10 330,46 256,42", DEM, ".5"],
    ["36,44 106,40 110,80 32,78", DEM, ".6"], ["106,40 176,36 172,76 110,80", REP, ".25"], ["176,36 256,42 250,80 172,76", DEM, ".45"], ["256,42 330,46 326,78 250,80", REP, ".4"],
  ];
  return (
    <Frame>
      <g stroke={BG} strokeWidth="2">{cells.map(([points, fill, o]) => <polygon key={points} points={points} fill={fill} fillOpacity={o} />)}</g>
    </Frame>
  );
}

/** Rows of seats colored by the party holding them. */
function Delegation() {
  const rows = ["DDDRRRRDDRRRDRRDRR", "RRDDRRDRRRDDRDRRDR", "DRRRDDRRRDRRDRDRRD"];
  return (
    <Frame>
      {rows.map((row, r) => row.split("").map((p, c) => (
        <rect key={`${r}-${c}`} x={18 + c * 18} y={14 + r * 21} width="14" height="14" rx="2" fill={p === "D" ? DEM : REP} />
      )))}
    </Frame>
  );
}

/** A calendar grid with race badges on some days and today outlined. */
function Calendar() {
  const badges: [number, number, string][] = [[1, 0, DEM], [5, 0, REP], [9, 0, IND], [0, 1, IND], [4, 1, REDRAW], [8, 1, DEM], [11, 1, REP], [3, 2, REP], [10, 2, DEM]];
  return (
    <Frame>
      <g fill="none" stroke={BORDER} strokeWidth="1.5">
        {Array.from({ length: 36 }, (_, i) => <rect key={i} x={22 + (i % 12) * 27} y={6 + Math.floor(i / 12) * 27} width="22" height="22" rx="3" />)}
      </g>
      {badges.map(([c, r, fill]) => <rect key={`${c}-${r}`} x={22 + c * 27} y={6 + r * 27} width="22" height="22" rx="3" fill={fill} fillOpacity={fill === REDRAW ? ".55" : ".45"} />)}
      <rect x={22 + 6 * 27} y={6 + 27} width="22" height="22" rx="3" fill="none" stroke={INK} strokeWidth="2.5" />
    </Frame>
  );
}

const GRAPHICS: Record<HubGraphicId, () => ReactNode> = {
  forecasts: Forecasts, markets: Markets, pollsters: Pollsters, misses: Misses, popularVote: PopularVote,
  turnout: Turnout, precincts: Precincts, delegation: Delegation, calendar: Calendar,
};

export default function HubGraphic({ id }: { id: HubGraphicId }) {
  const Graphic = GRAPHICS[id];
  return <Graphic />;
}

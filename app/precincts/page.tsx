import { TPL_GLOBAL_CONSTANTS } from "@/data/tplModelData";
import { PAGE_HERO_BG, PAGE_HERO_TOP, PAGE_TITLE_STYLE } from "@/lib/pageLayout";
import PrecinctExplorer from "@/components/precincts/PrecinctExplorer";
import { OFFICES, type Office, type OfficeSummary, type StateShell } from "@/components/precincts/types";
import { statesData } from "@/data/statesData";
import coverageJson from "@/data/precincts/coverage.json";
import statesJson from "@/data/precincts/states.json";
import nationalTrends from "@/data/precincts/nationalTrends.json";
import { CERTIFIED_2026 } from "@/data/precincts/certified2026";

export const metadata = {
  title: "Precinct Results",
  description: "Election results for every precinct in the country, from president to state legislature, on one precinct map.",
};

type Cell = { status: string; d?: number; r?: number; o?: number; note?: string };
type Coverage = { years: number[]; states: Record<string, { n: number; years: Record<string, Record<string, Cell>> }> };

const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17",
  IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31",
  NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46",
  TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
};

export default function PrecinctsPage() {
  const coverage = coverageJson as unknown as Coverage;
  const geo = statesJson as unknown as Record<string, { n: number; first: number; bbox: [number, number, number, number] | null }>;
  const nameOf = new Map(statesData.map((s) => [s.abbr, s.name]));
  nameOf.set("DC", nameOf.get("DC") ?? "District of Columbia");

  // The shell carries only statewide sums; precinct rows are fetched per state by the browser.
  const states: StateShell[] = Object.keys(coverage.states)
    .filter((abbr) => geo[abbr]?.bbox)
    .map((abbr) => {
      const years: StateShell["years"] = {};
      for (const [y, cells] of Object.entries(coverage.states[abbr].years)) {
        // 2026 appears state by state as each certifies; counts before that are still moving.
        if (y === "2026" && !CERTIFIED_2026[abbr]) continue;
        const out: Partial<Record<Office, OfficeSummary>> = {};
        for (const o of OFFICES) {
          const c = cells[o];
          if (c && (c.status === "reconciled" || c.status === "explained" || c.status === "loaded")) {
            out[o] = { d: c.d ?? 0, r: c.r ?? 0, o: c.o ?? 0, status: c.status, ...(c.status !== "reconciled" && c.note ? { note: c.note } : {}) };
          }
        }
        if (Object.keys(out).length) years[y] = out;
      }
      return { abbr, name: nameOf.get(abbr) ?? abbr, fips: STATE_FIPS[abbr], n: geo[abbr].n, first: geo[abbr].first, bbox: geo[abbr].bbox!, years };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Every year in the grid; the explorer shows odd years only for a state that voted in them.
  const years = coverage.years.map((year) => ({ year, loaded: states.some((s) => s.years[String(year)]) }));
  const precincts = states.reduce((n, s) => n + s.n, 0);
  const certified2026 = states.filter((s) => s.years["2026"]);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      {/* The top-level tabs' header (lib/pageLayout), at the explorer's wider column so the title lines up with the map. */}
      <div style={{ background: PAGE_HERO_BG }}>
        <div className={`mx-auto max-w-7xl px-4 pb-4 sm:px-6 ${PAGE_HERO_TOP}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <h1 style={PAGE_TITLE_STYLE}>Precinct Results</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                {precincts.toLocaleString()} precincts, with every election fitted onto 2024 precinct lines.
              </p>
            </div>
            {/* PrecinctExplorer portals its address search in here. */}
            <div id="precinct-search-slot" className="shrink-0" />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6">
        <PrecinctExplorer states={states} years={years} national={nationalTrends} tplWeights={{ presidential: TPL_GLOBAL_CONSTANTS.RACE_TYPE_WEIGHTS, midterm: TPL_GLOBAL_CONSTANTS.RACE_TYPE_WEIGHTS_MIDTERM }} />
        <p className="mt-6 max-w-4xl text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          Precinct boundaries are each state&rsquo;s November 2024 lines. This map was created using data from the Redistricting
          Data Hub; District of Columbia boundaries are from Open Data DC. Results not carried in those files come from the MIT
          Election Data and Science Lab&rsquo;s precinct returns. Some states report early or absentee votes for a whole county;
          those votes are allocated to precincts by the source and are estimates at precinct level. 2026 results are added
          state by state once a state certifies its count and publishes it by precinct: so far{" "}
          {certified2026.length ? certified2026.map((s) => s.name).join(", ") : "none"}.
        </p>
      </main>
    </div>
  );
}

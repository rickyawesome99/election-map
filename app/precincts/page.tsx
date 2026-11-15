import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import PrecinctExplorer from "@/components/precincts/PrecinctExplorer";
import { OFFICES, type Office, type OfficeSummary, type StateShell } from "@/components/precincts/types";
import { statesData } from "@/data/statesData";
import coverageJson from "@/data/precincts/coverage.json";
import statesJson from "@/data/precincts/states.json";

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

  const years = coverage.years
    .filter((y) => y % 2 === 0)
    .map((year) => ({ year, loaded: states.some((s) => s.years[String(year)]) }));
  const precincts = states.reduce((n, s) => n + s.n, 0);
  const loadedYears = years.filter((y) => y.loaded).map((y) => y.year);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Precincts" title="Precinct Results">
        <Fig>{precincts.toLocaleString()}</Fig> precincts in <Fig>{states.length}</Fig> states, each with its vote for president,
        Senate, governor, U.S. House and the state legislature. Results so far: <Fig>{loadedYears.join(", ")}</Fig>. Earlier years
        are being fitted onto the same 2024 precinct lines.
      </StandfirstHeader>
      <main className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6">
        <PrecinctExplorer states={states} years={years} />
        <p className="mt-6 max-w-4xl text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          Precinct boundaries are each state&rsquo;s November 2024 lines. This map was created using data from the Redistricting
          Data Hub; District of Columbia boundaries are from Open Data DC. Results not carried in those files come from the MIT
          Election Data and Science Lab&rsquo;s precinct returns. Some states report early or absentee votes for a whole county;
          those votes are allocated to precincts by the source and are estimates at precinct level.
        </p>
      </main>
    </div>
  );
}

import { electionYear, stateLegData } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { UNICAMERAL_STATES } from "@/data/stateLegDistricts";
import { chamberOutcome } from "@/lib/chamberOutcome";
import { stateLegCompositionAsOf } from "@/data/stateLegComposition";
import { projectAllChambers } from "@/lib/final2026";
import { chamberResults2026, districtResults2026 } from "@/lib/stateLegResults2026";
import { currentChamberSeats, latestChamberSeats } from "@/lib/stateLegSeats";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";
import LegislatureChambersTable, { type ChamberRow } from "@/components/LegislatureChambersTable";
import ChamberSummary from "@/components/ChamberSummary";
import LegislatureControlMap, { type LegislatureMapChamber, type LegislatureMapState } from "@/components/LegislatureControlMap";

export const metadata = {
  title: `State Legislatures — ${electionYear} Forecast`,
  description: `Every state legislative chamber on the ${electionYear} ballot: projected composition, control odds and the seats in play, from the district atlas.`,
};

export default function LegislaturesPage() {
  const chambers = projectAllChambers();
  const byAbbr = new Map(statesData.map((s) => [s.abbr, s]));
  const rows = chambers.map((c) => {
    const state = byAbbr.get(c.abbr)!;
    const unicameral = UNICAMERAL_STATES.has(c.abbr);
    const comp = currentChamberSeats(c.abbr, c.chamber) ?? latestChamberSeats(stateLegData[state.name] ?? [], unicameral ? "House" : c.chamber === "house" ? "House" : "Senate");
    const currentDemControl = comp ? comp.dem > comp.rep : null;
    const flipD = c.pDemControl != null && currentDemControl === false ? c.pDemControl : 0;
    const flipR = c.pRepControl != null && currentDemControl === true ? c.pRepControl : 0;
    const closeness = c.pDemControl == null ? -1 : Math.min(c.pDemControl, c.pRepControl ?? 0);
    return { c, state, unicameral, comp, currentDemControl, flipD, flipR, closeness, label: unicameral ? "Legislature" : c.chamber === "house" ? "House" : "Senate" };
  });
  rows.sort((a, b) => b.closeness - a.closeness || a.state.name.localeCompare(b.state.name) || a.c.chamber.localeCompare(b.c.chamber));
  // The counted election, summed over every chamber that held one (lib/stateLegResults2026.ts):
  // seats by winner (the leader where a race is not called), seats that changed hands by the same
  // comparison of each district's winners with its sitting members as a set, and which party holds more seats in each chamber before and after.
  const res = { chambers: 0, races: 0, uncalled: 0, seats: 0, dem: 0, rep: 0, oth: 0, flipD: 0, flipR: 0, gainI: 0, demBefore: 0, demAfter: 0, chamberFlipD: 0, chamberFlipR: 0 };
  const resultByKey = new Map<string, NonNullable<ReturnType<typeof chamberResults2026>>>();
  for (const state of statesData) {
    for (const chamber of ["house", "senate"] as const) {
      const r = chamberResults2026(state.abbr, chamber);
      if (!r) continue;
      resultByKey.set(`${state.abbr}-${chamber}`, r);
      res.chambers += 1; res.races += r.races; res.uncalled += r.uncalled;
      for (const d of districtResults2026(state.abbr, chamber).values()) {
        res.seats += d.seats; res.dem += d.winners.D; res.rep += d.winners.R; res.oth += d.winners.I;
        if (!d.held) continue;
        const gain = (p: "D" | "R" | "I") => Math.max(0, d.winners[p] - d.held![p]);
        const loss = (p: "D" | "R" | "I") => Math.max(0, d.held![p] - d.winners[p]);
        res.flipD += Math.min(gain("D"), loss("R"));
        res.flipR += Math.min(gain("R"), loss("D"));
        res.gainI += Math.min(gain("I"), loss("D") + loss("R"));
      }
      const comp = currentChamberSeats(state.abbr, chamber) ?? latestChamberSeats(stateLegData[state.name] ?? [], UNICAMERAL_STATES.has(state.abbr) || chamber === "house" ? "House" : "Senate");
      const before = comp ? comp.dem > comp.rep : null, after = r.seats.dem > r.seats.rep;
      if (before) res.demBefore += 1;
      if (after) res.demAfter += 1;
      if (before === false && after) res.chamberFlipD += 1;
      if (before === true && !after) res.chamberFlipR += 1;
    }
  }

  // Map rows: every state, both chambers — including chambers with no election this cycle, which keep
  // today's composition in the projected view.
  const projByKey = new Map(chambers.map((c) => [`${c.abbr}-${c.chamber}`, c]));
  const mapStates: LegislatureMapState[] = statesData.filter((s) => s.abbr !== "DC").map((state) => {
    const unicameral = UNICAMERAL_STATES.has(state.abbr);
    const build = (chamber: "house" | "senate"): LegislatureMapChamber | null => {
      const c = projByKey.get(`${state.abbr}-${chamber}`);
      const comp = currentChamberSeats(state.abbr, unicameral ? "senate" : chamber) ?? latestChamberSeats(stateLegData[state.name] ?? [], unicameral || chamber === "house" ? "House" : "Senate");
      const info = stateLegMapInfo[state.abbr]?.[chamber];
      const totalSeats = c?.totalSeats ?? info?.totalSeats ?? comp?.total ?? null;
      if (totalSeats == null || (!c && !comp)) return null;
      return {
        href: `/states/${state.id}/legislature/${chamber}`,
        label: unicameral ? "Legislature" : chamber === "house" ? "House" : "Senate",
        totalSeats,
        majority: c?.majority ?? Math.floor(totalSeats / 2) + 1,
        supermajority: c?.supermajority ?? info?.supermajoritySeats ?? Math.ceil((totalSeats * 2) / 3),
        now: comp ? { dem: comp.dem, rep: comp.rep, oth: comp.oth, year: comp.year } : null,
        projected: c ? { dem: c.expectedDem, rep: c.expectedRep, pDem: c.pDemControl, pRep: c.pRepControl } : null,
        result: (() => { const r = resultByKey.get(`${state.abbr}-${unicameral ? "senate" : chamber}`); return r ? { dem: r.seats.dem, rep: r.seats.rep, oth: r.seats.oth, uncalled: r.uncalled } : null; })(),
      };
    };
    if (unicameral) {
      const one = build(projByKey.has(`${state.abbr}-house`) ? "house" : "senate");
      return { name: state.name, abbr: state.abbr, house: one, senate: one };
    }
    return { name: state.name, abbr: state.abbr, house: build("house"), senate: build("senate") };
  });

  // Slim rows for the client table: the projections themselves carry every district.
  const tableRows: ChamberRow[] = rows.map(({ c, state, comp, label }) => {
    return {
      key: `${c.abbr}-${c.chamber}`, stateName: state.name, href: `/states/${state.id}/legislature/${c.chamber}`, label, chamber: c.chamber,
      seatsUp: c.seatsUp, totalSeats: c.totalSeats, now: comp ? { dem: comp.dem, rep: comp.rep, oth: comp.oth ?? 0 } : null,
      expectedDem: c.expectedDem, expectedRep: c.expectedRep, expectedOth: c.expectedOth, lo80: c.lo80, hi80: c.hi80, majority: c.majority,
      pDem: c.pDemControl, pRep: c.pRepControl,
      supermajority: c.supermajority,
      nowStatus: comp && c.majority != null ? chamberOutcome(comp.dem, comp.rep, c.majority, c.supermajority) : null,
      outcomes: c.outcomes,
      unopposed: c.decided.dem + c.decided.rep + c.decided.oth, unprojected: c.unprojected,
    };
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: PAGE_HERO_BG }}>
        <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} pb-6`}>
          <h1 style={PAGE_TITLE_STYLE}>State Legislatures</h1>
          {/* The counted election; the projection it replaced here lives on in the map and the Chambers table. */}
          {res.chambers > 0 && (
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
              <ChamberSummary
                seatsKicker={`${electionYear} results · ${res.seats.toLocaleString()} seats on the ballot`}
                seatsNote={res.uncalled ? `winners and leaders · ${res.uncalled.toLocaleString()} of ${res.races.toLocaleString()} races not yet called` : "winners, all races"}
                seats={{ dem: res.dem, rep: res.rep, oth: res.oth, total: res.seats }}
                othNote={res.gainI ? ` · incl. ${res.gainI} gain${res.gainI > 1 ? "s" : ""} from a party` : ""}
                flipsKicker={`${electionYear} seat flips`}
                flips={{ toD: res.flipD, toR: res.flipR, titleD: "R-held seats won or led by a Democrat", titleR: "D-held seats won or led by a Republican" }}
                controlKicker={`Chamber control · ${res.chambers} with an election`}
                controlRows={[
                  { label: "Before", d: res.demBefore, r: res.chambers - res.demBefore, fmt: (n: number) => String(n) },
                  { label: "After", d: res.demAfter, r: res.chambers - res.demAfter, fmt: (n: number) => String(n) },
                ]}
                controlFoot={<><b style={{ color: "var(--app-text-primary)" }}>{res.chamberFlipD + res.chamberFlipR}</b> chamber{res.chamberFlipD + res.chamberFlipR === 1 ? "" : "s"} changed hands{res.chamberFlipD + res.chamberFlipR > 0 ? <>: {[res.chamberFlipD ? `${res.chamberFlipD} to D` : "", res.chamberFlipR ? `${res.chamberFlipR} to R` : ""].filter(Boolean).join(" · ")}</> : null}</>}
              />
            </div>
          )}
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} py-6`}>
        <LegislatureControlMap states={mapStates} year={electionYear} />
        <LegislatureChambersTable rows={tableRows} />
        <p className="mt-4 max-w-3xl text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          The bar under Projected seats is the whole chamber, holdovers included, with seats that have no projection left gray; the tick marks a majority and the gray whisker above it the 80% range of Democratic seats. Control shows the favored party&apos;s chance; in a chamber that can tie, the favorite can sit below 50%. Net is the projected change from &ldquo;Now&rdquo; in whole seats, credited to the party that gains. &ldquo;Now&rdquo; is the chamber as it sits today (Ballotpedia, {stateLegCompositionAsOf}), independents and third parties as the third figure and vacancies left out, with its majority status below; Projected status is the status the simulations end in most often (hover for the chance of each: D Supermajority, D Majority, Tie, R Majority and R Supermajority), supermajority being the veto-override line. Control is withheld (—) where seats with no projection could decide them. Nebraska&apos;s ballot is nonpartisan; its seats are counted by each candidate&apos;s party (registration or party endorsement), the caucus they sit with. Multi-member districts draw each seat on the same margin. Michigan&apos;s 110-seat House can tie, so its two control odds do not sum to 100%.
        </p>
      </main>
    </div>
  );
}

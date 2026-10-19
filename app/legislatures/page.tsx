import Link from "next/link";
import { electionYear, stateLegData } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { stateLegDistricts, UNICAMERAL_STATES } from "@/data/stateLegDistricts";
import { chamberOutcome } from "@/lib/chamberOutcome";
import { stateLegCompositionAsOf } from "@/data/stateLegComposition";
import { projectAllChambers } from "@/lib/stateLegForecast";
import { currentChamberSeats, latestChamberSeats } from "@/lib/stateLegSeats";
import { getNationalEnvironment } from "@/lib/tplCompute";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";
import LegislatureChambersTable, { SplitBar, type ChamberRow } from "@/components/LegislatureChambersTable";
import LegislatureControlMap, { type LegislatureMapChamber, type LegislatureMapState } from "@/components/LegislatureControlMap";

export const metadata = {
  title: `State Legislatures — ${electionYear} Forecast`,
  description: `Every state legislative chamber on the ${electionYear} ballot: projected composition, control odds and the seats in play, from the district atlas.`,
};

// Header visuals. Numbers stay in text ink; the party color rides on the marks beside them.
function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{children}</span>;
}

function BigNum({ value, label, color, align = "left" }: { value: string; label: string; color: string; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <div className="text-2xl font-bold tabular-nums leading-tight" style={{ color }}>{value}</div>
      <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{label}</div>
    </div>
  );
}

export default function LegislaturesPage() {
  const chambers = projectAllChambers();
  const env = getNationalEnvironment();
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
  const competitive = rows.filter((r) => r.closeness >= 0.2);
  const expectedFlips = rows.reduce((s, r) => s + r.flipD + r.flipR, 0);
  const demHeld = rows.filter((r) => r.currentDemControl === true).length;
  const repHeld = rows.filter((r) => r.currentDemControl === false).length;
  const expectedDemAfter = rows.reduce((s, r) => s + (r.c.pDemControl ?? (r.currentDemControl ? 1 : 0)), 0);

  // Seat totals across every race on the ballot: projected seats exclude holdovers, and a flip is a
  // seat whose favored winner (P ≥ 50%) is of a different party than its sitting member. Each
  // district compares its favored winners with its sitting members as a set, so a vacant seat or a
  // seat with no projection counts toward no flip, and a seat an independent holds or gains is
  // counted apart from the D/R flips.
  const seatTotals = { forecast: 0, dem: 0, rep: 0, oth: 0, flipD: 0, flipR: 0, gainI: 0 };
  for (const c of chambers) {
    seatTotals.forecast += c.seatsUp - c.unprojected;
    seatTotals.dem += c.expectedDem - c.holdover.dem;
    seatTotals.rep += c.expectedRep - c.holdover.rep;
    seatTotals.oth += c.expectedOth - c.holdover.oth;
    const roster = stateLegDistricts[c.abbr]?.[c.chamber] ?? [];
    c.districts.forEach((d, i) => {
      const winners: string[] = [];
      if (d.contest === "independent" && d.indep && d.pI != null) {
        const party = d.indep.slot === "D" ? "R" : "D";
        winners.push(d.pI >= 0.5 ? "O" : party, ...Array(d.seats - d.indep.seats).fill(party));
      } else if (d.contest === "other" && d.pI === 1) winners.push(...Array(d.seats).fill("O"));
      else if (d.contest === "split") winners.push(...Array(d.guaranteed.dem).fill("D"), ...Array(d.guaranteed.rep).fill("R"));
      else if (d.pD != null) winners.push(...Array(d.guaranteed.dem).fill("D"), ...Array(d.guaranteed.rep).fill("R"), ...Array(d.contestedSeats).fill(d.pD >= 0.5 ? "D" : "R"));
      if (!winners.length) return;
      // Sitting party per seat from the roster, which files fusion-ticket members (New York,
      // Connecticut, Vermont) under "O": those take the major party their own 2026 listing carries.
      const rd = roster[i];
      const fieldParty = new Map<string, string>();
      for (const x of d.candidates2026?.candidates ?? []) if (x.party === "D" || x.party === "R") fieldParty.set(x.name, x.party);
      const sitting = (rd?.incumbents ?? []).filter((inc) => (inc.nextElection ?? rd.nextElection) === c.year)
        .map((inc) => (inc.party === "D" || inc.party === "R" ? inc.party : fieldParty.get(inc.name) ?? "O")).slice(0, d.seats);
      const n = (xs: string[], p: string) => xs.filter((x) => x === p).length;
      const gain = (p: string) => Math.max(0, n(winners, p) - n(sitting, p));
      const loss = (p: string) => Math.max(0, n(sitting, p) - n(winners, p));
      seatTotals.flipD += Math.min(gain("D"), loss("R"));
      seatTotals.flipR += Math.min(gain("R"), loss("D"));
      seatTotals.gainI += Math.min(gain("O"), loss("D") + loss("R"));
    });
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
          <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            {chambers.length} chambers are on the ballot. Each is simulated seat by seat from the district atlas: a district&apos;s lean on today&apos;s lines, the national environment (E {env.eHat >= 0 ? "R" : "D"}+{Math.abs(env.eHat).toFixed(1)}, σ {env.sigmaE.toFixed(1)}), incumbency, and the {electionYear} field. Seats not on the ballot hold their sitting member. Method: <Link href="/methodology/state-leg" className="underline underline-offset-2">Legislative atlas</Link>.
          </p>
          <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            {/* Seats on the ballot: one bar, D | independent | R, with the halfway tick. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Kicker>Projected seats · {seatTotals.forecast.toLocaleString()} on the ballot</Kicker>
              <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>expected wins, all races</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <BigNum value={Math.round(seatTotals.dem).toLocaleString()} label="Democratic" color="var(--party-dem)" />
              {Math.round(seatTotals.oth) > 0 && (
                <span className="pb-1 text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  <b style={{ color: "var(--app-text-primary)" }}>{Math.round(seatTotals.oth)}</b> independent{seatTotals.gainI ? ` · incl. ${seatTotals.gainI} gain${seatTotals.gainI > 1 ? "s" : ""} from a party` : ""}
                </span>
              )}
              <BigNum value={Math.round(seatTotals.rep).toLocaleString()} label="Republican" color="var(--party-rep)" align="right" />
            </div>
            <div className="relative mt-2">
              <SplitBar height={14} parts={[
                { value: seatTotals.dem, color: "var(--party-dem)", title: `${Math.round(seatTotals.dem).toLocaleString()} Democratic seats` },
                { value: seatTotals.oth, color: "var(--party-ind)", title: `${Math.round(seatTotals.oth)} independent seats` },
                { value: seatTotals.rep, color: "var(--party-rep)", title: `${Math.round(seatTotals.rep).toLocaleString()} Republican seats` },
              ]} />
              <span aria-hidden className="absolute -bottom-1 -top-1 left-1/2 w-px" style={{ background: "var(--app-text-primary)" }} />
            </div>
            <div className="mt-1 text-center text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>half of {seatTotals.forecast.toLocaleString()}</div>

            <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
              {/* Seat flips, both bars on one scale. */}
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <Kicker>Projected seat flips</Kicker>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: seatTotals.flipD >= seatTotals.flipR ? "var(--party-dem)" : "var(--party-rep)" }}>
                    net {seatTotals.flipD >= seatTotals.flipR ? "D" : "R"} +{Math.abs(seatTotals.flipD - seatTotals.flipR)}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {[
                    { n: seatTotals.flipD, label: "R-held → D", color: "var(--party-dem)", title: "R-held seats favoring a Democrat" },
                    { n: seatTotals.flipR, label: "D-held → R", color: "var(--party-rep)", title: "D-held seats favoring a Republican" },
                  ].map((f) => (
                    <div key={f.label} className="grid items-center gap-3" style={{ gridTemplateColumns: "5.5rem 1fr 2.5rem" }} title={`${f.n} ${f.title}`}>
                      <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>{f.label}</span>
                      <span className="h-3">
                        <span className="block h-full rounded-r" style={{ width: `${Math.max(1, (f.n / Math.max(seatTotals.flipD, seatTotals.flipR, 1)) * 100)}%`, background: f.color }} />
                      </span>
                      <span className="text-right text-sm font-bold tabular-nums">{f.n}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chamber control, now vs projected. */}
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <Kicker>Chamber control · {chambers.length} on the ballot</Kicker>
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {[
                    { label: "Now", d: demHeld, r: repHeld, fmt: (n: number) => String(n) },
                    { label: "Projected", d: expectedDemAfter, r: chambers.length - expectedDemAfter, fmt: (n: number) => n.toFixed(1) },
                  ].map((row) => (
                    <div key={row.label} className="grid items-center gap-3" style={{ gridTemplateColumns: "5.5rem 1fr" }}>
                      <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="w-8 text-right text-sm font-bold tabular-nums" style={{ color: "var(--party-dem)" }}>{row.fmt(row.d)}</span>
                        <div className="relative flex-1">
                          <SplitBar height={12} parts={[
                            { value: row.d, color: "var(--party-dem)", title: `${row.fmt(row.d)} Democratic chambers` },
                            { value: row.r, color: "var(--party-rep)", title: `${row.fmt(row.r)} Republican chambers` },
                          ]} />
                          <span aria-hidden className="absolute -bottom-1 -top-1 left-1/2 w-px" style={{ background: "var(--app-text-primary)" }} />
                        </div>
                        <span className="w-8 text-sm font-bold tabular-nums" style={{ color: "var(--party-rep)" }}>{row.fmt(row.r)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
                  <b style={{ color: "var(--app-text-primary)" }}>{competitive.length}</b> in play (either party ≥ 20%) · <b style={{ color: "var(--app-text-primary)" }}>{expectedFlips.toFixed(1)}</b> expected flips
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} py-6`}>
        <LegislatureControlMap states={mapStates} year={electionYear} />
        <LegislatureChambersTable rows={tableRows} />
        <p className="mt-4 max-w-3xl text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          The bar under Projected seats is the whole chamber, holdovers included, with seats that have no projection left gray; the tick marks a majority and the gray whisker above it the 80% range of Democratic seats. Control odds show the favored party&apos;s chance; in a chamber that can tie, the favorite can sit below 50%. Net is the projected change from &ldquo;Now&rdquo; in whole seats, credited to the party that gains. &ldquo;Now&rdquo; is the chamber as it sits today (Ballotpedia, {stateLegCompositionAsOf}), independents and third parties as the third figure and vacancies left out, with its majority status below; Projected status is the status the simulations end in most often (hover for D Supermajority, D Majority, Tie, R Majority and R Supermajority), supermajority being the veto-override line. Control odds are withheld (—) where seats with no projection could decide them. Nebraska&apos;s ballot is nonpartisan; its seats are counted by each candidate&apos;s party (registration or party endorsement), the caucus they sit with. Multi-member districts draw each seat on the same margin. Michigan&apos;s 110-seat House can tie, so its two control odds do not sum to 100%.
        </p>
      </main>
    </div>
  );
}

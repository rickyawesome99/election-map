import Link from "next/link";
import { electionYear, stateLegData } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { UNICAMERAL_STATES } from "@/data/stateLegDistricts";
import { projectAllChambers, STATE_LEG_FORECAST_CONSTANTS } from "@/lib/stateLegForecast";
import { latestChamberSeats } from "@/lib/stateLegSeats";
import { getNationalEnvironment } from "@/lib/tplCompute";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import LegislatureControlMap, { type LegislatureMapChamber, type LegislatureMapState } from "@/components/LegislatureControlMap";

export const metadata = {
  title: `State Legislatures — ${electionYear} Forecast`,
  description: `Every state legislative chamber on the ${electionYear} ballot: projected composition, control odds and the seats in play, from the district atlas.`,
};

const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);

export default function LegislaturesPage() {
  const chambers = projectAllChambers();
  const env = getNationalEnvironment();
  const byAbbr = new Map(statesData.map((s) => [s.abbr, s]));
  const rows = chambers.map((c) => {
    const state = byAbbr.get(c.abbr)!;
    const unicameral = UNICAMERAL_STATES.has(c.abbr);
    const comp = latestChamberSeats(stateLegData[state.name] ?? [], unicameral ? "House" : c.chamber === "house" ? "House" : "Senate");
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

  // Map rows: every state, both chambers — including chambers with no election this cycle, which keep
  // today's composition in the projected view.
  const projByKey = new Map(chambers.map((c) => [`${c.abbr}-${c.chamber}`, c]));
  const mapStates: LegislatureMapState[] = statesData.filter((s) => s.abbr !== "DC").map((state) => {
    const unicameral = UNICAMERAL_STATES.has(state.abbr);
    const build = (chamber: "house" | "senate"): LegislatureMapChamber | null => {
      const c = projByKey.get(`${state.abbr}-${chamber}`);
      const comp = latestChamberSeats(stateLegData[state.name] ?? [], unicameral || chamber === "house" ? "House" : "Senate");
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

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)" }}>{electionYear} forecast</div>
          <h1 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6vw, 4.25rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>State Legislatures</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            {chambers.length} chambers are on the ballot. Each is simulated seat by seat from the district atlas: a district&apos;s lean on today&apos;s lines, the national environment (E {env.eHat >= 0 ? "R" : "D"}+{Math.abs(env.eHat).toFixed(1)}, σ {env.sigmaE.toFixed(1)}), incumbency, and the {electionYear} field. Seats not on the ballot hold their sitting member. Method: <Link href="/methodology/state-leg" className="underline underline-offset-2">Legislative atlas</Link>.
          </p>
          <div className="mt-6 pt-4 flex flex-wrap gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
            {[
              { label: "Chambers on the ballot", value: chambers.length, sub: `${demHeld} Democratic-held · ${repHeld} Republican-held` },
              { label: "In play", value: competitive.length, sub: "either party ≥ 20% to control" },
              { label: "Expected flips", value: expectedFlips.toFixed(1), sub: "sum of flip probabilities" },
              { label: "Expected Democratic chambers", value: expectedDemAfter.toFixed(1), sub: `of ${chambers.length} on the ballot` },
            ].map((s) => (
              <div key={s.label} className="min-w-[140px]">
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>{s.label}</div>
                <div className="text-lg font-bold tabular-nums leading-tight">{s.value}</div>
                <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <LegislatureControlMap states={mapStates} year={electionYear} />
        <div className="flex items-baseline gap-3 pb-3 mb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
          <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Chambers</h2>
          <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>closest first · 80% range of Democratic seats · race noise σ {STATE_LEG_FORECAST_CONSTANTS.SIGMA}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                {[["State", "left"], ["Chamber", "left"], ["Seats", "right"], ["Now", "right"], ["Up", "right"], ["Projected D", "right"], ["Projected R", "right"], ["P(D control)", "right"], ["P(R control)", "right"], ["Supermajority", "right"], ["Unopposed", "right"]].map(([h, a]) => (
                  <th key={h} className={`py-1.5 pr-3 text-[10px] uppercase tracking-wider font-semibold text-${a}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, state, comp, label }) => {
                const superP = c.supermajority == null ? null : Math.max(c.pDemSuper ?? 0, c.pRepSuper ?? 0);
                const superWho = c.supermajority == null ? null : (c.pDemSuper ?? 0) >= (c.pRepSuper ?? 0) ? "D" : "R";
                const flipText = c.pDemControl == null ? "" : "";
                void flipText;
                return (
                  <tr key={`${c.abbr}-${c.chamber}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap"><Link href={`/states/${state.id}/legislature/${c.chamber}`} className="hover:underline">{state.name}</Link></td>
                    <td className="py-2 pr-3">{label}</td>
                    <td className="py-2 pr-3 text-right">{c.totalSeats ?? "—"}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{comp ? <><span style={{ color: "var(--party-dem)" }}>{comp.dem}</span>–<span style={{ color: "var(--party-rep)" }}>{comp.rep}</span>{comp.oth ? <span style={{ color: "var(--party-ind)" }}>–{comp.oth}</span> : null}</> : "—"}</td>
                    <td className="py-2 pr-3 text-right">{c.seatsUp}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap" style={{ color: "var(--party-dem)" }}>{c.expectedDem.toFixed(1)} <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>({c.lo80}–{c.hi80})</span></td>
                    <td className="py-2 pr-3 text-right" style={{ color: "var(--party-rep)" }}>{c.expectedRep.toFixed(1)}</td>
                    <td className="py-2 pr-3 text-right font-semibold" style={{ color: c.pDemControl != null && c.pDemControl >= 0.5 ? "var(--party-dem)" : "var(--app-text-muted)" }}>{pct(c.pDemControl)}</td>
                    <td className="py-2 pr-3 text-right font-semibold" style={{ color: c.pRepControl != null && c.pRepControl >= 0.5 ? "var(--party-rep)" : "var(--app-text-muted)" }}>{pct(c.pRepControl)}</td>
                    <td className="py-2 pr-3 text-right" style={{ color: "var(--app-text-muted)" }}>{superP == null ? "—" : superP < 0.005 ? "<1%" : `${superWho} ${Math.round(superP * 100)}%`}</td>
                    <td className="py-2 pr-0 text-right" style={{ color: "var(--app-text-muted)" }}>{c.decided.dem + c.decided.rep}{c.unprojected ? <span title="seats with no projection"> · {c.unprojected} n/p</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-3xl text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          &ldquo;Now&rdquo; is the composition after the last election on record. Control odds are withheld (—) where seats with no projection could decide them: Nebraska&apos;s nonpartisan Legislature. Multi-member districts draw each seat on the same margin. Michigan&apos;s 110-seat House can tie, so its two control odds do not sum to 100%.
        </p>
      </main>
    </div>
  );
}

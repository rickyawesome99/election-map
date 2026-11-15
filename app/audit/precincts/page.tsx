import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import coverageJson from "@/data/precincts/coverage.json";

export const metadata = {
  title: "Precinct Data Tracker",
  robots: { index: false, follow: false },
};

// The grid is written by the precinct pipeline (scripts/precincts/build_results_*.py), never by hand:
// a cell turns green only when precinct sums agree with the county and district totals the site
// already holds. The public precinct page will read the same file to grey out what is unavailable.

type Status = "na" | "missing" | "loaded" | "explained" | "reconciled";
type Cell = { status: Status; d?: number; r?: number; o?: number; truthD?: number; truthR?: number; diffD?: number; diffR?: number; src?: string; withVotes?: number; matched?: number; note?: string; basis?: string };
type StateEntry = { n: number; anchor: { kind: string; built: string; confidence: string; same_in_2026: string }; years: Record<string, Record<string, Cell>> };
type Coverage = { generated: string; offices: string[]; years: number[]; tolerance: number; states: Record<string, StateEntry> };

const coverage = coverageJson as unknown as Coverage;

const OFFICE_LABEL: Record<string, string> = { PRES: "President", USS: "U.S. Senate", GOV: "Governor", USH: "U.S. House", SLDU: "State Senate", SLDL: "State House" };
const OFFICE_SHORT: Record<string, string> = { PRES: "P", USS: "S", GOV: "G", USH: "H", SLDU: "SS", SLDL: "SH" };

const STATUS_COLOR: Record<Status, string> = {
  reconciled: "#3d8f5f",
  explained: "#8fc7a4",
  loaded: "#c9a227",
  missing: "transparent",
  na: "transparent",
};
const STATUS_LABEL: Record<Status, string> = {
  reconciled: "Reconciled",
  explained: "Differs for a documented reason",
  loaded: "Loaded, not reconciled",
  missing: "Missing",
  na: "No contest",
};

const pct = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}`);
const num = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString());

function Box({ cell, label }: { cell: Cell; label: string }) {
  const s = cell.status;
  const title =
    s === "na" ? `${label}: no contest`
    : s === "missing" ? `${label}: missing`
    : `${label}: ${STATUS_LABEL[s]} · D ${num(cell.d)} R ${num(cell.r)}` + (cell.truthD !== undefined ? ` · site D ${num(cell.truthD)} R ${num(cell.truthR)} · diff D ${pct(cell.diffD)} R ${pct(cell.diffR)} pts` : " · no site total to compare");
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: "inline-block",
        width: 11,
        height: 11,
        background: STATUS_COLOR[s],
        border: s === "missing" ? "1.5px solid var(--app-text-muted)" : s === "na" ? "1px dotted var(--app-border)" : "1px solid transparent",
        opacity: s === "na" ? 0.5 : 1,
      }}
    />
  );
}

function SectionHeading({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="pb-3 mb-4" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-bold" style={{ color: "var(--app-text-muted)" }}>{n}</span>
        <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}>{title}</h2>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed max-w-4xl" style={{ color: "var(--app-text-muted)" }}>{children}</p>
    </div>
  );
}

export default function PrecinctTrackerPage() {
  const states = Object.keys(coverage.states).sort();
  const { years, offices } = coverage;

  const tally: Record<Status, number> = { reconciled: 0, explained: 0, loaded: 0, missing: 0, na: 0 };
  const byYear: Record<number, Record<Status, number>> = {};
  const open: { st: string; year: number; office: string; cell: Cell }[] = [];
  let precincts = 0;
  for (const st of states) {
    precincts += coverage.states[st].n;
    for (const y of years) {
      byYear[y] ??= { reconciled: 0, explained: 0, loaded: 0, missing: 0, na: 0 };
      for (const o of offices) {
        const cell = coverage.states[st].years[String(y)]?.[o] ?? { status: "na" as Status };
        tally[cell.status] += 1;
        byYear[y][cell.status] += 1;
        if (cell.status === "loaded" || cell.status === "explained") open.push({ st, year: y, office: o, cell });
      }
    }
  }
  const contests = tally.reconciled + tally.explained + tally.loaded + tally.missing;
  open.sort((a, b) => (a.cell.status === b.cell.status ? 0 : a.cell.status === "loaded" ? -1 : 1) || Math.max(Math.abs(b.cell.diffD ?? 0), Math.abs(b.cell.diffR ?? 0)) - Math.max(Math.abs(a.cell.diffD ?? 0), Math.abs(a.cell.diffR ?? 0)));

  const th = "px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-left";
  const td = "px-1.5 py-1 text-xs";

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Audit" title="Precinct Data Tracker">
        <Fig>{precincts.toLocaleString()}</Fig> precincts on the 2024 map in <Fig>{states.length}</Fig> states. Of{" "}
        <Fig>{contests.toLocaleString()}</Fig> state-year-office contests from 2016 to 2026, <Fig>{tally.reconciled.toLocaleString()}</Fig> are
        loaded and agree with the site&rsquo;s totals, <Fig>{tally.explained.toLocaleString()}</Fig> differ for a documented reason,{" "}
        <Fig>{tally.loaded.toLocaleString()}</Fig> are loaded but unresolved, and{" "}
        <Fig>{tally.missing.toLocaleString()}</Fig> are still missing. Updated {coverage.generated}.
      </StandfirstHeader>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-7 sm:pt-8 pb-10 flex flex-col gap-10">
        <section>
          <SectionHeading n={1} title="Coverage — state × year × office">
            Each square is one contest: president, U.S. Senate, governor, U.S. House, state Senate, state House, in that
            order within a year. Green means the precinct sums match the site&rsquo;s county or district totals within{" "}
            {(coverage.tolerance * 100).toFixed(1)} points of the two-party vote for both parties. Pale green means they
            differ for a documented reason, such as a ranked-choice round. Amber means votes are loaded and the gap is
            unresolved, often because the site&rsquo;s own figure looks wrong. An empty outlined square is a contest that was held and has no precinct data. A
            faint dotted square means no such contest that year. Hover a square for the numbers.
          </SectionHeading>

          <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {(["reconciled", "explained", "loaded", "missing", "na"] as Status[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <Box cell={{ status: s }} label={STATUS_LABEL[s]} /> {STATUS_LABEL[s]} · {tally[s].toLocaleString()}
              </span>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <th className={th} style={{ color: "var(--app-text-muted)" }}>State</th>
                  <th className={`${th} text-right`} style={{ color: "var(--app-text-muted)" }}>Precincts</th>
                  {years.map((y) => (
                    <th key={y} className={th} style={{ color: "var(--app-text-muted)" }}>
                      {y}
                      <div className="font-normal normal-case tracking-normal" style={{ fontSize: 9, whiteSpace: "nowrap" }}>
                        {offices.map((o) => OFFICE_SHORT[o]).join(" ")}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {states.map((st) => {
                  const e = coverage.states[st];
                  return (
                    <tr key={st} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td className={`${td} font-semibold`} title={`Anchor: ${e.anchor.kind}, confidence ${e.anchor.confidence || "n/a"}; same precincts in 2026: ${e.anchor.same_in_2026 || "unknown"}`}>{st}</td>
                      <td className={`${td} text-right`} style={{ color: "var(--app-text-muted)" }}>{e.n.toLocaleString()}</td>
                      {years.map((y) => (
                        <td key={y} className={td} style={{ whiteSpace: "nowrap" }}>
                          <span className="inline-flex gap-[3px]">
                            {offices.map((o) => (
                              <Box key={o} cell={e.years[String(y)]?.[o] ?? { status: "na" }} label={`${st} ${y} ${OFFICE_LABEL[o]}`} />
                            ))}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                  <td className={`${td} font-semibold`} colSpan={2}>Done / held</td>
                  {years.map((y) => {
                    const b = byYear[y];
                    const held = b.reconciled + b.explained + b.loaded + b.missing;
                    return (
                      <td key={y} className={td} style={{ color: "var(--app-text-muted)" }}>
                        {held ? `${b.reconciled + b.explained + b.loaded}/${held}` : "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionHeading n={2} title="Differences from the site&rsquo;s totals">
            Contests where precinct votes are in but the statewide sum differs from the site&rsquo;s total, largest gap
            first. The difference is in points of the site&rsquo;s two-party vote. Typical causes: an independent the
            site counts in the Democratic column, uncontested seats left out of one source, countywide absentee votes
            that were never assigned to precincts, or a source error on either side.
          </SectionHeading>
          <div style={{ overflowX: "auto" }}>
            <table className="w-full" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  <th className={th}>State</th>
                  <th className={th}>Year</th>
                  <th className={th}>Office</th>
                  <th className={`${th} text-right`}>Precinct D</th>
                  <th className={`${th} text-right`}>Site D</th>
                  <th className={`${th} text-right`}>Diff D</th>
                  <th className={`${th} text-right`}>Precinct R</th>
                  <th className={`${th} text-right`}>Site R</th>
                  <th className={`${th} text-right`}>Diff R</th>
                  <th className={th}>Status</th>
                  <th className={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {open.map(({ st, year, office, cell }) => (
                  <tr key={`${st}-${year}-${office}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className={`${td} font-semibold`}>{st}</td>
                    <td className={td}>{year}</td>
                    <td className={td}>{OFFICE_LABEL[office]}</td>
                    <td className={`${td} text-right`}>{num(cell.d)}</td>
                    <td className={`${td} text-right`}>{num(cell.truthD)}</td>
                    <td className={`${td} text-right`}>{pct(cell.diffD)}</td>
                    <td className={`${td} text-right`}>{num(cell.r)}</td>
                    <td className={`${td} text-right`}>{num(cell.truthR)}</td>
                    <td className={`${td} text-right`}>{pct(cell.diffR)}</td>
                    <td className={td} style={{ whiteSpace: "nowrap" }}>
                      <span className="inline-flex items-center gap-1.5"><Box cell={{ status: cell.status }} label={STATUS_LABEL[cell.status]} /> {cell.status === "explained" ? "Explained" : "Open"}</span>
                    </td>
                    <td className={td} style={{ color: "var(--app-text-muted)", minWidth: 280 }}>{cell.note ?? "Not yet investigated."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

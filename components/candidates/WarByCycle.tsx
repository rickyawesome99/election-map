import { WAR_BAD, WAR_GOOD } from "@/components/tpl/format";

// A candidate's WAR, one bar per cycle and office (a state legislative race, office "L", is a bar like any other): positive rises from the zero line, negative hangs below
// it, on one scale. A presidential run is scored state by state (50+ rows in one year), so its
// bar is the average per state, the same basis careerWar uses. Shared by the candidate page and
// the WAR tab's candidate record; no hooks, so it renders on the server too. The bars grow from
// the zero line one after another (held until on screen inside a [data-vh] block).
export function WarByCycle({ rows, barPx = 120 }: { rows: { year: number; office: string; state: string; war: number }[]; barPx?: number }) {
  const states = [...new Set(rows.map((r) => r.state))];
  const cycles: { key: string; year: number; war: number; states: string[] }[] = [];
  for (const r of [...rows].sort((a, b) => a.year - b.year)) {
    const key = `${r.year}|${r.office}`;
    const c = cycles.find((x) => x.key === key);
    if (c) { c.war += r.war; c.states.push(r.state); } else cycles.push({ key, year: r.year, war: r.war, states: [r.state] });
  }
  for (const c of cycles) if (c.key.endsWith("|P")) c.war /= c.states.length;
  const maxPos = Math.max(0, ...cycles.map((c) => c.war));
  const maxNeg = Math.max(0, ...cycles.map((c) => -c.war));
  const LABEL_PX = 18;
  const pxPer = barPx / Math.max(maxPos + maxNeg, 0.1);
  const posH = maxPos * pxPer, negH = maxNeg * pxPer;
  // A career across offices (a legislator who ran for Congress) names each bar's office.
  const OFFICE_TAG: Record<string, string> = { L: "Leg.", H: "House", S: "Sen.", G: "Gov.", P: "Pres." };
  const mixed = new Set(cycles.map((c) => c.key.split("|")[1])).size > 1;
  const stCol = (c: { key: string; states: string[] }) => (mixed ? ` · ${OFFICE_TAG[c.key.split("|")[1]] ?? ""}` : "") + (c.states.length > 1 ? ` · ${c.states.length} st` : states.length > 1 ? ` · ${c.states[0]}` : "");
  return (
    <div className="flex px-1 pt-2" style={{ borderBottom: "1px solid var(--app-border)" }} role="img" aria-label={`WAR by cycle. ${cycles.map((r) => `${r.year}: ${r.war.toFixed(1)}`).join(", ")}`}>
      {cycles.map((r, i) => {
        const delay = `${Math.min(i, 10) * 70}ms`;
        const h = Math.max(3, Math.abs(r.war) * pxPer);
        const label = <b className="rg-fade tabular-nums transition-transform duration-200 group-hover:scale-110" style={{ animationDelay: `${Math.min(i, 10) * 70 + 320}ms`, color: r.war < 0 ? WAR_BAD : r.war > 0 ? WAR_GOOD : "var(--app-text-primary)" }}>{r.war > 0 ? "+" : r.war < 0 ? "−" : ""}{Math.abs(r.war).toFixed(1)}</b>;
        return (
          <div key={r.key} title={r.states.length > 1 ? `${r.year}: average over ${r.states.length} states` : undefined} className="group flex min-w-0 flex-1 flex-col items-center text-[11px]" style={{ color: "var(--app-text-muted)" }}>
            <div className="flex w-full flex-col items-center justify-end gap-1 px-1" style={{ height: posH + LABEL_PX }}>
              {r.war >= 0 && <>{label}<span className="rg-grow block w-full max-w-[48px] rounded-t-sm opacity-90 transition-opacity duration-200 group-hover:opacity-100" style={{ height: h, background: WAR_GOOD, transformOrigin: "center bottom", animationDelay: delay }} /></>}
            </div>
            <div className="w-full" style={{ borderTop: "1px solid var(--app-text-muted)" }} />
            <div className="flex w-full flex-col items-center justify-start gap-1 px-1" style={{ height: negH + (maxNeg > 0 ? LABEL_PX : 0) }}>
              {r.war < 0 && <><span className="rg-grow block w-full max-w-[48px] rounded-b-sm opacity-90 transition-opacity duration-200 group-hover:opacity-100" style={{ height: h, background: WAR_BAD, transformOrigin: "center top", animationDelay: delay }} />{label}</>}
            </div>
            <span className="mt-1 truncate pb-1">{r.year}{stCol(r)}</span>
          </div>
        );
      })}
    </div>
  );
}

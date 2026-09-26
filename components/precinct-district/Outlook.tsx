// The 2026 outlook section: the projected margin and its band, how it was built (a ledger of
// terms and the race rows behind the lean), and what the seat looks like at the 2026
// turnout estimate. Server component; the projection is computed by the page.

import Link from "next/link";
import { fmtMargin } from "@/lib/colorScale";
import type { DistrictConfig, DistrictFinance } from "@/lib/precinctDistrict/types";
import type { DistrictProjection } from "@/lib/precinctDistrict/project";

const mc = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.05 ? "var(--app-text-muted)" : v > 0 ? "var(--party-rep)" : "var(--party-dem)");
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
const M = ({ v }: { v: number | null | undefined }) => <span className="tabular-nums font-semibold" style={{ color: mc(v) }}>{fmtMargin(v ?? null)}</span>;

export interface StatewideContext { label: string; margin: number; dem: string; rep: string; href: string }

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function Outlook({ config, p, statewide, finance }: { config: DistrictConfig; p: DistrictProjection; statewide: StatewideContext[]; finance?: DistrictFinance }) {
  const e = config.election2026;
  const dName = e?.candidates?.d?.name ?? "the Democrat";
  const turnout = p.turnout;
  const rName = e?.candidates?.r?.name ?? "the Republican";
  const pR = 1 - p.pD;
  const terms: { label: string; note: string; value: number; op?: string }[] = [
    { label: "Structural lean", note: `${p.rows.filter((r) => r.included).length} race-years, incumbency and environment stripped, recency-weighted`, value: p.lean },
    { op: "+", label: "2026 environment", note: `β*(${p.stateAbbr}) ${p.beta.toFixed(2)} × E(2026) ${signed(p.eHat)}`, value: p.envPts },
    { op: "+", label: "Incumbency", note: e?.status === "open" ? "open seat" : "incumbent on the ballot", value: 0 },
    { op: "+", label: "Down-ballot gap", note: p.gap.raw == null ? "no single-race State House year" : `State House ran ${signed(p.gap.raw)} vs the top of the ticket over ${p.gap.n} year${p.gap.n === 1 ? "" : "s"}, shrunk ×${p.gap.shrink.toFixed(2)}`, value: p.gap.value },
    ...(p.money ? [{ op: "+", label: "Campaign money", note: `receipts through ${fmtDate(p.money.through)}: gap ${signed(p.money.gapPct)}% vs ${signed(p.money.structuralGapPct)}% typical, × K ${p.money.calibration.K}${Math.abs(p.money.pts) >= p.money.calibration.CAP ? `, capped at ±${p.money.calibration.CAP}` : ""}`, value: p.money.pts }] : []),
  ];

  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Headline */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Projected margin · {e ? new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "2026"}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.5rem, 6vw, 4rem)", fontWeight: 700, lineHeight: 1, color: mc(p.margin) }}>{fmtMargin(p.margin)}</span>
            <span className="text-sm" style={{ color: "var(--app-text-muted)" }}>80% band {fmtMargin(p.interval80[0])} to {fmtMargin(p.interval80[1])}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
            <div><div className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--party-dem)" }}>{Math.round(p.pD * 100)}%</div><div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{dName} (D)</div></div>
            <div><div className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--party-rep)" }}>{Math.round(pR * 100)}%</div><div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{rName} (R)</div></div>
            <div><div className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>±{p.sigma.toFixed(1)}</div><div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>σ, points</div></div>
          </div>
          {statewide.length > 0 && (
            <div className="mt-4 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{config.stateName} statewide, site forecast:</span>{" "}
              {statewide.map((s, i) => (
                <span key={s.href}>{i > 0 ? " · " : ""}<Link href={s.href} className="underline underline-offset-2">{s.label}</Link> <M v={s.margin} /></span>
              ))}
            </div>
          )}
        </div>

        {/* Ledger */}
        <div>
          <div className="pb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>How it is built</div>
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {terms.map((t) => (
                <tr key={t.label} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="w-4 py-1.5 pr-1 text-[12px]" style={{ color: "var(--app-text-very-muted)" }}>{t.op ?? ""}</td>
                  <td className="py-1.5 pr-3"><div className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{t.label}</div><div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{t.note}</div></td>
                  <td className="py-1.5 text-right"><M v={t.value} /></td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-1 text-[12px]" style={{ color: "var(--app-text-very-muted)" }}>=</td>
                <td className="py-2 pr-3 font-bold" style={{ color: "var(--app-text-primary)" }}>Projected margin<div className="text-[11px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>σ² = (β*σ_E)² + race noise²; details on the <Link href="/methodology/precinct-district" className="underline">methodology page</Link></div></td>
                <td className="py-2 text-right text-[15px]"><M v={p.margin} /></td>
              </tr>
            </tbody>
          </table>

          <details className="mt-3 text-[12.5px]">
            <summary className="cursor-pointer select-none font-semibold" style={{ color: "var(--app-text-muted)" }}>The race-years behind the lean</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                <thead><tr style={{ color: "var(--app-text-muted)" }}><th className="pb-1 text-left font-semibold">Race</th><th className="pb-1 text-right font-semibold">Raw</th><th className="pb-1 text-right font-semibold">Inc.</th><th className="pb-1 text-right font-semibold">Env.</th><th className="pb-1 text-right font-semibold">Money</th><th className="pb-1 text-right font-semibold">Neutral</th><th className="pb-1 text-right font-semibold">Weight</th></tr></thead>
                <tbody>
                  {p.rows.map((r) => (
                    <tr key={`${r.year}-${r.office}`} style={{ borderTop: "1px solid var(--app-border)", opacity: r.included ? 1 : 0.55 }}>
                      <td className="py-1 pr-2"><span style={{ color: "var(--app-text-primary)" }}>{r.label}</span>{r.candidates && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{r.candidates}</span>}{!r.included && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>— excluded: {r.reason}</span>}</td>
                      <td className="py-1 text-right"><M v={r.raw} /></td>
                      <td className="py-1 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.incPts ? signed(r.incPts) : "—"}</td>
                      <td className="py-1 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{signed(r.envPts)}</td>
                      <td className="py-1 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.moneyPts ? signed(-r.moneyPts) : "—"}</td>
                      <td className="py-1 text-right"><M v={r.NM} /></td>
                      <td className="py-1 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.included ? `${(r.weight * 100).toFixed(1)}%${r.huber < 0.999 ? ` · Huber ×${r.huber.toFixed(2)}` : ""}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Margins are two-party on today&apos;s precinct lines. Inc. = incumbency strip (House advantage {p.constants.incumbencyPts.toFixed(1)} used for State House). Env. = −β* × E(year). Money = the nominees&apos; money edge beyond the typical gap for the seat, removed (only races with receipts on file). A year that summed several districts is not one race and is left out.</div>
            </div>
          </details>
        </div>
      </div>

      {/* Campaign money */}
      {p.money && finance && (() => {
        const m = p.money, cal = m.calibration, f = finance["2026"];
        const cands = [{ c: f.d, color: "var(--party-dem)", party: "D" }, { c: f.r, color: "var(--party-rep)", party: "R" }];
        const strip = p.rows.filter((r) => r.moneyPts);
        return (
          <div className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Campaign money</div>
              <div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Candidate committees through {fmtDate(f.through)}{f.nextReport ? ` · next: ${f.nextReport}` : ""}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--app-text-muted)" }}>
                    <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider">Candidate</th>
                    <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">Total raised</th>
                    <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">In-kind</th>
                    <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">Spent</th>
                    <th className="py-2 pl-3 text-right text-[11px] font-semibold uppercase tracking-wider">Cash on hand</th>
                  </tr>
                </thead>
                <tbody>
                  {cands.map(({ c, color, party }) => (
                    <tr key={party} style={{ borderTop: "1px solid var(--app-border)" }}>
                      <td className="py-2 pr-3"><a href={c.url} className="font-semibold hover:underline" style={{ color }}>{c.name} ({party})</a><div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{c.committee}</div></td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: "var(--app-text-primary)" }}>{usd(c.receipts)}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{usd(c.inKind)}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{usd(c.spent)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{usd(c.cashOnHand)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="mt-3 text-[12.5px]">
              <summary className="cursor-pointer select-none font-semibold" style={{ color: "var(--app-text-muted)" }}>More details</summary>
              <div className="mt-2 max-w-4xl space-y-1.5 text-[11.5px]" style={{ color: "var(--app-text-very-muted)" }}>
                <p>
                  <b style={{ color: "var(--app-text-muted)" }}>How it enters the margin.</b> Receipts gap {signed(m.gapPct)}% (R-positive share of the two nominees&apos; combined {usd(m.dReceipts + m.rReceipts)}), × {m.scale} because the trailing side usually closes part of the gap after mid-cycle = {signed(m.scale * m.gapPct)}%. {m.incSign === 0 ? "An open" : m.incSign > 0 ? "A Republican-held" : "A Democratic-held"} {config.state} House seat at a {fmtMargin(m.presMargin)} presidential margin typically sees {signed(m.structuralGapPct)}%, so the edge beyond the seat is {signed(m.residualGapPct)}%. At K = {cal.K} points per point of edge that is {signed(cal.K * m.residualGapPct)}{Math.abs(cal.K * m.residualGapPct) > cal.CAP ? `, capped at ${signed(m.pts)}` : ""}.
                  K and the typical gap are fitted on {cal.n} contested {cal.state} House races in {cal.fitYear} (K = {cal.kOls.toFixed(3)} ± {cal.kSe.toFixed(3)}, rounded; the money term cuts the fit&apos;s error from {cal.rmse.noMoney.toFixed(1)} to {cal.rmse.withMoney.toFixed(1)} points) — see the <Link href="/methodology/precinct-district" className="underline">methodology</Link>.
                </p>
                <p>
                  <b style={{ color: "var(--app-text-muted)" }}>Raised is not spending power.</b> Gross receipts are the calibration&apos;s measure and read as a signal of donor and caucus backing. They include in-kind spending made on a candidate&apos;s behalf and money a candidate passes on to the caucus, so cash on hand can run the other way.
                  {[f.d, f.r].flatMap((c) => c.caveats ?? []).map((t) => <span key={t}> {t}</span>)}
                </p>
                {strip.length > 0 && (
                  <p>
                    <b style={{ color: "var(--app-text-muted)" }}>Past races.</b> {strip.map((r) => { const h = finance.history[r.office]?.[String(r.year)]; return `${r.label}: ${h?.rName ?? "R"} ${usd(h?.r ?? 0)} vs ${h?.dName ?? "D"} ${usd(h?.d ?? 0)}, worth ${signed(r.moneyPts)} beyond the typical gap for the seat`; }).join("; ")}. That much is removed from those rows before the lean and the down-ballot gap are formed, so it is not counted twice.
                  </p>
                )}
              </div>
            </details>
          </div>
        );
      })()}

      {/* 2026 turnout estimate */}
      <div className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>What the projected margin means in votes</div>
          <div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>each precinct at its {p.baseline.year} baseline plus the district&apos;s projected shift ({signed(p.shift)})</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--app-text-muted)" }}>
                <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider">Turnout</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">Ballots</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">Rate</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--party-dem)" }}>{dName}</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--party-rep)" }}>{rName}</th>
                <th className="py-2 pl-3 text-right text-[11px] font-semibold uppercase tracking-wider">Net votes to flip</th>
              </tr>
            </thead>
            <tbody>
              {[{ key: "est", label: "2026 estimate", note: `each precinct's average ${turnout.basisYears.join("/")} turnout rate on today's registration`, v: turnout, main: true },
                ...turnout.range.map((r) => ({ key: String(r.year), label: `At ${r.year} rates`, note: turnout.range.length < 2 ? "basis year alone" : r.ballots === Math.min(...turnout.range.map((x) => x.ballots)) ? "low end" : "high end", v: r, main: false }))].map((row) => (
                <tr key={row.key} style={{ borderTop: "1px solid var(--app-border)", color: row.main ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
                  <td className="py-2 pr-3"><div className={row.main ? "font-semibold" : ""}>{row.label}</div><div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{row.note}</div></td>
                  <td className={`py-2 px-3 text-right tabular-nums ${row.main ? "font-semibold" : ""}`}>{row.v.ballots.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{row.v.rate.toFixed(1)}%</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--party-dem)" }}>{row.v.d.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--party-rep)" }}>{row.v.r.toLocaleString()}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{row.v.votesToFlip.toLocaleString()} <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>for {row.v.trailing === "D" ? dName : rName}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 max-w-4xl space-y-1.5 text-[11.5px]" style={{ color: "var(--app-text-very-muted)" }}>
          <p>
            Baseline per precinct = {Math.round(p.constants.BASELINE_PRES_WEIGHT * 100)}% {p.baseline.year} {p.baseline.topOffice === "pres" ? "President" : "top of ticket"} + {Math.round((1 - p.constants.BASELINE_PRES_WEIGHT) * 100)}% {p.baseline.year} State House, so a precinct&apos;s projection reflects both its partisanship and how it voted for the legislature. The Projection mode in the explorer maps every precinct at this turnout.
          </p>
          <p>
            <b style={{ color: "var(--app-text-muted)" }}>Turnout sets the size of the race, not the margin.</b> For scale, {turnout.presYear} saw {turnout.presBallots.toLocaleString()} ballots. Midterm turnout falls almost evenly across this district&apos;s precincts, so the turnout estimate barely moves the margin; the margin is the projection above. What precinct rates cannot show is which voters inside a precinct stay home in a midterm.
          </p>
        </div>
      </div>
    </div>
  );
}

// The 2026 outlook section: the projected margin and its band, how it was built (a ledger of
// terms and the race rows behind the lean), and what the seat looks like under each turnout
// scenario. Server component; the projection is computed by the page.

import Link from "next/link";
import { fmtMargin } from "@/lib/colorScale";
import type { DistrictConfig } from "@/lib/precinctDistrict/types";
import type { DistrictProjection } from "@/lib/precinctDistrict/project";

const mc = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.05 ? "var(--app-text-muted)" : v > 0 ? "var(--party-rep)" : "var(--party-dem)");
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
const M = ({ v }: { v: number | null | undefined }) => <span className="tabular-nums font-semibold" style={{ color: mc(v) }}>{fmtMargin(v ?? null)}</span>;

export interface StatewideContext { label: string; margin: number; dem: string; rep: string; href: string }

export default function Outlook({ config, p, statewide }: { config: DistrictConfig; p: DistrictProjection; statewide: StatewideContext[] }) {
  const e = config.election2026;
  const dName = e?.candidates?.d?.name ?? "the Democrat";
  const rName = e?.candidates?.r?.name ?? "the Republican";
  const leader = p.margin < 0 ? dName : rName;
  const pR = 1 - p.pD;
  const terms: { label: string; note: string; value: number; op?: string }[] = [
    { label: "Structural lean", note: `${p.rows.filter((r) => r.included).length} race-years, incumbency and environment stripped, recency-weighted`, value: p.lean },
    { op: "+", label: "2026 environment", note: `β*(${p.stateAbbr}) ${p.beta.toFixed(2)} × E(2026) ${signed(p.eHat)}`, value: p.envPts },
    { op: "+", label: "Incumbency", note: e?.status === "open" ? "open seat" : "incumbent on the ballot", value: 0 },
    { op: "+", label: "Down-ballot gap", note: p.gap.raw == null ? "no single-race State House year" : `State House ran ${signed(p.gap.raw)} vs the top of the ticket over ${p.gap.n} year${p.gap.n === 1 ? "" : "s"}, shrunk ×${p.gap.shrink.toFixed(2)}`, value: p.gap.value },
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
          <p className="mt-4 max-w-xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            A structural read as of {p.asOf}: where these precincts sit once past candidates and past national environments are stripped out, moved by the national environment the site currently expects for November and by the seat being open. {leader} leads on that arithmetic; the band is wide because state legislative results carry more candidate-specific variation than the races the site&apos;s forecast is fitted on. No polling, fundraising or candidate-quality term is in the number yet.
          </p>
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
                <thead><tr style={{ color: "var(--app-text-muted)" }}><th className="pb-1 text-left font-semibold">Race</th><th className="pb-1 text-right font-semibold">Raw</th><th className="pb-1 text-right font-semibold">Inc.</th><th className="pb-1 text-right font-semibold">Env.</th><th className="pb-1 text-right font-semibold">Neutral</th><th className="pb-1 text-right font-semibold">Weight</th></tr></thead>
                <tbody>
                  {p.rows.map((r) => (
                    <tr key={`${r.year}-${r.office}`} style={{ borderTop: "1px solid var(--app-border)", opacity: r.included ? 1 : 0.55 }}>
                      <td className="py-1 pr-2"><span style={{ color: "var(--app-text-primary)" }}>{r.label}</span>{r.candidates && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{r.candidates}</span>}{!r.included && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>— excluded: {r.reason}</span>}</td>
                      <td className="py-1 text-right"><M v={r.raw} /></td>
                      <td className="py-1 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.incPts ? signed(r.incPts) : "—"}</td>
                      <td className="py-1 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{signed(r.envPts)}</td>
                      <td className="py-1 text-right"><M v={r.NM} /></td>
                      <td className="py-1 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.included ? `${(r.weight * 100).toFixed(1)}%${r.huber < 0.999 ? ` · Huber ×${r.huber.toFixed(2)}` : ""}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Margins are two-party on today&apos;s precinct lines. Inc. = incumbency strip (House advantage {p.constants.incumbencyPts.toFixed(1)} used for State House). Env. = −β* × E(year). A year that summed several districts is not one race and is left out.</div>
            </div>
          </details>
        </div>
      </div>

      {/* Turnout scenarios */}
      <div className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>What the projected margin means in votes</div>
          <div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>each precinct at its {p.baseline.year} baseline plus the district&apos;s projected shift ({signed(p.shift)})</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--app-text-muted)" }}>
                <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider">Turnout scenario</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">Ballots</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--party-dem)" }}>{dName}</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--party-rep)" }}>{rName}</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">Margin</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-wider">vs {p.scenarios[0]?.basisYear} turnout</th>
                <th className="py-2 pl-3 text-right text-[11px] font-semibold uppercase tracking-wider">Net votes to flip</th>
              </tr>
            </thead>
            <tbody>
              {p.scenarios.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--app-border)" }}>
                  <td className="py-2 pr-3"><div className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{s.label}</div><div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{s.basisYear === p.baseline.year ? "ballots as cast" : `each precinct's ${s.basisYear} turnout rate on today's registration`}</div></td>
                  <td className="py-2 px-3 text-right tabular-nums">{s.ballots.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--party-dem)" }}>{s.d.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--party-rep)" }}>{s.r.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right"><M v={s.margin} /></td>
                  <td className="py-2 px-3 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                    {s.id === p.scenarios[0]?.id ? "—" : `${signed(s.margin - p.scenarios[0].margin)} pts`}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums" style={{ color: "var(--app-text-primary)" }}>{s.votesToFlip.toLocaleString()} <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>for {s.trailing === "D" ? dName : rName}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 max-w-4xl space-y-1.5 text-[11.5px]" style={{ color: "var(--app-text-very-muted)" }}>
          <p>
            Baseline per precinct = {Math.round(p.constants.BASELINE_PRES_WEIGHT * 100)}% {p.baseline.year} {p.baseline.topOffice === "pres" ? "President" : "top of ticket"} + {Math.round((1 - p.constants.BASELINE_PRES_WEIGHT) * 100)}% {p.baseline.year} State House, so a precinct&apos;s projection reflects both its partisanship and how it voted for the legislature. The Projection mode in the explorer maps every precinct.
          </p>
          <p>
            <b style={{ color: "var(--app-text-muted)" }}>What a scenario does and does not move.</b> Each precinct keeps its projected margin, so the district margin shifts only through which precincts turn out. Here that is worth a fraction of a point, because turnout falls almost evenly across the district in a midterm rather than concentrating in one party&apos;s precincts. What these rows do not capture is the same precinct&apos;s electorate voting differently when fewer of its neighbours show up — a real midterm effect, but one that happens inside precincts and cannot be read off precinct turnout rates. The vote columns are what the scenarios are for: how many votes each side needs to find, and where.
          </p>
        </div>
      </div>
    </div>
  );
}

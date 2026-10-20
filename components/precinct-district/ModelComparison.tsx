// This page's precinct projection beside the site's general state legislature model for the same
// seat: the two margins, the terms behind each, and where they part ways. Server component; the
// page computes both projections and hands this a plain summary of the legislature model's.

import Link from "next/link";
import { fmtMargin } from "@/lib/colorScale";
import type { DistrictConfig } from "@/lib/precinctDistrict/types";
import type { DistrictProjection } from "@/lib/precinctDistrict/project";

export interface LegModelSummary {
  href: string;
  margin: number | null;
  sigma: number;
  pD: number | null;
  rating: string | null;
  lean: number | null;
  envPts: number;
  incPts: number;
  money: { pts: number; K: number; CAP: number; gapPct: number; structuralGapPct: number } | null;
  rows: { pres: number; seat: number; relocated: number; years: [number, number] | null };
}

const mc = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.05 ? "var(--app-text-muted)" : v > 0 ? "var(--party-rep)" : "var(--party-dem)");
const M = ({ v, big }: { v: number | null | undefined; big?: boolean }) => <span className={`tabular-nums font-semibold ${big ? "text-2xl font-extrabold" : ""}`} style={{ color: mc(v) }}>{v == null ? "—" : fmtMargin(v)}</span>;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default function ModelComparison({ config, p, leg }: { config: DistrictConfig; p: DistrictProjection; leg: LegModelSummary | null }) {
  const e = config.election2026;
  const rName = e?.candidates?.r?.name ?? "the Republican";
  const included = p.rows.filter((r) => r.included);
  const statewideKinds = [...new Set(included.filter((r) => r.office !== "pres" && r.office !== "sthouse").map((r) => r.label.replace(/^\d{4}\s+/, "")))];
  const pR = 1 - p.pD;
  const legPR = leg?.pD == null ? null : 1 - leg.pD;
  const diff = leg?.margin == null ? null : p.margin - leg.margin;

  const rows: { label: string; a: number | null; b: number | null; note?: string }[] = [
    { label: "Structural lean", a: p.lean, b: leg?.lean ?? null, note: `${included.length} race-years here${statewideKinds.length ? ` (president, State House, ${statewideKinds.join(", ")})` : ""} vs ${leg ? `${leg.rows.pres} presidential + ${leg.rows.seat} State House rows${leg.rows.relocated ? `, ${leg.rows.relocated} relocated from the old map` : ""}` : "—"}; State House rows carry the same seat weight in both` },
    { label: "2026 environment", a: p.envPts, b: leg?.envPts ?? null, note: `β*(${p.stateAbbr}) ${p.beta.toFixed(2)} × E(2026) ${signed(p.eHat)}, the same in both` },
    { label: "Incumbency", a: 0, b: leg?.incPts ?? null, note: e?.status === "open" ? "open seat" : "incumbent on the ballot" },
    { label: "Campaign money", a: p.money?.pts ?? null, b: leg?.money?.pts ?? null, note: p.money && leg?.money ? `the same K ${leg.money.K} and cap ±${leg.money.CAP}; the typical gap for the seat is ${p.stateAbbr}'s own House fit here (${signed(p.money.structuralGapPct)}%) and the legislature model's structural fit there (${signed(leg.money.structuralGapPct)}%)` : p.money ? `K ${p.money.calibration.K}, cap ±${p.money.calibration.CAP}` : "no receipts on file" },
  ];

  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>This page · precinct model</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3"><M v={p.margin} big /><span className="text-xs" style={{ color: "var(--app-text-muted)" }}>σ {p.sigma.toFixed(1)} · {rName} {pct(pR)}</span></div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Built from this district&apos;s own precinct sums, every race on the ballot since {config.years.length ? Math.min(...config.years) : ""}.</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>State legislature model</div>
          {leg ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3"><M v={leg.margin} big /><span className="text-xs" style={{ color: "var(--app-text-muted)" }}>σ {leg.sigma.toFixed(1)} · {rName} {pct(legPR)}{leg.rating ? ` · ${leg.rating}` : ""}</span></div>
              <div className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>The site&apos;s projection for every seat in the country, from presidential results and the seat&apos;s own past races. <Link href={leg.href} prefetch={false} className="underline underline-offset-2">District page</Link>.</div>
            </>
          ) : <div className="mt-1 text-sm" style={{ color: "var(--app-text-muted)" }}>No projection for this seat.</div>}
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Gap</div>
          {diff != null ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3"><span className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{Math.abs(diff).toFixed(1)}</span><span className="text-xs" style={{ color: "var(--app-text-muted)" }}>points {diff > 0 ? "more Republican" : "more Democratic"} here</span></div>
              <div className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                {Math.abs(diff) < 1 ? "The two models agree to within a point; " : Math.abs(diff) < 3 ? "A modest difference, well inside either model's uncertainty; " : "A real difference, though still inside either model's uncertainty; "}
                the ledger below shows which terms carry it. Neither is a poll: both read the district&apos;s voting history under a 2026 environment of {signed(p.eHat)}.
              </div>
            </>
          ) : <div className="mt-1 text-sm" style={{ color: "var(--app-text-muted)" }}>—</div>}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--app-text-muted)" }}>
              <th className="pb-1.5 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>Term</th>
              <th className="whitespace-nowrap pb-1.5 pl-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>This page</th>
              <th className="whitespace-nowrap pb-1.5 pl-3 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>Legislature model</th>
              <th className="hidden pb-1.5 pl-4 text-left text-[11px] font-semibold uppercase tracking-wider md:table-cell" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="py-1.5 pr-2" style={{ color: "var(--app-text-primary)" }}>{r.label}<div className="text-[11px] md:hidden" style={{ color: "var(--app-text-very-muted)" }}>{r.note}</div></td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right"><M v={r.a} /></td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right">{r.b == null ? <span style={{ color: "var(--app-text-very-muted)" }}>—</span> : <M v={r.b} />}</td>
                <td className="hidden py-1.5 pl-4 text-[12px] md:table-cell" style={{ color: "var(--app-text-muted)" }}>{r.note}</td>
              </tr>
            ))}
            <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
              <td className="py-2 pr-2 font-bold" style={{ color: "var(--app-text-primary)" }}>Projected margin</td>
              <td className="whitespace-nowrap py-2 pl-3 text-right"><M v={p.margin} /></td>
              <td className="whitespace-nowrap py-2 pl-3 text-right"><M v={leg?.margin ?? null} /></td>
              <td className="hidden py-2 pl-4 text-[12px] md:table-cell" style={{ color: "var(--app-text-muted)" }}>{rName} {pct(pR)} here, {pct(legPR)} in the legislature model</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
        Margins are two-party, R-positive. The legislature model&apos;s lean weights the seat&apos;s own State House rows against presidential results only, and relocates rows from before the 2022 map through its redistricting crosswalk; this page&apos;s lean weights its State House rows the same way and adds the statewide races as counted in these precincts, each stripped of incumbency and environment with the same TPL fit. Both money terms price the same receipts at the same K and cap; they differ only in the typical gap for the seat, which this page takes from {config.stateName} House races alone. Incumbency, seat noise and the chamber shock are the legislature model&apos;s fitted values in both.
      </div>
    </div>
  );
}

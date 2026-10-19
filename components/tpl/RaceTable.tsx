"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { FormulaKey } from "./TplModals";
import { fmt2, marginBg, marginColor, signed } from "./format";
import type { TplRace } from "./types";
import { ArrowOut, CandidateLink, TD, TD_R, TH, TH_R, VERY_MUTED } from "./ui";

// The per-race table under a matrix. One row per race with the two nominees,
// the strips, the neutralized margin and the aggregation weight. Clicking a row opens its step-by-step calculation; the
// links inside a row go where they say. Phones keep only Race, Raw, NM and Wt.

// Race and nominee cells wrap; the numbers stay on one line.
const TD_WRAP = TD.replace("whitespace-nowrap", "whitespace-normal");

export function RaceTable({ races, variant, showYear, onRow, onFormula, emptyText = "No races match." }: {
  races: TplRace[];
  variant: "state" | "district";
  showYear: boolean;
  onRow: (race: TplRace) => void;
  onFormula: (k: FormulaKey) => void;
  emptyText?: string;
}) {
  const strip = (label: string, k: FormulaKey, title: string) => (
    <th className={`${TH_R} hidden sm:table-cell`} style={{ color: "var(--app-text-muted)" }}>
      <button type="button" onClick={() => onFormula(k)} className="hover:underline" title={title}>{label} <ArrowOut /></button>
    </th>
  );
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  // When any row carries the imputed second line, the rest reserve its height (number centered
  // in it) so rows match.
  const anyImputed = races.some((r) => r.imputed);
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse sm:min-w-[560px] text-xs">
        <thead>
          <tr style={{ borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-muted)" }}>
            <th className={TH}>Race</th>
            <th className={`${TH} hidden sm:table-cell`}>Winner</th>
            <th className={`${TH} hidden sm:table-cell`}>Runner-up</th>
            <th className={TH_R}>Raw</th>
            {strip("IF", "IF", "Incumbency points")}
            {strip("FF", "FF", "Fundraising points")}
            {variant === "district" && strip("BS", "BS", "Boundary shift")}
            {strip("ENV", "ENV", "Environment adjustment")}
            <th className={TH_R}><button type="button" onClick={() => onFormula("NM")} className="hover:underline" title="Neutralized margin">NM<span className="hidden sm:inline"> <ArrowOut /></span></button></th>
            <th className={`${TH_R}`} title="Weight in aggregation">Wt</th>
          </tr>
        </thead>
        <tbody>
          {races.length === 0 && (
            <tr><td colSpan={12} className="px-2 py-6 text-center" style={VERY_MUTED}>{emptyText}</td></tr>
          )}
          {races.map((r, i) => {
            const rWon = (r.rawMargin ?? 0) > 0;
            const winner = rWon ? { name: r.repCandidate, party: r.repParty ?? "R" } : { name: r.demCandidate, party: r.demParty ?? "D" };
            const loser = rWon ? { name: r.demCandidate, party: r.demParty ?? "D" } : { name: r.repCandidate, party: r.repParty ?? "R" };
            const label = r.raceType === "H" ? r.race.replace(/^House /, "")
              : r.race === "State Legislature (unopposed seats)" ? "Legislature Unopposed"
              : r.race === "State Legislature" ? "Legislature" : r.race;
            const href = r.pastHref ?? r.detailHref;
            const num = (v: number | null, cls = "") => <td className={`${TD_R} ${cls}`} style={{ color: v ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>{v ? signed(v) : "—"}</td>;
            return (
              <tr key={`${r.raceType}-${r.year}-${r.race}-${i}`} onClick={() => onRow(r)} className="cursor-pointer" style={{ borderBottom: "1px solid var(--app-border)" }}
                title="Open this race's step-by-step calculation">
                <td className={`${TD_WRAP} font-medium`}>
                  <span className="mr-1.5 rounded px-1 py-px font-mono text-[9px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{r.raceType}</span>
                  {showYear && <span className="mr-1.5" style={{ color: "var(--app-text-muted)" }}>{r.year} ·</span>}
                  {href ? <Link href={href} onClick={stop} className="underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)" }} title={r.pastHref ? "Full results for this election" : "Seat page"}>{label}</Link> : label}
                  {r.imputed && <span className="ml-1" style={VERY_MUTED} title="Imputed from the presidential baseline">⊘</span>}
                </td>
                <td className={`${TD_WRAP} hidden sm:table-cell`} onClick={stop}><CandidateLink name={winner.name} party={winner.party} /></td>
                <td className={`${TD_WRAP} hidden sm:table-cell`} onClick={stop}><CandidateLink name={loser.name} party={loser.party} /></td>
                <td className={TD_R} style={{ color: marginColor(r.rawMargin) }}>
                  {r.imputed ? <>{fmt2(r.rawMargin)}<span className="block text-[10px]" style={VERY_MUTED} title="Adjusted (imputed)">⊘ {fmt2(r.adjustedMargin)}</span></>
                    : anyImputed ? <span className="flex min-h-8 items-center justify-end">{fmt2(r.rawMargin)}</span>
                    : fmt2(r.rawMargin)}
                </td>
                {num(r.incumbencyPts, "hidden sm:table-cell")}
                {num(r.FF_pts, "hidden sm:table-cell")}
                {variant === "district" && num(r.raceType === "H" ? r.BS_pts : null, "hidden sm:table-cell")}
                {num(r.envPts, "hidden sm:table-cell")}
                <td className={`${TD_R} font-bold`}><span className="rounded px-1.5 py-0.5" style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}>{fmt2(r.NM)}</span></td>
                <td className={`${TD_R}`} style={{ color: "var(--app-text-muted)" }}>{r.aggWeight.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TableCaption({ children }: { children: ReactNode }) {
  return <div className="mt-2 max-w-4xl text-[11px] leading-relaxed" style={VERY_MUTED}>{children}</div>;
}

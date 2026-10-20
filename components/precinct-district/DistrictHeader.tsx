// Page header for a precinct-district page: the standfirst header with a sentence on the seat, the
// 2026 race and the district's presidential lean. Server component; everything is precomputed by the page.

import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import type { DistrictConfig } from "@/lib/precinctDistrict/types";

export interface HeaderStats {
  latestYear: number;
  presYear: number | null;
  presMargin: number | null;          // R-positive
  leanVsState: number | null;         // district pres margin − state pres margin (R-positive)
  stateName: string;
  legMargin: number | null;           // latest State House margin, R-positive
  legLabel: string;                   // "2024 State Rep"
  legCandidates: string | null;       // "Roemer (R) over Harris (D)"
  registered: number;
  ballots: number;
  turnout: number | null;
  precincts: number;
}

const PARTY_WORD = { D: "Democrat", R: "Republican", I: "Independent" } as const;
const PARTY_COLOR = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)" } as const;

export default function DistrictHeader({ config, stats }: { config: DistrictConfig; stats: HeaderStats }) {
  const e = config.election2026;
  const holder = e?.seatHolder;
  const d = e?.candidates?.d?.name;
  const r = e?.candidates?.r?.name;
  const where = `${config.county}, ${config.stateName}`;
  const date = e ? new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : null;
  const lean = stats.leanVsState;

  return (
    <StandfirstHeader kicker="Precinct Analysis" title={config.name}>
      {e?.status === "open" ? (
        <>An open seat in {where}{holder && <>: {PARTY_WORD[holder.party]} {holder.name} is leaving{holder.note ? `, ${holder.note}` : ""}</>}.</>
      ) : holder ? (
        <>A seat in {where} held by {PARTY_WORD[holder.party]} {holder.name}.</>
      ) : (
        <>A {config.chamber === "house" ? "State House" : "State Senate"} district in {where}.</>
      )}
      {d && r && date && (
        <> On {date}, <b style={{ color: PARTY_COLOR.D }}>{d}</b> (D) faces <b style={{ color: PARTY_COLOR.R }}>{r}</b> (R).</>
      )}
      {stats.presMargin != null && stats.presYear != null && (
        <>
          {" "}In {stats.presYear} it voted <Fig><span style={{ color: marginColor(stats.presMargin) }}>{fmtMargin(stats.presMargin)}</span></Fig> for president
          {lean != null && Math.abs(lean) >= 0.05
            ? <>, <Fig>{Math.abs(lean).toFixed(1)}</Fig> points more {lean > 0 ? "Republican" : "Democratic"} than {stats.stateName}.</>
            : <>, in line with {stats.stateName}.</>}
        </>
      )}
    </StandfirstHeader>
  );
}

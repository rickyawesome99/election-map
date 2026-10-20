"use client";
import Link from "next/link";

import { useState } from "react";
import type { RaceType } from "@/data/forecastData";
import type { AgreementSummary, ChamberTopline } from "@/lib/forecastComparison";

// The top of /analysis/forecasts: one row per forecast, one chamber at a time. Each row is the
// forecast's seat projection drawn as a stacked bar (Democrats from the left, Republicans from the
// right, a rater's uncalled seats in amber between them), its control odds, and how many more
// seats than us it hands the Democrats across the races both call. One chamber per tab keeps the
// table narrow enough to read on a phone without sideways scrolling.

export interface PanelSummary extends AgreementSummary {
  url: string;
}

export interface PanelRow {
  id: string;
  name: string;
  shortName: string;
  kind: "model" | "ratings";
  asOf: string;
  href: string;
  external: boolean;
  t: ChamberTopline | null;
  summary: PanelSummary | null; // null for ours
}

export interface PanelData {
  rows: Record<RaceType, PanelRow[]>;
  chamberSeats: Record<RaceType, number>;
  holdovers: { senate: { dem: number; rep: number }; governor: { dem: number; rep: number } };
  bands: string;
}

const TABS: RaceType[] = ["house", "senate", "governor"];
const TAB_LABEL: Record<RaceType, string> = { house: "House", senate: "Senate", governor: "Governors" };
// Seats a party needs for control, for the marker on the bar (Senate: 51 for the Democrats, since
// the Republican vice president breaks a 50–50 tie). Governors have no chamber to control.
const MAJORITY: Partial<Record<RaceType, number>> = { house: 218, senate: 51 };

const pct = (p: number) => `${Math.round(p * 100)}%`;
const seats = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const netSeats = (n: number) => (Math.abs(n) < 0.01 ? "even" : `${n > 0 ? "D" : "R"}+${Number.isInteger(n) ? Math.abs(n) : Math.abs(n).toFixed(1)}`);
const partyColor = (n: number) => (Math.abs(n) < 0.01 ? "var(--app-text-muted)" : n > 0 ? "var(--party-dem)" : "var(--party-rep)");

function Ext({ href, external, children }: { href: string; external: boolean; children: React.ReactNode }) {
  if (!external) return <Link prefetch={false} href={href} className="hover:underline">{children}</Link>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{children}</a>;
}

function seatSplit(t: ChamberTopline | null, total: number) {
  if (!t || t.demSeats == null) return null;
  const toss = t.tossups ?? 0;
  const rep = t.repSeats ?? total - t.demSeats - toss;
  return { dem: t.demSeats, rep, toss };
}

function SeatBar({ t, total, majority }: { t: ChamberTopline | null; total: number; majority?: number }) {
  const s = seatSplit(t, total);
  if (!s) return <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>no seat projection</div>;
  const w = (n: number) => `${(n / total) * 100}%`;
  const label = `${seats(s.dem)} D – ${seats(s.rep)} R${s.toss ? `, ${s.toss} uncalled` : ""}${t?.derived ? " (counted from its race calls)" : ""}`;
  return (
    <div className="relative h-5 w-full overflow-hidden rounded-sm" title={label} aria-label={label}
      style={{ background: "color-mix(in srgb, var(--app-text-primary) 6%, transparent)" }}>
      <div className="absolute inset-y-0 left-0" style={{ width: w(s.dem), background: "var(--party-dem)" }} />
      {s.toss > 0 && <div className="absolute inset-y-0" style={{ left: w(s.dem), width: w(s.toss), background: "var(--rating-tossup)" }} />}
      <div className="absolute inset-y-0 right-0" style={{ width: w(s.rep), background: "var(--party-rep)" }} />
      {majority && <div className="absolute -inset-y-px w-0.5" style={{ left: w(majority - 0.5), background: "var(--app-bg)" }} />}
      <span className="absolute inset-y-0 left-1 flex items-center text-[10px] font-bold sm:left-1.5 sm:text-[11px] tabular-nums text-white">{seats(s.dem)}</span>
      {s.toss > 0 && s.toss / total > 0.06 && (
        <span className="absolute inset-y-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-white" style={{ left: w(s.dem), width: w(s.toss) }}>{s.toss}</span>
      )}
      <span className="absolute inset-y-0 right-1 flex items-center text-[10px] font-bold sm:right-1.5 sm:text-[11px] tabular-nums text-white">{seats(s.rep)}</span>
    </div>
  );
}

function Control({ p }: { p: number | null | undefined }) {
  if (p == null) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const dem = p >= 0.5;
  return <span className="font-semibold tabular-nums" style={{ color: dem ? "var(--party-dem)" : "var(--party-rep)" }}>{dem ? "D" : "R"} {pct(dem ? p : 1 - p)}</span>;
}

// Their seats minus ours as a bar out from a centre line, scaled to the widest gap in the chamber.
function NetBar({ n, max }: { n: number; max: number }) {
  const w = (Math.abs(n) / max) * 50;
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative hidden h-2.5 w-16 shrink-0 sm:block lg:w-24">
        <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--app-border)" }} />
        <div className="absolute inset-y-0" style={{
          background: partyColor(n), width: `${w}%`,
          ...(n > 0 ? { left: "50%", borderRadius: "0 2px 2px 0" } : { right: "50%", borderRadius: "2px 0 0 2px" }),
        }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] font-semibold sm:w-11 sm:text-xs tabular-nums" style={{ color: partyColor(n) }}>{netSeats(n)}</span>
    </div>
  );
}

const TH = ({ children, className = "", title }: { children?: React.ReactNode; className?: string; title?: string }) => (
  <th scope="col" title={title} className={`whitespace-nowrap px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${className}`}
    style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{children}</th>
);

export default function ForecastToplinePanel({ data }: { data: PanelData }) {
  const [tab, setTab] = useState<RaceType>("house");
  const total = data.chamberSeats[tab];
  const rows = [...data.rows[tab]].sort((a, b) => {
    const sa = seatSplit(a.t, total), sb = seatSplit(b.t, total);
    const ka = sa ? sa.dem + sa.toss / 2 : (a.t?.pDemControl ?? -1) - 1000;
    const kb = sb ? sb.dem + sb.toss / 2 : (b.t?.pDemControl ?? -1) - 1000;
    return kb - ka;
  });
  const maxNet = Math.max(1, ...rows.map((r) => Math.abs(r.summary?.netSeats ?? 0)));
  const hasControl = tab !== "governor";
  const tabStyle = (active: boolean) => ({
    background: active ? "var(--app-text-primary)" : "transparent",
    color: active ? "var(--app-bg)" : "var(--app-text-muted)",
    border: "1px solid var(--app-border)",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 pb-3" role="tablist" aria-label="Chamber">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="rounded px-3 py-1 text-xs font-bold" style={tabStyle(tab === t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
        <span className="ml-2 hidden text-xs sm:inline" style={{ color: "var(--app-text-very-muted)" }}>
          {MAJORITY[tab] ? `Marker at ${MAJORITY[tab]} seats, the Democrats' majority line` : "Governorships after the election, all 50"}
        </span>
      </div>

      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className={hasControl ? "w-[7.5rem] sm:w-52 lg:w-72" : "w-[10.5rem] sm:w-56 lg:w-72"} />
          <col />
          {hasControl && <col className="w-[3.25rem] sm:w-20" />}
          <col className="w-[2.9rem] sm:w-28 lg:w-36" />
          <col className="hidden w-20 md:table-column" />
          <col className="hidden w-14 md:table-column" />
        </colgroup>
        <thead>
          <tr>
            <TH className="text-left">Forecast</TH>
            <TH className="text-left" title="Democratic seats from the left, Republican from the right; in amber, seats a rater will not call either way">Seats</TH>
            {hasControl && <TH className="text-right" title="Probability of controlling the chamber">Control</TH>}
            <TH className="text-right" title="Seats they hand the Democrats minus the seats we do, across the races both call (a rater's Toss-up counts half)">
              <span className="sm:hidden">vs CTS</span><span className="hidden sm:inline">Seats vs CTS</span>
            </TH>
            <TH className="hidden text-right md:table-cell" title="CT Strategies' step minus theirs, averaged: R means CTS calls sit further toward the Republicans">CTS lean</TH>
            <TH className="hidden text-right md:table-cell" title="Races where they favor one party and we favor the other: they D / we R, then they R / we D">Flips</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = r.summary;
            const lean = s?.meanDelta;
            return (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--app-border)", background: r.external ? undefined : "color-mix(in srgb, var(--app-text-primary) 6%, transparent)" }}>
                <th scope="row" className="truncate px-1.5 py-1 text-left text-xs font-semibold sm:text-sm" title={`${r.name} · ${r.kind === "model" ? "statistical model" : "race ratings"} · as of ${r.asOf}`}>
                  <Ext href={r.href} external={r.external}>
                    <span className="sm:hidden">{hasControl ? r.shortName : r.name}</span><span className="hidden sm:inline">{r.name}</span>
                  </Ext>
                  <span className="ml-1 hidden text-[9px] font-normal uppercase tracking-wider lg:inline" style={{ color: "var(--app-text-very-muted)" }}>{r.kind === "model" ? "model" : "rater"}</span>
                </th>
                <td className="px-1.5 py-1"><SeatBar t={r.t} total={total} majority={MAJORITY[tab]} /></td>
                {hasControl && <td className="px-1.5 py-1 text-right text-xs sm:text-sm"><Control p={r.t?.pDemControl} /></td>}
                <td className="px-1.5 py-1">
                  {s ? <div className="flex justify-end"><NetBar n={s.netSeats} max={maxNet} /></div>
                    : <div className="text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>base</div>}
                </td>
                <td className="hidden px-1.5 py-1 text-right text-xs font-semibold tabular-nums md:table-cell"
                  style={{ color: lean == null || Math.abs(lean) < 0.005 ? "var(--app-text-very-muted)" : lean > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                  {lean == null ? "" : Math.abs(lean) < 0.005 ? "even" : `${lean > 0 ? "R" : "D"} ${Math.abs(lean).toFixed(2)}`}
                </td>
                <td className="hidden px-1.5 py-1 text-right text-xs tabular-nums md:table-cell" title={s ? `They favor the Democrat where we favor the Republican in ${s.theyDweR}, the reverse in ${s.theyRweD}, of ${s.compared} races` : undefined}>
                  {s && <><span style={{ color: s.theyDweR ? "var(--party-dem)" : "var(--app-text-very-muted)" }}>{s.theyDweR}</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}>/</span>
                    <span style={{ color: s.theyRweD ? "var(--party-rep)" : "var(--app-text-very-muted)" }}>{s.theyRweD}</span></>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <details className="mt-3 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
        <summary className="cursor-pointer font-semibold" style={{ color: "var(--app-text-muted)" }}>How these are counted</summary>
        <p className="mt-2">
          Each model&rsquo;s seats are the projection it publishes itself, so the row matches its own site; some headline the seats
          they favor and some the middle of their simulated distribution, and the two run a few seats apart. Where a forecast
          publishes no total &mdash; every rater, and a model that gives only control odds &mdash; the count is taken from its own race
          calls, with the seats a rater will not call either way in amber. Ours is the seats we favor. Every count includes the seats
          not on the ballot (Senate {data.holdovers.senate.dem} D – {data.holdovers.senate.rep} R, governors {data.holdovers.governor.dem} D – {data.holdovers.governor.rep} R).
        </p>
        <p className="mt-2">
          <strong>Seats vs CTS</strong> is how many more seats they hand the Democrats than we do across the races both call &mdash;
          counted the same way for everyone, so it will not always match the gap between the bars. <strong>CTS lean</strong> is the
          average distance between our call and theirs in steps on the scale Safe D, Likely D, Lean D, Tilt D, Toss-up, Tilt R, Lean R,
          Likely R, Safe R, and <strong>Flips</strong> counts the races where they favor the Democrat and we the Republican, then the
          reverse. A rater&rsquo;s label is used as published (Solid counts as Safe); a model&rsquo;s probability is banded on its
          favorite&rsquo;s chance: {data.bands}, and Toss-up below that. Our own call is a band of the projected margin and has no
          Toss-up. A forecast that lists only its competitive seats is taken to rate every other seat Safe for the party ahead.
        </p>
      </details>
    </div>
  );
}

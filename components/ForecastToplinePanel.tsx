"use client";

import { useState } from "react";
import type { RaceType } from "@/data/forecastData";
import type { AgreementSummary, ChamberTopline } from "@/lib/forecastComparison";

// The top of /analysis/forecasts: one tabbed block holding the chamber toplines and, per chamber,
// how far each forecast sits from ours. Tabs rather than four stacked tables, because only one of
// them is ever being read at a time.

export interface PanelRow {
  id: string;
  name: string;
  kind: "model" | "ratings";
  asOf: string;
  href: string;
  external: boolean;
  t: Record<RaceType, ChamberTopline | null>;
}

export interface PanelSummary extends AgreementSummary {
  name: string;
  url: string;
}

export interface PanelData {
  toplineRows: PanelRow[];
  summaries: Record<RaceType, PanelSummary[]>;
  raceCounts: Record<RaceType, number>;
  chamberSeats: Record<RaceType, number>;
  holdovers: { senate: { dem: number; rep: number }; governor: { dem: number; rep: number } };
  bands: string;
}

type Tab = "toplines" | RaceType;
const TAB_LABEL: Record<Tab, string> = { toplines: "Chamber toplines", senate: "Senate", governor: "Governor", house: "House" };
const TABS: Tab[] = ["toplines", "senate", "governor", "house"];

const pct = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const seats = (n: number | null | undefined) => (n == null ? "—" : String(Math.round(n)));
const netSeats = (n: number) => (Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1));

function Ext({ href, external, children }: { href: string; external: boolean; children: React.ReactNode }) {
  if (!external) return <a href={href} className="hover:underline">{children}</a>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
      {children}<span aria-hidden="true" style={{ color: "var(--app-text-very-muted)" }}> ↗</span>
    </a>
  );
}

const TH = ({ children, align = "left", title }: { children: React.ReactNode; align?: "left" | "center" | "right"; title?: string }) => (
  <th scope="col" title={title} className={`whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-${align}`}
    style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{children}</th>
);

function ControlCell({ p }: { p: number | null }) {
  if (p == null) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const dem = p >= 0.5;
  return <span className="font-semibold tabular-nums" style={{ color: dem ? "var(--party-dem)" : "var(--party-rep)" }}>{dem ? "D" : "R"} {pct(dem ? p : 1 - p)}</span>;
}

function SeatCell({ t, total }: { t: ChamberTopline | null; total: number }) {
  if (!t || t.demSeats == null) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const rep = t.repSeats ?? (t.tossups != null ? total - t.demSeats - t.tossups : total - t.demSeats);
  return (
    <span className="tabular-nums whitespace-nowrap">
      <span className="font-semibold" style={{ color: "var(--party-dem)" }}>{seats(t.demSeats)}</span>
      <span style={{ color: "var(--app-text-very-muted)" }}> – </span>
      <span className="font-semibold" style={{ color: "var(--party-rep)" }}>{seats(rep)}</span>
      {t.tossups != null && t.tossups > 0 && (
        <>
          <span style={{ color: "var(--app-text-very-muted)" }}> – </span>
          <span className="font-semibold" style={{ color: "var(--rating-tossup)" }} title={`${t.tossups} seats it will not call either way`}>{t.tossups}</span>
        </>
      )}
    </span>
  );
}

function ToplineTable({ rows, chamberSeats }: { rows: PanelRow[]; chamberSeats: Record<RaceType, number> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <TH>Forecast</TH><TH>Type</TH>
            <TH align="center" title="Democratic seats, Republican seats, then in amber the seats a rater will not call either way">House seats</TH>
            <TH align="center" title="Probability of controlling the House (218 seats)">House control</TH>
            <TH align="center" title="Democratic seats, Republican seats, then in amber the seats a rater will not call either way">Senate seats</TH>
            <TH align="center" title="Probability of controlling the Senate (Democrats need 51; a tie goes to the Republican vice president)">Senate control</TH>
            <TH align="center" title="Democratic and Republican governorships after the election, including the 14 not on the ballot, then in amber the ones a rater will not call either way">Governors</TH>
            <TH align="right">As of</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--app-border)", background: r.external ? undefined : "color-mix(in srgb, var(--app-text-primary) 4%, transparent)" }}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-semibold"><Ext href={r.href} external={r.external}>{r.name}</Ext></th>
              <td className="px-2 py-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>{r.kind}</td>
              <td className="px-2 py-1.5 text-center"><SeatCell t={r.t.house} total={chamberSeats.house} /></td>
              <td className="px-2 py-1.5 text-center"><ControlCell p={r.t.house?.pDemControl ?? null} /></td>
              <td className="px-2 py-1.5 text-center"><SeatCell t={r.t.senate} total={chamberSeats.senate} /></td>
              <td className="px-2 py-1.5 text-center"><ControlCell p={r.t.senate?.pDemControl ?? null} /></td>
              <td className="px-2 py-1.5 text-center"><SeatCell t={r.t.governor} total={chamberSeats.governor} /></td>
              <td className="px-2 py-1.5 text-right text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.asOf}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgreementTable({ summaries }: { summaries: PanelSummary[] }) {
  const fmtLean = (d: number | null) => (d == null ? "—" : Math.abs(d) < 0.005 ? "even" : `${d > 0 ? "R" : "D"} ${Math.abs(d).toFixed(2)}`);
  const fmtNet = (n: number) => (Math.abs(n) < 0.01 ? "even" : `${n > 0 ? "D" : "R"} +${netSeats(n)}`);
  const sorted = [...summaries].sort((a, b) => b.netSeats - a.netSeats);
  const max = Math.max(1, ...sorted.map((s) => Math.abs(s.netSeats)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <TH>Forecast</TH>
            <TH align="right" title="Races both sides call">Races</TH>
            <TH align="right" title="Our step minus theirs, averaged: R means our calls sit further toward the Republicans than theirs, D means further toward the Democrats">Our lean vs theirs</TH>
            <TH align="center" title="Seats they hand the Democrats minus the seats we do, across the races both call. D means they are more generous to the Democrats than we are. A rater's Toss-up counts as half a seat to each party.">Their seats vs ours</TH>
            <TH align="right" title="Races where they favor the Democrat and we favor the Republican">They D, we R</TH>
            <TH align="right" title="Races where they favor the Republican and we favor the Democrat">They R, we D</TH>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const w = (Math.abs(s.netSeats) / max) * 50;
            return (
              <tr key={s.forecasterId} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-semibold"><Ext href={s.url} external>{s.name}</Ext></th>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{s.compared}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: s.meanDelta == null || Math.abs(s.meanDelta) < 0.005 ? "var(--app-text-muted)" : s.meanDelta > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>{fmtLean(s.meanDelta)}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="relative h-3 min-w-[6rem] flex-1">
                      <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--app-border)" }} />
                      <div className="absolute inset-y-0" style={{
                        background: s.netSeats > 0 ? "var(--party-dem)" : "var(--party-rep)", width: `${w}%`,
                        ...(s.netSeats > 0 ? { left: "50%", borderRadius: "0 3px 3px 0" } : { right: "50%", borderRadius: "3px 0 0 3px" }),
                      }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: Math.abs(s.netSeats) < 0.01 ? "var(--app-text-muted)" : s.netSeats > 0 ? "var(--party-dem)" : "var(--party-rep)" }}>{fmtNet(s.netSeats)}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: s.theyDweR ? "var(--party-dem)" : "var(--app-text-very-muted)" }}>{s.theyDweR || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: s.theyRweD ? "var(--party-rep)" : "var(--app-text-very-muted)" }}>{s.theyRweD || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ForecastToplinePanel({ data }: { data: PanelData }) {
  const [tab, setTab] = useState<Tab>("toplines");
  const note = "mt-4 max-w-3xl text-xs leading-relaxed";
  const style = (active: boolean) => ({
    background: active ? "var(--app-text-primary)" : "transparent",
    color: active ? "var(--app-bg)" : "var(--app-text-muted)",
    border: "1px solid var(--app-border)",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 pb-4">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="rounded px-3 py-1 text-xs font-bold" style={style(tab === t)}>
            {TAB_LABEL[t]}
            {t !== "toplines" && <span className="font-normal opacity-70"> · {data.raceCounts[t]}</span>}
          </button>
        ))}
        <span className="ml-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          {tab === "toplines" ? "Control probabilities and seat counts as each forecast publishes them" : "How far each forecast sits from ours, race by race"}
        </span>
      </div>

      {tab === "toplines" ? (
        <>
          <ToplineTable rows={data.toplineRows} chamberSeats={data.chamberSeats} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Each model&rsquo;s seats are the projection it publishes itself, so the row matches its own site; models differ in what they
            headline, some the seats they favor and some the middle of their simulated distribution, and the two run a few seats
            apart. Where a forecast publishes no total &mdash; every rater, and a model that gives only control odds &mdash; the count is
            taken from its own race calls, a model by which candidate it puts above 50% and a rater by its label, with the seats a
            rater will not call either way shown separately. Ours is the seats we favor. Every count includes the seats not on the
            ballot (Senate {data.holdovers.senate.dem} D – {data.holdovers.senate.rep} R, governors {data.holdovers.governor.dem} D – {data.holdovers.governor.rep} R).
          </p>
        </>
      ) : (
        <>
          <AgreementTable summaries={data.summaries[tab]} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            <strong>Our lean vs theirs</strong> is the average distance between our call and theirs in steps, and <strong>their seats
            vs ours</strong> is how many more seats they hand the Democrats than we do across the races both call &mdash; counted the same
            way for everyone, so it will not always match the difference between the published totals. The scale runs Safe D, Likely D,
            Lean D, Tilt D, Toss-up, Tilt R, Lean R, Likely R, Safe R. A rater&rsquo;s label is used as published (Solid counts as Safe).
            A model&rsquo;s probability is banded on its favorite&rsquo;s chance: {data.bands}, and Toss-up below that. Our own call is the
            site&rsquo;s rating, which is a band of the projected margin and has no Toss-up, so a race we call Tilt and a rater calls
            Toss-up is one step apart. A forecast that lists only its competitive seats is taken to rate every other seat Safe for the
            party ahead there.
          </p>
        </>
      )}
    </div>
  );
}

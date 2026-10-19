"use client";
import Link from "next/link";

import { useMemo, useState } from "react";
import { useStaticJson } from "@/lib/useStaticJson";
import { MODEL_NAME, type ComparisonDistrict, type ModelCall } from "@/lib/stateLegComparison";
import { getRaceColor } from "@/lib/colorScale";

// Every district on the ballot with all three calls, fetched from the build-time slice
// public/state-leg-comparison/districts.json. Narrowed to one state and to the seats where a
// model parts company with ours; sorted by how far apart the margins are.

type Against = "sn" | "ei" | "either";
type Filter = "disagree" | "favored" | "competitive" | "all";

const fmtM = (m: number | null | undefined) => (m == null ? "—" : Math.abs(m) < 0.05 ? "Even" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const pct = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const colorOf = (m: number | null | undefined) => (m == null ? "var(--app-text-very-muted)" : getRaceColor(m));

function Cell({ c }: { c: ModelCall | null }) {
  if (!c) return <td className="py-1.5 pr-3 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>;
  return (
    <td className="py-1.5 pr-3 text-right whitespace-nowrap">
      <span className="font-semibold" style={{ color: colorOf(c.m) }}>{fmtM(c.m)}</span>
      <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}> {c.unc ? "unc." : pct(c.pD)}</span>
      <div className="text-[10px] leading-tight" style={{ color: "var(--app-text-muted)" }}>{c.rating}</div>
    </td>
  );
}

// A seat either side marks uncontested has no margin to compare (State Navigate carries ±100 there).
const gap = (d: ComparisonDistrict, m: "sn" | "ei") => (d.ours && d[m] && !d.ours.unc && !d[m]!.unc && d.contest === "contested" ? Math.abs(d.ours.m - d[m]!.m) : 0);
const favoredDiffers = (d: ComparisonDistrict, m: "sn" | "ei") => !!(d.ours?.pD != null && d[m]?.pD != null && (d.ours.pD >= 0.5) !== (d[m]!.pD! >= 0.5));

export default function StateLegModelTable({ states }: { states: { abbr: string; name: string }[] }) {
  const { data, failed } = useStaticJson<ComparisonDistrict[]>("/state-leg-comparison/districts.json");
  const [state, setState] = useState("all");
  const [against, setAgainst] = useState<Against>("either");
  const [filter, setFilter] = useState<Filter>("disagree");
  const [limit, setLimit] = useState(80);

  const rows = useMemo(() => {
    if (!data) return [];
    const models: ("sn" | "ei")[] = against === "either" ? ["sn", "ei"] : [against];
    let r = data.filter((d) => d.ours && models.some((m) => d[m]));
    if (state !== "all") r = r.filter((d) => d.abbr === state);
    if (filter === "disagree") r = r.filter((d) => models.some((m) => gap(d, m) >= 5));
    else if (filter === "favored") r = r.filter((d) => models.some((m) => favoredDiffers(d, m)));
    else if (filter === "competitive") r = r.filter((d) => Math.abs(d.ours!.m) <= 10 || models.some((m) => d[m] != null && Math.abs(d[m]!.m) <= 10));
    const spread = (d: ComparisonDistrict) => Math.max(...models.map((m) => gap(d, m)));
    return [...r].sort((a, b) => spread(b) - spread(a) || a.abbr.localeCompare(b.abbr) || a.label.localeCompare(b.label));
  }, [data, state, against, filter]);

  const sel = "rounded px-1.5 py-1 text-xs";
  const selStyle = { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" } as const;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <select value={state} onChange={(e) => { setState(e.target.value); setLimit(80); }} className={sel} style={selStyle}>
          <option value="all">All states</option>
          {states.map((s) => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
        </select>
        <select value={against} onChange={(e) => { setAgainst(e.target.value as Against); setLimit(80); }} className={sel} style={selStyle}>
          <option value="either">vs either model</option>
          <option value="sn">vs {MODEL_NAME.sn}</option>
          <option value="ei">vs {MODEL_NAME.ei}</option>
        </select>
        {([["disagree", "margins 5+ apart"], ["favored", "different favorite"], ["competitive", "within 10"], ["all", "every seat"]] as [Filter, string][]).map(([k, label]) => (
          <button key={k} onClick={() => { setFilter(k); setLimit(80); }} className="rounded px-2 py-1 font-semibold" style={{ background: filter === k ? "var(--app-text-primary)" : "var(--app-tab-bg)", color: filter === k ? "var(--app-bg)" : "var(--app-text-primary)" }}>{label}</button>
        ))}
        <span className="ml-auto" style={{ color: "var(--app-text-very-muted)" }}>{data ? `${rows.length.toLocaleString()} districts` : failed ? "could not load the district slice" : "loading…"}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
              {[["District", "left"], ["Held", "left"], ["This site", "right"], [MODEL_NAME.sn, "right"], [MODEL_NAME.ei, "right"], ["Gap", "right"]].map(([h, a]) => (
                <th key={h} className={`py-1.5 pr-3 text-[10px] uppercase tracking-wider font-semibold text-${a}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((d) => {
              const g = Math.max(gap(d, "sn"), gap(d, "ei"));
              return (
                <tr key={`${d.abbr}-${d.chamber}-${d.key}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="py-1.5 pr-3 whitespace-nowrap align-top"><Link prefetch={false} href={d.href} className="font-semibold hover:underline">{d.abbr} {d.chamber === "house" ? "" : "Sen. "}{d.label}</Link>{d.seats > 1 && <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}> · {d.seats} seats</span>}</td>
                  <td className="py-1.5 pr-3 align-top" style={{ color: d.cur === "D" ? "var(--party-dem)" : d.cur === "R" ? "var(--party-rep)" : "var(--app-text-muted)" }}>{d.cur === "vac" ? "vacant" : d.cur}</td>
                  <Cell c={d.ours} />
                  <Cell c={d.sn} />
                  <Cell c={d.ei} />
                  <td className="py-1.5 pr-0 text-right align-top font-semibold" style={{ color: g >= 10 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{g.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button onClick={() => setLimit((l) => l + 120)} className="mt-3 text-xs font-semibold underline underline-offset-2" style={{ color: "var(--app-text-muted)" }}>Show {Math.min(120, rows.length - limit)} more of {rows.length.toLocaleString()}</button>
      )}
    </div>
  );
}

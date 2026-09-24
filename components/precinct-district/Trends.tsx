"use client";

// Trends: the district's two-party margin by year for each ticket position, and the same
// picture for each subdivision. Small multiples, one series per panel (no legend needed),
// points colored by which party led. Values are the exact year totals (original lines).

import { useMemo, useState } from "react";
import type { PrecinctDistrictData } from "@/lib/precinctDistrict/types";
import { marginOf, sumOffice, subdivisionName, topOfTicket } from "@/lib/precinctDistrict/aggregate";
import { fmtMargin } from "@/lib/colorScale";
import { officeShort } from "@/lib/precinctDistrict/explorer";

type Series = { key: string; label: string; note: string; points: { year: number; value: number; tag?: string }[] };

const W = 300, H = 150, PL = 40, PR = 40, PT = 12, PB = 22;

function Panel({ s, years, ymax, compact }: { s: Series; years: number[]; ymax: number; compact?: boolean }) {
  const x = (y: number) => PL + ((y - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * (W - PL - PR);
  const yy = (v: number) => PT + ((ymax + v) / (2 * ymax)) * (H - PT - PB); // R-positive: R up? no — D above the line reads naturally, so invert: v>0 (R) goes DOWN
  const path = s.points.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)} ${yy(-p.value).toFixed(1)}`).join(" ");
  const last = s.points[s.points.length - 1];
  const [hover, setHover] = useState<number | null>(null);
  const hp = hover != null ? s.points.find((p) => p.year === hover) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-primary)" }}>{s.label}</div>
        {!compact && <div className="text-[10.5px]" style={{ color: "var(--app-text-very-muted)" }}>{s.note}</div>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: "auto", overflow: "visible" }} role="img" aria-label={`${s.label} margin by year`} onMouseLeave={() => setHover(null)}>
        {[-ymax, -ymax / 2, ymax / 2, ymax].map((g) => <line key={g} x1={PL} x2={W - PR} y1={yy(g)} y2={yy(g)} stroke="var(--app-border)" strokeWidth={1} />)}
        <line x1={PL} x2={W - PR} y1={yy(0)} y2={yy(0)} stroke="var(--app-text-muted)" strokeWidth={1} />
        <text x={PL - 6} y={yy(ymax) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--app-text-muted)" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>D+{ymax}</text>
        <text x={PL - 6} y={yy(0) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--app-text-muted)" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>even</text>
        <text x={PL - 6} y={yy(-ymax) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--app-text-muted)" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>R+{ymax}</text>
        {s.points.length > 1 && <path d={path} fill="none" stroke="var(--app-text-muted)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {s.points.map((p) => (
          <g key={p.year}>
            <circle cx={x(p.year)} cy={yy(-p.value)} r={hover === p.year ? 5.5 : 4.5} fill={p.value > 0 ? "var(--party-rep)" : "var(--party-dem)"} stroke="var(--app-bg)" strokeWidth={2} />
            <circle cx={x(p.year)} cy={yy(-p.value)} r={14} fill="transparent" onMouseEnter={() => setHover(p.year)} />
          </g>
        ))}
        {last && hover == null && (
          <text x={x(last.year) + 8} y={yy(-last.value) + 3.5} fontSize={10.5} fontWeight={700} fill="var(--app-text-primary)" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>{fmtMargin(last.value)}</text>
        )}
        {hp && (
          <g>
            <rect x={Math.min(W - PR - 92, Math.max(PL, x(hp.year) - 46))} y={2} width={92} height={16} rx={3} fill="var(--app-panel)" stroke="var(--app-border)" />
            <text x={Math.min(W - PR - 92, Math.max(PL, x(hp.year) - 46)) + 46} y={13.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--app-text-primary)" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>{hp.year}{hp.tag ? ` ${hp.tag}` : ""} {fmtMargin(hp.value)}</text>
          </g>
        )}
        {years.map((y) => <text key={y} x={x(y)} y={H - 6} textAnchor="middle" fontSize={9.5} fill="var(--app-text-muted)" style={{ fontFamily: "var(--font-ibm-plex-mono)" }}>{String(y).slice(2)}</text>)}
      </svg>
    </div>
  );
}

export default function Trends({ data }: { data: PrecinctDistrictData }) {
  const { config, results } = data;
  const years = useMemo(() => [...config.years].sort((a, b) => a - b), [config.years]);
  const [subOffice, setSubOffice] = useState<"top" | "sthouse" | "ussen" | "ushouse">("top");

  const series = (rows: (y: number) => { races: Record<string, { d: number; r: number; t: number }> }[]): Series[] => {
    const mk = (key: string, label: string, note: string, pick: (y: number) => string | null): Series => ({
      key, label, note,
      points: years.flatMap((y) => {
        const office = pick(y);
        if (!office) return [];
        const m = marginOf(sumOffice(rows(y) as never, office));
        return m == null ? [] : [{ year: y, value: m, tag: office === "gov" ? "Gov" : office === "pres" ? "Pres" : undefined }];
      }),
    });
    const out: Series[] = [
      mk("top", "Top of ticket", "President, or Governor in midterms", (y) => topOfTicket(results.years[String(y)])),
    ];
    if (years.some((y) => results.years[String(y)].offices.ussen)) out.push(mk("ussen", "U.S. Senate", "", (y) => (results.years[String(y)].offices.ussen ? "ussen" : null)));
    if (years.some((y) => results.years[String(y)].offices.ushouse)) out.push(mk("ushouse", "U.S. House", "sums several districts before 2022", (y) => (results.years[String(y)].offices.ushouse ? "ushouse" : null)));
    if (years.some((y) => results.years[String(y)].offices.sthouse)) out.push(mk("sthouse", "State House", "sums several districts before 2024", (y) => (results.years[String(y)].offices.sthouse ? "sthouse" : null)));
    return out;
  };

  const district = series((y) => results.years[String(y)].precincts);
  const ymax = 20;

  const subSeries = (() => {
    return config.subdivisions.map((s) => {
      const rows = (y: number) => results.years[String(y)].precincts.filter((p) => p.sub === s.id);
      const pick = (y: number) => {
        const yr = results.years[String(y)];
        if (subOffice === "top") return topOfTicket(yr);
        return yr.offices[subOffice] ? subOffice : null;
      };
      const latestCount = results.years[String(years[years.length - 1])].precincts.filter((pr) => pr.sub === s.id).length;
      return {
        key: s.id, label: s.name, note: `${latestCount} precinct${latestCount === 1 ? "" : "s"}`,
        points: years.flatMap((y) => { const o = pick(y); if (!o) return []; const m = marginOf(sumOffice(rows(y), o)); return m == null ? [] : [{ year: y, value: m, tag: o === "gov" ? "Gov" : undefined }]; }),
      } as Series;
    });
  })();
  const subYmax = 40;

  return (
    <div>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {district.map((s) => <Panel key={s.key} s={s} years={years} ymax={ymax} />)}
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--app-text-very-muted)" }}>
        Two-party margin of the whole footprint as counted each year. Hover a point for the value; the label marks the latest year.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 pb-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>By area</div>
        <div className="flex items-center gap-1">
          {([["top", "Top of ticket"], ["sthouse", "State House"], ["ussen", "Senate"], ["ushouse", "House"]] as const).filter(([k]) => k === "top" || years.some((y) => results.years[String(y)].offices[k])).map(([k, label]) => (
            <button key={k} onClick={() => setSubOffice(k)} aria-pressed={subOffice === k} className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={subOffice === k ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" } : { color: "var(--app-text-muted)", border: "1px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {subSeries.map((s) => <Panel key={s.key} s={s} years={years} ymax={subYmax} />)}
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--app-text-very-muted)" }}>
        {subOffice === "top" ? "President in presidential years, Governor in midterms." : `${officeShort(results.years[String(years[years.length - 1])], subOffice)} as counted; before ${subOffice === "sthouse" ? 2024 : 2022} the column sums more than one district.`} Area totals are exact in every year.
      </p>
    </div>
  );
}

export { subdivisionName };

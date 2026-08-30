"use client";

import { useMemo, useState } from "react";
import { stateLegCalendar, type StateLegMapEra } from "@/data/stateLegCalendar";
import type { Chamber } from "@/data/stateLegDistricts";

const FIRST_YEAR = 2016;
const LAST_YEAR = 2025;
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

// One color per era position within a chamber, so a change of shade down a row reads as a redraw.
// Deliberately not a party scale — these are map generations, not political values.
const ERA_COLORS = ["#4a6fa5", "#7d9b76", "#c9a227", "#b5713f", "#8c5a8c"];

type Entry = {
  abbr: string;
  chamber: Chamber;
  chamberLabel: string;
  termYears: number | null;
  termPattern?: string;
  staggered: boolean;
  frequency: string;
  electionYears: number[];
  seatsUp: Record<string, number>;
  eras: StateLegMapEra[];
};

function buildEntries(): Entry[] {
  const out: Entry[] = [];
  for (const [abbr, chambers] of Object.entries(stateLegCalendar)) {
    for (const [key, cal] of Object.entries(chambers)) {
      if (!cal) continue;
      const chamber = key as Chamber;
      out.push({
        abbr,
        chamber,
        // Nebraska's unicameral body is stored under the `senate` key by the boundary-data
        // convention; labelling it "Senate" here would misdescribe it.
        chamberLabel: abbr === "NE" ? "Unicameral" : chamber === "house" ? "House" : "Senate",
        ...cal,
      });
    }
  }
  return out.sort((a, b) => a.abbr.localeCompare(b.abbr) || a.chamberLabel.localeCompare(b.chamberLabel));
}

/** Index of the era covering a given election year, or -1. */
function eraIndexFor(eras: StateLegMapEra[], year: number): number {
  return eras.findIndex((e) => e.electionYears.includes(year));
}

export default function StateLegCalendarAuditTable() {
  const entries = useMemo(buildEntries, []);
  const [view, setView] = useState<"grid" | "eras">("grid");

  const allEras = entries.flatMap((e) => e.eras);
  const assumed = allEras.filter((e) => !e.verified).length;
  const multiEra = entries.filter((e) => e.eras.length > 2).length;
  const staggered = entries.filter((e) => e.staggered).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{entries.length}</strong> chambers
          </span>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{staggered}</strong> staggered
          </span>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{allEras.length}</strong> map eras
          </span>
          <span>
            <strong style={{ color: "#c9a227" }}>{assumed}</strong> era starts assumed, not verified
          </span>
          <span>
            <strong style={{ color: "var(--app-text-primary)" }}>{multiEra}</strong> chambers with 3+ eras
          </span>
        </div>
        <div className="flex gap-1 text-xs">
          {(["grid", "eras"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-2.5 py-1 rounded-full font-semibold capitalize"
              style={{
                background: view === v ? "var(--app-text-primary)" : "var(--app-tab-bg)",
                color: view === v ? "var(--app-bg)" : "var(--app-text-muted)",
              }}
            >
              {v === "grid" ? "Calendar" : "Eras"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
        <span>Cell = seats contested that year, shaded by which map era it fell in.</span>
        {ERA_COLORS.slice(0, 4).map((c, i) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: c, opacity: 0.85 }} />
            era {i + 1}
          </span>
        ))}
        <span>A dotted outline marks an era whose start year is assumed rather than evidenced.</span>
      </div>

      {view === "grid" ? (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  Chamber
                </th>
                <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  Term
                </th>
                {YEARS.map((y) => (
                  <th key={y} className="pb-2 px-1 text-center text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
                    {`'${String(y).slice(2)}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.abbr}-${e.chamber}`} style={{ borderBottom: "1px solid var(--app-border, rgba(128,128,128,0.15))" }}>
                  <td className="py-1 pr-3 whitespace-nowrap font-medium" style={{ color: "var(--app-text-primary)" }}>
                    {e.abbr} <span style={{ color: "var(--app-text-muted)" }}>{e.chamberLabel}</span>
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }} title={e.frequency}>
                    {e.termYears ?? "—"}y{e.staggered ? " stag." : ""}
                    {e.termPattern ? " *" : ""}
                  </td>
                  {YEARS.map((y) => {
                    const up = e.seatsUp[String(y)];
                    if (up == null) {
                      return (
                        <td key={y} className="py-1 px-1 text-center" style={{ color: "var(--app-text-very-muted)" }}>
                          ·
                        </td>
                      );
                    }
                    const idx = eraIndexFor(e.eras, y);
                    const era = e.eras[idx];
                    const total = era?.totalSeats;
                    const whole = total != null && up === total;
                    const title = [
                      `${e.abbr} ${e.chamberLabel} ${y}`,
                      `${up} of ${total ?? "?"} seats up${whole && e.staggered ? " — whole chamber, so the map was redrawn" : ""}`,
                      era ? `Era ${idx + 1}: ${era.firstYear}–${era.lastYear ?? "present"} · ${era.source ?? ""}` : "",
                      era && !era.verified ? "Era start assumed, not verified against a source" : "",
                      era?.note ?? "",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    return (
                      <td key={y} className="py-1 px-1 text-center" title={title}>
                        <span
                          className="inline-flex items-center justify-center min-w-[1.75rem] h-5 px-1 rounded-sm font-semibold"
                          style={{
                            background: ERA_COLORS[idx % ERA_COLORS.length] ?? "var(--app-tab-bg)",
                            color: "#fff",
                            opacity: 0.85,
                            outline: era && !era.verified ? "1px dotted var(--app-text-primary)" : undefined,
                            fontWeight: whole && e.staggered ? 800 : 600,
                          }}
                        >
                          {up}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                {["State", "Chamber", "Era", "Years", "Seats", "Elections", "Enacted", "Source", "Start"].map((h, i) => (
                  <th
                    key={h}
                    className={`pb-2 pr-3 pt-1 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${i >= 4 && i <= 5 ? "text-right" : "text-left"}`}
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.flatMap((e) =>
                e.eras.map((era, i) => (
                  <tr key={`${e.abbr}-${e.chamber}-${era.firstYear}`} style={{ borderBottom: "1px solid var(--app-border, rgba(128,128,128,0.15))" }}>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-medium" style={{ color: "var(--app-text-primary)" }}>{i === 0 ? e.abbr : ""}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{i === 0 ? e.chamberLabel : ""}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-semibold" style={{ color: ERA_COLORS[i % ERA_COLORS.length] }}>{i + 1}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: "var(--app-text-secondary)" }}>
                      {era.firstYear}&ndash;{era.lastYear ?? "present"}
                    </td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{era.totalSeats}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                      {era.electionYears.length ? era.electionYears.join(", ") : "—"}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-xs" style={{ color: "var(--app-text-muted)" }}>{era.enactedDate ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-xs" style={{ color: "var(--app-text-secondary)" }} title={era.note}>{era.source ?? "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-xs" style={{ color: era.verified ? "#3d8f5f" : "#c9a227" }}>
                      {era.verified ? "evidenced" : "assumed"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { RedistrictingYear } from "@/lib/statePage";
import { REDISTRICT_LABEL } from "@/lib/redistrictingCalendar";
import RedistrictingMaps from "./RedistrictingMaps";

function pviLabel(pvi: number): string {
  if (pvi === 0) return "EVEN";
  return `${pvi > 0 ? "R" : "D"}+${Math.abs(pvi)}`;
}

function PviBadge({ pvi }: { pvi: number }) {
  const isR = pvi > 0;
  const isEven = pvi === 0;
  return (
    <span
      className="text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap tabular-nums"
      style={{
        background: isEven ? "var(--app-tab-bg)" : isR ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)",
        color: isEven ? "var(--app-text-muted)" : isR ? "var(--party-rep)" : "var(--party-dem)",
      }}
    >
      {pviLabel(pvi)}
    </span>
  );
}

/**
 * One redraw: the year, what the calendar says was redrawn, the before/after maps, and each
 * district's account of how its lines moved. Clicking a district on either map marks its card
 * and brings it into view; clicking the card marks it on the maps.
 */
export default function RedistrictingYearBlock({ stateAbbr, stateFips, year }: { stateAbbr: string; stateFips: string; year: RedistrictingYear }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fromMap = useRef(false);

  useEffect(() => {
    if (!selectedId || !fromMap.current) return;
    fromMap.current = false;
    cardRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <div className="py-5" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <span className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 700, color: "var(--app-text-primary)" }}>{year.year}</span>
        {year.events.map((e) => (
          <span key={e.kind} className="text-xs" style={{ color: "var(--app-text-muted)" }}>
            <span className="text-[10px] uppercase tracking-wider font-semibold mr-1.5" style={{ color: e.kind === "CD" ? "var(--redistrict-cd)" : e.kind === "SH" ? "var(--redistrict-sh)" : "var(--redistrict-ss)" }}>
              {REDISTRICT_LABEL[e.kind]}
            </span>
            {e.note}
          </span>
        ))}
      </div>

      <RedistrictingMaps
        stateAbbr={stateAbbr}
        stateFips={stateFips}
        year={year.year}
        districts={year.districts}
        selectedId={selectedId}
        onSelect={(id) => { fromMap.current = true; setSelectedId(id); }}
      />
      <div className="mt-2 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
        Districts coloured by PVI on each map; grey has no figure on that side. Click a district to find its account below.
      </div>

      {year.districts.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          {year.districts.map((d) => {
            const active = selectedId === d.id;
            return (
              <div
                key={d.id}
                ref={(el) => { if (el) cardRefs.current.set(d.id, el); else cardRefs.current.delete(d.id); }}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(active ? null : d.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(active ? null : d.id); } }}
                className="min-w-0 cursor-pointer py-2 pl-2.5 scroll-mt-24"
                style={{ borderLeft: `2px solid ${active ? "var(--app-text-primary)" : "transparent"}`, background: active ? "var(--app-tab-bg)" : undefined }}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {d.href ? (
                    <a href={d.href} onClick={(e) => e.stopPropagation()} className="text-sm font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{d.name}</a>
                  ) : (
                    <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{d.name}</span>
                  )}
                  {d.pviNew != null && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>PVI</span>
                      {d.pviOld != null && (
                        <>
                          <PviBadge pvi={d.pviOld} />
                          <span className="text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>→</span>
                        </>
                      )}
                      <PviBadge pvi={d.pviNew} />
                    </span>
                  )}
                </div>
                {d.description ? (
                  <p className="text-sm leading-relaxed" style={{ color: "var(--app-text-primary)" }}>{d.description}</p>
                ) : (
                  <p className="text-xs italic" style={{ color: "var(--app-text-very-muted)" }}>Lines changed; description to come.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

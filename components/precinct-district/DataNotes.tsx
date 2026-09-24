// Provenance and caveats for a precinct-district page: boundary eras and the crosswalk, which
// districts the footprint belonged to each year, sources, and anything the numbers leave out.

import { LedgerSectionHead } from "@/components/RaceDetailSections";
import type { PrecinctDistrictData } from "@/lib/precinctDistrict/types";

export default function DataNotes({ data }: { data: PrecinctDistrictData }) {
  const { config, crosswalk, results } = data;
  const cur = config.eras.find((e) => e.current);
  const older = config.eras.filter((e) => !e.current);
  const years = [...config.years].sort((a, b) => b - a);

  return (
    <section id="data-notes" className="scroll-mt-24">
      <LedgerSectionHead label="Data notes" meta={`built ${config.generated}`} />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          <h3 className="mb-1.5 text-[13px] font-bold" style={{ color: "var(--app-text-primary)" }}>Precinct lines</h3>
          <p>
            {config.eras.map((e, i) => (
              <span key={e.id}>{i > 0 ? " " : ""}<b style={{ color: "var(--app-text-primary)" }}>{e.label}</b>: {e.precincts} precincts ({e.years.join(", ")}).</span>
            ))}
          </p>
          {older.length > 0 && cur && (
            <>
              <p className="mt-2">
                Older years are shown on {cur.label} by default. Each older precinct&apos;s votes, ballots and registration are spread over today&apos;s precincts in proportion to the 2020 population it shares with each ({crosswalk.blocks}); values built that way carry a ≈ mark. Township and city totals are never estimated.
              </p>
              {older.map((e) => {
                const x = crosswalk.eras[e.id];
                if (!x) return null;
                return (
                  <p key={e.id} className="mt-2">
                    {e.label} → {cur.label}: {x.summary.oldMappingMostlyToOne} of {x.summary.oldPrecincts} older precincts sit at least 95% inside a single current precinct; the rest are split.
                    {x.excluded.length > 0 && (
                      <> {x.excluded.map((ex) => ex.precinct).join(", ")} {x.excluded.length === 1 ? "lies" : "lie"} outside the current district and {x.excluded.length === 1 ? "is" : "are"} left out of the current-lines view (still counted under original lines).</>
                    )}
                  </p>
                );
              })}
            </>
          )}
        </div>

        <div className="text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          <h3 className="mb-1.5 text-[13px] font-bold" style={{ color: "var(--app-text-primary)" }}>Which districts these precincts were in</h3>
          <table className="w-full text-[12.5px]" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {years.map((y) => {
                const comp = config.composition[String(y)] ?? {};
                const yr = results.years[String(y)];
                return (
                  <tr key={y} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className="py-1 pr-3 font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{y}</td>
                    <td className="py-1">
                      {Object.entries(comp).map(([office, districts]) => (
                        <span key={office} className="mr-3">{yr.offices[office]?.short ?? office}: <b style={{ color: "var(--app-text-primary)" }}>{districts.join(", ")}</b></span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[12px]">Where more than one district is listed, that column sums several different races (different candidates, sometimes uncontested), so it describes how these precincts voted rather than one contest.</p>
        </div>

        <div className="text-sm leading-relaxed md:col-span-2" style={{ color: "var(--app-text-muted)" }}>
          <h3 className="mb-1.5 text-[13px] font-bold" style={{ color: "var(--app-text-primary)" }}>Sources</h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {config.sources.map((s) => (
              <li key={s.label}><b style={{ color: "var(--app-text-primary)" }}>{s.label}.</b> {s.text}</li>
            ))}
            {config.election2026?.sources?.length ? (
              <li><b style={{ color: "var(--app-text-primary)" }}>2026 candidates.</b> {config.election2026.sources.map((u, i) => <span key={u}>{i > 0 ? ", " : ""}<a href={u} className="underline" target="_blank" rel="noreferrer">{new URL(u).hostname.replace(/^www\./, "")}</a></span>)}</li>
            ) : null}
          </ul>
        </div>
      </div>
    </section>
  );
}

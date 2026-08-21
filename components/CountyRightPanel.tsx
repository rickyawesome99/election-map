import { PastElectionResultsSection, type DetailPastResult } from "@/components/RaceDetailSections";

export default function CountyRightPanel({
  results,
  fallbackYears,
  areaLabel,
}: {
  results: DetailPastResult[];
  fallbackYears: number[];
  areaLabel: string;
}) {
  return (
    <section className="rounded-xl overflow-hidden" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
      <div className="p-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <h2 className="text-[10px] uppercase tracking-wider font-semibold px-1 py-1.5" style={{ color: "var(--app-text-muted)" }}>
          Past Race Results
        </h2>
      </div>

      <div className="p-3">
        {results.length > 0 ? (
          <PastElectionResultsSection
            results={results}
            fallbackYears={fallbackYears}
            showElectionType
            showSpecialBadgeForSpecialElections
            scrollable
            maxHeight="363px"
            bare
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
            No historical election results available for this {areaLabel.toLowerCase()}.
          </p>
        )}
      </div>
    </section>
  );
}

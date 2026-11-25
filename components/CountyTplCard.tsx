import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { CountySection } from "@/components/tpl/CountySection";
import { countyModelSlice } from "@/lib/modelSlices";

// The TPL calculation on a county page: the model's rows are built on the server
// (lib/modelSlices.ts countyModelSlice) and handed to the client section, which lays them out
// like a State TPL page (matrix, races behind the cell, result).
export default function CountyTplCard({ fips, countyLabel }: { fips: string; countyLabel: string }) {
  const data = countyModelSlice(fips, countyLabel);

  // Kalawao County, HI and the District of Columbia have no county-level rows the model can
  // rest on: say so instead of showing a fabricated EVEN.
  if (!data) {
    return (
      <section>
        <LedgerSectionHead label="County TPL" />
        <p className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>
          Not enough countywide election history to compute a True Partisan Lean for {countyLabel}.
        </p>
      </section>
    );
  }
  return <CountySection data={data} />;
}

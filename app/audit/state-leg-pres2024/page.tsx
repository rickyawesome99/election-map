import StateLegPres2024AuditTable from "@/components/StateLegPres2024AuditTable";
import { StandfirstHeader } from "@/components/StandfirstHeader";

export const metadata = {
  title: "State Leg 2024 President Audit",
  robots: { index: false, follow: false },
};

export default function StateLegPres2024AuditPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Audit" title="State Legislature 2024 President Audit">
        Sums the 2024 presidential vote across every state house and senate district (Nebraska&rsquo;s unicameral legislature
        counted once) and checks each chamber&rsquo;s total against the state&rsquo;s official result. A large difference points at a
        data gap or a crosswalk error.
      </StandfirstHeader>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-7 sm:pt-8 pb-6">
        <StateLegPres2024AuditTable />
      </main>
    </div>
  );
}

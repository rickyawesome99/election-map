import StateLegPres2024AuditTable from "@/components/StateLegPres2024AuditTable";

export const metadata = {
  title: "State Leg 2024 President Audit",
  robots: { index: false, follow: false },
};

export default function StateLegPres2024AuditPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, var(--app-tab-bg) 0%, var(--app-bg) 65%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              INTERNAL
            </span>
            <h1
              style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.75rem, 4vw, 2.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
            >
              State Legislature 2024 President — Aggregation Audit
            </h1>
          </div>
          <div className="mt-2 text-sm max-w-3xl" style={{ color: "var(--app-text-muted)" }}>
            Sanity check: sums the per-district 2024 presidential results in{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>data/stateLegPres2024.ts</code> for each state
            house/senate chamber (Nebraska's unicameral legislature counted once) and compares the aggregate to that
            state&rsquo;s official 2024 presidential result. Once sourcing is complete, every chamber&rsquo;s
            aggregate should match the official state totals almost exactly — any large diff below points at a
            data gap or crosswalk error. Temporary page, not linked from site navigation.
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <StateLegPres2024AuditTable />
      </main>
    </div>
  );
}

import { electionYear } from "@/data/forecastData";

export const metadata = {
  title: `Analysis — ${electionYear} Forecast`,
  description: `${electionYear} U.S. election analysis`,
};

export default function AnalysisPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <main>
        <section style={{ background: "linear-gradient(110deg, color-mix(in srgb, var(--party-rep) 5%, var(--app-bg)) 0%, var(--app-bg) 48%, color-mix(in srgb, var(--party-dem) 4%, var(--app-bg)) 100%)" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 sm:pt-16 pb-9 sm:pb-11">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)" }}>{electionYear} Election Analysis</div>
            <h1 className="mt-3" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.7rem, 6.4vw, 5.25rem)", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 0.92 }}>Analysis</h1>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Deep dives into the races, coalitions, and national forces shaping {electionYear}.</p>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-14">
          <section className="pt-6 sm:pt-7">
            <div className="pb-3 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)", borderBottom: "2px solid var(--app-text-primary)" }}>Latest Analysis</div>
            <a href="/analysis/oh-31" className="grid grid-cols-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto] gap-2 sm:gap-8 items-start py-6" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>State House</div>
              <div><h3 className="text-xl sm:text-2xl font-bold hover:underline" style={{ fontFamily: "var(--font-serif)" }}>OH-31 State House Analysis</h3><p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Precinct results, demographics, and district geography in one interactive analysis.</p></div>
              <span className="hidden sm:block text-sm font-bold" style={{ color: "var(--party-dem)" }}>Read Analysis →</span>
            </a>
            <a href="/analysis/popular-vote" className="grid grid-cols-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto] gap-2 sm:gap-8 items-start py-6" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>National</div>
              <div><h3 className="text-xl sm:text-2xl font-bold hover:underline" style={{ fontFamily: "var(--font-serif)" }}>Popular Vote History</h3><p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Compare national vote margins, turnout, approval, and seats across election cycles.</p></div>
              <span className="hidden sm:block text-sm font-bold" style={{ color: "var(--party-dem)" }}>Read Analysis →</span>
            </a>
          </section>
        </div>
      </main>
    </div>
  );
}

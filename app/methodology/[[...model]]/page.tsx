import Link from "next/link";
import { notFound } from "next/navigation";
import { electionYear } from "@/data/forecastData";
import { METHODOLOGY_CHANGELOG } from "@/data/methodologyChangelog";
import ForecastMethodology from "@/components/methodology/ForecastMethodology";
import { StateTplMethodology, DistrictTplMethodology, CountyTplMethodology } from "@/components/methodology/TplMethodology";
import WarMethodology from "@/components/methodology/WarMethodology";
import ChangeLog, { RevisionHistory } from "@/components/methodology/ChangeLog";
import SourcesMethodology from "@/components/methodology/SourcesMethodology";
import MethodologyToc from "@/components/methodology/MethodologyToc";

// One tab per model. Each tab reads its constants and fitted values from the code that runs the
// model, so the numbers cannot drift; when the STRUCTURE of a calculation changes, edit the tab's
// component and add an entry to data/methodologyChangelog.ts.
const TABS = [
  { key: "forecast", label: "Forecast", blurb: "House, Senate and Governor projections" },
  { key: "state-tpl", label: "State TPL", blurb: "A state's structural lean" },
  { key: "district-tpl", label: "District TPL", blurb: "A district's lean on the 2026 lines" },
  { key: "county-tpl", label: "County TPL", blurb: "The state pipeline in one county" },
  { key: "war", label: "WAR", blurb: "Candidate WAR, Expected Result, Vs. Opponent" },
  { key: "changelog", label: "Change Log", blurb: "What changed, and when" },
  { key: "sources", label: "Sources", blurb: "Every external source behind the data" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function parseTab(segments: string[] | undefined): TabKey {
  if (!segments || segments.length === 0) return "forecast";
  if (segments.length > 1) notFound();
  const tab = TABS.find((t) => t.key === segments[0]);
  if (!tab) notFound();
  return tab.key;
}

export async function generateMetadata({ params }: { params: Promise<{ model?: string[] }> }) {
  const active = parseTab((await params).model);
  const tab = TABS.find((t) => t.key === active)!;
  return { title: `${tab.label} · Methodology — ${electionYear} Forecast`, description: `${tab.label} — ${tab.blurb.toLowerCase()}.` };
}

export default async function MethodologyPage({ params }: { params: Promise<{ model?: string[] }> }) {
  const active = parseTab((await params).model);
  const lastChange = METHODOLOGY_CHANGELOG[0]?.date;
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)" }}>How every number is calculated</div>
          <h1 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6vw, 4.25rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Methodology</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            The current specification of each model on this site. Constants, fitted values, worked examples and backtests are read live
            from the code that produces the forecasts, and each is labelled with how it was set — so this is the place to look before
            changing anything.{lastChange && <> Last model change recorded {new Date(`${lastChange}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}.</>}
          </p>
          <nav aria-label="Models" className="scrollbar-none -mx-4 mt-6 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ borderBottom: "1px solid var(--app-border)" }}>
            {TABS.map((t) => {
              const on = t.key === active;
              return (
                <Link key={t.key} href={t.key === "forecast" ? "/methodology" : `/methodology/${t.key}`} aria-current={on ? "page" : undefined} title={t.blurb}
                  className="shrink-0 px-3 py-2.5 text-sm font-semibold transition-colors"
                  style={{ color: on ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: `2px solid ${on ? "var(--app-text-primary)" : "transparent"}`, marginBottom: "-1px" }}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <main id="methodology-content" className="min-w-0">
          {active === "forecast" && <><ForecastMethodology /><RevisionHistory model="forecast" /></>}
          {active === "state-tpl" && <><StateTplMethodology /><RevisionHistory model="state-tpl" /></>}
          {active === "district-tpl" && <><DistrictTplMethodology /><RevisionHistory model="district-tpl" /></>}
          {active === "county-tpl" && <><CountyTplMethodology /><RevisionHistory model="county-tpl" /></>}
          {active === "war" && <><WarMethodology /><RevisionHistory model="war" /></>}
          {active === "changelog" && <ChangeLog />}
          {active === "sources" && <SourcesMethodology />}
        </main>
        <aside className="hidden lg:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pt-8"><MethodologyToc key={active} contentId="methodology-content" /></div>
        </aside>
      </div>
    </div>
  );
}

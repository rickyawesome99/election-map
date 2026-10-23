import Link from "next/link";
import { notFound } from "next/navigation";
import { electionYear } from "@/data/forecastData";
import ForecastPublic from "@/components/methodology-public/ForecastPublic";
import { StateTplPublic, DistrictTplPublic, CountyTplPublic } from "@/components/methodology-public/TplPublic";
import WarPublic from "@/components/methodology-public/WarPublic";
import PrecinctPublic from "@/components/methodology-public/PrecinctPublic";
import TurnoutPublic from "@/components/methodology-public/TurnoutPublic";
import StateLegPublic from "@/components/methodology-public/StateLegPublic";
import MethodologyToc from "@/components/methodology/MethodologyToc";
import { StandfirstHeader } from "@/components/StandfirstHeader";

// The public Methodology page: a plain-language explanation of every model, for readers. It is derived
// from Internal Methodology (/analysis/internal-methodology), the working specification, and covers the
// same models on the same tab keys; its numbers are read live from the same code. When a model change
// alters what a reader is told here (a new ingredient, a removed one, a new rule), update the matching
// component in components/methodology-public/ in the same piece of work. Plain value changes need no
// edit. The change log lives on Internal Methodology only.
const TABS = [
  { key: "forecast", label: "Forecast", blurb: "How House, Senate and governor races are forecast" },
  { key: "state-tpl", label: "State TPL", blurb: "How a state's partisan lean is measured" },
  { key: "district-tpl", label: "District TPL", blurb: "How a House district's lean is measured" },
  { key: "county-tpl", label: "County TPL", blurb: "How a county's lean is measured" },
  { key: "war", label: "WAR", blurb: "How a candidate's strength is measured" },
  { key: "turnout", label: "Turnout", blurb: "How turnout is measured and estimated" },
  { key: "state-leg", label: "State Legislatures", blurb: "How state legislative seats are recorded and projected" },
  { key: "precinct-district", label: "Precinct Districts", blurb: "How the precinct-level district pages work" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Every tab is prerendered; without this an optional catch-all renders on demand.
export function generateStaticParams() {
  return [{ model: [] }, ...TABS.map((t) => ({ model: [t.key] }))];
}

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
  return { title: `${tab.label} · Methodology — ${electionYear} Forecast`, description: `${tab.blurb}.` };
}

export default async function MethodologyPage({ params }: { params: Promise<{ model?: string[] }> }) {
  const active = parseTab((await params).model);
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        <StandfirstHeader title="Methodology" size="large" bare>
          How the numbers on this site are made, in plain language: where each one comes from, what goes into it, and how
          well it has held up against past elections.
        </StandfirstHeader>
        <nav aria-label="Models" className="scrollbar-none -mx-4 mt-6 flex gap-1 overflow-x-auto overflow-y-hidden px-4 sm:mx-0 sm:px-0" style={{ boxShadow: "inset 0 -1px 0 var(--app-border)" }}>
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <Link key={t.key} href={t.key === "forecast" ? "/methodology" : `/methodology/${t.key}`} prefetch={false} aria-current={on ? "page" : undefined} title={t.blurb}
                className="shrink-0 px-3 py-2.5 text-sm font-semibold transition-colors"
                style={{ color: on ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: `2px solid ${on ? "var(--app-text-primary)" : "transparent"}` }}>
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <main id="methodology-content" className="min-w-0">
          {active === "forecast" && <ForecastPublic />}
          {active === "state-tpl" && <StateTplPublic />}
          {active === "district-tpl" && <DistrictTplPublic />}
          {active === "county-tpl" && <CountyTplPublic />}
          {active === "war" && <WarPublic />}
          {active === "precinct-district" && <PrecinctPublic />}
          {active === "turnout" && <TurnoutPublic />}
          {active === "state-leg" && <StateLegPublic />}
        </main>
        <aside className="hidden lg:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pt-8"><MethodologyToc key={active} contentId="methodology-content" /></div>
        </aside>
      </div>
    </div>
  );
}

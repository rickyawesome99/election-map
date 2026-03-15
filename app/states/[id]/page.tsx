import { statesData } from "@/data/statesData";
import { notFound } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { label: "House",    href: "/house" },
  { label: "Senate",   href: "/senate" },
  { label: "Governor", href: "/governor" },
  { label: "States",   href: "/states" },
];

export async function generateStaticParams() {
  return statesData.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) return { title: "State Not Found" };
  return {
    title: `${state.name} — 2026 Forecast`,
    description: `2026 election forecast for ${state.name}`,
  };
}

export default async function StateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = statesData.find((s) => s.id === id);
  if (!state) notFound();

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <header
        className="px-6 py-4 flex items-center gap-4"
        style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-panel)" }}
      >
        <Link href="/" className="font-bold text-lg tracking-tight" style={{ color: "var(--app-text-primary)" }}>
          CT Strategies
        </Link>
        <div className="h-4 w-px" style={{ background: "var(--app-border)" }} />
        <nav className="flex items-center gap-1">
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
              style={{ color: "var(--app-text-muted)" }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/states"
            className="text-sm transition-colors"
            style={{ color: "var(--app-text-muted)" }}
          >
            ← All States
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Title */}
        <div className="mb-10 flex items-center gap-4">
          <span
            className="text-sm font-bold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
          >
            {state.abbr}
          </span>
          <h1 className="text-3xl font-bold" style={{ color: "var(--app-text-primary)" }}>
            {state.name}
          </h1>
        </div>

        {/* Placeholder sections */}
        <div className="grid grid-cols-1 gap-6">
          {["Senate", "Governor", "House Districts"].map((section) => (
            <section
              key={section}
              className="rounded-xl p-6"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
            >
              <h2
                className="text-[10px] uppercase tracking-wider font-semibold mb-4"
                style={{ color: "var(--app-text-muted)" }}
              >
                {section}
              </h2>
              <p className="text-sm italic" style={{ color: "var(--app-text-very-muted)" }}>
                Coming soon.
              </p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

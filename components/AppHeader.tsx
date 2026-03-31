import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { label: "States",   href: "/states" },
  { label: "House",    href: "/house" },
  { label: "Senate",   href: "/senate" },
  { label: "Governor", href: "/governor" },
  { label: "Analysis", href: "/analysis" },
];

export default function AppHeader({ back }: { back?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10">
      <header
        className="px-6 py-4 flex items-center gap-4"
        style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-panel)" }}
      >
        <Link href="/" className="font-bold text-lg tracking-tight shrink-0" style={{ color: "var(--app-text-primary)" }}>
          CT Strategies
        </Link>
        <div className="hidden md:block h-4 w-px shrink-0" style={{ background: "var(--app-border)" }} />
        <nav className="hidden md:flex items-center gap-1">
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
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {back}
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile nav tabs */}
      <nav className="md:hidden flex border-b" style={{ background: "var(--app-panel)", borderColor: "var(--app-border)" }}>
        {NAV.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 py-2 text-center text-sm font-medium"
            style={{ color: "var(--app-text-muted)" }}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

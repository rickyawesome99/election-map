import Link from "next/link";

// One line under every page: who runs the site and where to read about it.
const LINKS = [
  { href: "/about", label: "About" },
  { href: "/methodology", label: "Methodology" },
  { href: "/methodology/sources", label: "Sources" },
];

export default function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-bg)" }}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-5 text-xs sm:px-6" style={{ color: "var(--app-text-muted)" }}>
        <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>CT Strategies</span>
        {LINKS.map((l) => <Link key={l.href} href={l.href} className="hover:underline">{l.label}</Link>)}
      </div>
    </footer>
  );
}

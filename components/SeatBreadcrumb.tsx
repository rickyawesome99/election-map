// "Nebraska › Nebraska's 3rd District" — the seat context line at the top of the past election
// pages. A crumb without an href is the page itself.
export type Crumb = { label: string; href?: string };

const CRUMB_STYLE = { fontFamily: "var(--font-serif)", fontSize: "1rem", color: "var(--app-text-muted)" } as const;

export function SeatCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      {crumbs.map((c, i) => (
        <span key={c.label} className="flex items-baseline gap-x-2.5">
          {i > 0 && <span aria-hidden className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>›</span>}
          {c.href ? (
            <a href={c.href} className="hover:underline" style={CRUMB_STYLE}>{c.label}</a>
          ) : (
            <span style={CRUMB_STYLE} aria-current="page">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

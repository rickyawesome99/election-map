export default function OH31Hero({
  precinctCount,
  ballots,
  registered,
  turnoutPct,
  margin,
}: {
  precinctCount: number;
  ballots: number;
  registered: number;
  turnoutPct: number;
  margin: number; // positive = R, negative = D
}) {
  const isD = margin <= 0;
  const heroColor = isD ? "var(--party-dem)" : "var(--party-rep)";

  return (
    <div
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${heroColor} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
      }}
    >
      <div className="max-w-6xl mx-auto px-6 pt-6 pb-8 sm:pb-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
              >
                OH
              </span>
              <h1
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "clamp(2rem, 5.5vw, 3.5rem)",
                  fontWeight: 700,
                  lineHeight: 0.98,
                  letterSpacing: "-0.02em",
                  color: "var(--app-text-primary)",
                }}
              >
                House District 31
              </h1>
            </div>
            <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
              Summit County · Akron–Cuyahoga Falls area · {precinctCount} precincts
            </div>
          </div>

          <div className="shrink-0 sm:text-right">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
              2024 State Rep Margin
            </div>
            <div
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(2rem, 5vw, 3rem)",
                fontWeight: 700,
                lineHeight: 1,
                marginTop: "0.35rem",
                color: heroColor,
              }}
            >
              {isD ? "D" : "R"}+{Math.abs(margin).toFixed(1)}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-5 flex flex-wrap gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
          <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
              {ballots.toLocaleString()}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
              Ballots Cast
            </div>
          </div>
          <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
              {turnoutPct.toFixed(1)}%
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
              Turnout
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
              {registered.toLocaleString()}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
              Registered
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

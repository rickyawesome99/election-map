import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import StateLegModelTable from "@/components/StateLegModelTable";
import { electionYear } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { MODEL_NAME, type ComparisonSummary, type ModelId } from "@/lib/stateLegComparison";

export const metadata = {
  title: `State Legislature Model Comparison — ${electionYear} Forecast`,
  description: `This site's ${electionYear} state legislative forecast against State Navigate's and ElectIndex's, chamber by chamber and district by district.`,
};

// A utility page for checking our model against the two published ones; not meant for the
// public site. The slices are written by scripts/buildStateLegComparison.ts (see the foot).
function loadSummary(): ComparisonSummary {
  return JSON.parse(readFileSync(join(process.cwd(), "public", "state-leg-comparison", "summary.json"), "utf8")) as ComparisonSummary;
}

const pct = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
const MODELS: ModelId[] = ["ours", "sn", "ei"];
const th = (h: string, a: "left" | "right" = "right", extra = "", key = h) => (
  <th key={key} className={`py-1.5 pr-3 text-[10px] uppercase tracking-wider font-semibold text-${a} ${extra}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
);

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{children}<span aria-hidden="true" style={{ color: "var(--app-text-very-muted)" }}> ↗</span></a>;
}

export default function StateLegModelsPage() {
  const s = loadSummary();
  const by = (m: ModelId) => s.toplines.find((t) => t.model === m)!;
  const ag = (m: "sn" | "ei") => s.agreement.find((a) => a.model === m)!;
  const muted = { color: "var(--app-text-muted)" } as const;
  const veryMuted = { color: "var(--app-text-very-muted)" } as const;
  const gapChambers = s.chambers.filter((c) => [c.sn?.pD, c.ei?.pD].some((p) => p != null && c.ours.pD != null && Math.abs(p - c.ours.pD) >= 0.15));
  const pColor = (p: number | null) => (p == null ? "var(--app-text-very-muted)" : p >= 0.5 ? "var(--party-dem)" : "var(--party-rep)");

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={muted}><Link href="/analysis" className="hover:underline">Analysis</Link> · utility</div>
          <h1 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>State Legislature Models</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={muted}>
            Our <Link href="/legislatures" className="underline underline-offset-2">state legislative forecast</Link> against the two published district-level models, read into the same {s.districts.toLocaleString()} districts on the {electionYear} ballot: <Ext href={s.sources.sn.url}>{s.sources.sn.name}</Ext> (its public national page, run {fmtDate(s.sources.sn.run)}, read {fmtDate(s.sources.sn.fetched)}) and <Ext href={s.sources.ei.url}>{s.sources.ei.name}</Ext> (its published CSV, run {fmtDate(s.sources.ei.run)}, read {fmtDate(s.sources.ei.fetched)}). Both list the A/B states seat by seat; those rows are averaged onto the district. Margins are R-positive throughout; a model&apos;s own rating words are kept.
          </p>
          <div className="mt-6 pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
            {[
              { label: "Districts compared", value: s.districts.toLocaleString(), sub: `${s.unmatched.sn + s.unmatched.ei} external rows unmatched` },
              { label: `vs ${MODEL_NAME.sn}`, value: `r ${ag("sn").corr.toFixed(2)}`, sub: `${ag("sn").n.toLocaleString()} contested · ${ag("sn").mad.toFixed(1)} pts apart` },
              { label: `vs ${MODEL_NAME.ei}`, value: `r ${ag("ei").corr.toFixed(2)}`, sub: `${ag("ei").n.toLocaleString()} contested · ${ag("ei").mad.toFixed(1)} pts apart` },
              { label: "Our lean vs theirs", value: `${signed(ag("sn").bias)} · ${signed(ag("ei").bias)}`, sub: "R-positive; ours minus theirs" },
              { label: "Different favorite", value: `${ag("sn").favoredDisagree} · ${ag("ei").favoredDisagree}`, sub: "seats, vs each model" },
              { label: "Control odds 15+ apart", value: gapChambers.length, sub: "chambers, vs either model" },
            ].map((x) => (
              <div key={x.label} className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={muted}>{x.label}</div>
                <div className="text-2xl font-bold tabular-nums leading-tight">{x.value}</div>
                <div className="text-xs" style={veryMuted}>{x.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-10">
        <section>
          <LedgerSectionHead label="Toplines" meta="seats on the ballot, by each model's own reckoning of who holds them and who is favored" />
          <div className="overflow-x-auto">
            <table className="w-full max-w-3xl text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>{th("Model", "left")}{th("Seats")}{th("D favored")}{th("R favored")}{th("D pickups")}{th("R pickups")}{th("Chambers P(D) ≥ 50%")}</tr></thead>
              <tbody>
                {MODELS.map((m) => { const t = by(m); return (
                  <tr key={m} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className="py-2 pr-3 font-semibold">{MODEL_NAME[m]}{m === "sn" && s.sources.sn.hero ? <span className="text-xs font-normal" style={veryMuted}> · its page: {s.sources.sn.hero.seats.toLocaleString()} seats, {s.sources.sn.hero.demPickups} D / {s.sources.sn.hero.repPickups} R pickups</span> : null}</td>
                    <td className="py-2 pr-3 text-right">{t.seats.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right" style={{ color: "var(--party-dem)" }}>{t.demFav.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right" style={{ color: "var(--party-rep)" }}>{t.repFav.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right" style={{ color: "var(--party-dem)" }}>{t.demPick}</td>
                    <td className="py-2 pr-3 text-right" style={{ color: "var(--party-rep)" }}>{t.repPick}</td>
                    <td className="py-2 pr-0 text-right">{t.demChambers} <span className="text-xs" style={veryMuted}>of {s.chambers.length}</span></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 max-w-3xl text-xs" style={veryMuted}>Favored seats count every seat on the ballot a model leans one way, uncontested ones included; ours gives the seats the field decides to their party and counts independents apart. A pickup is a seat a model favors against the party it records as holding it, so each column follows that model&apos;s own roster. State Navigate&apos;s own page counts specials and holdover seats we do not carry.</p>
        </section>

        <section>
          <LedgerSectionHead label="Agreement" meta="contested seats both models score; margins R-positive" />
          <div className="grid gap-8 lg:grid-cols-2">
            {(["sn", "ei"] as const).map((m) => { const a = ag(m); return (
              <div key={m}>
                <div className="text-sm font-bold mb-2">{MODEL_NAME[m]}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm mb-4">
                  {[["Seats", a.n.toLocaleString()], ["Correlation", a.corr.toFixed(3)], ["Mean gap", `${a.mad.toFixed(1)} pts`], ["Ours − theirs", `${signed(a.bias)} pts`], ["Different favorite", a.favoredDisagree], ["Within 10 on either", a.within10.toLocaleString()]].map(([l, v]) => (
                    <div key={String(l)}><div className="text-[10px] uppercase tracking-wider font-semibold" style={muted}>{l}</div><div className="font-bold tabular-nums">{v}</div></div>
                  ))}
                </div>
                <table className="w-full max-w-md text-xs" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>{th("|margin|", "left")}{th("Our favorite's odds")}{th("n")}{th(`${MODEL_NAME[m]}'s`)}{th("n", "right", "", "n2")}</tr></thead>
                  <tbody>
                    {a.bands.map((b) => (
                      <tr key={b.band} style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td className="py-1 pr-3">{b.band}</td><td className="py-1 pr-3 text-right">{pct(b.ours)}</td><td className="py-1 pr-3 text-right" style={veryMuted}>{b.oursN}</td>
                        <td className="py-1 pr-3 text-right">{pct(b.theirs)}</td><td className="py-1 pr-0 text-right" style={veryMuted}>{b.theirsN}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[11px]" style={veryMuted}>The favorite&apos;s win probability at each model&apos;s own margin: how confident each is at the same distance from even.</p>
              </div>
            ); })}
          </div>
        </section>

        <section>
          <LedgerSectionHead label="By state" meta="mean of ours − theirs on contested seats, states with 10+; most Democratic-leaning gap first" />
          <div className="grid gap-8 lg:grid-cols-2">
            {(["sn", "ei"] as const).map((m) => (
              <div key={m} className="overflow-x-auto">
                <div className="text-sm font-bold mb-2">{MODEL_NAME[m]}</div>
                <table className="w-full text-xs" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>{th("State", "left")}{th("n")}{th("Ours − theirs")}{th("Mean gap")}{th("", "left", "w-full")}</tr></thead>
                  <tbody>
                    {ag(m).states.map((r) => (
                      <tr key={r.abbr} style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td className="py-1 pr-3 font-semibold">{r.abbr}</td><td className="py-1 pr-3 text-right" style={veryMuted}>{r.n}</td>
                        <td className="py-1 pr-3 text-right font-semibold" style={{ color: r.bias > 0 ? "var(--party-rep)" : "var(--party-dem)" }}>{signed(r.bias)}</td>
                        <td className="py-1 pr-3 text-right">{r.mad.toFixed(1)}</td>
                        <td className="py-1"><div style={{ height: 6, width: `${Math.min(100, Math.abs(r.bias) * 8)}%`, background: r.bias > 0 ? "var(--party-rep)" : "var(--party-dem)", opacity: 0.6 }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        <section>
          <LedgerSectionHead label="Chambers" meta={`projected Democratic seats (whole chamber) and P(Democratic control); ${gapChambers.length} chambers 15+ points apart flagged`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                  {th("Chamber", "left")}{th("Seats")}{th("Now D–R")}{th("Ours D")}{th("P(D)")}{th(`${MODEL_NAME.sn} D`)}{th("P(D)", "right", "", "pd-sn")}{th(`${MODEL_NAME.ei} D`)}{th("P(D)", "right", "", "pd-ei")}
                </tr>
              </thead>
              <tbody>
                {s.chambers.map((c) => {
                  const flag = gapChambers.includes(c);
                  return (
                    <tr key={`${c.abbr}-${c.chamber}`} style={{ borderBottom: "1px solid var(--app-border)", background: flag ? "color-mix(in srgb, var(--app-text-primary) 4%, transparent)" : undefined }}>
                      <td className="py-1.5 pr-3 whitespace-nowrap"><Link prefetch={false} href={c.href} className="font-semibold hover:underline">{c.state}</Link> <span style={muted}>{c.chamber === "house" ? "House" : "Senate"}</span>{flag && <span className="ml-1 text-[10px] font-bold" style={muted}>▲</span>}</td>
                      <td className="py-1.5 pr-3 text-right">{c.totalSeats ?? "—"} <span className="text-xs" style={veryMuted}>({c.seatsUp} up)</span></td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap"><span style={{ color: "var(--party-dem)" }}>{c.nowD}</span>–<span style={{ color: "var(--party-rep)" }}>{c.nowR}</span></td>
                      <td className="py-1.5 pr-3 text-right">{c.ours.d.toFixed(1)}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: pColor(c.ours.pD) }}>{pct(c.ours.pD)}</td>
                      <td className="py-1.5 pr-3 text-right">{c.sn ? c.sn.d : "—"}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: pColor(c.sn?.pD ?? null) }}>{pct(c.sn?.pD)}</td>
                      <td className="py-1.5 pr-3 text-right">{c.ei ? c.ei.d.toFixed(1) : "—"}</td>
                      <td className="py-1.5 pr-0 text-right font-semibold" style={{ color: pColor(c.ei?.pD ?? null) }}>{pct(c.ei?.pD)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 max-w-3xl text-xs" style={veryMuted}>State Navigate counts Alaska&apos;s bipartisan coalition as Democratic control and assigns a caucus to Nebraska&apos;s nonpartisan seats; ElectIndex reports a coalition outcome for Alaska. Our Nebraska odds are withheld.</p>
        </section>

        <section>
          <LedgerSectionHead label="Districts" meta="every seat with all three calls; the gap is the widest margin difference against the models selected" />
          <StateLegModelTable states={statesData.filter((x) => s.chambers.some((c) => c.abbr === x.abbr)).map((x) => ({ abbr: x.abbr, name: x.name }))} />
        </section>

        <p className="max-w-3xl text-xs" style={veryMuted}>
          Built {fmtDate(s.built)}. Refresh: <code>node scripts/fetch-state-leg-comparison.mjs</code> then <code>npx tsx --conditions=react-server scripts/buildStateLegComparison.ts</code>; the build re-runs our projection, so it is also the step after any model change.
        </p>
      </main>
    </div>
  );
}

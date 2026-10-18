import Link from "next/link";
import BackButton from "@/components/BackButton";
import PollingMissExplorer from "@/components/PollingMissExplorer";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { electionYear } from "@/data/forecastData";
import { POLLSTER_RATING_META as META } from "@/data/pollsterRatings";
import { pollingMisses } from "@/lib/pollingMisses";
import { fmtLean, leanColor } from "@/lib/pollsterDisplay";

export const metadata = {
  title: `Polling Misses by State — ${electionYear} Forecast`,
  description: "How far the final polls of every presidential, Senate and governor race since 2016 missed the result in each state, and which party kept beating its polls.",
};

export default function PollingMissesPage() {
  const data = pollingMisses();
  const { races } = data;
  const states = new Set(races.map((r) => r.abbr)).size;
  const finalPolls = races.reduce((n, r) => n + r.polls, 0);
  const overall = races.reduce((s, r) => s + r.miss, 0) / races.length;
  const byOffice = (["President", "Senate", "Governor"] as const).map((office) => {
    const rs = races.filter((r) => r.office === office);
    return { office, n: rs.length, miss: rs.reduce((s, r) => s + r.miss, 0) / rs.length, abs: rs.reduce((s, r) => s + Math.abs(r.miss), 0) / rs.length };
  });
  const byYear = data.years.map((year) => {
    const rs = races.filter((r) => r.year === year);
    return { year, n: rs.length, miss: rs.reduce((s, r) => s + r.miss, 0) / rs.length, abs: rs.reduce((s, r) => s + Math.abs(r.miss), 0) / rs.length };
  });
  const stats = [
    { value: races.length, label: "Statewide races" },
    { value: finalPolls.toLocaleString(), label: "Final polls counted" },
    { value: states, label: "States" },
    { value: `${data.years[0]}–${data.years[data.years.length - 1]}`, label: "Elections covered" },
    { value: <span style={{ color: leanColor(overall) }}>{fmtLean(overall)}</span>, label: "Average miss, all races" },
  ];
  const note = "mt-4 max-w-3xl text-xs leading-relaxed";

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-3 sm:px-6 sm:pb-10">
          <div className="-ml-2 mb-5"><BackButton /></div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 4rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Polling Misses by State</h1>
          <div className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            For every presidential, Senate and governor race since {data.years[0]}, each pollster&rsquo;s final poll of the race, taken in
            October or later, is averaged into one predicted margin and compared with the result. The difference is the race&rsquo;s
            polling miss: <b style={{ color: "var(--party-dem)" }}>blue</b> where Democrats did better than their polls,{" "}
            <b style={{ color: "var(--party-rep)" }}>red</b> where Republicans did. The map colors each state by its misses
            across years, recent years counting most; the table lists every race. The pollsters themselves are graded on the{" "}
            <Link href="/analysis/pollsters" className="font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Pollster Ratings</Link> page.
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            {stats.map((stat, i, all) => (
              <div key={stat.label} className={i < all.length - 1 ? "pr-8" : ""} style={i < all.length - 1 ? { borderRight: "1px solid var(--app-border)" } : undefined}>
                <div className="text-2xl font-extrabold tabular-nums">{stat.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6">
        <section className="mb-12">
          <PollingMissExplorer data={data} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            <strong>Poll average</strong> is the plain mean of each pollster&rsquo;s last poll of the race, counting only pollsters whose last
            poll ended on or after October 1 of the election year (runoffs and specials use the same cutoff; all their polls fall
            after it). Every pollster counts once and equally, including polls released by a party or campaign, which the Final polls
            column counts separately. <strong>Miss</strong> is the result minus the poll average, so R+3 means the Republican finished
            three points better than the final polls said. A state&rsquo;s all-years figure averages its races within each year, then
            averages those years with each one weighted {META.decay} per year of age, the same recency weight the pollster grades
            use (a year counts half as much after four). Margins are Republican minus Democrat; first-round and runoff rounds of the
            same race are separate rows.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="By Office and by Year" meta="Average miss and its direction across all states" />
          <div className="grid gap-8 md:grid-cols-2">
            {[{ title: "Office", rows: byOffice.map((r) => ({ label: r.office, ...r })) }, { title: "Year", rows: byYear.map((r) => ({ label: String(r.year), ...r })) }].map((block) => (
              <table key={block.title} className="w-full max-w-md border-collapse text-sm">
                <thead>
                  <tr>{[block.title, "Races", "Avg. size", "Avg. miss"].map((h, i) => (
                    <th key={h} scope="col" className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {block.rows.map((r) => (
                    <tr key={r.label} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td className="px-2 py-1.5 font-semibold tabular-nums">{r.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.n}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.abs.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: leanColor(r.miss) }}>{fmtLean(r.miss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            <strong>Avg. size</strong> is the mean absolute miss, how far off the final polls were regardless of direction; <strong>Avg. miss</strong>{" "}
            is the signed mean, which way they were off. Each race counts once, so the big presidential years dominate. Odd-year rows are the
            Virginia, New Jersey, Kentucky, Louisiana and Mississippi governor races and the 2017 Alabama Senate special. The source archive has
            no polls of the 2023 or 2025 governor races, and {data.droppedPollsters.toLocaleString()} pollsters&rsquo; last polls of a race ended
            before October and were set aside.
          </p>
        </section>
      </main>
    </div>
  );
}

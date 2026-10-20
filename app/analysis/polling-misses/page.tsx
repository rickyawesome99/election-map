import Link from "next/link";
import PollingMissExplorer from "@/components/PollingMissExplorer";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
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
  const first = data.years[0], last = data.years[data.years.length - 1];
  const overallParty = overall > 0 ? "Republicans" : "Democrats";
  const note = "mt-4 max-w-3xl text-xs leading-relaxed";

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Polling" title="Polling Misses by State">
        We checked <Fig>{finalPolls.toLocaleString()}</Fig> final polls of <Fig>{races.length}</Fig> presidential, Senate and governor
        races in <Fig>{states}</Fig> states, from {first} to {last}, against the results.
        {Math.abs(overall) < 0.05
          ? <> On average the polls landed right on the result.</>
          : <> On average {overallParty} finished <Fig><span style={{ color: leanColor(overall) }}>{Math.abs(overall).toFixed(1)}</span></Fig> points better than their polls.</>}
      </StandfirstHeader>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 sm:pt-8">
        <section className="mb-12">
          <PollingMissExplorer data={data} />
          <div className={`${note} space-y-1.5`} style={{ color: "var(--app-text-very-muted)" }}>
            <p>
              <b style={{ color: "var(--party-dem)" }}>Blue</b> means Democrats beat their polls. <b style={{ color: "var(--party-rep)" }}>Red</b> means
              Republicans did. Pollsters are graded on the <Link href="/analysis/pollsters" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Pollster Ratings</Link> page.
            </p>
            <p>
              <strong>Poll average:</strong> the plain mean of each pollster&rsquo;s last poll, if it ended on or after October 1 of the
              election year. Every pollster counts once, partisan ones included.
            </p>
            <p>
              <strong>Miss:</strong> result minus poll average. R+3 means the Republican did three points better than the polls.
            </p>
            <p>
              <strong>All years:</strong> each year&rsquo;s average miss, with older years weighted {META.decay} per year of age (half
              as much after four years).
            </p>
            <p>
              <strong>Margins:</strong> Republican minus Democrat. First-round and runoff rounds are separate rows.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="By Office and by Year" meta="Average miss and its direction across all states" />
          <div className="grid gap-8 md:grid-cols-2">
            {[{ title: "Office", rows: byOffice.map((r) => ({ label: r.office, ...r })) }, { title: "Year", rows: byYear.map((r) => ({ label: String(r.year), ...r })) }].map((block) => (
              <table key={block.title} className="w-full max-w-md table-fixed border-collapse text-sm">
                {/* fixed widths so the Office and Year tables' columns line up side by side */}
                <colgroup><col className="w-[40%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[20%]" /></colgroup>
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
          <div className={`${note} space-y-1.5`} style={{ color: "var(--app-text-very-muted)" }}>
            <p><strong>Avg. size:</strong> the mean absolute miss, how far off the final polls were regardless of direction.</p>
            <p><strong>Avg. miss:</strong> the signed mean, which way they were off.</p>
            <p><strong>Races:</strong> each race counts once, so the big presidential years dominate.</p>
            <p>
              <strong>Odd years:</strong> the Virginia, New Jersey, Kentucky, Louisiana and Mississippi governor races and the 2017
              Alabama Senate special. The source archive has no polls of the 2023 or 2025 governor races.
            </p>
            <p>
              <strong>Set aside:</strong> {data.droppedPollsters.toLocaleString()} pollsters&rsquo; last polls of a race ended before
              October.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

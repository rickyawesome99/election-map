import { notFound } from "next/navigation";
import PollsterGradeExplainer from "@/components/PollsterGradeExplainer";
import PollsterPollsTable from "@/components/PollsterPollsTable";
import PollsterSectionTabs from "@/components/PollsterSectionTabs";
import { PollsterRecordDetail, WinLossCell } from "@/components/PollsterRatingsTable";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { electionYear } from "@/data/forecastData";
import { fmtLean, fmtVsField, gradeTint, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";
import { getPollsterRecord, pollsterSlugs } from "@/lib/pollsterRecord";
import { POLLSTER_RATING_META as META } from "@/data/pollsterRatings";

export const dynamicParams = false;

// "Live Phone/Text-to-Web" -> "live phone and text-to-web"; acronyms like IVR keep their case.
const methodWords = (m: string) => {
  const parts = m.split("/").map((p) => p.split(" ").map((w) => (w === w.toUpperCase() ? w : w.toLowerCase())).join(" "));
  return parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
};

export async function generateStaticParams() {
  return pollsterSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const rec = getPollsterRecord((await params).slug);
  if (!rec) return { title: "Pollster Not Found" };
  return {
    title: `${rec.rating.name} — Pollster Ratings`,
    description: `Every ${rec.rating.name} general-election poll on file, scored against the result: grade, average error, bias and ${electionYear} house effect.`,
  };
}

export default async function PollsterPage({ params }: { params: Promise<{ slug: string }> }) {
  const rec = getPollsterRecord((await params).slug);
  if (!rec) notFound();
  const { rating: r, polls, houseEffects, grade } = rec;
  // by the poll's own year: an odd-year race counts toward the next cycle but already has a result
  const currentPolls = polls.filter((p) => p.year === electionYear);
  const pastPolls = polls.filter((p) => p.year !== electionYear);
  const current = currentPolls.length;
  const pub = houseEffects.find((h) => h.partisan == null) ?? houseEffects[0];

  const stats: { value: React.ReactNode; label: string; title?: string }[] = [
    // drawn at headline size, like the Vs. field box beside it (the chip elsewhere is table-sized)
    { value: r.grade
        ? <span className="rounded px-1.5" style={{ background: gradeTint(r.grade) }}>{r.grade}</span>
        : <span className="rounded px-1.5" style={{ color: "var(--app-text-very-muted)", outline: "1px dashed var(--app-border)", outlineOffset: -1 }}>NR</span>,
      label: "Grade", title: r.grade ? `Historical accuracy grade ${r.grade}` : "Not rated: fewer than five graded polls" },
    { value: <span className="rounded px-1.5" style={{ background: vsFieldTint(r.score) }}>{fmtVsField(r.score)}</span>, label: "Vs. field", title: "Shrunk average miss minus a typical poll of the same races; negative is better" },
    { value: r.n.toLocaleString(), label: "Graded polls", title: "General-election polls in the final 21 days" },
    { value: r.avgError?.toFixed(1) ?? "—", label: "Avg. error", title: "Recency-weighted average miss on the margin, in points" },
    { value: <span style={{ color: leanColor(r.bias) }}>{fmtLean(r.bias)}</span>, label: "Bias", title: "Average signed miss against the result (shrunk)" },
    { value: <span style={{ color: leanColor(r.house) }}>{fmtLean(r.house)}</span>, label: "House effect", title: "Average lean against the other pollsters in the same races (shrunk)" },
    { value: <span style={{ color: leanColor(r.avgMiss) }}>{fmtLean(r.avgMiss)}</span>, label: "Avg. miss", title: "Plain average of poll margin minus result over its graded polls, every cycle counted equally" },
    { value: <WinLossCell record={r.record} />, label: r.record[0] + r.record[1] ? `Record · ${Math.round((r.record[0] / (r.record[0] + r.record[1])) * 100)}% right` : "Record", title: "Graded polls that had the eventual winner ahead – that had the loser ahead (– ties)" },
    { value: current.toLocaleString(), label: `${electionYear} polls` },
    { value: pub ? <span style={{ color: leanColor(pub.effect) }}>{fmtLean(pub.effect)}</span> : "—", label: `${electionYear} house effect`, title: pub ? `${pub.polls} polls of ${pub.races} races vs the field this cycle` : "Too few overlapping polls this cycle" },
  ];

  const span = r.firstYear === r.lastYear ? `in ${r.firstYear}` : `from ${r.firstYear} to ${r.lastYear}`;
  const partisanPct = Math.round((r.partisanShare ?? 0) * 100);
  const vsField = r.score == null ? null : Math.abs(r.score) < 0.1 ? "about as close to the result as" : r.score < 0 ? "closer to the result than" : "further from the result than";

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Pollster Ratings" title={r.name} href="/analysis/pollsters" hubLabel="Pollster Ratings">
        {r.n > 0 && r.firstYear ? (
          <>
            We graded <Fig>{r.n.toLocaleString()}</Fig> final-stretch {r.n === 1 ? "poll" : "polls"} by {r.name} {span}.
            {r.methodology && <> {r.n === 1 ? "It" : "Most"} used {methodWords(r.methodology)}.</>}
            {partisanPct > 0 && <> {partisanPct === 100 ? (r.n === 1 ? "It was" : "All were") : <><Fig>{partisanPct}%</Fig> were</>} sponsored by {r.partisanLean === "D" ? "Democrats" : "Republicans"}.</>}
            {r.grade == null
              ? <> A grade needs at least <Fig>{META.minPolls}</Fig>, so it is not rated yet.</>
              : vsField && <> On average {r.n === 1 ? "it" : "they"} landed {vsField} a typical poll of the same races.</>}
          </>
        ) : (
          <>{r.name} has no graded polls on file{current > 0 && <>, but has released <Fig>{current}</Fig> {current === 1 ? "poll" : "polls"} of {electionYear} races</>}.</>
        )}
      </StandfirstHeader>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6">
        <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-4 pt-5 sm:flex sm:flex-wrap sm:gap-x-7" style={{ borderTop: "1px solid var(--app-border)" }}>
          {stats.map((s) => (
            <div key={s.label} title={s.title} className="min-w-0">
              <div className="flex h-7 items-center text-xl font-extrabold tabular-nums sm:h-8 sm:text-2xl">{s.value}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase leading-tight tracking-wider sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <section className="mb-12">
          <LedgerSectionHead label="Record" meta="Graded polls by cycle, by region and by office" />
          <PollsterRecordDetail r={r} sponsorEffects={houseEffects} year={electionYear} />
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="How the Grade Is Calculated" meta={`${r.name}'s numbers at each step`} />
          <PollsterGradeExplainer r={r} g={grade} />
        </section>

        <section>
          <PollsterSectionTabs ariaLabel={`${electionYear} or past polls`} tabs={[
            ...(currentPolls.length > 0 ? [{
              key: "polls-current", label: `${electionYear} Polls`,
              meta: null,
              content: (
                <>
                  <PollsterPollsTable polls={currentPolls} past={false} />
                  <p className="mt-4 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
                    Dates are the last day in the field. Margins are the top two candidates as published, before the forecast&rsquo;s
                    house-effect adjustment; (D) and (R) mark polls sponsored by a party or campaign. Sources: Wikipedia and RealClearPolling.
                  </p>
                </>
              ),
            }] : []),
            {
              key: "polls-past", label: "Past Polls",
              meta: null,
              content: (
                <>
                  {pastPolls.length > 0
                    ? <PollsterPollsTable polls={pastPolls} />
                    : <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>No past general-election polls on file.</p>}
                  <p className="mt-4 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
                    Polls whose field period ended within 60 days of the election; only those in the final 21 days are graded.
                    Margins are the top two candidates (a same-party contest shows no party), and an ✕ marks a poll that had the
                    loser ahead. Sources: FiveThirtyEight&rsquo;s graded poll file and archive, which links each poll&rsquo;s release from 2018 on.
                  </p>
                  <p className="mt-2 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
                    <strong>Vs. field</strong> compares the poll with other polls of the same race: its miss minus a typical poll&rsquo;s
                    miss. Lower is better. &minus;1.5 means it came 1.5 points closer to the result than the field; +1.5 means 1.5 points further off.
                  </p>
                </>
              ),
            },
          ]} />
        </section>
      </main>
    </div>
  );
}

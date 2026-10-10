import Link from "next/link";
import { notFound } from "next/navigation";
import BackButton from "@/components/BackButton";
import PollsterGradeChip from "@/components/PollsterGradeChip";
import PollsterGradeExplainer from "@/components/PollsterGradeExplainer";
import PollsterPollsTable from "@/components/PollsterPollsTable";
import { PollsterRecordDetail, WinLossCell } from "@/components/PollsterRatingsTable";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { electionYear } from "@/data/forecastData";
import { fmtLean, fmtVsField, leanColor, vsFieldTint } from "@/lib/pollsterDisplay";
import { getPollsterRecord, pollsterSlugs } from "@/lib/pollsterRecord";

export const dynamicParams = false;

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
  const current = polls.filter((p) => p.cycle === electionYear).length;
  const pub = houseEffects.find((h) => h.partisan == null) ?? houseEffects[0];

  const stats: { value: React.ReactNode; label: string; title?: string }[] = [
    { value: <PollsterGradeChip grade={r.grade} />, label: "Grade" },
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

  const sub = [
    r.firstYear && `Graded polls ${r.firstYear}–${r.lastYear}`,
    r.methodology && `mostly ${r.methodology}`,
    (r.partisanShare ?? 0) > 0 && `${Math.round((r.partisanShare ?? 0) * 100)}% ${r.partisanLean === "D" ? "Democratic" : "Republican"}-sponsored`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-3 sm:px-6">
        <div className="-ml-2 mb-5"><BackButton /></div>
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
          <Link href="/analysis/pollsters" className="hover:underline">Pollster Ratings</Link>
        </div>
        <h1 className="mt-1" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.8rem, 4.5vw, 3.2rem)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{r.name}</h1>
        {sub && <div className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>{sub}</div>}
        <div className="mt-6 flex flex-wrap gap-x-7 gap-y-4 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
          {stats.map((s) => (
            <div key={s.label} title={s.title}>
              <div className="flex h-8 items-center text-2xl font-extrabold tabular-nums">{s.value}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <section className="mb-12">
          <LedgerSectionHead label="Record" meta="Graded polls by cycle, by region and by office" />
          <PollsterRecordDetail r={r} />
          {houseEffects.length > 1 && (
            <p className="mt-4 text-xs" style={{ color: "var(--app-text-muted)" }}>
              {electionYear} house effect by sponsor: {houseEffects.map((h) => `${h.partisan ? `(${h.partisan}) ` : "public "}${fmtLean(h.effect)} over ${h.polls} polls`).join(" · ")}.
            </p>
          )}
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="How the Grade Is Calculated" meta={`${r.name}'s numbers at each step`} />
          <PollsterGradeExplainer r={r} g={grade} />
        </section>

        <section>
          <LedgerSectionHead label="Every Poll" meta={`${polls.length.toLocaleString()} general-election polls on file — column headings sort`} />
          <PollsterPollsTable polls={polls} />
          <p className="mt-4 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
            Past polls are those whose field period ended within 60 days of the election, 2008&ndash;2024; only the final 21 days
            count toward the grade, and those carry a <strong>Vs. field</strong> figure. Margins are the top two candidates;
            in a same-party contest the margin is shown without a party. An ✕ marks a poll that had the loser ahead.
            {" "}{electionYear} polls are those fielded since 1 January and have no result yet. Sources: FiveThirtyEight&rsquo;s
            graded poll file and archive (past), Wikipedia and RealClearPolling ({electionYear}).
          </p>
        </section>
      </main>
    </div>
  );
}

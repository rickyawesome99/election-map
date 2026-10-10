import PollsterGradeChip from "@/components/PollsterGradeChip";
import { POLLSTER_RATING_META as META, type PollsterRating } from "@/data/pollsterRatings";
import { fmtVsField, gradeTint, vsFieldTint } from "@/lib/pollsterDisplay";
import type { GradeBreakdown } from "@/lib/pollsterRecord";

// "How the grade is calculated" on /analysis/pollsters/[slug]: the four steps of
// scripts/build-pollster-ratings.py rate() + grade(), filled in with this pollster's numbers.

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const n2 = (v: number) => fmtVsField(v);

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-2 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)]" style={{ borderTop: "1px solid var(--app-border)" }}>
      <div className="text-2xl font-extrabold tabular-nums" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-very-muted)" }}>{n}</div>
      <div className="min-w-0">
        <h3 className="text-sm font-bold">{title}</h3>
        <div className="mt-1.5 max-w-3xl space-y-2 text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{children}</div>
      </div>
    </div>
  );
}

const Num = ({ children }: { children: React.ReactNode }) => <strong className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{children}</strong>;

function GradeBands({ grade, score }: { grade: string | null; score: number | null }) {
  const bands = META.gradeBands as readonly (readonly [string, number])[];
  // each band runs from the previous cut (exclusive) up to its own
  const ranges = [...bands.map(([g, cut]) => [g, `≤ ${n2(cut)}`] as const), ["F", `> ${n2(bands[bands.length - 1][1])}`] as const];
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[36rem] grid-cols-11 gap-1">
        {ranges.map(([g, range]) => {
          const on = g === grade;
          return (
            <div key={g} className="rounded px-1 py-1.5 text-center" style={{ background: on ? gradeTint(g) : "transparent", outline: on ? "2px solid var(--app-text-primary)" : "1px solid var(--app-border)", outlineOffset: on ? -2 : -1 }}>
              <div className="text-xs font-bold" style={{ color: on ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{g}</div>
              <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{range}</div>
            </div>
          );
        })}
      </div>
      {score != null && <div className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>Score {n2(score)}; lower is better.</div>}
    </div>
  );
}

export default function PollsterGradeExplainer({ r, g }: { r: PollsterRating; g: GradeBreakdown | null }) {
  if (!g || r.score == null)
    return (
      <p className="max-w-3xl text-sm" style={{ color: "var(--app-text-muted)" }}>
        {r.name} has no graded polls (general-election polls taken in the final {META.window} days of a race, {META.firstYear}–{META.lastYear}),
        so it has no grade yet. {r.racePolls2026 + r.genericPolls2026 ? "Its current polls are listed below, and its " : "Its "}first graded polls will come after this November&rsquo;s results.
      </p>
    );
  const kept = g.weight / (g.weight + META.scoreK);
  const head = "px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider";
  const cell = "px-2 py-1.5 text-right tabular-nums";
  const ex = g.example;
  return (
    <div>
      <Step n={1} title="Score every graded poll against the field">
        <p>
          Every general-election poll that {r.name} took in the final {META.window} days of a race is graded: {r.n} of them.
          Each one gets a score, &ldquo;vs. field&rdquo;: how far its margin missed the result, minus how far a typical poll of the
          same race missed. A typical miss is the average miss of the other pollsters in that race. With few other pollsters
          it leans on the usual miss for that office and year, adjusted for sample size and days out. (With {META.fieldK} other
          pollsters, each source counts half.) A negative score means the poll beat the field.
        </p>
        {ex && (
          <p>
            Example: its latest graded poll, of the <Num>{ex.label}</Num> ({fmtDate(ex.date)}), missed the result by <Num>{ex.absError.toFixed(1)}</Num> pts.
            A typical poll of that race missed by <Num>{ex.benchmark.toFixed(1)}</Num>, so it scores{" "}
            <span className="rounded px-1 font-bold tabular-nums" style={{ background: vsFieldTint(ex.excess, 4), color: "var(--app-text-primary)" }}>{n2(ex.excess)}</span>.
            The Vs. field column in the table below has this score for every graded poll.
          </p>
        )}
      </Step>

      <Step n={2} title="Weight recent polls more, and repeat polls of one race less">
        <p>
          A poll&rsquo;s weight is <Num>{META.decay}</Num> for each year before {META.asOf - 1}, so a poll counts half as much
          after about four years. That weight is then divided by the square root of the number of graded polls {r.name} took of the same race, so a
          pollster that ran four polls of one race gets twice the say of one poll, not four times.
        </p>
        <div className="overflow-x-auto">
          <table className="mt-1 border-collapse text-sm">
            <thead>
              <tr style={{ color: "var(--app-text-very-muted)", borderBottom: "1px solid var(--app-border)" }}>
                <th scope="col" className={`${head} text-left`}>Year</th>
                <th scope="col" className={`${head} text-right`}>Graded polls</th>
                <th scope="col" className={`${head} text-right`} title={`${META.decay} ^ (${META.asOf - 1} − year)`}>Recency</th>
                <th scope="col" className={`${head} text-right`} title="Σ recency ÷ √(polls of the same race)">Weight</th>
                <th scope="col" className={`${head} text-right`} title="Weighted average vs. field that year">Vs. field</th>
                <th scope="col" className={`${head} text-right`} title="Weight × vs. field">Weighted total</th>
              </tr>
            </thead>
            <tbody>
              {g.years.map((y) => (
                <tr key={y.year} style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
                  <td className="px-2 py-1.5 font-semibold tabular-nums">{y.year}</td>
                  <td className={cell}>{y.polls}</td>
                  <td className={cell} style={{ color: "var(--app-text-muted)" }}>× {y.recency.toFixed(2)}</td>
                  <td className={cell}>{y.weight.toFixed(2)}</td>
                  <td className={cell}><span className="rounded px-1" style={{ background: vsFieldTint(y.excess, 3) }}>{n2(y.excess)}</span></td>
                  <td className={cell}>{n2(y.contribution)}</td>
                </tr>
              ))}
              <tr className="font-bold" style={{ color: "var(--app-text-primary)" }}>
                <td className="px-2 py-1.5">Total</td>
                <td className={cell}>{r.n}</td>
                <td />
                <td className={cell}>{g.weight.toFixed(2)}</td>
                <td className={cell}><span className="rounded px-1" style={{ background: vsFieldTint(g.contribution / g.weight, 3) }}>{n2(g.contribution / g.weight)}</span></td>
                <td className={cell}>{n2(g.contribution)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Weighted this way, {r.name}&rsquo;s polls {g.contribution / g.weight < 0 ? "beat" : "trailed"} the field by{" "}
          <Num>{Math.abs(g.contribution / g.weight).toFixed(2)}</Num> pts. That is its raw record.
        </p>
      </Step>

      <Step n={3} title="Pull a thin record toward the average pollster">
        <p>
          Before any polls, every pollster is treated as if it had <Num>{META.scoreK}</Num> weight&rsquo;s worth of exactly average
          polls (vs. field 0). Its real polls are added on top:
        </p>
        <div className="overflow-x-auto">
          <div className="rounded px-3 py-2 text-sm tabular-nums" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }}>
            score = weighted total ÷ (weight + {META.scoreK}) = {n2(g.contribution)} ÷ ({g.weight.toFixed(2)} + {META.scoreK}) = <strong>{n2(r.score)}</strong>
          </div>
        </div>
        <p>
          With a weight of {g.weight.toFixed(1)}, {r.name} keeps <Num>{Math.round(kept * 100)}%</Num> of its raw record; the other{" "}
          {Math.round((1 - kept) * 100)}% is the average pollster. {kept < 0.5
            ? "Its record is too thin (or too old) to move far from the middle, so the grade is cautious."
            : "Its record is long and recent enough that the grade mostly reflects its own polls."}
        </p>
      </Step>

      <Step n={4} title="Read the grade off the score">
        <p>
          The score falls into one of eleven bands.{" "}
          {r.grade
            ? <>{r.name}&rsquo;s score of <Num>{n2(r.score)}</Num> earns <PollsterGradeChip grade={r.grade} />.</>
            : <>A grade needs at least {META.minPolls} graded polls; with {r.n}, {r.name} is not rated (NR), though its score is shown.</>}
        </p>
        <GradeBands grade={r.grade} score={r.score} />
        <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          Not part of the grade: bias, house effect, average miss and the win&ndash;loss record. Those describe which way a pollster
          misses and whether it had the winner ahead, not how close it got. The forecast does not weight polls by grade, because past
          accuracy has not predicted next-cycle accuracy; it adjusts each poll for its pollster&rsquo;s current house effect instead.
        </p>
      </Step>
    </div>
  );
}

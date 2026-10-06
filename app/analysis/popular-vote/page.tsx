import BackButton from "@/components/BackButton";
import PopularVoteChart from "@/components/PopularVoteChart";
import PopVotePredictorCharts from "@/components/PopVotePredictorCharts";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { electionYear } from "@/data/forecastData";
import { popVotePredictorYears, popVoteTargetYear, type PopVotePredictorYear } from "@/data/popVotePredictors";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { forecastNow } from "@/lib/forecastClock";
import { computeGenericBallotAverage } from "@/lib/genericBallotAverage";
import { PREDICTORS, cycleOf, predictorValue, projectHouse, type CycleFilter } from "@/lib/popVotePredictors";
import { computeTrumpApprovalAverage } from "@/lib/trumpApprovalAverage";

export const metadata = {
  title: `Popular Vote — ${electionYear} Analysis`,
  description: `The national popular vote by office since 2016, and how presidential approval, direction of country and Gallup's third-quarter party ID anticipated the House and presidential vote in 2016–2024 and what each implies for ${electionYear}.`,
};

const th = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
const thStyle = { color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" };
const rowStyle = { borderBottom: "1px solid var(--app-border)" };
const note = "mt-4 max-w-3xl text-xs leading-relaxed";

// What each marker's record actually shows, beyond the fitted numbers.
const CAVEAT: Record<string, string> = {
  approval: "The line is flat because the two Biden years broke it: his party ran 10 and 13 points ahead of his approval in 2022 and 2024, after Trump's had run only a point ahead in 2018. Approval has been a verdict on the president that voters stopped carrying over to his party's House candidates, which is why the fitted line and the midterm shift disagree so widely.",
  direction: "The slope runs the wrong way: the worst right-track readings, 2022 and 2024, came with the best results for the president's party. Direction of country has been underwater by 14 to 44 points in every election here and mostly measures the mood of the moment, not who it will be taken out on, so its line should be read as a non-finding.",
  partyId: "The strongest of the three. Party ID with leaners tracks the presidential vote almost one for one and the House vote with a slope near one; 2018, when the House vote ran six points ahead of a Democratic ID lead of under three, is the outlier. Gallup's third quarter of 2026 is the widest Democratic lead since 2008.",
};

const signed = (v: number | null, digits = 1) => (v == null ? "—" : Math.abs(v) < 0.05 ? "0.0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`);
const Margin = ({ v }: { v: number | null }) => <span className="font-semibold" style={{ color: marginColor(v) }}>{fmtMargin(v)}</span>;
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function InputsTable({ years }: { years: PopVotePredictorYear[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${th} text-left`} style={thStyle}>Year</th>
            <th scope="col" className={`${th} text-left`} style={thStyle}>President</th>
            <th scope="col" className={`${th} text-right`} style={thStyle} title="Approve − disapprove, election-day polling average">Net approval</th>
            <th scope="col" className={`${th} text-right`} style={thStyle} title="Right direction − wrong track, election-day polling average">Direction</th>
            <th scope="col" className={`${th} text-right`} style={thStyle} title="Gallup third-quarter average, party ID with leaners">Gallup Q3 party ID</th>
            <th scope="col" className={`${th} text-right`} style={thStyle} title="Election-eve generic-ballot polling average">Generic ballot</th>
            <th scope="col" className={`${th} text-right`} style={thStyle}>House vote</th>
            <th scope="col" className={`${th} text-right`} style={thStyle}>President vote</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const pid = predictorValue(y, "partyId");
            return (
              <tr key={y.year} style={y.complete ? rowStyle : { borderTop: "2px solid var(--app-text-primary)" }}>
                <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-semibold tabular-nums">{y.year}<span className="ml-2 text-xs font-normal" style={{ color: "var(--app-text-very-muted)" }}>{cycleOf(y) === "midterm" ? "midterm" : "presidential"}</span></th>
                <td className="px-2 py-2"><span style={{ color: y.presidentParty === "R" ? "var(--party-rep)" : "var(--party-dem)" }}>{y.president}</span></td>
                <td className="px-2 py-2 text-right tabular-nums">{y.approval ? <>{signed(y.approval.approve - y.approval.disapprove)}<span className="ml-1.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>{y.approval.approve.toFixed(1)}–{y.approval.disapprove.toFixed(1)}</span></> : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{y.direction ? <>{signed(y.direction.right - y.direction.wrong)}<span className="ml-1.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>{y.direction.right.toFixed(1)}–{y.direction.wrong.toFixed(1)}</span></> : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{y.partyId ? <><Margin v={pid} /><span className="ml-1.5 text-xs" style={{ color: "var(--app-text-very-muted)" }}>R {y.partyId.rep} · D {y.partyId.dem}</span></> : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums"><Margin v={y.gbFinal} /></td>
                <td className="px-2 py-2 text-right tabular-nums"><Margin v={y.housePv} /></td>
                <td className="px-2 py-2 text-right tabular-nums"><Margin v={y.presPv} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectionTable({ years, target }: { years: PopVotePredictorYear[]; target: PopVotePredictorYear }) {
  const cycles: [CycleFilter, string][] = [["all", "All five elections"], ["midterm", "Midterms only"], ["presidential", "Presidential years only"]];
  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-4xl border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${th} text-left`} style={thStyle}>Marker</th>
            <th scope="col" className={`${th} text-right`} style={thStyle}>{target.year} reading</th>
            {cycles.map(([k, label]) => <th key={k} scope="col" className={`${th} text-right`} style={thStyle}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {PREDICTORS.map((p) => {
            const reading = predictorValue(target, p.key);
            return (
              <tr key={p.key} style={rowStyle}>
                <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-semibold">{p.label}</th>
                <td className="px-2 py-2 text-right tabular-nums">{p.incumbentSigned ? signed(reading) : <Margin v={reading} />}</td>
                {cycles.map(([k]) => {
                  const pr = projectHouse(p.key, target, k, years);
                  return (
                    <td key={k} className="px-2 py-2 text-right tabular-nums">
                      {pr?.fitted != null ? <Margin v={pr.fitted} /> : <span style={{ color: "var(--app-text-very-muted)" }}>—</span>}
                      {p.shiftable && <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>shift {pr?.shifted != null ? fmtMargin(pr.shifted) : "—"}</div>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PopularVotePage() {
  const now = forecastNow();
  const gb = computeGenericBallotAverage(now);
  const approval = computeTrumpApprovalAverage(now);
  const asOf = now.toISOString().slice(0, 10);

  // The current cycle's approval is the site's own average; direction and party ID are the latest readings on file.
  const years = popVotePredictorYears.map((y) =>
    y.year === popVoteTargetYear ? { ...y, approval: { approve: approval.approve, disapprove: approval.disapprove, asOf } } : y
  );
  const target = years.find((y) => y.year === popVoteTargetYear)!;
  const projections = PREDICTORS.map((p) => ({ spec: p, all: projectHouse(p.key, target, "all", years), mid: projectHouse(p.key, target, "midterm", years) }));
  const lines = projections.map((p) => p.all?.fitted).filter((v): v is number => v != null);
  const spread = lines.length ? [Math.min(...lines), Math.max(...lines)] : null;

  const stats = [
    { value: fmtMargin(gb.diff), color: marginColor(gb.diff), label: `Generic ballot average` },
    { value: signed(-approval.diff), color: marginColor(-approval.diff), label: "Trump net approval" },
    { value: target.direction ? signed(target.direction.right - target.direction.wrong) : "—", color: target.direction ? marginColor(target.direction.right - target.direction.wrong) : undefined, label: "Right direction − wrong track" },
    { value: fmtMargin(predictorValue(target, "partyId")), color: marginColor(predictorValue(target, "partyId")), label: `Gallup ${target.partyId?.quarter ?? "Q3"} party ID` },
    { value: spread ? (fmtMargin(spread[0]) === fmtMargin(spread[1]) ? fmtMargin(spread[0]) : `${fmtMargin(spread[1])} to ${fmtMargin(spread[0])}`) : "—", label: "The three markers imply" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-3 sm:px-6 sm:pb-10">
          <div className="-ml-2 mb-5"><BackButton /></div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 4rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Popular Vote</h1>
          <div className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            The national vote for president, House, Senate and governor in every election since 2016, then three national
            markers that are supposed to anticipate it: the president&rsquo;s approval, whether the country is on the right
            track, and the party people say they identify with. Each is set against the House popular vote, the realized
            generic ballot, and the presidential vote in 2016, 2018, 2020, 2022 and 2024, and then read forward to {target.year}.
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            {stats.map((stat, i, list) => (
              <div key={stat.label} className={i < list.length - 1 ? "pr-8" : ""} style={i < list.length - 1 ? { borderRight: "1px solid var(--app-border)" } : undefined}>
                <div className="text-2xl font-extrabold tabular-nums" style={stat.color ? { color: stat.color } : undefined}>{stat.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6">
        <section className="mb-12">
          <LedgerSectionHead label="The Record" meta="National popular vote by office since 2016, with the sitting president's net approval" />
          <PopularVoteChart />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            The Senate and governor totals are what they are: a third of the Senate and a shifting slate of governorships,
            with uncontested seats, same-party contests such as California&rsquo;s 2016 and 2018 Senate races and the
            states that happen to be on the ballot all pulling the margin around. The House vote, cast in all 435 districts,
            is the cleanest realized generic ballot; the presidential vote measures the same electorate on a different
            question. The rest of this page uses those two.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Three Markers" meta="What each said at the election, and what happened" />
          <InputsTable years={years} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Approval and direction of country are election-day polling averages. Gallup&rsquo;s party ID is the
            third-quarter average, July through September, of adults who identify with or lean toward each party: the last
            complete quarter before the vote, so the {target.year} figure is already final. The {target.year} approval is this
            site&rsquo;s own average as of {fmtDate(asOf)}; the direction-of-country reading is the average as of{" "}
            {target.direction ? fmtDate(target.direction.asOf) : "—"}. The House vote and the generic ballot are R − D margins.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label="Marker Against Result" meta="Each marker's reading on the horizontal axis, the vote it preceded on the vertical" />
          <PopVotePredictorCharts years={years} target={target} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Approval and direction of country judge the president, so those two panels are drawn in the president&rsquo;s
            party&rsquo;s terms: a Biden year with a House vote of R+2.7 plots as −2.7, and the {target.year} projection comes
            back out as an R − D margin. Party ID is already a partisan margin and plots as one. The solid line is the least-squares
            fit through the elections selected, the dashed line is where the marker stands today, and the colored point is
            the House vote the line implies for {target.year}. There is no presidential vote in {target.year}, so the presidential
            panels show the record only. Five elections is a small sample, so the correlation shown above each panel is as
            important as the line.
          </p>
        </section>

        <section className="mb-12">
          <LedgerSectionHead label={`What ${target.year} Looks Like`} meta="The House popular vote each marker implies, by which elections it is read against" />
          <ProjectionTable years={years} target={target} />
          <p className={note} style={{ color: "var(--app-text-very-muted)" }}>
            Two readings for each cell. The main figure is the fitted line. Two midterms cannot carry a slope of their
            own, so that column keeps the all-five slope and moves the line to pass through the two midterm points; three
            presidential years get their own line, for what three points are worth. The small figure is the average shift: how far the result ran from the marker in those elections,
            added to this year&rsquo;s reading.
            Both are set against today&rsquo;s generic-ballot average of <Margin v={gb.diff} />.
          </p>
        </section>

        <section>
          <LedgerSectionHead label="Reading the Markers" />
          <div className="max-w-3xl space-y-3 text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            {projections.map(({ spec, all, mid }) => (
              <p key={spec.key}>
                <strong style={{ color: "var(--app-text-primary)" }}>{spec.label}.</strong>{" "}
                {all?.fit?.r != null && <>Across the five elections the line has a slope of {all.fit.slope.toFixed(2)} and a correlation of {all.fit.r.toFixed(2)} with the House vote, missing by {all.fit.mae.toFixed(1)} points on average. </>}
                {all?.fitted != null && <>At today&rsquo;s reading of {spec.incumbentSigned ? signed(all.reading) : fmtMargin(all.readingRMinusD)} it implies <Margin v={all.fitted} />{mid?.fitted != null ? "; " : ". "}</>}
                {mid?.fitted != null && <>centered on the two midterms it implies <Margin v={mid.fitted} />{mid.shifted != null ? ", and their average shift " : ". "}</>}
                {mid?.shifted != null && <>puts it at <Margin v={mid.shifted} />. </>}
                {CAVEAT[spec.key]}
              </p>
            ))}
            <p>
              <strong style={{ color: "var(--app-text-primary)" }}>Sources.</strong> Approval and direction of country are
              the RealClearPolitics averages on election day; Gallup party identification is from its Party Affiliation
              trend, quarterly averages with leaners; vote totals are the same as the chart above and the site&rsquo;s
              past-election pages; the generic ballot is the election-eve RealClearPolitics average.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

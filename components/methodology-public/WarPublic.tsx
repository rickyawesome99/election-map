import { computeWarTable, type WarRow } from "@/lib/tplCompute";
import { STATE_LEG_WAR_SUMMARY as LW } from "@/data/stateLegWarSummary";
import { A, BuildUp, Chapter, KeyFigures, Label, Num, QA, SeeIt, SimpleTable, Steps } from "./kit";

// Public WAR tab: the plain-language version of components/methodology/WarMethodology.tsx, reading the
// same live table. Update alongside it when what WAR measures changes (the replacement basis, what
// Expected includes, how an opponent is accounted for).

const OFFICE = { P: "President", S: "Senate", G: "Governor", H: "House" } as const;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
const Name = ({ row }: { row: WarRow }) => <span className="font-semibold" style={{ color: row.party === "R" ? "var(--party-rep)" : row.party === "D" ? "var(--party-dem)" : "var(--app-text-primary)" }}>{row.candidate}</span>;

export default function WarPublic() {
  const rows = computeWarTable();
  const ex = rows.find((r) => r.candidate === "Phil Scott" && r.year === 2022) ?? rows[0];
  const opp = rows.find((r) => r.state === ex.state && r.race === ex.race && r.year === ex.year && r.candidate !== ex.candidate);
  const s = ex.party === "R" ? 1 : -1;
  // One row per candidate (their best and their worst), so a repeat candidate does not fill the list.
  const downBallot = rows.filter((r) => r.office !== "P");
  const firstPer = (list: WarRow[]) => list.filter((r, i, a) => a.findIndex((x) => x.state === r.state && x.party === r.party && x.candidate === r.candidate) === i);
  const top = firstPer(downBallot).slice(0, 5), bottom = firstPer([...downBallot].reverse()).slice(0, 5);
  const candidates = new Set(rows.map((r) => `${r.state}|${r.party}|${r.candidate}`)).size;

  return (
    <>
      <Chapter id="overview" kicker="WAR · Wins Above Replacement" title="How much better than a generic nominee"
        intro={<>Borrowed from baseball, WAR measures how much a candidate added over a <em>replacement-level</em> nominee: a typical, non-incumbent candidate of the same party running in the same seat, in the same year, against the same opponent. It is counted in points of margin. A positive WAR means the candidate did better than that stand-in would have; a negative one means they did worse.</>}>
        <KeyFigures items={[
          { value: rows.length.toLocaleString(), label: "candidate races scored, 2016 to 2026" },
          { value: candidates.toLocaleString(), label: "candidates" },
        ]} />
      </Chapter>

      <Chapter id="steps" kicker="How it's built" title="Three numbers">
        <Steps items={[
          { title: "Expected result",
            body: <>What two typical nominees would have done in that seat that year. The starting point is how the place itself voted that year in the other races on its ballot: the state for a Senate, governor or presidential race, and the district for a House race (its vote for president, Senate, governor and the state legislature, adjusted by how the state&rsquo;s other House candidates ran against theirs). A place that swung further than the country therefore does not make its candidates look better or worse than they were. Incumbency and the money gap two typical candidates would have had are then added.</> },
          { title: "Expected against this opponent",
            body: "A typical nominee does worse against a strong opponent and better against a weak one. Each candidate has a record: how they ran in their other races. When a race turns out differently from what the two records suggest, most of the difference is put down to the candidate with the longer record, because it is usually their standing that changed; two first-time candidates share it evenly. The expected result is then moved by the opponent's strength in that race. If the candidate is the incumbent, their incumbency is also taken out, because a replacement would not have been the incumbent." },
          { title: "WAR",
            body: "The actual result minus the expected result against this opponent, counted toward the candidate. Positive is good for the candidate, whichever party they belong to." },
        ]} />
      </Chapter>

      <Chapter id="example" kicker="Worked example · live" title={`${ex.candidate}, ${ex.year}`}
        intro={<>The {ex.year} {ex.state} {OFFICE[ex.office].toLowerCase()} race{opp ? <>, against <Name row={opp} /></> : null}. {ex.candidate} ran far ahead of what a typical {ex.party === "R" ? "Republican" : "Democrat"} could have managed in the state, which makes the gap easy to see.</>}>
        <BuildUp steps={[
          { label: "Expected result", note: "two typical nominees", value: ex.expected, total: true },
          { label: "Opponent's strength", note: opp ? opp.candidate : "no opponent on file", value: -s * ex.opponentEffect },
          { label: "Incumbency taken out", note: ex.replacementPts !== 0 ? "a replacement wouldn't be the incumbent" : "not the incumbent", value: -s * ex.replacementPts },
          { label: "Expected against this opponent", value: ex.expectedVsOpponent, total: true },
          { label: "Actual result", value: ex.actual, total: true },
        ]} />
        <p className="text-[17px] leading-relaxed" style={{ fontFamily: "var(--font-serif)" }}>
          WAR: <Num>{signed(ex.war)}</Num> points for {ex.candidate}, the gap between the last two rows.
        </p>
      </Chapter>

      <Chapter id="leaders" kicker="Live" title="Highest and lowest">
        <div>
          <Label meta="House, Senate and governor races · each candidate once">Candidates who ran furthest from expectations</Label>
          <SimpleTable align="llr" head={["Candidate", "Race", "WAR"]} rows={[...top, ...bottom].map((r) => [<Name key="n" row={r} />, `${r.year} ${r.state} ${OFFICE[r.office]}`, <Num key="w">{signed(r.war)}</Num>])} />
        </div>
      </Chapter>

      <Chapter id="legislature" kicker="State House and Senate" title="State legislative candidates"
        intro={<>Candidates for state legislatures are scored the same way, against their own seat. The yardstick is how the seat&rsquo;s voters cast the rest of their ballot that year (president, Senate, governor, the U.S. House and the other chamber of the legislature), adjusted by how the chamber&rsquo;s other candidates ran against their own seats, plus the usual advantage of an incumbent.</>}>
        <KeyFigures items={[
          { value: LW.rows.toLocaleString(), label: "legislative candidate races scored, 2016 to 2026" },
          { value: LW.people.toLocaleString(), label: "candidates" },
        ]} />
        <QA items={[
          { q: "Where is it shown?", a: "On each candidate's own page, beside every scored race in their electoral history. Click a race to see the calculation step by step." },
          { q: "Which races are scored?", a: "General elections for a single seat between one Democrat and one Republican. Districts that elect several members at once, and races with only one major party on the ballot, are not scored." },
          { q: "Is it combined with WAR in federal races?", a: "Yes: WAR is one number whatever the office, and a candidate's career WAR adds every scored race. When a legislator runs for Senate, governor or Congress, their legislative record counts toward what is expected of them, but at a discount, because running ahead in a legislative seat only partly carries over: about a third of it into a statewide race and very little into a U.S. House race." },
          { q: "What about two candidates with the same name?", a: "A record belongs to a person, not a name. Two people with one name in one state are kept apart when they appear on the same year's ballot in different seats, or when one is a Democrat and the other a Republican in distant parts of the state." },
          { q: "How reliable is it?", a: "Less than the federal scores. Most legislative candidates have a single scored race, districts are small, and older precinct results are placed approximately. A long record is worth much more than one race." },
        ]} />
      </Chapter>

      <Chapter id="faq" kicker="Questions" title="Reading WAR">
        <QA items={[
          { q: "Do the two candidates' scores add up?", a: "Yes. Apart from the incumbent's incumbency credit, what one candidate is credited with the other is charged, so the two scores together account for how far the race ran from expectations." },
          { q: "What if neither candidate has run before?", a: "Then there is nothing to tell them apart, and the result is shared evenly, or mostly given to the incumbent if there is one. A first race is the least reliable reading of any candidate." },
          { q: "Does money count?", a: "Money a typical candidate would have raised in that situation is part of the expected result. Raising more than that counts toward the candidate." },
          { q: "Is it used in the forecast?", a: <>A closely related number is: the forecast&rsquo;s <A href="/methodology">candidate ingredient</A> uses each nominee&rsquo;s strength measured the same way, but with incumbency and all fundraising counted separately.</> },
          { q: "Why grade a candidate against their own state's or district's vote?", a: "Because that vote is known once the election is over, and it is a closer yardstick than a national average. In a year when one state moves much further than the country, every candidate there would otherwise be credited or blamed for it. Where little else was on the ballot, as in an odd-year governor race, or where a district's precinct results are not reliable enough to use, the place's partisan lean and the national mood fill in." },
          { q: "What are its limits?", a: "Records start in 2016, so a long career before that is invisible. A candidate whose strength changed a lot over the years is measured with one number. A candidate who lifts the rest of their party's ticket raises the bar they are measured against. In a state with only a few House seats, each candidate's result moves the bar the others are measured against. The 2026 scores are on the count as it stands, and most 2026 House races are measured against the district's lean and the state's other House races for now, because precinct results are in for only eight states." },
        ]} />
        <SeeIt>Every candidate&rsquo;s record is on the <A href="/war">WAR</A> tab.</SeeIt>
      </Chapter>
    </>
  );
}

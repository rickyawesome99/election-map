import { computeWarTable, type WarRow } from "@/lib/tplCompute";
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
          { value: rows.length.toLocaleString(), label: "candidate races scored, 2016 to 2025" },
          { value: candidates.toLocaleString(), label: "candidates" },
        ]} />
      </Chapter>

      <Chapter id="steps" kicker="How it's built" title="Three numbers">
        <Steps items={[
          { title: "Expected result",
            body: <>What two typical nominees would have done in that seat that year: the place&rsquo;s <A href="/methodology/state-tpl">partisan lean</A>, moved to that year&rsquo;s politics, plus the national mood, incumbency, and the money gap two typical candidates would have had.</> },
          { title: "Expected against this opponent",
            body: "A typical nominee does worse against a strong opponent and better against a weak one. Every candidate's strength is estimated from all the races they have run, and the expected result is moved by the opponent's. If the candidate is the incumbent, their incumbency is also taken out, because a replacement would not have been the incumbent." },
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

      <Chapter id="faq" kicker="Questions" title="Reading WAR">
        <QA items={[
          { q: "Why do both candidates in a race get credit?", a: "Each candidate keeps whatever the race left unexplained, the way a batter and a pitcher both get credit for the same hit. So two opponents' WARs don't add up to the race's result." },
          { q: "Does money count?", a: "Money a typical candidate would have raised in that situation is part of the expected result. Raising more than that counts toward the candidate." },
          { q: "Is it used in the forecast?", a: <>A closely related number is: the forecast&rsquo;s <A href="/methodology">candidate ingredient</A> uses each nominee&rsquo;s strength measured the same way, but with incumbency and all fundraising counted separately.</> },
          { q: "What are its limits?", a: "Records start in 2016, so a long career before that is invisible. A candidate whose strength changed a lot over the years is measured with one number. A House member's own results are part of their district's lean, which slightly understates House WAR." },
        ]} />
        <SeeIt>Every candidate&rsquo;s record is on <A href="/model/candidates">TPL › Candidates</A>.</SeeIt>
      </Chapter>
    </>
  );
}

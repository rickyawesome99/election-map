import Link from "next/link";
import type { ReactNode } from "react";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { computeWarTable, getWarMoneyModel, raceTypeWeightsFor, warCandidateKey, FF_K, FF_MAX, WAR_HOUSE_OTHERS_K, WAR_INCUMBENT_RECORD, WAR_LAMBDA, WAR_RECORD_LAMBDA, WAR_STATEWIDE_LAST_YEAR, WAR_SURPRISE_GAMMA, WAR_TAIL, WAR_TAIL_INCUMBENT, WAR_RECENCY_DECAY, WAR_RECENCY_DECAY_STATEWIDE, type WarRow } from "@/lib/tplCompute";
import { Block, Code, Constants, D, DataTable, Defs, FilesAndCommands, Formula, Ledger, M, P, R, Section, signed } from "./kit";

const link = (href: string, text: ReactNode) => <Link href={href} className="underline underline-offset-2">{text}</Link>;
const OFFICE = { P: "President", S: "Senate", G: "Governor", H: "House" } as const;
/** A candidate-signed number: positive = better than a generic nominee. */
const War = ({ v }: { v: number }) => <span className="font-bold tabular-nums" style={{ color: v >= 0 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{signed(v)}</span>;
const Name = ({ row }: { row: WarRow }) => <span style={{ color: row.party === "R" ? "var(--party-rep)" : row.party === "D" ? "var(--party-dem)" : "var(--app-text-primary)" }} className="font-semibold">{row.candidate}</span>;

export default function WarMethodology() {
  const rows = computeWarTable();
  const money = getWarMoneyModel();
  const keys = new Map<string, number>();
  for (const r of rows) { const k = warCandidateKey(r.state, r.party, r.candidate); keys.set(k, (keys.get(k) ?? 0) + 1); }
  const repeat = [...keys.values()].filter((n) => n >= 2).length;
  const races = new Set(rows.map((r) => `${r.state}|${r.office}|${r.race}|${r.year}`)).size;
  const byOffice = (o: string) => rows.filter((r) => r.office === o).length;
  const ex = rows.find((r) => r.candidate === "Phil Scott" && r.year === 2022) ?? rows[0];
  const opp = rows.find((r) => r.state === ex.state && r.race === ex.race && r.year === ex.year && r.candidate !== ex.candidate);
  const s = ex.party === "R" ? 1 : -1;
  const top = rows.filter((r) => r.office !== "P").slice(0, 6), bottom = rows.filter((r) => r.office !== "P").slice(-6).reverse();
  // Statewide races by how much of their baseline is the state's own vote that year (one row per race).
  const statewide = rows.filter((r) => r.office !== "H");
  const oneSide = statewide.filter((r, i, a) => a.findIndex((x) => x.state === r.state && x.office === r.office && x.race === r.race && x.year === r.year) === i);
  const thin = oneSide.filter((r) => r.genericWeight < 1).sort((a, b) => a.year - b.year || a.state.localeCompare(b.state));
  const midW = raceTypeWeightsFor(2022);
  const houseRaces = rows.filter((r) => r.office === "H").filter((r, i, a) => a.findIndex((x) => x.seatId === r.seatId && x.year === r.year) === i);
  const houseYears = [...new Set(houseRaces.map((r) => r.year))].sort();
  const rowOf = (r: WarRow) => [<Name key="n" row={r} />, `${r.year} ${r.state} ${OFFICE[r.office]}`, <M key="a" v={r.actual} />, <M key="e" v={r.expected} />, <M key="o" v={r.expectedVsOpponent} />, <War key="w" v={r.war} />];

  return (
    <>
      <Section id="overview" kicker="WAR · Wins Above Replacement" title="How much better than a generic nominee"
        lede={<>WAR is how far a candidate&rsquo;s actual margin ran ahead of what a replacement-level nominee of their party — a generic <em>non-incumbent</em> — would have managed against the same opponent in the same seat and year, in points of margin. It is built from three numbers, each answering a different question. Table: {link("/war", "the WAR tab")}.</>}>
        <Defs items={[
          { term: "Expected Result", def: <><strong>Generic vs generic.</strong> The margin this seat would produce in that year with two replacement-level nominees. The starting point is how the place itself voted that year on the rest of its ballot: the state for a statewide race, the district for a House race. Incumbency and the money gap a generic pair in that situation would have are added.</> },
          { term: "Vs. Opponent", def: <><strong>Generic non-incumbent vs this specific opponent.</strong> The Expected Result moved by the opponent&rsquo;s strength in this race (facing a strong opponent lowers what a generic nominee would be expected to do) and, when the candidate is the incumbent, with their own incumbency taken out: a replacement-level nominee never holds the seat.</> },
          { term: "Candidate WAR", def: <><strong>Actual − Vs. Opponent</strong>, signed toward the candidate. Equal to the candidate&rsquo;s strength in this race (their record from other races plus their share of how far the race departed from the two records), plus, for an incumbent, what their incumbency was worth. The two candidates&rsquo; strengths differ by exactly the race&rsquo;s residual.</> },
        ]} />
        <Formula lines={[
          "Expected      = baseline + incumbency + structural money pts                            R-positive",
          "  statewide:    baseline = the state's own vote that year, this race left out",
          "  House:        baseline = the district's own vote that year, the House race left out, + the state's other House races",
          "residual r    = Actual − Expected                       = strength_R − strength_D      one per race, two candidates",
          "Incumb.       = Expected − Expected with no incumbent    incumbent's row only, signed toward them; 0 otherwise",
          "Vs. Opponent  = Expected − s × Incumb. − s × strength_opponent   s = +1 for a Republican, −1 for a Democrat",
          "WAR           = s × (Actual − Vs. Opponent)             = strength_candidate + Incumb.",
        ]} note={<>Positive WAR is always good for the candidate, whichever party. The two strengths account for the race once: what one candidate is credited with, the other is charged. Incumb. is added only to the reported WAR.</>} />
        <DataTable align="lr" maxWidth="max-w-md" head={["Now", ""]} rows={[
          ["Candidate-race rows", rows.length.toLocaleString()],
          ["Races", races.toLocaleString()],
          ["Candidates (≥ 2 races)", `${keys.size.toLocaleString()} (${repeat})`],
          ["House · Senate · Governor · President rows", `${byOffice("H")} · ${byOffice("S")} · ${byOffice("G")} · ${byOffice("P")}`],
        ]} />
      </Section>

      <Section id="expected" kicker="Number 1" title="Expected Result (generic vs generic)"
        lede="A race is a fact about its own year. A statewide race is graded against how its state actually voted that year, and a House race against how its district did.">
        <Formula lines={[
          "Senate / Governor / President:",
          "  generic(Y)  = the state's year score as State TPL builds it, environment LEFT IN, without this race",
          "  modelled(Y) = fitted state lean + trend(Y) + E(Y)                  (President: no trend, it would be circular)",
          "  w           = min(1, Σ office weight of what else was on the ballot ÷ the House weight)",
          "  base        = w × generic(Y) + (1 − w) × modelled(Y) + incumbency",
          "House:",
          "  generic(Y)  = the district's President, Senate, governor and legislature vote that year, on that year's lines",
          "  modelled(Y) = District TPL + trend(Y) + shift + E(Y)",
          "  w           = min(1, Σ office weight of the offices with a figure ÷ the legislature's weight)   (0 if a check fails)",
          "  base        = w × generic(Y) + (1 − w) × modelled(Y) + incumbency",
          `  others      = μ(Y) + n ÷ (n + ${WAR_HOUSE_OTHERS_K}) × (mean gap of the state's n OTHER House races − μ(Y))    gap = Actual − Expected before this term`,
          "  Expected    = base + structural money + others                                     μ(Y) = mean gap of every House race that year",
          "No-D / no-R race:  modelled(Y) = imputed presidential baseline (NM) + E(Y)    (Osborn-class; no money term)",
          "trend(Y) = neutral presidential margin interpolated to year Y − the presidential average the lean embodies",
          "Expected = base + clamp(FF_K × structural gap%, ±FF_MAX)",
        ]} note={<>Until 2026-11-23 a statewide race used modelled(Y) alone. That is a prediction of where the state should have landed, and it applies one national E(Y) to every state: a state that moved more or less than the nation handed the difference to every candidate on its ballot. WAR is graded after the election, so the state&rsquo;s movement does not need predicting; it is read off the rest of the ballot.</>} />
        <Defs items={[
          { term: "The state's own vote", def: <>The same rows, strips, office weights, turnout weights and outlier factors as a {link("/analysis/internal-methodology/state-tpl", "State TPL")} year, with nothing removed for the national environment and with the race being scored taken out, so a candidate is never graded against themselves. In a midterm that is mostly the House vote ({midW.H}) and the legislature ({midW.L}), with the other top race at {midW.S} or {midW.G}; in a presidential year a Senate or governor candidate is graded mostly against the presidential result, and a presidential candidate against House, legislature and Senate.</> },
          { term: "Thin ballots (w)", def: <>The state&rsquo;s own vote counts in full once the offices left on the ballot carry at least the House&rsquo;s weight, which is every even year with a contested House seat. An odd-year governor race beside only a legislature gets w = {midW.L} ÷ {midW.H} = {(midW.L / midW.H).toFixed(1)}; one with nothing else on the ballot gets 0 and keeps the modelled baseline whole. w uses the offices present, not their outlier factors.</> },
          { term: "Seats nobody contested", def: <>A filled row is not evidence of how the state voted that year. Here, and only here (State TPL is unchanged), an uncontested House seat is filled with its presidential margin plus the gap the state&rsquo;s contested seats ran from their own presidential margins that year, as the legislature&rsquo;s unopposed seats already are; where no seat was contested it is dropped. An imputed Senate or governor race and the legislature&rsquo;s no-gap unopposed pool are dropped.</> },
          { term: "Modelled state baseline", def: <>The Huber-fitted state lean from the {link("/analysis/internal-methodology/state-tpl#fit", "TPL fit")}, with no recency decay, so its presidential average is an equal-year one. Now only the fallback for a thin ballot, and the basis of the forecast&rsquo;s candidate effects (below).</> },
          { term: "The district's own vote", def: <>Everything the district&rsquo;s voters cast a ballot for that year except the House race: President, Senate, governor and both legislative chambers, summed from precinct results on the lines the race was run on (<Code>scripts/buildDistrictBallot.ts</Code>), at the year&rsquo;s office weights without the House. Senate and governor margins carry the incumbency and money strips of the state&rsquo;s race. In a midterm the legislature is about two thirds of it. Inside the legislature figure, precincts in uncontested or not-up seats are filled with their presidential margin plus the gap the state&rsquo;s contested seats ran from theirs that year.</> },
          { term: "The other House races", def: <>A district&rsquo;s ballot holds one House race, so the House vote cannot sit in its own baseline the way a state&rsquo;s does for a Senate race. It enters through the state&rsquo;s other House races: how far each ran from its own district&rsquo;s baseline that year. That gap is common to the state. In a midterm a district&rsquo;s baseline is mostly its legislative vote, and a state&rsquo;s legislature can sit many points from its congressional races as a whole (Massachusetts and California in 2018 to the right, West Virginia to the left). The mean gap of the state&rsquo;s other House races is added to Expected, shrunk toward the national House mean by n ÷ (n + {WAR_HOUSE_OTHERS_K}) for a small delegation; a one-seat state gets the national mean. The race is never in its own figure.</> },
          { term: "Checks on a district", def: <>Older precinct files place some votes approximately, so a state total can be right while a district&rsquo;s is not. A district is used only if the presidential vote summed on its precincts is within 2 points of the site&rsquo;s own presidential result for that district on those lines (and its turnout within 15%), and its precinct House margin within 3 points of the certified one. An office whose precinct total is far from the House total there is left out, and a legislative chamber is used only where at least 60% of its votes were matched to a real precinct. A district that fails keeps the modelled baseline whole.</> },
          { term: "Modelled district baseline", def: <>{link("/analysis/internal-methodology/district-tpl", "District TPL")}, whose presidential average is recency-weighted to match. <em>shift</em> is the boundary shift: the actual margin was recorded on the map the race was run on, so the expectation must sit on that turf too. Now the fallback for a district with no usable own-year figure.</> },
          { term: "Trend interpolation", def: "Presidential margins exist every four years; other years interpolate linearly between the bracketing ones (2018 = ½·2016 + ½·2020; 2025 clamps to 2024)." },
          { term: "Excluded", def: "Same-party generals and Louisiana's fragmented jungle generals (no R-vs-D margin to sign), and State Legislature rows (no candidate)." },
          { term: "Relocated House races", def: "Carry their boundary weight into the candidate-effect fit, discounted exactly as they are in District TPL." },
        ]} />
        <Block label="Statewide races not wholly on the state's own vote" meta={`${thin.length} of ${oneSide.length} races, live`}>
          <DataTable align="llrl" maxWidth="max-w-3xl" head={["Year", "Race", "Own-vote share w", "Baseline"]} rows={thin.map((r) => [r.year, `${r.state} ${OFFICE[r.office]}`, `${Math.round(r.genericWeight * 100)}%`, r.note])} />
        </Block>
        <Block label="House races by baseline" meta="live">
          <DataTable align="lrrrr" maxWidth="max-w-2xl" head={["Year", "Races", "Wholly own vote", "Part", "Modelled only"]} rows={houseYears.map((y) => { const v = houseRaces.filter((r) => r.year === y); return [y, v.length, v.filter((r) => r.genericWeight >= 1).length, v.filter((r) => r.genericWeight > 0 && r.genericWeight < 1).length, v.filter((r) => r.genericWeight === 0).length]; })} />
        </Block>
        <Block label="Old baseline against new" meta="scripts/warBaselineTest.ts, 2026-11-23 · House">
          <P>The decisive reading for House is the last three rows. The same seat on the same lines in consecutive elections is split by whether the candidates were the same people. Where neither is, the two races have no candidate quality in common, so whatever still repeats is the district, not a candidate.</P>
          <DataTable align="lrrr" maxWidth="max-w-3xl" head={["Reading", "Pairs", "Modelled", "Own-year"]} rows={[
            ["Repeat, all", 1549, "0.47", "0.46"],
            ["Repeat, second race 2018 or 2020", 711, "0.61", "0.49"],
            ["Repeat, second race 2022 or 2024", 838, "0.24", "0.44"],
            ["Same seat and lines: rematch", 147, "0.67", "0.62"],
            ["Same seat and lines: one candidate the same", 722, "0.48", "0.41"],
            ["Same seat and lines: neither the same (lower is better)", 111, "0.40", "0.18"],
            ["  the same, both races wholly on the district's vote", 85, "0.44", "0.14"],
            ["Share of score variance that is a state-party-year average", "", "0.21", "0.03"],
          ]} />
          <P>On the modelled baseline a score repeated almost as well between two different pairs of candidates (0.40) as when one of them ran again (0.48): most of what repeated was the district. On the new baseline the pure-district figure falls to 0.18 while a rematch still repeats at 0.62 and the plain repeat holds (0.46), rising sharply for recent races, where the modelled baseline contained the member&rsquo;s own results. Without the other-House-races term the same readings are 0.27 (neither the same), 0.40 (repeat) and 0.19 (state share): the district&rsquo;s own ballot does most of the work on the district carry-over, the other House races remove the state-wide part.</P>
        </Block>
        <Block label="Old baseline against new" meta="scripts/warBaselineTest.ts, 2026-11-23 · Senate and governor">
          <P>WAR is not a forecast, so there is no out-of-sample error to compare. Two readings stand in for it. <em>Repeat</em>: a candidate&rsquo;s score against their score in their next race; quality should carry over, and noise in a baseline pushes it toward zero. <em>Ticket-mates</em>: two same-party candidates in different races in one state and year; different people should not score alike, and a state-wide swing booked as quality makes them. Scores are actual − expected, signed toward the candidate, centred by year and office.</P>
          <DataTable align="lrrr" maxWidth="max-w-3xl" head={["Reading", "Pairs", "Modelled", "Own-year"]} rows={[
            ["Ticket-mates, all years (lower is better)", 199, "0.39", "0.33"],
            ["Ticket-mates, 2026", 49, "0.73", "0.58"],
            ["Ticket-mates, through 2024", 150, "0.34", "0.31"],
            ["Repeat, second race through 2024 (higher is better)", 110, "0.30", "0.36"],
            ["Repeat, second race in 2026", 51, "0.53", "0.33"],
            ["Repeat, all", 161, "0.36", "0.35"],
            ["Spread of scores in 2026, pts", 142, "9.8", "7.4"],
            ["Senate, midterms: mean actual − expected, R-positive", 103, "−2.5", "−1.0"],
          ]} />
          <P>The gain is real and modest. What the new baseline removes is the part of a state&rsquo;s swing that the national number missed (2026: every Texas Democrat about +13 on the modelled baseline, +3 to +5 on the state&rsquo;s own vote). What it leaves is the gap between a state&rsquo;s statewide races and its House and legislature vote, which two ticket-mates still share; the repeat reading into 2026 is the one result that goes the other way, on 51 pairs.</P>
        </Block>
        <Block label="Structural money" meta="only the money a generic pair would have had goes into Expected">
          <P>The TPL strips the full fundraising gap because it wants the seat&rsquo;s lean. For a quality metric, money is partly the candidate. So the gap is split: the structural part — predicted from incumbency and the pre-money margin — enters Expected; the money a candidate raised <em>beyond</em> their situation stays in the residual and is credited to them. The prediction needs no receipts, so every non-imputed race gets the term.</P>
          <Formula lines={["structural gap% = a + b × incumbentSign + c × base"]} note="OLS per office over races with both receipts known through 2025, on the MODELLED base (the forecast's money term reads this model, so it does not move with WAR's baseline). In Expected it is evaluated at the race's own base." />
          <DataTable align="lrrrrr" head={["Office", "Intercept a", "Incumbent b", "Margin c", "Races", "R²"]} rows={(["S", "G", "H"] as const).map((o) => [OFFICE[o], signed(money[o].intercept), signed(money[o].incSign), signed(money[o].base, 2), money[o].n, money[o].r2.toFixed(2)])} />
        </Block>
      </Section>

      <Section id="effects" kicker="Number 2" title="Vs. Opponent (generic vs this opponent)"
        lede="A single race yields one residual for two candidates and cannot split it. What splits it is each candidate's record: how they ran in their other races.">
        <Formula lines={[
          `record(c)     = Σ w × strength(c, other race) ÷ (Σ w + λ)                        λ = ${WAR_RECORD_LAMBDA}; a first race has record 0`,
          "surprise      = r − (record_R − record_D)",
          "strength_R    = record_R + φ_R × surprise          strength_D = record_D − φ_D × surprise",
          `φ_c           = v_c ÷ (v_R + v_D),   v_c = (1 + W_c + ι × elected incumbent)^γ        γ = ${WAR_SURPRISE_GAMMA}, ι = ${WAR_INCUMBENT_RECORD}; W_c = Σ w over c's other races`,
          `w             = boundary weight × decay^|years apart|                              decay ${WAR_RECENCY_DECAY_STATEWIDE} statewide · ${WAR_RECENCY_DECAY} House`,
        ]} note="Every candidate's strength in every race is solved together by iteration, because a record is built from strengths in other races. strength_R − strength_D = r in every race." />
        <Defs items={[
          { term: "Record", def: <>The candidate&rsquo;s strength in their <em>other</em> races, weighted by recency and shrunk toward zero (&ldquo;an unseen candidate is replacement level&rdquo;). It never contains the race being scored, so a race is not scored with a number taken from that race.</> },
          { term: "Who gets a surprise", def: <>The part of a result the two records did not predict is divided by record weight. A candidate with several races on file takes most of it; two newcomers split it evenly; an elected incumbent counts as having {WAR_INCUMBENT_RECORD} more races than the file shows, because their record exists whether or not it falls inside the window. The reason is measured: where a candidate with two or more earlier races fell short of their own record against a first-time opponent who later ran again, the shortfall predicted nothing about the opponent&rsquo;s next race (slope 0.01, 94 cases), while the established candidate&rsquo;s own deviation carried into their next race at 0.56 (390 cases). When someone with a record has an off year, it is their strength that moved.</> },
          { term: "What this replaced (2026-11-24)", def: <>A ridge fit gave each candidate one pooled effect and then credited both sides with the race&rsquo;s whole leftover. A first-time candidate&rsquo;s effect was estimated from the very race it was used to score, so the two rows fed each other, and a long-serving candidate&rsquo;s off year could only be explained as a strong opponent. Phil Scott ran 31 ahead of Expected in 2026 against 71 to 76 in 2020 to 2024, kept an effect of +54 and a WAR of +51, and Amanda Janoo was booked at +23; in the years he beat his own average his opponents were booked at −17 to −21. The ridge is still what the forecast&rsquo;s candidate term uses.</> },
          { term: "Pooling", def: <>Records are keyed <Code>state | party | normalized name</Code> and pooled across offices: Hogan&rsquo;s Governor and Senate races inform one record.</> },
          { term: "Recency", def: "A candidate's other races fade with distance from the race being scored, so the same candidate has a different record on different rows. Measured persistence of repeat candidates' residuals: slope ≈ 0.45 at 1–4 year gaps, 0.26 at 5–6, ≈ 0 at 7–9." },
          { term: "Effective races", def: "Σ of the recency weights over the other races, plus one for the race itself, shown beside each record on the Candidates page." },
          { term: "The replacement is a non-incumbent", def: <>Expected carries the office&rsquo;s incumbency term, so a strength measures an incumbent against a generic <em>incumbent</em>. WAR asks a different question: how much better than freely available talent, and freely available talent never holds the seat. So an incumbent&rsquo;s row adds back <strong>Incumb.</strong> = Expected minus the same expectation with no incumbent in the race: the office&rsquo;s incumbency term plus the incumbent share of the structural money term, re-priced on the open-seat margin. Challengers and open seats add nothing; appointed incumbents carry no incumbency term, so only the money share.</> },
        ]} />
        <Block label="The fit" meta="scripts/warAttributionTest.ts, 2026-11-24 · every race held out in turn">
          <P>Each race is removed, its candidates&rsquo; other races are re-solved without it, and their records are used to predict it. The figure is the mean miss in points over the 2,271 races where at least one candidate has a record (4.42 with no candidate information).</P>
          <DataTable align="lr" maxWidth="max-w-2xl" head={["Rule", "Mean miss"]} rows={[
            [`By record, λ ${WAR_RECORD_LAMBDA}, γ ${WAR_SURPRISE_GAMMA}, ι ${WAR_INCUMBENT_RECORD} (live)`, "3.680"],
            ["By record, no incumbent weight (ι 0)", "3.695"],
            ["By record, even split whatever the records (γ 0)", "3.700"],
            ["By record, the newcomer takes the surprise (γ −1)", "3.740"],
            ["By record, λ 1 (the ridge's shrinkage)", "3.777"],
            ["Ridge, heavy tail (the table until 2026-11-24)", "3.692"],
            ["Ridge, plain", "3.714"],
          ]} />
          <P>The differences are small. Records predict other races about as well however a surprise is divided; the rule that a newcomer absorbs it, which is how the ridge behaved, is the worst of them. The case for the change is therefore mostly structural: a row no longer scores a race with a number taken from that race, and the two rows of a race add up to what happened.</P>
        </Block>
        <Constants rows={[
          { name: "WAR_RECORD_LAMBDA", value: WAR_RECORD_LAMBDA, basis: "calibrated", meaning: "Shrinkage of a record toward zero, in effective races.", source: "Held-out miss 3.69 at 0.25, 3.70 at 0.5, 3.78 at 1, 3.92 at 2 (γ 1, ι 0)." },
          { name: "WAR_SURPRISE_GAMMA", value: WAR_SURPRISE_GAMMA, basis: "calibrated", meaning: "How strongly a surprise goes to the candidate with the heavier record: share ∝ (1 + record weight)^γ.", source: "Flat from 0.5 to 2; negative values worst. 1 is the simplest value inside the flat range." },
          { name: "WAR_INCUMBENT_RECORD", value: WAR_INCUMBENT_RECORD, basis: "calibrated", meaning: "Record weight added for a candidate running as the elected incumbent.", source: "Held-out miss 3.695 at 0, 3.681 at 1, 3.680 at 2, 3.685 at 4, 3.694 at 8. Of the 12 races more than 30 points off Expected, 9 favor the incumbent and 1 goes against." },
          { name: "WAR_RECENCY_DECAY", value: WAR_RECENCY_DECAY, basis: "measured", meaning: "Per-year fade of a past House race (2 yrs 0.64 · 4 yrs 0.41 · 8 yrs 0.17).", source: "Tracks the measured persistence curve." },
          { name: "WAR_RECENCY_DECAY_STATEWIDE", value: WAR_RECENCY_DECAY_STATEWIDE, basis: "decision", meaning: "The same for Senate / Governor / President races: a statewide brand persists longer.", source: "Decay sweep flat within 0.06 MAE across 0.8–1.0." },
          { name: "FF_K · FF_MAX", value: `${FF_K} · ±${FF_MAX}`, basis: "calibrated", meaning: "Points per point of STRUCTURAL money gap in Expected, and its cap — the TPL strip's constants." },
        ]} />
      </Section>

      <Section id="war" kicker="Number 3 · worked example, live" title="Candidate WAR"
        lede={<><Name row={ex} />, {ex.year} {ex.state} {OFFICE[ex.office]}{opp ? <> against <Name row={opp} /></> : null}.</>}>
        <Ledger lines={[
          ...(ex.generic != null ? [
            { label: `${ex.state}'s ${ex.year} vote without this race`, note: ex.genericWeight >= 1 ? "the whole baseline: a full ballot beside it (w = 100%)" : `own-vote share w = ${Math.round(ex.genericWeight * 100)}%; the modelled baseline (${signed(ex.leanBaseline)}, R-positive) carries the rest`, value: <M v={ex.generic} /> },
            { op: "+" as const, label: "Incumbency and structural money", note: "what a generic pair in this situation would have", value: <M v={ex.expected - (ex.genericWeight * ex.generic + (1 - ex.genericWeight) * ex.leanBaseline)} /> },
          ] : []),
          { op: ex.generic != null ? "=" as const : undefined, label: "Expected Result", note: "generic vs generic", value: <M v={ex.expected} />, total: ex.generic != null },
          { op: "+", label: "Opponent's strength in this race", note: opp ? `${opp.candidate} ${signed(ex.opponentEffect)} toward their own side` : "no opponent on file", value: <M v={-s * ex.opponentEffect} /> },
          { op: "+", label: "Own incumbency, removed", note: ex.replacementPts !== 0 ? `Incumb. ${signed(ex.replacementPts)} toward the candidate: a replacement would not hold the seat` : "not the incumbent", value: <M v={-s * ex.replacementPts} /> },
          { op: "=", label: "Vs. Opponent", note: "generic non-incumbent vs this opponent", value: <M v={ex.expectedVsOpponent} />, total: true },
          { label: "Actual", value: <M v={ex.actual} /> },
          { op: "=", label: "Candidate WAR", note: `record ${signed(ex.record ?? 0)} (${ex.effectN} races, ${ex.effectW.toFixed(1)} effective) + share of this race's surprise ${signed(ex.war - (ex.record ?? 0) - ex.replacementPts)} + incumbency ${signed(ex.replacementPts)}`, value: <War v={ex.war} />, total: true },
        ]} />
        <P>Identity on every row: WAR = s × (Actual − Vs. Opponent) = record + share of the surprise + Incumb. The Residual column on the Candidates page is s × (Actual − Expected), the race&rsquo;s net two-candidate result before it is divided; the Effect column is the candidate&rsquo;s standing as of that race, which is the record with the race itself included. Margins are colored by the party they favor (<D>D+</D> / <R>R+</R>); WAR is candidate-signed, so it is not.</P>
        <Block label="Highest and lowest" meta="down-ballot rows, live">
          <DataTable align="llrrrr" maxWidth="max-w-4xl" head={["Candidate", "Race", "Actual", "Expected", "Vs. Opp", "WAR"]} rows={[...top.map(rowOf), ...bottom.map(rowOf)]} />
        </Block>
      </Section>

      <Section id="forward" kicker="Two versions" title="WAR on the tab vs. the forecast's Candidates term">
        <DataTable align="lll" maxWidth="max-w-4xl" head={["", "WAR tab", "Forecast → Candidates"]} rows={[
          ["Baseline", "The state's (House: the district's) own vote that year, the race left out; the modelled baseline only for a thin ballot or a district that fails its checks", "Modelled: lean + trend + E(year). The forward backtest was run on it, so it stays until the next forecast is built"],
          ["Years", `Through ${WAR_STATEWIDE_LAST_YEAR}`, "Through 2025"],
          ["Money in Expected", `Structural gap only, k ${FF_K} cap ±${FF_MAX}`, `FULL residual-basis money (k ${F.MONEY_K.H}/${F.MONEY_K.S}/${F.MONEY_K.G}) — money is its own forward term`],
          ["Incumbency", "Stripped from Expected for the ridge; an incumbent's own incumbency added back to WAR (Incumb.)", "Stripped from the effects; the forecast adds incumbency as its own term"],
          ["Reads as", "Value over a replacement-level (non-incumbent) nominee, money beyond the situation included", "Quality net of money and incumbency"],
          ["How a race is divided", `By record: each candidate's strength in a race is their record from other races plus a share of the surprise (λ ${WAR_RECORD_LAMBDA}, γ ${WAR_SURPRISE_GAMMA}, ι ${WAR_INCUMBENT_RECORD})`, `Ridge: one pooled effect per candidate (λ ${WAR_LAMBDA}), squared penalty throughout. Before 2026-11-24 the WAR tab used the same ridge with a heavy tail (τ ${WAR_TAIL} · ${WAR_TAIL_INCUMBENT})`],
          ["Solved as of", "Each race's own year, from the candidate's other races", "2026, from races through 2025"],
          ["Used for", "The WAR column", <>QUALITY_WEIGHT × (effect_R − effect_D) — see {link("/analysis/internal-methodology/forecast#candidates", "Forecast")}</>],
        ]} />
      </Section>

      <Section id="limits" kicker="Open items" title="Known limitations">
        <Defs items={[
          { term: "House rows still on the modelled baseline", def: "Through 2024 about one race in seven: districts whose precincts fail a check, or with no presidential result on their lines to check against (the 2022-only maps of NC, AL, GA, LA and NY). There the district anchor contains the candidate's own margins, and one national E(year) still applies before the other-House-races term." },
          { term: "2026 House races", def: "Scored since 2026-11-24. Precinct results are in for eight states (AZ, GA, HI, ID, MN, NC, SC, WA), so 58 of 416 races sit on their district's own vote; the other 358 are on the modelled baseline plus the state's other House races. That term removes a state's swing beyond the nation's (Texas, Indiana, Tennessee and Utah each about 5 to 6 points toward Democrats), which is why these scores are usable at all: a candidate's 2026 score repeats their previous one at 0.38 with it and not at all without it. What it cannot remove is a swing that differs INSIDE a state. The highest 2026 scores are Democrats in heavily Hispanic seats (Cuellar, Meng, Pou, Takano, Aguilar, Barragán) and the lowest include Valadao and De La Cruz, which reads as a group of voters moving, not eight unusual candidates. A district's own 2026 vote would absorb that; it replaces the modelled baseline state by state as precinct files arrive (npm run district-ballot)." },
          { term: "Small delegations", def: `The other-House-races term is shrunk by n ÷ (n + ${WAR_HOUSE_OTHERS_K}), so a state with two or three seats keeps most of any state-wide gap between its legislature and its House races (West Virginia 2018: McKinley +17), and each of its few candidates moves the others' baseline. A wave that lifts a whole delegation is taken out of every member's score: a delegation of uniformly strong candidates would read as average.` },
          { term: "Uncontested legislative seats", def: "About 40% of a typical district's legislative vote is filled from the presidential margin plus the contested seats' gap, and a gap measured on seats someone chose to contest is not the gap of the seats nobody did." },
          { term: "A race between two candidates with no record says little about either", def: "With no other race on either side, the result is split evenly, or about three to one toward an elected incumbent. Jay Gonzalez is charged a quarter of Charlie Baker's 58-point 2018 and nothing in the data can say that is too much or too little. A candidate's first race is their weakest reading." },
          { term: "The split is weakly pinned", def: "Held-out error barely changes for γ between 0.5 and 2 or ι between 1 and 4, so the exact shares are a choice inside a range the data allows, not a measurement." },
          { term: "The rest of the ballot is not a pure generic", def: "A state's House and legislature vote is the best own-year read in the data, but a state's statewide races can sit a few points from it as a group (2026: both top-of-ticket Republicans ran behind it in AR, KS, NE, SD and TX, ahead of it in MA, OR and WY), and that shared gap still reads as quality for both. Low-profile statewide offices (attorney general, secretary of state) would be a closer generic; they are not in the data. Statewide races also run about a tenth closer to even than their baseline, on either baseline; removing that was tested and did not help." },
          { term: "One-seat states", def: "In Alaska, Delaware, the Dakotas, Vermont and Wyoming the House part of the baseline is a single race, so that one House candidate's strength sets most of the bar for the Senate and governor candidates in a midterm." },
          { term: "Presidential rows", def: "A presidential candidate is graded against the state's House, legislature and Senate vote, so the score is how far they ran from the rest of the ticket. It is large where ticket-splitting is a habit (West Virginia and Hawaii in 2016) and its spread is wider than before (4.5 against 2.8 points)." },
          { term: "A candidate who lifts the ticket", def: "Raises their own baseline and gets no credit for it. Whether that happens, and how much, is untested." },
          { term: "Window", def: "Records start in 2016: Baker, Manchin and Justice are one-race candidates here. House coverage before 2022 is thin." },
          { term: "No standard error", def: "Effects carry an effective race count but no interval." },
          { term: "Benchmarks (measured before 2026-11-23, on the modelled baseline)", def: "Inside Elections VAR ≈ our residual ÷ 2 (r .93; share vs margin scale). Split Ticket WAR vs our residual r .84 (Senate .90, House .80). Both comparisons are on the residual, not WAR: Split Ticket controls for incumbency, Strength in Numbers counts it toward WAR as we now do, Inside Elections leaves it in the score." },
        ]} />
      </Section>

      <Section id="files" kicker="Reference" title="Code and commands">
        <FilesAndCommands files={[
          { path: "lib/tplCompute.ts", role: "stateOwnYearGeneric and districtOwnYearGeneric (the state's or district's own vote, a race left out), buildWarPending (both baselines, trend, shift), computeWarTable, fitWarMoneyModel, solveCandidateEffects, attributeWar; computeCandidateEffects for the forecast." },
          { path: "scripts/buildDistrictBallot.ts · lib/districtBallot.ts", role: "Every office a congressional district voted on, by year, summed from precinct results (npm run district-ballot; part of prebuild and predev)." },
          { path: "components/TplModelPage.tsx", role: "The WAR sub-tab." },
        ]} commands={[
          { cmd: "npx tsx scripts/forwardBacktest.ts --env struct --quality · --decay-sweep", does: "The leakage-free test of whether candidate effects predict forward, and of the decay." },
          { cmd: "npx tsx --conditions=react-server scripts/warBaselineTest.ts [--list]", does: "(warAttributionTest.ts: how a race is divided between its two candidates, the held-out fit of λ, γ and ι against the ridge, and the table on both.) WAR on the modelled and own-year baselines side by side, statewide then House: thin ballots, level by office and year, repeat, ticket-mates, the same-seat check, spread, largest moves. WAR_BASELINE=lean WAR_LAST_YEAR=2025 reproduces the table as it was before 2026-11-23." },
          { cmd: "npx playwright test -g war", does: "WAR tab filters and column count." },
        ]} />
      </Section>
    </>
  );
}

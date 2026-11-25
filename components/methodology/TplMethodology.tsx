import Link from "next/link";
import type { ReactNode } from "react";
import { TPL_NEUTRAL_ANCHOR, TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { TPL_VALIDATION } from "@/data/tplValidation";
import { STATE_LEG_NOT_UP_VALIDATION } from "@/data/stateLegNotUpValidation";
import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { houseData } from "@/data/forecastData";
import { ALIGNED_INDEPENDENTS } from "@/data/raceEligibility";
import {
  getTplFit, calculateStateModel, calculateDistrictModel, calculateCountyModel, getMedianStateTpl, incumbentAdvantage,
  FF_K, FF_MAX, IMPUTED_RACE_WEIGHT, IMPUTED_HOUSE_ROW_WEIGHT, IMPUTED_LEG_ROW_WEIGHT, LEG_NOT_UP_MODE, LEG_NOT_UP_SLOPE_K, LEG_UNOPPOSED_MODE, type ComputedRace, type YearAggregation,
} from "@/lib/tplCompute";
import { Block, Code, Constants, DataTable, Defs, FilesAndCommands, Formula, Ledger, M, N, P, Section, pct, signed, type ConstantRow, type LedgerLine } from "./kit";

const TYPE_NAME: Record<string, string> = { P: "President", S: "Senate", H: "House", L: "State Legislature", G: "Governor" };
const link = (href: string, text: ReactNode) => <Link href={href} className="underline underline-offset-2">{text}</Link>;

// Every TPL_GLOBAL_CONSTANTS key and where it is documented (tab#section). `satisfies` makes the
// type-check fail when a constant is added without being documented here.
const DOCUMENTED_IN = {
  RACE_TYPE_WEIGHTS: "state-tpl#aggregation", RACE_TYPE_WEIGHTS_MIDTERM: "state-tpl#aggregation", YEAR_WEIGHTS: "state-tpl#aggregation", YEARS: "state-tpl#aggregation",
  HUBER_C: "state-tpl#fit", FIT_ITERATIONS: "state-tpl#fit", SPARSE_YEAR_K: "state-tpl#fit",
  BS_WEIGHT_K: "district-tpl#boundary",
} satisfies Record<keyof typeof G, string>;

// ── Pieces shared by the three lean models ───────────────────────────────────

function raceLedger(r: ComputedRace, opts: { bs?: boolean } = {}): LedgerLine[] {
  return [
    { label: r.imputed ? "Adjusted (imputed)" : "Raw margin", note: r.imputed ? `${r.imputedSourceDesc}, ${r.imputedSourceYear}` : "R% − D% of the full total vote", value: <M v={r.adjustedMargin} /> },
    { op: "+", label: "Incumbency strip", note: r.incumbent === "R" || r.incumbent === "D" ? `${r.incumbent} incumbent` : "open seat", value: <M v={r.incumbencyPts} /> },
    { op: "+", label: "Fundraising strip", note: r.ffDetail ? `receipts D $${(r.ffDetail.dem / 1e6).toFixed(1)}M · R $${(r.ffDetail.rep / 1e6).toFixed(1)}M` : "no receipts on file → 0", value: <M v={r.FF_pts} /> },
    ...(opts.bs ? [{ op: "+" as const, label: "Boundary shift", note: r.boundaryShift == null ? "run on today's lines" : `old lines ${signed(r.boundaryShift)} vs 2026 lines`, value: <M v={r.BS_pts ?? 0} /> }] : []),
    { op: "+", label: "Environment strip", note: "−E(year)", value: <M v={r.envPts} /> },
    { op: "=", label: "Neutral margin (NM)", note: `aggregation weight ${r.aggWeight.toFixed(2)}`, value: <M v={r.NM} />, total: true },
  ];
}

function YearTable({ aggs }: { aggs: YearAggregation[] }) {
  const present = aggs.filter((a) => a.racesPresent.length > 0);
  return (
    <DataTable align="rlrrrr" head={["Year", "Offices present", "Coverage", "Recency", "Final weight", "Year margin (WRS)"]}
      rows={present.map((a) => [a.year, a.racesPresent.map((t) => `${t} ${pct(a.redistributedWeights[t])}${t === "H" && (a.typeFactors?.H ?? 1) < 0.999 ? ` (Huber ×${a.typeFactors.H.toFixed(2)})` : ""}`).join(" · "), a.coverage.toFixed(2), (G.YEAR_WEIGHTS[a.year] ?? 0).toFixed(3), pct(a.finalWeight, 1), <M key="w" v={a.WRS} />])}
      caption="Offices present shows each type's redistributed share within the year; a House year more than HUBER_C from its anchor (the state's fitted lean; for a county, its statewide-rows lean) shows its Huber factor. Final weight = recency × coverage, normalized over the years with data." />
  );
}

const stripConstants = (): ConstantRow[] => {
  const inc = incumbentAdvantage();
  return [
    { name: "incumbency", value: `H ${inc.H.toFixed(1)} · S ${inc.S.toFixed(1)} · G ${inc.G.toFixed(1)}`, basis: "fitted", meaning: "Points the incumbent's party is worth, stripped toward the other party. Senate and Governor are fitted inside the fit; House is a fixed 3. President and State Legislature carry none.", source: <>See {link("/analysis/internal-methodology/forecast#incumbency", "Forecast → Incumbency")}.</> },
    { name: "APPOINTED_INCUMBENCY_SHARE", value: F.APPOINTED_INCUMBENCY_SHARE, basis: "decision", meaning: "Share of the advantage stripped for an incumbent who had never won the seat. 0 = treated as an open seat." },
    { name: "FF_K · FF_MAX", value: `${FF_K} · ±${FF_MAX}`, basis: "calibrated", meaning: "Fundraising strip = −clamp(FF_K × gap%, ±FF_MAX), gap% = (R$ − D$)/(R$ + D$) × 100. Applied only where both receipts are known; never to President or imputed rows.", source: "tplCalibrate FF sweep on the clean presidential target. Larger k overcorrects: the receipts gap partly double-counts incumbency. (The forecast uses a different, residual-basis money rule.)" },
  ];
};

function Eligibility() {
  return (
    <Section id="eligibility" kicker="Step 0" title="Which races count"
      lede="A margin is a usable Republican-vs-Democrat measurement only if a genuine (or caucus-aligned) nominee of each major party was on the general ballot. There is no margin threshold: a legitimate blowout stays at face value.">
      <DataTable align="lll" head={["Class", "Meaning", "Treatment"]} rows={[
        ["eligible", "A real Republican against a real Democrat", "Used as is"],
        ["no-dem / no-rep", "A major party absent — nobody, or a minor-party or unaligned independent stand-in (Osborn NE 2024, McMullin UT 2022)", "Imputed"],
        ["same-party", "Top-two or runoff between two candidates of one party", "Imputed"],
        ["fragmented", "Louisiana Senate or Governor jungle general decided without a runoff: the top candidate of each party understates split fields. Detected as D% + R% < 90 in LA", "Imputed"],
        ["Louisiana House, 2016–2024", "The November all-party primary: every Democratic candidate's votes against every Republican candidate's, as a share of the total vote. A seat where one party ran nobody is no-dem / no-rep", "Used as is"],
      ]} />
      <Defs items={[
        { term: "Aligned independents", def: <>Count as their party&rsquo;s nominee: {Object.entries(ALIGNED_INDEPENDENTS).map(([n, p]) => `${n} (${p})`).join(", ")}. Every other independent does not.</> },
        { term: "Write-in-scale slots", def: "A slot under 5% while the opponent clears 90%, or under 2% outright, is treated as unfilled." },
        { term: "Margin basis", def: "Every margin is R% − D% as a percent of the FULL total vote, third parties included — never a two-party share." },
      ]} />
    </Section>
  );
}

// ── State TPL ────────────────────────────────────────────────────────────────

export function StateTplMethodology() {
  const fit = getTplFit();
  const median = getMedianStateTpl();
  const models = statesData.map((s) => ({ ...s, calc: calculateStateModel(s.abbr, s.name) }));
  const allRaces = models.flatMap((m) => m.calc.races.filter((r) => r.inAggregation && r.NM != null));
  const imputedN = allRaces.filter((r) => r.imputed).length;
  const downweighted = allRaces.filter((r) => !r.imputed && r.raceType !== "H" && r.aggWeight < 0.999).length;
  const houseYearsDown = models.flatMap((m) => m.calc.yearAggregations).filter((a) => (a.typeFactors?.H ?? 1) < 0.999).length;
  const oh = models.find((m) => m.abbr === "OH")!;
  const exRace = oh.calc.races.find((r) => r.race === "Senate" && r.year === 2022) ?? oh.calc.races.find((r) => r.raceType === "S")!;
  const ranked = [...models].sort((a, b) => a.calc.tpl - b.calc.tpl);

  return (
    <>
      <Section id="overview" kicker="State TPL · True Partisan Lean" title="A state's lean in a neutral year"
        lede={<>State TPL is the margin a generic Republican against a generic Democrat would produce in a neutral national year: the year in which the national U.S. House vote, with every seat contested, is tied. It is a baseline, not a forecast. It is built from every eligible race from {G.YEARS[0]} to {G.YEARS.at(-1)} (President, Senate, Governor, House and State Legislature, odd years included) by stripping three additive distortions from each and averaging across offices and years. 2026 is in on the counts as they stand, which are not certified. The {link("/analysis/internal-methodology/forecast", "2026 forecast")} started from the lean as it stood before the election. Live ledgers: {link("/model", "TPL tab")}.</>}>
        <Formula lines={[
          "margin(state, race, year) = lean + E(year) + incumbency + fundraising + residual",
          "NM   = Adjusted margin + incumbency strip + fundraising strip − E(year)      each strip additive, applied once",
          "TPL  = Σ year weight × WRS(year)        WRS = type-weighted mean of that year's NMs",
          "Centered TPL = TPL − median of the 50 state TPLs",
        ]} note={<>R-positive throughout. Candidate quality is deliberately not a term: outlier candidates are downweighted instead, and their residuals become {link("/analysis/internal-methodology/war", "WAR")}.</>} />
        <DataTable align="lr" maxWidth="max-w-md" head={["Now", ""]} rows={[
          ["Races in the fit", fit.rowsUsed.toLocaleString()],
          ["Races aggregated / imputed / statewide rows Huber-downweighted / House years Huber-downweighted", `${allRaces.length.toLocaleString()} / ${imputedN} / ${downweighted} / ${houseYearsDown}`],
          ["Median state TPL", <M key="m" v={median} />],
          ["Most Democratic · most Republican", <span key="x">{ranked[0].abbr} <M v={ranked[0].calc.tpl} /> · {ranked.at(-1)!.abbr} <M v={ranked.at(-1)!.calc.tpl} /></span>],
        ]} />
      </Section>

      <Eligibility />

      <Section id="adjusted" kicker="Step 1" title="Adjusted margin and imputation">
        <Defs items={[
          { term: "Eligible race", def: "Adjusted = Raw, untouched." },
          { term: "Ineligible race (⊘)", def: <>Adjusted is imputed from the seat&rsquo;s nearest presidential result: district-level for a House seat (restricted to the boundary vintage the race was run on), statewide otherwise. Imputed rows skip the incumbency and fundraising strips, strip the environment of the SOURCE presidential year, and enter aggregation at weight <N>{IMPUTED_RACE_WEIGHT}</N> (which also scales the office&rsquo;s weight that year: Steps 5–6). An imputed House row instead keeps weight <N>{IMPUTED_HOUSE_ROW_WEIGHT}</N> × the source presidential year&rsquo;s turnout share: it is that district&rsquo;s share of the state&rsquo;s House vote, and halving it would drop half the district out of the state&rsquo;s sum.</> },
          { term: "State Legislature", def: <>One row per year over every chamber on the ballot that year, built district by district (<Link href="/analysis/internal-methodology/state-leg" className="underline underline-offset-2">Legislative atlas</Link>) so that it measures the whole chamber with every seat filled. The <em>contested seats</em>, where both major parties drew votes, enter on their own votes as a share of their full total. Every other seat is an estimate: its presidential margin on the map it was run on (the presidential year nearest the race) plus the gap the contested seats ran from theirs that year (<a href="#not-up" className="underline underline-offset-2">below</a>), weighted by that presidential vote scaled to the chamber&apos;s legislative-to-presidential turnout ratio. That covers the <em>unopposed seats</em> (uncontested, one-party or uncounted districts, and a district on the year&apos;s map with no results row whose seat was up: MEDSL&apos;s 2024 files and Louisiana&apos;s omit unprinted unopposed races) and a staggered chamber&apos;s seats <em>not up</em>, whose class can differ from the one on the ballot by several points in lean. The row carries the year&apos;s own environment. Until 2026-11-19 the unopposed seats were a second row (⊘) at the presidential margin alone, stripping that presidential year&apos;s environment; that row survives only where a chamber has no gap to use (fewer than five contested seats in either chamber). Before 2026-10-10 the entry was the raw chamber aggregate, which counted a printed unopposed race as a 100–0 result and so overstated the dominant party in every state that prints them. A year counts once every chamber that WAS on the ballot is sourced (staggered senates sit out some years; Nebraska is unicameral).</> },
          { term: "Senate specials", def: "A state with a regular and a special Senate race in one year carries both rows; both feed that year's Senate mean." },
        ]} />
      </Section>

      <Section id="strips" kicker="Steps 2–3" title="Incumbency and fundraising strips"
        lede="Each strip removes what the incumbent's party, or a money advantage, added to the margin — so what remains describes the seat, not the candidates' circumstances. The forecast adds incumbency back for 2026 from the same table.">
        <Constants rows={stripConstants()} />
      </Section>

      <Section id="fit" kicker="Step 4" title="The fit: environment, neutral point, incumbency"
        lede="One national environment number per year, the same in every state, and the Senate and Governor incumbency values are estimated together by Huber-weighted alternating least squares over the full eligible panel. The level of the whole scale is then pinned to a tied House vote.">
        <Formula lines={[
          "adj  = margin + fundraising strip + incumbency strip   ≈   lean(state) + E(year)",
          "row base weight = type weight for that kind of year / count(state, year, type)",
          `w    = base × min(1, HUBER_C / |residual|)                                 HUBER_C = ${G.HUBER_C}`,
          `E(y) = Σ w·(adj − lean) / Σ w  ×  n / (n + SPARSE_YEAR_K)                  SPARSE_YEAR_K = ${G.SPARSE_YEAR_K}`,
          "inc(office) = Σ w·sign·(margin + FF strip − lean − E) / Σ w               over incumbent-held Senate / Governor rows",
          "neutral: fit E(y) = c + s × House vote(y) over the even years, then  E ← E − c,  lean ← lean + c",
        ]} note={`${G.FIT_ITERATIONS} alternating rounds (converged by round 4). The base weight makes a state-year's House rows share the House weight instead of outvoting its single presidential row, so the fitted lean answers the same question TPL does. Only contested races enter the fit, so a seat with no opponent cannot move E.`} />
        <Block label="Fitted national environment E(year)" meta="identified from within-state changes, so which seats happen to be up cannot skew it">
          <DataTable align={"l" + "r".repeat(fit.years.length)} maxWidth="max-w-4xl" head={["", ...fit.years]} rows={[["E", ...fit.years.map((y) => <M key={y} v={fit.E[y]} />)]]}
            caption="After the neutral point is applied: E = 0 is a tied House vote, not the average of these years. Odd years get their own E from the VA / NJ / KY / LA / MS races, shrunk hard by the sparse-year factor." />
        </Block>
        {fit.neutral && (
          <Block label="Neutral point" meta={`TPL_NEUTRAL_ANCHOR = ${TPL_NEUTRAL_ANCHOR}`}>
            <P>The fit identifies lean + E only up to a constant: add any number to every E and take it from every lean and nothing changes. Left alone, E = 0 sits at the average of whatever years are in the model, so every lean moved when a wave year entered (adding 2026 moved the median state 1.7 points Democratic). The level is pinned instead to the national U.S. House vote with every seat contested: each uncontested or same-party seat is filled with its presidential margin on the lines it was run on plus that year&rsquo;s gap between House and presidential margins in the contested seats, at the state&rsquo;s median contested total vote. Every margin in this step is a share of the total vote (third parties in the denominator), the basis the presidential margins are on. That gap comes from contested seats only and no poll enters it, so nothing is circular.</P>
            <DataTable align={"l" + "r".repeat(fit.neutral.points.length)} maxWidth="max-w-3xl" head={["", ...fit.neutral.points.map((p) => p.year)]} rows={[
              ["House vote, every seat contested", ...fit.neutral.points.map((p) => <M key={p.year} v={p.housePv} />)],
              ["E(year)", ...fit.neutral.points.map((p) => <M key={p.year} v={p.E} />)],
            ]} caption={<>E = c + s × House vote, s = <N>{fit.neutral.slope.toFixed(2)}</N>: one point of House vote is {fit.neutral.slope.toFixed(2)} points of E. c, the E the fit gave a tied House vote, was <M v={fit.neutral.shift} digits={2} />; it is subtracted from every E and added to every lean, so every state, district and county moved by that amount together and no difference between two places changed.</>} />
          </Block>
        )}
        <Block label="No state elasticity" meta="removed 2026-11-19">
          <P>Until 2026-11-19 each state had an elasticity β*, a multiplier on E fitted with the lean and shrunk halfway to 1. It was removed after the 2026 review. A state&rsquo;s β fitted on the earlier years did not predict its β on the later years (correlation −0.17), the states with a higher β* did not swing more in 2026 (the swing&rsquo;s slope on β* ran between −5 and +5 against an implied −12), and a β*-scaled shift fitted the result worse than a uniform one in 19 of 27 office-years. Over six holdout rounds β = 1 scored 3.90 against 3.93.</P>
        </Block>
        <Constants rows={[
          { name: "HUBER_C", value: G.HUBER_C, basis: "decision", meaning: "Residual size (pts) beyond which a race is downweighted: every row in the fit, and in aggregation each statewide row and each whole House year (House rows carry no row-level factor: a packed district is not an outlier). This is what keeps Manchin, Scott and Hogan from dragging a state's lean.", source: "7 until 2026-11-20, then widened (user decision): with one national environment for every state, 7 also discounted states that swing more than the nation in a wave. Conditional test 7 → 15: Senate 4.43 → 4.45, Governor 7.60 → 7.55, House 4.65 → 4.65. The seat-level models (legislative and precinct districts) keep 7 as SEAT_HUBER_C." },
          { name: "SPARSE_YEAR_K", value: G.SPARSE_YEAR_K, basis: "designed", meaning: "E(y) shrink n/(n + K): reins in thin odd years.", source: "2–8 move the objective ≤ 0.01." },
          { name: "TPL_NEUTRAL_ANCHOR", value: TPL_NEUTRAL_ANCHOR, basis: "decision", meaning: "Where E = 0 sits: a tied every-seat-contested House vote (house-vote), or the average of the model's years (window, the behaviour until 2026-11-19).", source: "User decision 2026-11-19. Changes no difference between two places." },
          { name: "FIT_ITERATIONS", value: G.FIT_ITERATIONS, basis: "designed", meaning: "Alternating least-squares rounds." },
        ]} />
      </Section>

      <Section id="aggregation" kicker="Steps 5–6" title="Robust weighting and aggregation">
        <Formula lines={[
          `aggWeight    = (imputed ? ${IMPUTED_RACE_WEIGHT} : 1) × min(1, HUBER_C / |NM − fitted lean|)         statewide rows (P, S, G, Leg)`,
          `aggWeight    = (imputed ? ${IMPUTED_HOUSE_ROW_WEIGHT} : 1) × total votes / mean House turnout that year     House rows — no row-level Huber; an imputed district keeps its share`,
          `aggWeight    = (imputed ? ${IMPUTED_LEG_ROW_WEIGHT} : 1) × Huber × row turnout / mean row turnout that year   State Legislature — one whole-chamber row; a second (unopposed, no gap available) shares the L weight on its electorate`,
          "type NM      = aggWeight-weighted mean of the type's NMs that year",
          "House factor = min(1, HUBER_C / |House NM − fitted lean|)      one Huber check on the whole House year, applied to its type weight",
          "type factor  = Σ aggWeight / Σ turnout share (1 per row outside House and Legislature)      P, S, G, Leg: the rows' own discounts, applied to the type weight",
          "type weight  = RACE_TYPE_WEIGHTS in a presidential year, RACE_TYPE_WEIGHTS_MIDTERM in any other",
          "WRS(year)    = Σ type weight × type NM      base weights (each × its factor) redistributed among the types present",
          `year weight  ∝ ${(G.YEAR_WEIGHTS[2024] / G.YEAR_WEIGHTS[2025]).toFixed(2)}^(2026 − year) × coverage    coverage = Σ base type weights present that year (each × its factor)`,
          "TPL          = Σ normalized year weight × WRS",
        ]} note="A row's weight only acts against other rows of its office in the same year, and a state-year nearly always has one presidential, one Senate, one governor and one legislature row. So the Huber factor and the imputed discount are also applied to the office's weight in the year (the type factor): an outlier such as Scott in Vermont, or a Senate race imputed from the presidential vote, counts less against the other offices that year and, through coverage, against other years. Until 2026-11-19 they were not, and on a lone row both cancelled. Coverage is what stops a sparse odd year (one governor race) from dominating through redistribution. A year with no races drops out and the rest renormalize. House rows are turnout-weighted because the districts sum to the state: each district's result is a share of the state's House vote, and a packed D+60 seat is not an outlier. Row-level Huber on House rows handed every packed-map state's House aggregate to the party with more middling seats (Georgia 2024: R+10 against a turnout-weighted R+2 and a presidential NM of R+0.3), so the outlier check is applied once to the whole House year instead. An imputed House row is weighted by the turnout of the presidential result it borrows, not by its own depressed turnout." />
        <Block label="Race-type weights" meta="one set for presidential years, one for every other year">
          <DataTable align="lrr" maxWidth="max-w-lg" head={["Office", "Presidential year", "Midterm or odd year"]} rows={(["P", "H", "L", "S", "G"] as const).map((t) => [TYPE_NAME[t], G.RACE_TYPE_WEIGHTS[t].toFixed(2), t === "P" ? "—" : G.RACE_TYPE_WEIGHTS_MIDTERM[t].toFixed(2)])}
            caption={<>Presidential set: calibrated (tplCalibrate), the knee of the presidential-weight curve; P .70 was proposed twice and declined, and the 2026 result took back the gain it promised. Midterm set (2026-11-19, a decision): a midterm is a down-ballot-only election, so its offices are weighed on their own terms. The set sums to the 0.40 the same offices carry in a presidential year, so a midterm year still counts 0.4 of a presidential one. Inside it the House and the State Legislature, each a whole-state vote with every seat filled, take more, and the two single-candidate statewide offices less. Over six holdout rounds the change is inside the noise (3.90 → 3.87), and no midterm set tested moved the score by more than 0.05.</>} />
        </Block>
        <Block label="Year weights" meta="recency only, before coverage">
          <DataTable align={"l" + "r".repeat(G.YEARS.length)} maxWidth="max-w-4xl" head={["", ...G.YEARS]} rows={[["weight", ...G.YEARS.map((y) => G.YEAR_WEIGHTS[y].toFixed(3))]]}
            caption="Geometric decay per year, anchored on 2026. Six-round holdout (2026-11-19): 0.50 3.93, 0.60 3.89, 0.75 3.93, 0.87 4.05, 1.00 4.24. Kept at 0.75." />
        </Block>
        <Constants rows={[
          { name: "IMPUTED_RACE_WEIGHT", value: IMPUTED_RACE_WEIGHT, basis: "designed", meaning: "An imputed statewide row is a lean borrowed from a presidential result, not an observation of its own.", source: "0.25–1.0 move the calibration objective ≤ 0.01." },
          { name: "IMPUTED_HOUSE_ROW_WEIGHT", value: IMPUTED_HOUSE_ROW_WEIGHT, basis: "decision", meaning: "An imputed House row is a turnout-weighted share of the state's House vote, so it keeps its full share; its value is the district's own presidential lean.", source: "0.5 → 1.0 costs 0.025 on the calibration objective; kept at 1 so the districts still sum to the state." },
          { name: "IMPUTED_LEG_ROW_WEIGHT", value: IMPUTED_LEG_ROW_WEIGHT, basis: "calibrated", meaning: "The State Legislature's unopposed pool keeps its full turnout share for the same reason a House seat does: it is that part of the chamber's electorate.", source: "2024 holdout, 2026-10-10: at 0.5 President 2.25 / Senate 4.89 / House 3.52 against 2.24 / 4.90 / 3.41 at 1 — no better on the two targets that improved, worse on the third." },
          { name: "LEG_NOT_UP_MODE", value: LEG_NOT_UP_MODE, basis: "calibrated", meaning: "How a staggered chamber's not-up seats are estimated: off (left out), flat (presidential margin + the contested seats' mean gap) or slope (the gap fitted on presidential lean).", source: <>Hidden-seat-class test, <a href="#not-up" className="underline underline-offset-2">below</a>.</> },
          { name: "LEG_UNOPPOSED_MODE", value: LEG_UNOPPOSED_MODE, basis: "decision", meaning: "How unopposed legislative seats enter: gap (presidential margin plus the contested seats' gap, in the chamber row, as the not-up seats do) or pres (presidential margin alone, as a separate row).", source: "User decision 2026-11-19, for consistency with the seats not up. Conditional test unchanged within 0.03; E(2026) D+9.5 → D+10.8 because the fit now sees whole chambers." },
          { name: "LEG_NOT_UP_SLOPE_K", value: LEG_NOT_UP_SLOPE_K, basis: "calibrated", meaning: "Shrinkage of the gap's slope: b × n / (n + k) on n contested seats, so a chamber with few contested races leans on the flat gap.", source: "Same test: k 5–10 best; k 0 and k ≥ 50 slightly worse." },
        ]} />
      </Section>

      <Section id="example" kicker="Worked example · live" title={`${oh.name}`}
        lede={<>One race taken through the strips, then the state&rsquo;s year aggregation. Full ledger: {link("/model/oh", "Ohio State TPL")}.</>}>
        <Block label={`${exRace.year} ${exRace.race}`} meta={`${exRace.repCandidate ?? ""} (R) vs ${exRace.demCandidate ?? ""} (D)`}>
          <Ledger lines={raceLedger(exRace)} />
        </Block>
        <Block label="Year aggregation"><YearTable aggs={oh.calc.yearAggregations} /></Block>
        <Ledger lines={[
          { label: "State TPL", value: <M v={oh.calc.tpl} />, total: true },
          { op: "", label: "Median state", value: <M v={median} /> },
          { op: "=", label: "Centered TPL", note: "TPL − median", value: <M v={oh.calc.tpl - median} />, total: true },
        ]} />
      </Section>

      <Section id="not-up" kicker={`Hidden seat classes · generated ${STATE_LEG_NOT_UP_VALIDATION.generatedAt}`} title="Seats not up for election"
        lede={<>A staggered chamber puts a different half (or third) of its seats on the ballot each cycle, and the seats up one year can lean several points either way of the chamber. The State Legislature row adds the seats that sat out as estimates, carried in that year&rsquo;s own environment.</>}>
        <Formula lines={[
          "gap_j        = legislative margin − presidential margin           each contested seat up, on the lines it was run on",
          "a, b         = vote-weighted fit of gap_j = a + b·(P_j − P̄)          P̄ = the contested seats' vote-weighted mean presidential margin",
          `seat estimate = P_i + a + b·n/(n + ${LEG_NOT_UP_SLOPE_K})·(clamp(P_i) − P̄)    each seat not up; clamp = the range of P_j the fit saw`,
          "weight       = the seat's presidential votes × the chamber's legislative/presidential turnout ratio",
          "row          = contested seats' votes + not-up estimates + unopposed estimates, combined on those weights",
        ]} note={`The unopposed seats are estimated by the same formula from the same fit (${LEG_UNOPPOSED_MODE === "gap" ? "since 2026-11-19" : "switched off"}); the test below covers the not-up case only, where the hidden seats are an arbitrary half. An unopposed seat is not arbitrary (nobody chose to challenge it), so the gap may understate how far it runs toward its holder. A chamber with fewer than 5 contested seats borrows the other chamber's gap that year. Which seats were not up: a staggered chamber's districts with no results row, except a seat whose last regular election was that year (an unprinted unopposed race, imputed as unopposed instead). Live setting: ${LEG_NOT_UP_MODE}.`} />
        <DataTable align="lrrrr" maxWidth="max-w-3xl" head={["Estimator", "Alternate: hidden half", "Alternate: full row", "Random: hidden half", "Random: full row"]}
          rows={STATE_LEG_NOT_UP_VALIDATION.rows.map((r) => [r.estimator === STATE_LEG_NOT_UP_VALIDATION.live ? <N key="e">{r.estimator}</N> : r.estimator, r.alternateHalf.toFixed(2), r.alternateRow.toFixed(2), r.randomHalf.toFixed(2), r.randomRow.toFixed(2)])}
          caption={`MAE in margin points over ${STATE_LEG_NOT_UP_VALIDATION.chamberYears} chamber-years that elected every seat at once: each is split into two classes (alternate districts, and 20 random halves), and one half's contested seats are estimated from the other's. "none" is the row before this term — the hidden half assumed to vote like the visible one.`} />
      </Section>

      <Section id="validation" kicker={`Conditional test · generated ${TPL_VALIDATION.generatedAt}`} title="Validation"
        lede="TPL is a measurement of a place, not a forecast, and it makes one predictive claim: given the year's environment and the race's own terms, the lean supplies the rest. So that is the test. Every eligible Senate, governor and House race of each year is taken apart as lean + environment + incumbency + money + candidate record + leftover, with the lean built from earlier years only and the environment supplied exactly (one number per office and year, so no forecast of the year is on trial). The figure is the mean leftover in points.">
        <DataTable align="llrrrrrr" maxWidth="max-w-5xl" head={["Year", "Office", "Races", "Environment supplied", "TPL alone", "TPL + race terms", "Last pres. alone", "Last pres. + race terms"]}
          rows={[
            ...TPL_VALIDATION.rows.map((r) => [r.year, r.office, r.n, <M key="e" v={r.environment} />, r.tplAlone.toFixed(2), r.tplFull <= r.presFull ? <N key="t">{r.tplFull.toFixed(2)}</N> : r.tplFull.toFixed(2), r.presAlone.toFixed(2), r.presFull < r.tplFull ? <N key="p">{r.presFull.toFixed(2)}</N> : r.presFull.toFixed(2)]),
            ...TPL_VALIDATION.pooled.map((p) => [`All ${p.years}`, p.office, p.n, "", p.tplAlone.toFixed(2), <N key="t">{p.tplFull.toFixed(2)}</N>, p.presAlone.toFixed(2), p.presFull.toFixed(2)]),
          ]}
          caption={<>The last two columns run the same equation with the most recent presidential margin, on the lines the race was run on, in place of TPL: the fair form of &ldquo;a presidential margin does the same job&rdquo;. Bold marks the lower of the two full equations. House races are scored district by district: 2018 and 2020 on the maps of the day, 2022 and 2024 only where the lines were not redrawn afterwards, 2026 everywhere. The 2018 lean rests on 2016 and 2017 alone. 2026 uses the counts as they stand. Race terms are the forecast&rsquo;s own (incumbency, money, candidate record), each built without the year being scored. This table replaced the 2024 holdout on 2026-11-19: that table gave TPL no environment beyond one national shift and no race terms, which tested it as a forecast, and it set a lean with incumbency removed against margins that still contained it.</>} />
      </Section>

      <Section id="limits" kicker="Open items" title="Known limitations">
        <Defs items={[
          { term: "State Legislature pools", def: "A district with no presidential figure on its lines (New Hampshire's floterials, a key the boundary data lacks) is skipped rather than guessed; the environment fit still sees only the contested pool, since imputed rows never enter it." },
          { term: "House incumbency", def: "Fixed, not fitted, in this state-anchored fit." },
          { term: "2026 is provisional", def: "The 2026 rows are the counts as fetched, not certified results, and several states were short of their expected vote. Every number moves again when the results are final. County TPL has no 2026 rows yet: the county files stop at 2025." },
          { term: "No national TPL", def: "The model is built state-up; the median state is the stand-in for a typical state. The neutral point is defined on the House vote, so the vote-weighted mean of the state TPLs is close to zero but is not forced to be." },
        ]} />
      </Section>

      <Section id="files" kicker="Reference" title="Code and commands">
        <Block label="Constant index" meta="every key of TPL_GLOBAL_CONSTANTS, and where it is documented">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            {Object.entries(DOCUMENTED_IN).map(([name, where]) => <Link key={name} href={`/analysis/internal-methodology/${where}`} className="hover:underline"><Code>{name}</Code></Link>)}
          </div>
        </Block>
        <FilesAndCommands files={[
          { path: "lib/tplCompute.ts", role: "generateRaceList, getRawMargin, getTplFit, calculateStateModel, aggregateYears." },
          { path: "lib/tpl2026Inputs.ts ← scripts/buildTplInputs2026.ts", role: "The 2026 rows, from the results CSVs, until 2026 is certified and merged into the historical files." },
          { path: "data/tplModelData.ts", role: "TPL_GLOBAL_CONSTANTS with calibration provenance." },
          { path: "data/raceEligibility.ts", role: "classifyEligibility, ALIGNED_INDEPENDENTS, the Louisiana jungle rule." },
          { path: "data/laHouseNovemberPartyVote.ts", role: "Louisiana House November party totals by district, 2016–2024 (scripts/build-la-house-november-party-vote.py)." },
          { path: "data/fundraisingData.ts ← data-entry/fundraising_2016_2026.csv", role: "Receipts behind the fundraising strip." },
          { path: "components/TplModelPage.tsx", role: "The ledger UI on the TPL tab." },
          { path: "docs/TPL_MODEL_SPEC.md", role: "Long-form design history." },
        ]} commands={[
          { cmd: "npx tsx --conditions=react-server scripts/forwardBacktest.ts --conditional --emit", does: "The conditional test; regenerates the Validation table." },
          { cmd: "npm run tpl-inputs-2026", does: "Rebuilds the 2026 rows (data/generated/tpl-inputs-2026.json) from the results CSVs. Part of prebuild / predev; rerun after a results refresh." },
          { cmd: "npx tsx --conditions=react-server scripts/tplReview2026.ts --ext --design", does: "Six-round leakage-free holdout (2016–2026) for decay, type weights, Huber, strips and the midterm weight set." },
          { cmd: "npx tsx --conditions=react-server scripts/tplBacktest.ts", does: "Tracking holdout with acceptance test against recorded reference values. Re-baseline them after an intentional change." },
          { cmd: "npx tsx --conditions=react-server scripts/stateLegNotUpBacktest.ts --emit", does: "Hidden-seat-class test of the not-up seat estimate; regenerates the Seats-not-up table." },
          { cmd: "npx tsx scripts/tplCalibrate.ts --baseline", does: "Leakage-free objective for decay, type weights, Huber, shrinkage and imputed weight." },
          { cmd: "npx tsx --conditions=react-server scripts/tplBacktest.ts --matrix · --fit", does: "Cross-office predictiveness matrix; fitted E by year." },
        ]} />
      </Section>
    </>
  );
}

// ── District TPL ─────────────────────────────────────────────────────────────

export function DistrictTplMethodology() {
  const ids = Object.keys(districtPresidentialData);
  const calcs = ids.map((id) => ({ id, calc: calculateDistrictModel(id) }));
  const houseRows = calcs.flatMap((c) => c.calc.races.filter((r) => r.raceType === "H"));
  const moved = houseRows.filter((r) => r.boundaryShift != null && Math.abs(r.boundaryShift) >= 0.5);
  const presOnly = calcs.filter((c) => !c.calc.races.some((r) => r.raceType === "H")).length;
  const tpls = calcs.map((c) => c.calc.tpl).sort((a, b) => a - b);
  const median = tpls.length % 2 ? tpls[(tpls.length - 1) / 2] : (tpls[tpls.length / 2 - 1] + tpls[tpls.length / 2]) / 2;
  const nc14 = calcs.find((c) => c.id === "3714") ?? calcs[0];
  const exRace = nc14.calc.races.find((r) => r.raceType === "H" && r.year === 2022) ?? nc14.calc.races.find((r) => r.raceType === "H");
  const exName = houseData.find((r) => parseInt(r.id, 10).toString() === nc14.id)?.name ?? nc14.id;
  const K = G.BS_WEIGHT_K;

  return (
    <>
      <Section id="overview" kicker="District TPL" title="A district's lean, on the 2026 lines"
        lede={<>District TPL runs the {link("/analysis/internal-methodology/state-tpl", "State TPL")} pipeline at district level: the same additive strips, the same national environment, the same decay and coverage, so district and state leans sit on one scale. Its inputs are the district&rsquo;s presidential results re-aggregated onto the 2026 map, plus every House race from 2016 to 2026, the earlier ones relocated onto today&rsquo;s lines. 2026 is in on the counts as they stand. The {link("/analysis/internal-methodology/forecast", "2026 House forecast")} started from the lean as it stood before the election.</>}>
        <Formula lines={[
          "President rows (2016 · 2020 · 2024, on 2026 lines):   NM = Raw − E(year)",
          "House rows (2016–2026):                               NM = Raw + incumbency strip + fundraising strip + BS − E(year)",
          `District TPL = the State TPL aggregation over those rows   (presidential year P ${G.RACE_TYPE_WEIGHTS.P} / H ${G.RACE_TYPE_WEIGHTS.H} redistributed, midterm H ${G.RACE_TYPE_WEIGHTS_MIDTERM.H}; year decay ${(G.YEAR_WEIGHTS[2024] / G.YEAR_WEIGHTS[2025]).toFixed(2)} × coverage)`,
          "Centered     = TPL − median of the 435 district TPLs",
        ]} />
        <DataTable align="lr" maxWidth="max-w-md" head={["Now", ""]} rows={[
          ["Districts", calcs.length],
          ["House rows used", houseRows.length.toLocaleString()],
          ["…relocated across a redraw (|shift| ≥ 0.5)", moved.length.toLocaleString()],
          ["Presidential-only districts", presOnly],
          ["Median district TPL", <M key="m" v={median} />],
        ]} />
      </Section>

      <Section id="differences" kicker="Against State TPL" title="What differs">
        <Defs items={[
          { term: "Inputs", def: "President and House only. Senate, Governor and State Legislature results are not available by congressional district." },
          { term: "Ineligible House races", def: "Skipped, not imputed: the presidential rows already carry the district's lean, so imputing from them would count it twice." },
          { term: "Environment", def: "The national E(year), the same in every district. There is no state or district elasticity (removed 2026-11-19)." },
          { term: "No row weights", def: "A district-year holds one presidential row and at most one House row, and the year's value is a mean within each office before the offices are blended, so a weight on a single row cancels. Until 2026-11-19 the code computed an outlier (Huber) factor and a boundary weight per row and this page described them as active; they never reached the number. Applied as described they scored worse on 2026 (4.56 against 4.50), so they were removed, not repaired." },
          { term: "Appointed incumbents", def: "Not distinguished at district level; a House incumbent always gets the full strip." },
          { term: "Presidential data", def: <>2016, 2020 and 2024 presidential votes re-aggregated to the 2026 boundaries (<Code>data/districtPresidentialData.ts</Code>), full-total-vote basis. Verified on the new maps of all ten redrawn states.</> },
        ]} />
      </Section>

      <Section id="boundary" kicker="Step 3b" title="Boundary shift"
        lede="A House margin is a fact about the map that race was run on; District TPL is a property of the 2026 map. Rebuilding an old race on new lines is impossible even in principle — today's NC-14 is assembled from pieces of three 2022 districts, each of which held a different contest. So the race is relocated instead, by the presidential difference between the two maps.">
        <Formula lines={[
          "shift  = pres_P(lines used in year Y) − pres_P(2026 lines)        same election P, two maps",
          "BS pts = −shift",
          `weight = 1 / (1 + (|shift| / BS_WEIGHT_K)²)                        BS_WEIGHT_K = ${K}      candidate table only`,
        ]} note="P is the presidential election contemporaneous with the map; a midterm uses both neighbours weighted by distance (2018 = ½·2016 + ½·2020). Each term is a same-election, two-map difference, so no election-to-election trend leaks in." />
        <P>What transfers is performance relative to the presidential baseline, not the margin: &ldquo;ran a point behind the top of the ticket&rdquo; carries over, &ldquo;won by 15&rdquo; does not. The uniform shift assumes that relative performance is constant across the district&rsquo;s territory, which is weakest exactly where the shift is largest. The weight below expresses that, but it acts only in the {link("/analysis/internal-methodology/war", "candidate table")}, where each relocated race is a row of its own. It does not change District TPL: the House row is the only one of its office in its year, so its weight cancels.</P>
        <DataTable align="rr" maxWidth="max-w-xs" head={["|shift| (pts)", "Weight"]} rows={[0, 2, 5, 10, 20, 32].map((s) => [s, (1 / (1 + (s / K) ** 2)).toFixed(2)])} />
        <Constants rows={[{ name: "BS_WEIGHT_K", value: K, basis: "designed", meaning: "Shift (pts) at which a relocated race counts half in the candidate table. No effect on District TPL.", source: "Designed. Tested on the 2026 House results as a District TPL weight (K 3 to 40): every setting scored worse than no weight." }]} />
        <Defs items={[{ term: "Old-lines presidential data", def: <><Code>data/presByBoundaryVintage.ts</Code>, per map and presidential year. Two cells had no published source and were built from precinct returns: 2020 president on North Carolina&rsquo;s 2018 map, and 2024 president on the 2022 maps of AL / GA / LA / NC / NY. A neighbour missing on the old map drops out and the rest renormalize.</> }]} />
      </Section>

      <Section id="strips" kicker="Shared with State TPL" title="Strips and constants">
        <Constants rows={stripConstants().filter((c) => c.name !== "APPOINTED_INCUMBENCY_SHARE")} />
        <P>Environment E(year), its neutral point, year decay and type weights are exactly those documented under {link("/analysis/internal-methodology/state-tpl#fit", "State TPL")}. With only President and House present, the base weights P {G.RACE_TYPE_WEIGHTS.P} / H {G.RACE_TYPE_WEIGHTS.H} redistribute to {pct(G.RACE_TYPE_WEIGHTS.P / (G.RACE_TYPE_WEIGHTS.P + G.RACE_TYPE_WEIGHTS.H))} / {pct(G.RACE_TYPE_WEIGHTS.H / (G.RACE_TYPE_WEIGHTS.P + G.RACE_TYPE_WEIGHTS.H))} in a presidential year, and a midterm year is House alone at coverage {G.RACE_TYPE_WEIGHTS_MIDTERM.H}.</P>
      </Section>

      {exRace && (
        <Section id="example" kicker="Worked example · live" title={exName}
          lede={<>The most heavily relocated seat on the map. Full ledger: {link("/model#districts", "District TPL")}.</>}>
          <Block label={`${exRace.year} House`} meta={`${exRace.repCandidate ?? ""} (R) vs ${exRace.demCandidate ?? ""} (D)`}><Ledger lines={raceLedger(exRace, { bs: true })} /></Block>
          <Block label="Year aggregation"><YearTable aggs={nc14.calc.yearAggregations} /></Block>
          <Ledger lines={[{ label: "District TPL", value: <M v={nc14.calc.tpl} />, total: true }, { op: "=", label: "Centered", note: "− median district", value: <M v={nc14.calc.tpl - median} />, total: true }]} />
        </Section>
      )}

      <Section id="limits" kicker="Open items" title="Known limitations">
        <Defs items={[
          { term: "District holdout", def: "2026 was the first district-level test: with the 2026 environment supplied, the lean as locked left 4.34 points in a typical contested seat against 4.97 for the 2024 presidential margin alone (415 seats). The conditional test on the State TPL tab now scores House races district by district every year." },
          { term: "Self-influence", def: <>A member&rsquo;s own House margins feed their district&rsquo;s TPL, which slightly shrinks House {link("/analysis/internal-methodology/war", "WAR")}.</> },
          { term: "Uniform-shift assumption", def: "Home-county overperformance does not transfer to voters a member never represented." },
        ]} />
      </Section>

      <Section id="files" kicker="Reference" title="Code and commands">
        <FilesAndCommands files={[
          { path: "lib/tplCompute.ts", role: "calculateDistrictModel, boundaryStripFor, presInterpWeights." },
          { path: "data/districtPresidentialData.ts", role: "President by district on 2026 lines." },
          { path: "data/presByBoundaryVintage.ts", role: "President by district on each earlier map." },
          { path: "lib/redistrictingCalendar.ts · houseDistrictInfo", role: "Which map each House year was run on." },
        ]} commands={[
          { cmd: "npx tsx scripts/forwardBacktest.ts --env struct --emit", does: "The House rows of the forward backtest are the working check on District TPL." },
          { cmd: "python3 scripts/build-pres-on-old-lines-from-precincts.py", does: "Rebuilds the precinct-derived old-lines cells." },
        ]} />
      </Section>
    </>
  );
}

// ── County TPL ───────────────────────────────────────────────────────────────

export function CountyTplMethodology() {
  const fips = "39049";
  const calc = calculateCountyModel(fips);
  const exRace = calc?.races.find((r) => r.race === "Senate" && r.year === 2022) ?? calc?.races.find((r) => r.NM != null);
  const stateTpl = calculateStateModel("OH", "Ohio").tpl;

  return (
    <>
      <Section id="overview" kicker="County TPL" title="The state pipeline, measured in one county"
        lede={<>County TPL takes the same statewide races the {link("/analysis/internal-methodology/state-tpl", "State TPL")} uses and reads them at county granularity. Every formula, strip and weight is the shared code path, so a change to the state model changes every county with it. It appears on each county page (Historical → a county) and feeds no forecast.</>}>
        <Formula lines={[
          "NM         = county Adjusted margin + incumbency strip + fundraising strip − E(year)",
          "anchor     = the State TPL aggregation over the county's President, Senate and Governor rows",
          "County TPL = the State TPL aggregation over all the county's rows, each House year × min(1, HUBER_C / |House NM − anchor|)",
        ]} />
      </Section>

      <Section id="differences" kicker="Against State TPL" title="What differs">
        <Defs items={[
          { term: "President, Senate, Governor", def: "Genuinely the same statewide race, so the incumbent, the appointed flag and the candidates' receipts are inherited from the state's race list. Only the margin is the county's own." },
          { term: "House", def: "A county's House figure is a same-year aggregate across every district touching it, so there is no single incumbent or pair of candidates: no incumbency strip, no fundraising strip. A year counts as ineligible — and is imputed like any other — when one party drew no votes in the county (an unopposed race); a county split between a contested and an unopposed district stays eligible, since the aggregate has no per-district breakdown." },
          { term: "State Legislature", def: "Not included — no county-level legislature results." },
          { term: "Imputation", def: `An ineligible race (statewide, or an unopposed House year) is imputed from the COUNTY'S nearest presidential result, at weight ${IMPUTED_RACE_WEIGHT}, stripping the source year's environment.` },
          { term: "Huber: House years only, against the county's own lean", def: `No statewide row is Huber-weighted: a county sitting far from its STATE's lean is not an outlier, it is a county. Each House year is checked as a whole instead, as in the state model, but against the county's own statewide lean (its President, Senate and Governor rows aggregated alone): the year's House weight × min(1, ${G.HUBER_C} / |House NM − that lean|). A county's House vote carries its local candidates — Cuellar won Zapata County, TX by D+34 in 2024 as Trump carried it by R+22 — and with no incumbency strip possible that gap entered at full weight. A county with no statewide rows keeps its House years unchecked.` },
          { term: "Environment", def: "The national E(year), the same everywhere. No state or county elasticity." },
          { term: "2026", def: "Not in County TPL yet: the county result files stop at 2025. The level still moved with the neutral point, as every lean did." },
          { term: "Senate specials", def: "Special-election results live in a separate bucket of the county Senate data, so a regular and a special in one year each read their own margin." },
          { term: "No data", def: "Alaska (no county equivalents report results) and Kalawao County, HI have no rows; the county page says so rather than showing a fabricated EVEN." },
          { term: "Baseline for comparison", def: <>There is no national TPL; the county page compares against the median state TPL (<M v={getMedianStateTpl()} />).</> },
        ]} />
      </Section>

      {calc && exRace && (
        <Section id="example" kicker="Worked example · live" title="Franklin County, Ohio"
          lede={<>County page: {link(`/historical/${fips}`, "Franklin County")}.</>}>
          <Block label={`${exRace.year} ${exRace.race}`} meta="county margin, statewide strips"><Ledger lines={raceLedger(exRace)} /></Block>
          <Block label="Year aggregation"><YearTable aggs={calc.yearAggregations} /></Block>
          <Ledger lines={[{ label: "County TPL", value: <M v={calc.tpl} />, total: true }, { op: "", label: "Ohio State TPL", value: <M v={stateTpl} /> }]} />
        </Section>
      )}

      <Section id="shared" kicker="Shared with State TPL" title="Strips and constants">
        <Constants rows={stripConstants()} />
        <P>Eligibility, E(year), race-type weights, year decay and coverage are exactly those documented under {link("/analysis/internal-methodology/state-tpl", "State TPL")}.</P>
      </Section>

      <Section id="files" kicker="Reference" title="Code and commands">
        <FilesAndCommands files={[
          { path: "lib/tplCompute.ts", role: "calculateCountyModel, generateCountyRaceList, getCountyHistoricalMargins." },
          { path: "data/county{Presidential,Senate,Governor,House}Data.ts", role: "County margins, keyed by 5-digit FIPS." },
          { path: "components/CountyTplCard.tsx", role: "The ledger on each county page." },
        ]} commands={[{ cmd: "npx tsx scripts/tplBacktest.ts", does: "County TPL has no harness of its own; it inherits the state pipeline's." }]} />
      </Section>
    </>
  );
}

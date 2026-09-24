import Link from "next/link";
import type { ReactNode } from "react";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { computeWarTable, getWarMoneyModel, warCandidateKey, FF_K, FF_MAX, WAR_LAMBDA, WAR_RECENCY_DECAY, WAR_RECENCY_DECAY_STATEWIDE, type WarRow } from "@/lib/tplCompute";
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
  const rowOf = (r: WarRow) => [<Name key="n" row={r} />, `${r.year} ${r.state} ${OFFICE[r.office]}`, <M key="a" v={r.actual} />, <M key="e" v={r.expected} />, <M key="o" v={r.expectedVsOpponent} />, <War key="w" v={r.war} />];

  return (
    <>
      <Section id="overview" kicker="WAR · Wins Above Replacement" title="How much better than a generic nominee"
        lede={<>WAR is how far a candidate&rsquo;s actual margin ran ahead of what a replacement-level nominee of their party — a generic <em>non-incumbent</em> — would have managed against the same opponent in the same seat and year, in points of margin. It is built from three numbers, each answering a different question. Table: {link("/model/war", "TPL → WAR")}.</>}>
        <Defs items={[
          { term: "Expected Result", def: <><strong>Generic vs generic.</strong> The margin this seat would produce in that year with two replacement-level nominees: the seat&rsquo;s lean in that year, the national environment, incumbency, and the money gap a generic pair in that situation would have.</> },
          { term: "Vs. Opponent", def: <><strong>Generic non-incumbent vs this specific opponent.</strong> The Expected Result moved by the opponent&rsquo;s own candidate effect — facing a strong opponent lowers what a generic nominee would be expected to do — and, when the candidate is the incumbent, with their own incumbency taken out: a replacement-level nominee never holds the seat.</> },
          { term: "Candidate WAR", def: <><strong>Actual − Vs. Opponent</strong>, signed toward the candidate. Equal to the candidate&rsquo;s own effect, plus whatever the race left unexplained, plus — for an incumbent — what their incumbency was worth.</> },
        ]} />
        <Formula lines={[
          "Expected      = lean-in-that-year + β*·E(year) + incumbency + structural money pts         R-positive",
          "residual r    = Actual − Expected                       = a_R − a_D + ε      one per race, two candidates",
          "Incumb.       = Expected − Expected with no incumbent    incumbent's row only, signed toward them; 0 otherwise",
          "Vs. Opponent  = Expected − s × Incumb. − s × a_opponent   s = +1 for a Republican, −1 for a Democrat",
          "WAR           = s × (Actual − Vs. Opponent)             = a_candidate + s × ε + Incumb.",
        ]} note={<>Positive WAR is always good for the candidate, whichever party. Because each side keeps the whole unexplained leftover ε, the two candidates&rsquo; WARs do not sum to the residual — as a batter and a pitcher both book the same hit. The ridge solves on r, with incumbency stripped; Incumb. is added back only to the reported WAR, so the candidate effects the forecast reads are unchanged by it.</>} />
        <DataTable align="lr" maxWidth="max-w-md" head={["Now", ""]} rows={[
          ["Candidate-race rows", rows.length.toLocaleString()],
          ["Races", races.toLocaleString()],
          ["Candidates (≥ 2 races)", `${keys.size.toLocaleString()} (${repeat})`],
          ["House · Senate · Governor · President rows", `${byOffice("H")} · ${byOffice("S")} · ${byOffice("G")} · ${byOffice("P")}`],
        ]} />
      </Section>

      <Section id="expected" kicker="Number 1" title="Expected Result (generic vs generic)"
        lede="A lean is one number for 2016–2025, but a race is a fact about its own year. Scoring an old race against a present-day lean would charge the candidate for everything the electorate did since, so the anchor is moved to the race's year.">
        <Formula lines={[
          "Senate / Governor:  base = fitted state lean + trend(Y) + β*·E(Y) + incumbency",
          "House:              base = District TPL + trend(Y) + shift + β*·E(Y) + incumbency",
          "President:          base = fitted state lean + β*·E(Y)                                   (no trend — it would be circular)",
          "No-D / no-R race:   base = imputed presidential baseline (NM) + β*·E(Y) + incumbency      (Osborn-class; no money term)",
          "trend(Y) = neutral presidential margin interpolated to year Y − the presidential average the lean embodies",
          "Expected = base + clamp(FF_K × structural gap%, ±FF_MAX)",
        ]} />
        <Defs items={[
          { term: "State anchor", def: <>The Huber-fitted state lean from the {link("/methodology/state-tpl#fit", "TPL fit")} — outlier-resistant, so Manchin&rsquo;s own wins do not inflate his baseline. It has no recency decay, so its presidential average is an equal-year one.</> },
          { term: "District anchor", def: <>{link("/methodology/district-tpl", "District TPL")}, whose presidential average is recency-weighted to match. <em>shift</em> is the boundary shift: the actual margin was recorded on the map the race was run on, so the expectation must sit on that turf too. The member&rsquo;s own House margins feed District TPL, which slightly shrinks House WAR.</> },
          { term: "Trend interpolation", def: "Presidential margins exist every four years; other years interpolate linearly between the bracketing ones (2018 = ½·2016 + ½·2020; 2025 clamps to 2024)." },
          { term: "Excluded", def: "Same-party generals and Louisiana's fragmented jungle generals (no R-vs-D margin to sign), and State Legislature rows (no candidate)." },
          { term: "Relocated House races", def: "Carry their boundary weight into the candidate-effect fit, discounted exactly as they are in District TPL." },
        ]} />
        <Block label="Structural money" meta="only the money a generic pair would have had goes into Expected">
          <P>The TPL strips the full fundraising gap because it wants the seat&rsquo;s lean. For a quality metric, money is partly the candidate. So the gap is split: the structural part — predicted from incumbency and the pre-money margin — enters Expected; the money a candidate raised <em>beyond</em> their situation stays in the residual and is credited to them. The prediction needs no receipts, so every non-imputed race gets the term.</P>
          <Formula lines={["structural gap% = a + b × incumbentSign + c × base"]} note="OLS per office over races with both receipts known; base = the expected margin before money." />
          <DataTable align="lrrrrr" head={["Office", "Intercept a", "Incumbent b", "Margin c", "Races", "R²"]} rows={(["S", "G", "H"] as const).map((o) => [OFFICE[o], signed(money[o].intercept), signed(money[o].incSign), signed(money[o].base, 2), money[o].n, money[o].r2.toFixed(2)])} />
        </Block>
      </Section>

      <Section id="effects" kicker="Number 2" title="Vs. Opponent (generic vs this opponent)"
        lede="A single race yields one residual for two candidates and cannot split it. Candidate effects are what make the opponent-specific expectation identifiable: they are estimated across every race each candidate has run.">
        <Formula lines={[
          `minimise  Σ w_j × (r_j − a_R + a_D)²  +  λ × Σ a_c²                      λ = ${WAR_LAMBDA}`,
          `w_j = boundary weight × decay^|year_j − Y|                               decay ${WAR_RECENCY_DECAY_STATEWIDE} statewide · ${WAR_RECENCY_DECAY} House`,
          "one solve per target year Y, warm-started — an effect is always \"as of\" the race being scored",
        ]} note="Weighted coordinate descent on the normal equations, to convergence (< 200 sweeps)." />
        <Defs items={[
          { term: "The ridge penalty", def: <>Encodes &ldquo;an unseen candidate is replacement level&rdquo;. A one-race candidate keeps what is left after a known opponent&rsquo;s effect, shrunk by 1/(1+λ); two one-race candidates split the residual evenly (⅓ each as effect, leaving ε = ⅓), so each books a WAR of ⅔ of it.</> },
          { term: "Pooling", def: <>Effects are keyed <Code>state | party | normalized name</Code> and pooled across offices: Hogan&rsquo;s Governor and Senate races inform one effect.</> },
          { term: "Recency", def: "The race being scored always carries full weight; a candidate's other races fade with distance. The same candidate therefore shows different effects on different rows. Measured persistence of repeat candidates' residuals: slope ≈ 0.45 at 1–4 year gaps, 0.26 at 5–6, ≈ 0 at 7–9." },
          { term: "Effective races", def: "Σ of the recency weights, shown beside each Effect on the WAR tab." },
          { term: "The replacement is a non-incumbent", def: <>Expected carries the office&rsquo;s incumbency term, so the ridge measures an incumbent against a generic <em>incumbent</em> — the right basis for isolating quality (that is the Effect column, and what the forecast uses). WAR asks a different question: how much better than freely available talent, and freely available talent never holds the seat. So an incumbent&rsquo;s row adds back <strong>Incumb.</strong> = Expected minus the same expectation with no incumbent in the race: the office&rsquo;s incumbency term plus the incumbent share of the structural money term, re-priced on the open-seat margin. Challengers and open seats add nothing (the opponent&rsquo;s incumbency is a fact of the race either way); appointed incumbents carry no incumbency term, so only the money share. Part of the incumbency advantage is deterrence of strong challengers, and that part is already netted out through the opponent&rsquo;s effect, so the add-back does not double-count it.</> },
        ]} />
        <Constants rows={[
          { name: "WAR_LAMBDA", value: WAR_LAMBDA, basis: "measured", meaning: "Ridge penalty on candidate effects.", source: "Leave-one-out persistence of repeat candidates' residuals: r = 0.66 (0.38 excluding |r| > 25), slope 0.68 → λ ≈ 1. Harness calibration by leave-one-race-out is deferred." },
          { name: "WAR_RECENCY_DECAY", value: WAR_RECENCY_DECAY, basis: "measured", meaning: "Per-year fade of a past House race (2 yrs 0.64 · 4 yrs 0.41 · 8 yrs 0.17).", source: "Tracks the measured persistence curve." },
          { name: "WAR_RECENCY_DECAY_STATEWIDE", value: WAR_RECENCY_DECAY_STATEWIDE, basis: "decision", meaning: "The same for Senate / Governor / President races: a statewide brand persists longer.", source: "Decay sweep flat within 0.06 MAE across 0.8–1.0." },
          { name: "FF_K · FF_MAX", value: `${FF_K} · ±${FF_MAX}`, basis: "calibrated", meaning: "Points per point of STRUCTURAL money gap in Expected, and its cap — the TPL strip's constants." },
        ]} />
      </Section>

      <Section id="war" kicker="Number 3 · worked example, live" title="Candidate WAR"
        lede={<><Name row={ex} />, {ex.year} {ex.state} {OFFICE[ex.office]}{opp ? <> against <Name row={opp} /></> : null}.</>}>
        <Ledger lines={[
          { label: "Expected Result", note: "generic vs generic", value: <M v={ex.expected} /> },
          { op: "+", label: "Opponent's effect", note: opp ? `${opp.candidate} ${signed(ex.opponentEffect)} toward their own side` : "no opponent on file", value: <M v={-s * ex.opponentEffect} /> },
          { op: "+", label: "Own incumbency, removed", note: ex.replacementPts !== 0 ? `Incumb. ${signed(ex.replacementPts)} toward the candidate: a replacement would not hold the seat` : "not the incumbent", value: <M v={-s * ex.replacementPts} /> },
          { op: "=", label: "Vs. Opponent", note: "generic non-incumbent vs this opponent", value: <M v={ex.expectedVsOpponent} />, total: true },
          { label: "Actual", value: <M v={ex.actual} /> },
          { op: "=", label: "Candidate WAR", note: `own effect ${signed(ex.effect)} (${ex.effectN} races, ${ex.effectW.toFixed(1)} effective) + leftover ${signed(ex.war - ex.effect - ex.replacementPts)} + incumbency ${signed(ex.replacementPts)}`, value: <War v={ex.war} />, total: true },
        ]} />
        <P>Identity on every row: WAR = s × (Actual − Vs. Opponent) = own effect + s × ε + Incumb. The Residual column on the WAR tab is s × (Actual − Expected), the race&rsquo;s net two-candidate effect before attribution. Margins are colored by the party they favor (<D>D+</D> / <R>R+</R>); WAR is candidate-signed, so it is not.</P>
        <Block label="Highest and lowest" meta="down-ballot rows, live">
          <DataTable align="llrrrr" maxWidth="max-w-4xl" head={["Candidate", "Race", "Actual", "Expected", "Vs. Opp", "WAR"]} rows={[...top.map(rowOf), ...bottom.map(rowOf)]} />
        </Block>
      </Section>

      <Section id="forward" kicker="Two versions" title="WAR on the tab vs. the forecast's Candidates term">
        <DataTable align="lll" maxWidth="max-w-4xl" head={["", "WAR tab", "Forecast → Candidates"]} rows={[
          ["Money in Expected", `Structural gap only, k ${FF_K} cap ±${FF_MAX}`, `FULL residual-basis money (k ${F.MONEY_K.H}/${F.MONEY_K.S}/${F.MONEY_K.G}) — money is its own forward term`],
          ["Incumbency", "Stripped from Expected for the ridge; an incumbent's own incumbency added back to WAR (Incumb.)", "Stripped from the effects; the forecast adds incumbency as its own term"],
          ["Reads as", "Value over a replacement-level (non-incumbent) nominee, money beyond the situation included", "Quality net of money and incumbency"],
          ["Solved as of", "Each race's own year", "2026, from races through 2025"],
          ["Used for", "The WAR column", <>QUALITY_WEIGHT × (effect_R − effect_D) — see {link("/methodology/forecast#candidates", "Forecast")}</>],
        ]} />
      </Section>

      <Section id="limits" kicker="Open items" title="Known limitations">
        <Defs items={[
          { term: "House self-influence", def: "Same-candidate persistence of House WAR from 2022 to 2024 is .37 against .58 for Split Ticket's metric, because the district anchor contains the candidate's own margins. Proposed fix: jackknife District TPL per candidate, or anchor House to president + swing." },
          { term: "One national environment", def: "A single E(year) scaled by β* can flip sign against a per-state environment (HI, NH in 2024)." },
          { term: "Window", def: "Records start in 2016: Baker, Manchin and Justice are one-race candidates here. House coverage before 2022 is thin." },
          { term: "No standard error", def: "Effects carry an effective race count but no interval." },
          { term: "Benchmarks", def: "Inside Elections VAR ≈ our residual ÷ 2 (r .93; share vs margin scale). Split Ticket WAR vs our residual r .84 (Senate .90, House .80). Both comparisons are on the residual, not WAR: Split Ticket controls for incumbency, Strength in Numbers counts it toward WAR as we now do, Inside Elections leaves it in the score." },
        ]} />
      </Section>

      <Section id="files" kicker="Reference" title="Code and commands">
        <FilesAndCommands files={[
          { path: "lib/tplCompute.ts", role: "buildWarPending (anchors, trend, shift), computeWarTable, fitWarMoneyModel, solveCandidateEffects, attributeWar; computeCandidateEffects for the forecast." },
          { path: "components/TplModelPage.tsx", role: "The WAR sub-tab." },
        ]} commands={[
          { cmd: "npx tsx scripts/forwardBacktest.ts --env struct --quality · --decay-sweep", does: "The leakage-free test of whether candidate effects predict forward, and of the decay." },
          { cmd: "npx playwright test -g war", does: "WAR tab filters and column count." },
        ]} />
      </Section>
    </>
  );
}

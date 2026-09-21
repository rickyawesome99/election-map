import Link from "next/link";
import { FORECAST_CONSTANTS as F, TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { FORECAST_CALIBRATION as CAL } from "@/data/forecastCalibration";
import { nationalEnvironmentHistory } from "@/data/nationalEnvironmentHistory";
import { racePolls } from "@/data/racePolls";
import { genericBallotPolls } from "@/data/genericBallotPolls";
import { ALIGNED_INDEPENDENTS } from "@/data/raceEligibility";
import { senateForecasts, governorForecasts, houseForecasts, getChamberSimulations, SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE, type ForecastedRace } from "@/lib/forecast";
import {
  getTplFit, getEnvironmentModel, getNationalEnvironment, getWarMoneyModel, incumbentAdvantage, liveHouseEffects,
  calculateStateTpl, calculateDistrictTpl, effectiveEnvironment, computeIncumbentPts, raceMoneyTerm, candidateQuality,
  computeCandidateEffects, FF_K, FF_MAX, WAR_LAMBDA, WAR_RECENCY_DECAY, WAR_RECENCY_DECAY_STATEWIDE,
} from "@/lib/tplCompute";
import { alignedParty } from "@/data/raceEligibility";
import { formatProjectedMargin, projectedMarginColor } from "@/lib/colorScale";
import { Block, Code, Constants, D, DataTable, Defs, Derivation, FilesAndCommands, Formula, Ledger, M, N, P, R, Section, pct, signed } from "./kit";

const OFFICES = ["H", "S", "G"] as const;
const OFFICE_NAME = { H: "House", S: "Senate", G: "Governor" } as const;
const hsg = (o: Record<"H" | "S" | "G", number>, fmt: (v: number) => string = String) => `H ${fmt(o.H)} · S ${fmt(o.S)} · G ${fmt(o.G)}`;

// Every FORECAST_CONSTANTS key and the section of this tab that documents it. `satisfies` makes the
// type-check fail when a constant is added without being documented here.
const DOCUMENTED_IN = {
  ENV_MISS_SHRINK: "environment", ENV_DAYS_MID_SEPT_TO_ELECTION: "environment",
  APPOINTED_INCUMBENCY_SHARE: "incumbency",
  MONEY_BASIS: "fundraising", MONEY_K: "fundraising", MONEY_CAP: "fundraising", PARTIAL_CYCLE_GAP_SCALE: "fundraising",
  QUALITY_WEIGHT: "candidates", OBSERVABLE_PRIOR_FEATURES: "candidates",
  POLL_K: "polling", POLL_SIGMA: "polling", POLL_AGING_SHARE: "polling", HOUSE_EFFECTS: "polling", HOUSE_EFFECT_K: "polling",
  HOUSE_EFFECT_WINDOW_DAYS: "polling", HOUSE_EFFECT_PARTISAN_PRIOR: "polling", HOUSE_EFFECT_CAP: "polling",
  RACE_SIGMA: "uncertainty", DEMOGRAPHIC_SHOCK: "chambers",
} satisfies Record<keyof typeof F, string>;

/** The live ledger of one race, term by term — the same numbers its race page shows. */
function ledgerOf(race: ForecastedRace) {
  const tpl = race.raceType === "house" ? calculateDistrictTpl(race.id) : calculateStateTpl(race.stateAbbr, race.state);
  const inc = [race.candidates?.dem, race.candidates?.rep].find((c) => c?.incumbent) ?? null;
  const incPts = computeIncumbentPts(race.office, inc ? alignedParty(inc) : null, inc?.appointed ?? false);
  return { tpl, env: effectiveEnvironment(race.stateAbbr), incPts, money: raceMoneyTerm(race), quality: candidateQuality(race) };
}

export default function ForecastMethodology() {
  const fit = getTplFit();
  const envModel = getEnvironmentModel();
  const env = getNationalEnvironment();
  const inc = incumbentAdvantage();
  const money = getWarMoneyModel();
  const sims = getChamberSimulations();
  const all = [...senateForecasts, ...governorForecasts, ...houseForecasts];
  const byOffice = { H: houseForecasts, S: senateForecasts, G: governorForecasts };
  const polled = (rs: ForecastedRace[]) => rs.filter((r) => r.pollMargin != null).length;
  const decided = all.filter((r) => r.contest !== "contested");
  const withQuality = (rs: ForecastedRace[]) => rs.filter((r) => Math.abs(candidateQuality(r).pts) > 1e-9).length;
  const withMoney = (rs: ForecastedRace[]) => rs.filter((r) => raceMoneyTerm(r).known).length;
  const betas = Object.entries(fit.beta).filter(([, b]) => b.n > 0).sort((a, b) => a[1].shrunk - b[1].shrunk);
  const houseFx = liveHouseEffects().table;
  const pollCount = Object.values(racePolls).reduce((a, p) => a + p.length, 0);
  const effects = computeCandidateEffects();

  // Worked example: the closest polled Senate race.
  const example = [...senateForecasts].filter((r) => r.contest === "contested" && r.pollMargin != null).sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0] ?? senateForecasts[0];
  const ex = ledgerOf(example);
  const wPoll = example.pollWeight, wModel = 1 - wPoll;
  const partyPts = (v: number) => (Math.abs(v) < 0.05 ? <span style={{ color: "var(--app-text-very-muted)" }}>0</span> : <M v={v} />);

  const officeName = (o: string) => OFFICE_NAME[o as "H" | "S" | "G"];

  return (
    <>
      <Section id="overview" kicker="Forecast · House, Senate, Governor" title="One equation, three offices"
        lede={<>All {all.length} races on the <Link href="/senate" className="underline underline-offset-2">Forecast</Link> tab are projected by the same additive model. A structural <strong>Model</strong> margin is built from the seat&rsquo;s partisan lean and four adjustments, then blended with the race&rsquo;s <strong>Polling Average</strong> in proportion to how much polling evidence exists. All margins are R-positive: <R>R+</R> is a Republican lead, <D>D+</D> a Democratic one. House, Senate and Governor differ only in which lean they start from and in the per-office constants listed below.</>}>
        <Derivation rows={[
          { name: "Model", formula: "TPL + Environment + Incumbent + Fundraising + Candidates" },
          { name: "Projected Margin", formula: "(1 − w) × Model + w × Polling Avg" },
          { name: "w", formula: "nEff / (nEff + POLL_K)", now: "0 with no polls" },
          { name: "σ²", formula: "(β*·σ_E)² + ((1 − w)·RACE_SIGMA)² + (w·POLL_SIGMA)²" },
          { name: "Win Probability", formula: "Φ(−Projected Margin / σ)" },
          { name: "Rating", formula: "band of the Projected Margin", now: "Tilt < 1 · Lean < 5 · Likely < 15 · Safe" },
        ]} />
        <Block label="Worked example" meta={<>live · <Link href={`/senate/${example.id.toLowerCase().replace(/-2$/, "2")}`} className="underline underline-offset-2">{example.state} Senate</Link>, the closest polled Senate race right now</>}>
          <Ledger lines={[
            { label: "State TPL", note: "structural lean, neutral year", value: <M v={ex.tpl} /> },
            { op: "+", label: "Environment", note: `β* ${example.beta.toFixed(2)} × E ${signed(env.eHat)}`, value: <M v={ex.env} /> },
            { op: "+", label: "Incumbent", note: ex.incPts === 0 ? "open seat or appointed incumbent" : undefined, value: partyPts(ex.incPts) },
            { op: "+", label: "Fundraising", note: ex.money.known ? `filed gap ${signed(ex.money.gapPct ?? 0, 0)}% · typical ${signed(ex.money.structuralGapPct ?? 0, 0)}%` : "receipts not on file — typical gap assumed", value: partyPts(ex.money.pts) },
            { op: "+", label: "Candidates", note: `weight ${F.QUALITY_WEIGHT.S} × (R effect ${signed(ex.quality.rep?.effect ?? 0)} − D effect ${signed(ex.quality.dem?.effect ?? 0)})`, value: partyPts(ex.quality.pts) },
            { op: "=", label: "Model", note: `${pct(wModel)} weight`, value: <M v={example.model} />, total: true },
            { label: "Polling Avg", note: `${pct(wPoll)} weight · ${example.pollCount} pollsters`, value: <M v={example.pollMargin} /> },
            { op: "=", label: "Projected Margin", note: `σ ${example.sigma.toFixed(1)} · ${example.probability >= 0.5 ? "D" : "R"} ${pct(Math.max(example.probability, 1 - example.probability))} · ${example.rating}`, value: <span style={{ color: projectedMarginColor(example.margin) }}>{formatProjectedMargin(example.margin)}</span>, total: true },
          ]} />
        </Block>
        <Block label="By office" meta="every constant that differs between the three forecasts">
          <DataTable align="lrrr" head={["", "House", "Senate", "Governor"]} rows={[
            ["Races forecast", ...OFFICES.map((o) => byOffice[o].length)],
            ["Lean the Model starts from", <Link key="d" href="/methodology/district-tpl" className="underline underline-offset-2">District TPL</Link>, <Link key="s" href="/methodology/state-tpl" className="underline underline-offset-2">State TPL</Link>, <Link key="g" href="/methodology/state-tpl" className="underline underline-offset-2">State TPL</Link>],
            ["Incumbency (pts)", ...OFFICES.map((o) => `${inc[o].toFixed(1)}${o === "H" ? " fixed" : " fitted"}`)],
            ["Money: k / cap", ...OFFICES.map((o) => `${F.MONEY_K[o]} / ±${F.MONEY_CAP[o]}`)],
            ["Candidate weight", ...OFFICES.map((o) => F.QUALITY_WEIGHT[o])],
            ["Poll k (one fresh poll =)", ...OFFICES.map((o) => `${F.POLL_K[o]} (${pct(1 / (1 + F.POLL_K[o]))})`)],
            ["Race σ, model alone", ...OFFICES.map((o) => F.RACE_SIGMA[o])],
            ["Race σ, polls alone", ...OFFICES.map((o) => F.POLL_SIGMA[o])],
            ["Races with polls now", ...OFFICES.map((o) => `${polled(byOffice[o])} of ${byOffice[o].length}`)],
            ["Receipts on file, both sides", ...OFFICES.map((o) => `${withMoney(byOffice[o])} of ${byOffice[o].length}`)],
            ["Non-zero Candidates term", ...OFFICES.map((o) => `${withQuality(byOffice[o])} of ${byOffice[o].length}`)],
            ["Backtest MAE, model alone", ...OFFICES.map((o) => CAL.pooled.find((p) => p.office === o)?.mae.toFixed(2) ?? "—")],
          ]} />
        </Block>
      </Section>

      <Section id="lean" kicker="Term 1" title="Partisan lean (TPL)"
        lede={<>The starting point is the seat&rsquo;s True Partisan Lean: the margin a generic Republican against a generic Democrat would produce in a neutral national year. It is an absolute margin, not a lean relative to the nation. Senate and Governor races read the <Link href="/methodology/state-tpl" className="underline underline-offset-2">State TPL</Link>; House races read the <Link href="/methodology/district-tpl" className="underline underline-offset-2">District TPL</Link>, which is built on the 2026 lines.</>}>
        <P>Because TPL is built by stripping incumbency, fundraising and the national environment out of past results, the forecast adds the same three things back for 2026 with the same tables. A change to a strip therefore moves the forecast twice, in opposite directions, and mostly cancels; a change to the lean itself moves it one for one.</P>
      </Section>

      <Section id="environment" kicker="Term 2" title="National environment"
        lede={<>The generic ballot is not added to a race directly. It is converted onto the model&rsquo;s own environment scale E, then multiplied by the state&rsquo;s elasticity β*. Polling error is treated as uncertainty, not as a prediction.</>}>
        <Derivation rows={[
          { name: "GB", formula: "generic-ballot average", now: <M v={env.gb} /> },
          { name: "PV_hat", formula: `GB + ${F.ENV_MISS_SHRINK} × mean(House vote − final GB)`, now: <><M v={env.gb} /> + {F.ENV_MISS_SHRINK} × <M v={envModel.meanMiss} /> = <M v={env.pvHat} /></> },
          { name: "E_hat", formula: "c + s × PV_hat", now: <>{signed(envModel.c, 2)} + {envModel.s.toFixed(2)} × PV_hat = <M v={env.eHat} /></> },
          { name: "σ_E", formula: "|s| × √( sd(miss)² + (horizon × rms(drift))² )", now: <>{envModel.s.toFixed(2)} × √({envModel.sdMiss.toFixed(1)}² + ({env.horizon.toFixed(2)} × {envModel.sdDrift.toFixed(1)})²) = <N>{env.sigmaE.toFixed(2)}</N></> },
          { name: "Environment pts", formula: "β*(state) × E_hat", now: <>e.g. β* 1.00 → <M v={env.eHat} /></> },
        ]} note={<>horizon = days to the election ÷ {F.ENV_DAYS_MID_SEPT_TO_ELECTION}, capped at 1.5 ({Math.round(env.daysToElection)} days → {env.horizon.toFixed(2)}), so σ_E narrows as election day approaches.</>} />
        <Block label="Generic-ballot average" meta={`${genericBallotPolls.length} polls on file`}>
          <Defs items={[
            { term: "One poll per pollster", def: "Only each pollster's most recent survey counts, so weekly trackers cannot dominate by volume." },
            { term: "Recency", def: "Full weight for 14 days after the field period ends, then halving every further 14 days." },
            { term: "Sample size", def: "Weight ∝ √sample, capped at 3,000; an unpublished sample takes the median of the others." },
            { term: "Average", def: <>Σ weight × (R% − D%) ÷ Σ weight. Currently <M v={env.gb} />.</> },
          ]} />
        </Block>
        <Block label="Why a conversion" meta={`c and s fitted over ${envModel.years.join(", ")}`}>
          <P>E(year) is fitted jointly across every office and centered on the 2016–2025 average, so it is damped relative to the House popular vote: a one-point move in the House vote is worth {envModel.s.toFixed(2)} points of E, and E is zero when the House vote is <M v={envModel.pv0} />. Both numbers are properties of this model, so they are regressed from the model&rsquo;s own fitted E against the actual House vote rather than assumed.</P>
          <DataTable align="lrrrrr" head={["Year", "Fitted E", "GB mid-Sept", "GB final", "House vote", "Miss (vote − final GB)"]}
            rows={nationalEnvironmentHistory.filter((r) => fit.E[r.year] != null && r.housePv != null).map((r) => [
              r.year, <M key="e" v={fit.E[r.year]} />, <M key="s" v={r.gbMidSept} />, <M key="f" v={r.gbFinal} />, <M key="p" v={r.housePv} />, <M key="m" v={r.housePv != null && r.gbFinal != null ? r.housePv - r.gbFinal : null} />,
            ])}
            caption={<>Mean miss <M v={envModel.meanMiss} />, sd {envModel.sdMiss.toFixed(1)}; September→November drift rms {envModel.sdDrift.toFixed(1)}. Mid-September generic-ballot values are approximate and flagged in <Code>data-entry/national_environment_history.csv</Code>.</>} />
        </Block>
        <Block label="State elasticity β*" meta={`range ${betas[0]?.[1].shrunk.toFixed(2)} (${betas[0]?.[0]}) to ${betas.at(-1)?.[1].shrunk.toFixed(2)} (${betas.at(-1)?.[0]})`}>
          <P>β* is how strongly a state moves with the national environment, fitted alongside TPL and shrunk halfway to 1: β* = clamp(1 + {G.BETA_SHRINK} × (β̂ − 1), {G.BETA_MIN}, {G.BETA_MAX}). A House race uses its state&rsquo;s β*. See <Link href="/methodology/state-tpl#fit" className="underline underline-offset-2">State TPL → the fit</Link>.</P>
        </Block>
        <Constants rows={[
          { name: "ENV_MISS_SHRINK", value: F.ENV_MISS_SHRINK, basis: "decision", meaning: "Share of the historical mean generic-ballot miss applied to the point estimate. The remainder, and all of the miss's variance, live in σ_E.", source: "Polling gaps are not predictable; half is a hedge between trusting and ignoring the average miss." },
          { name: "ENV_DAYS_MID_SEPT_TO_ELECTION", value: F.ENV_DAYS_MID_SEPT_TO_ELECTION, basis: "data", meaning: "The horizon the drift variance in the history table was measured over; drift scales linearly with days remaining." },
          { name: "c, s", value: `${signed(envModel.c, 2)}, ${envModel.s.toFixed(2)}`, basis: "fitted", meaning: "E = c + s × House popular vote, OLS over the even years on file.", source: <Code>getEnvironmentModel()</Code> },
          { name: "σ_E", value: env.sigmaE.toFixed(2), basis: "fitted", meaning: "Shared national error on the E scale. Every race carries β* × σ_E, and the chamber simulation draws it once per run.", source: <Code>getNationalEnvironment()</Code> },
        ]} />
      </Section>

      <Section id="incumbency" kicker="Term 3" title="Incumbency"
        lede={<>Points for an incumbent seeking re-election, toward the incumbent&rsquo;s party. An open seat scores 0. The same table is what TPL strips from past results.</>}>
        <DataTable align="lrrl" head={["Office", "Points", "Rows behind it", "How set"]} rows={[
          ["House", `±${inc.H.toFixed(1)}`, "—", "Fixed. A state-level lean cannot separate House incumbency from district lean, so it is not fitted there; a sweep through strip, candidate effects and forward term puts the optimum at 2.5–3."],
          ["Senate", `±${inc.S.toFixed(1)}`, fit.incumbencyN.S, "Fitted inside the TPL fit from incumbent-held Senate races, with the fundraising strip already applied."],
          ["Governor", `±${inc.G.toFixed(1)}`, fit.incumbencyN.G, "Fitted the same way from incumbent-held Governor races."],
        ]} caption="Because the fitted values are estimated after the fundraising strip, they are the advantage NET of the money incumbents raise — incumbency and fundraising cannot double-count." />
        <Defs items={[
          { term: "Appointed incumbents", def: <>An incumbent who holds the seat by appointment or succession and has never won it receives <N>{pct(F.APPOINTED_INCUMBENCY_SHARE)}</N> of the advantage — scored as an open seat, with no penalty either. Of nine historical appointees, eight ran behind an open-seat generic nominee even with no incumbency credited.</> },
          { term: "Aligned independents", def: <>An independent who stands in for a party counts as that party&rsquo;s incumbent: {Object.entries(ALIGNED_INDEPENDENTS).map(([n, p]) => `${n} (${p})`).join(", ")}.</> },
          { term: "Not modeled", def: "Open-seat carryover for the outgoing party and a freshman-incumbent discount were both tested and rejected (see Tested, not adopted)." },
        ]} />
      </Section>

      <Section id="fundraising" kicker="Term 4" title="Fundraising"
        lede={<>Points for money raised beyond what a race like this normally sees. Incumbents and the favored party almost always out-raise, and lean and incumbency already account for that, so only the gap beyond the typical one is information.</>}>
        <Formula lines={[
          "gap%            = (R receipts − D receipts) / (R + D) × 100",
          "structural gap% = a + b × incumbentSign + c × preMoneyMargin        per office, clamped ±100",
          "                  preMoneyMargin = TPL + Environment + Incumbent   incumbentSign: R +1 · D −1 · open 0",
          "Fundraising pts = clamp( MONEY_K × (PARTIAL_CYCLE_GAP_SCALE × gap% − structural gap%), ±MONEY_CAP )",
        ]} />
        <Block label="Structural money model" meta="the gap a generic pair in the same situation would have — re-fitted live">
          <DataTable align="lrrrrr" head={["Office", "Intercept a", "Incumbent b", "Margin c", "Races", "R²"]} rows={OFFICES.map((o) => [OFFICE_NAME[o], signed(money[o].intercept), signed(money[o].incSign), signed(money[o].base, 2), money[o].n, money[o].r2.toFixed(2)])}
            caption="OLS over every 2016–2025 race with both nominees' receipts known. Read b as: incumbency alone is worth that many points of money gap." />
        </Block>
        <Constants rows={[
          { name: "MONEY_BASIS", value: F.MONEY_BASIS, basis: "calibrated", meaning: "Pay points on the residual gap (beyond structural) rather than the raw gap.", source: "forwardBacktest --money: raw gap S 5.61 / G 9.20 / H 4.81 → residual 5.04 / 8.90 / 4.59; raw House money was worse than no money at all (4.76)." },
          { name: "MONEY_K", value: hsg(F.MONEY_K), basis: "calibrated", meaning: "Points of margin per point of residual gap.", source: "Senate keeps improving to the sweep edge and is kept one step inside; House is flat across .04–.06; Governor takes the conservative pair (no September snapshot to confirm on)." },
          { name: "MONEY_CAP", value: hsg(F.MONEY_CAP, (v) => `±${v}`), basis: "calibrated", meaning: "Most the term can move a race. Self-funders hit it." },
          { name: "PARTIAL_CYCLE_GAP_SCALE", value: hsg(F.PARTIAL_CYCLE_GAP_SCALE), basis: "calibrated", meaning: "2026 receipts are a mid-September snapshot; past cycles are full-cycle. The trailing side closes about a tenth of the gap late.", source: "gap_final = 0.91 × gap_sept (Senate, n 63) / 0.90 × (House, n 380), from FEC report summaries for 2022 and 2024. Governor borrows the value." },
        ]} />
        <Defs items={[
          { term: "Receipts unknown", def: "A race with either side's receipts missing scores 0 points, which under the residual basis means \"the typical gap for this situation is assumed\". Imputing the structural gap under the raw basis was tested and rejected." },
          { term: "Sources", def: <>House and Senate: FEC candidate-committee total receipts. Governor: state filings (TransparencyUSA, FollowTheMoney, state portals). Both sides of a race always come from one source. Source of truth: <Code>data-entry/fundraising_2016_2026.csv</Code>.</> },
          { term: "$0 vs blank", def: "$0 means a confirmed non-filer (under the FEC's $5,000 threshold); blank means unknown. Only blank is treated as missing." },
        ]} />
      </Section>

      <Section id="candidates" kicker="Term 5" title="Candidates"
        lede={<>Each nominee&rsquo;s track record: how much better than a generic nominee of their party they have run before, net of lean, environment, incumbency and money. A nominee with no general-election record on file is a generic nominee (0).</>}>
        <Formula lines={[
          "Candidates pts = QUALITY_WEIGHT[office] × (effect_R − effect_D)",
          "effect         = ridge candidate effect, solved as of 2026 over every scorable race 2016–2025",
          `                 minimise Σ w·(r − a_R + a_D)² + λ·Σ a²        λ = ${WAR_LAMBDA}`,
          `                 w = decay^(2026 − year)   decay ${WAR_RECENCY_DECAY_STATEWIDE} statewide · ${WAR_RECENCY_DECAY} House`,
          "r              = actual − (lean-in-that-year + β*·E + incumbency + FULL-money points)",
        ]} note={<>The effects are the same machinery as <Link href="/methodology/war" className="underline underline-offset-2">WAR</Link>, with one difference: here the expected margin includes the full residual-basis money term, so that money stays a separate forward term and the effect does not contain it.</>} />
        <Constants rows={[
          { name: "QUALITY_WEIGHT", value: hsg(F.QUALITY_WEIGHT), basis: "calibrated", meaning: "Multiplier on the effect difference, per office.", source: "forwardBacktest --quality, leakage-free (effects rebuilt as of each test year): House error bottoms near 0.75, Senate at 1.0, Governor keeps improving past 1.5 (persistent personal brands) and is held off the sweep edge." },
          { name: "WAR_LAMBDA", value: WAR_LAMBDA, basis: "measured", meaning: "Ridge penalty: an unseen candidate is replacement level. A one-race candidate keeps 1/(1+λ) of what is left after a known opponent's effect.", source: "Matches the leave-one-out persistence slope (≈ 0.68) of repeat candidates' residuals." },
          { name: "WAR_RECENCY_DECAY", value: `${WAR_RECENCY_DECAY} House · ${WAR_RECENCY_DECAY_STATEWIDE} statewide`, basis: "decision", meaning: "Per-year fade of a past race's weight. A statewide personal brand is assumed to persist longer than a House record.", source: "forwardBacktest --decay-sweep is flat within 0.06 MAE across 0.8–1.0." },
          { name: "OBSERVABLE_PRIOR_FEATURES", value: F.OBSERVABLE_PRIOR_FEATURES.length ? F.OBSERVABLE_PRIOR_FEATURES.join(", ") : "[ ] (off)", basis: "off", meaning: "Optional prior from observables (prior office tier, prior win) used as the ridge shrinkage target and as the whole term for a nominee with no record.", source: "Net of the full money gap it carries nothing: no feature set moves pooled MAE by more than 0.02." },
        ]} />
        <Defs items={[
          { term: "Matching", def: <>Records are keyed <Code>state | party | normalized name</Code> and pooled across offices, so a House record follows a member into a Senate race. The name must match the historical spelling exactly; a surname fallback was rejected after it paired John E. Sununu with Chris Sununu&rsquo;s races.</> },
          { term: "Coverage", def: <>{effects.size.toLocaleString()} candidates have an effect on file; {withQuality(all)} of {all.length} races carry a non-zero term.</> },
          { term: "Placeholders", def: "A placeholder nominee (\"Democratic Candidate\", TBD) scores 0." },
        ]} />
      </Section>

      <Section id="polling" kicker="Blend" title="Race polling"
        lede={<>Where a race has general-election polls, their average is a second estimate of the same margin. It earns its share of the projection by evidence: no polls, the Model stands alone; many fresh polls, they dominate. {pollCount.toLocaleString()} polls across {Object.keys(racePolls).length} races are on file, and {polled(all)} races currently carry a polling average.</>}>
        <Formula lines={[
          "poll margin_i = (R% − D%) + aging shift_i − house effect_i",
          "weight_i      = recency_i × √min(sample_i, 3000)         recency: 1 for 14 days, then halving every 14",
          "Polling Avg   = Σ weight_i × poll margin_i / Σ weight_i   one poll per pollster (its latest)",
          "nEff          = Σ recency_i                                effective number of fresh polls",
          "w             = nEff / (nEff + POLL_K[office])",
        ]} />
        <Block label="How much a poll average counts" meta="w by effective poll count">
          <DataTable align="lrrrrr" head={["Office", "k", "nEff 0.5", "1", "2", "4", "8"]} rows={OFFICES.map((o) => [OFFICE_NAME[o], F.POLL_K[o], ...[0.5, 1, 2, 4, 8].map((n) => pct(n / (n + F.POLL_K[o])))])} />
        </Block>
        <Block label="Poll aging">
          <Formula lines={["aging shift = POLL_AGING_SHARE × β*(state) × (GB now − GB on the poll's end date)"]}
            note="A poll reads the race on its field date; the national environment has moved since. The generic ballot on a past date is the live recipe over the polls completed by then (read at the first date with five pollsters for anything older)." />
        </Block>
        <Block label="House effects" meta={`${houseFx.length} pollster keys estimated this cycle`}>
          <Formula lines={[
            "poll margin = race level + house effect(pollster, partisan flag) + noise",
            "h           = (Σ (margin − race level) + k × prior) / (n + k),   |h| ≤ cap",
          ]} note={<>Solved by alternating means over every race at least two pollsters have polled in the window. A firm&rsquo;s party/campaign polls are tracked separately from its public work. Effects are relative to the field, not to the truth: they cannot fix a miss every pollster shares. Live table: <Link href="/analysis/pollsters" className="underline underline-offset-2">Pollster Ratings</Link>.</>} />
        </Block>
        <Constants rows={[
          { name: "POLL_K", value: hsg(F.POLL_K), basis: "decision", meaning: "Pseudo-polls of model evidence the poll average must outweigh.", source: "forwardBacktest --polls fitted Senate 3, Governor ≤ 0.1, House 1. Governor and House were raised to 2 so a single fresh poll carries at most a third of a projection (a one-poll Governor race had swung 15 pts); backtest cost Governor 6.1 → 7.4, House 3.57 → 3.65, both still well under model-only." },
          { name: "POLL_SIGMA", value: hsg(F.POLL_SIGMA), basis: "calibrated", meaning: "Robust spread of actual − poll average over polled races; enters the race σ with weight w." },
          { name: "POLL_AGING_SHARE", value: F.POLL_AGING_SHARE, basis: "decision", meaning: "1 = a race moves point-for-point (through β*) with the national ballot; 0 = never aged.", source: "Backtest effect is tiny (blend < 0.05) because old polls already carry little weight; 1 kept as the principled value." },
          { name: "HOUSE_EFFECTS", value: String(F.HOUSE_EFFECTS), basis: "calibrated", meaning: "Subtract each pollster's current-cycle lean from its polls.", source: "forwardBacktest --pollsters: Senate poll average 6.64 → 6.27 (mid-Sept), House 5.11 → 4.75." },
          { name: "HOUSE_EFFECT_K", value: F.HOUSE_EFFECT_K, basis: "calibrated", meaning: "Pseudo-polls shrinking each lean toward its prior. k 1–5 are within 0.03 of each other." },
          { name: "HOUSE_EFFECT_WINDOW_DAYS", value: F.HOUSE_EFFECT_WINDOW_DAYS, basis: "calibrated", meaning: "Only polls this recent inform the leans. 120–300 days are within 0.03." },
          { name: "HOUSE_EFFECT_CAP", value: `±${F.HOUSE_EFFECT_CAP}`, basis: "designed", meaning: "Bound on any one lean: two pollsters 30 pts apart on different question wordings is not a house effect. Neutral in the backtest (±0.02)." },
          { name: "HOUSE_EFFECT_PARTISAN_PRIOR", value: F.HOUSE_EFFECT_PARTISAN_PRIOR, basis: "off", meaning: "Prior lean assumed for a party or campaign poll before any evidence. A fixed prior helped the House poll average but hurt its blend." },
          { name: "Recency / sample", value: "14 d · 14 d · 3,000", basis: "designed", meaning: "Full-weight days, half-life days and sample cap of the averaging recipe, shared with the generic ballot.", source: <Code>lib/racePollAverage.ts</Code> },
        ]} />
        <Defs items={[
          { term: "What is ingested", def: "General-election polls naming both nominees, from the polling tables of each race's Wikipedia page. Partisan polls are kept and flagged (D)/(R): dropping or shifting them costs House coverage and accuracy." },
          { term: "Pollster grades", def: "Shown beside every poll but never a weight: a pollster's accuracy against the field has not carried into the next cycle (correlation 0.00)." },
          { term: "Multi-candidate tables", def: "Where a table lists several candidates of one party (pre-primary top-two, jungle), each party's candidates are summed and normalized to two-party." },
          { term: "Alaska Senate", def: "Only a poll's ranked-choice FINAL ROUND between the two finalists is entered, by hand. First-choice toplines are not ingested, and a re-scrape must not overwrite these rows." },
        ]} />
      </Section>

      <Section id="uncertainty" kicker="Output" title="Win probability, range and rating"
        lede={<>A race&rsquo;s error has two parts: a national miss shared by every race through β*, and noise of its own. The Model and the polling average err independently, so blending them narrows the race&rsquo;s own noise; the national part is kept in full because polls miss nationally too.</>}>
        <Formula lines={[
          "σ²            = (β* × σ_E)²  +  ((1 − w) × RACE_SIGMA)²  +  (w × POLL_SIGMA)²",
          "P(D wins)     = Φ(−margin / σ)          clamped to 0.5% – 99.5%",
          "80% range     = margin ± 1.2816 × σ",
        ]} />
        <Constants rows={[
          { name: "RACE_SIGMA", value: hsg(F.RACE_SIGMA), basis: "calibrated", meaning: "Race-level error of the Model alone, beyond the national shock.", source: <>forwardBacktest robust within-year spread now reads {CAL.pooled.map((p) => `${p.office} ${p.withinRsd}`).join(" · ")}, but those values under-cover; the live values cover {CAL.pooled.map((p) => `${p.office} ${pct(p.cover80)}`).join(" · ")} of results inside the 80% range.</> },
        ]} />
        <Block label="Rating bands" meta="a band of the projected MARGIN — never of the probability">
          <DataTable align="ll" maxWidth="max-w-md" head={["Rating", "Projected margin"]} rows={[["Tilt", "under 1 pt"], ["Lean", "1 to 5"], ["Likely", "5 to 15"], ["Safe", "15 or more"]]} caption="A projection always names a leader: a race inside ±0.05 reads D+0.0 or R+0.0, never EVEN." />
        </Block>
      </Section>

      <Section id="special" kicker="Rules" title="Races that are not one Democrat against one Republican"
        lede={<>{decided.length} of the {all.length} races are decided by rule rather than by margin.</>}>
        <Defs items={[
          { term: "Uncontested", def: <>One major party fielded no nominee (a placeholder name on one side). Decided: probability pinned at 99.5%, rating Safe, displayed margin floored at ±20 toward the unopposed party, no simulation noise. Currently {decided.filter((r) => r.contest.startsWith("uncontested")).length}.</> },
          { term: "Same-party general", def: <>Both general-election slots belong to one party after alignment (California top-two, an incumbent-vs-incumbent pairing). Decided the same way. Currently {decided.filter((r) => r.contest.startsWith("same-party")).length}.</> },
          { term: "Both nominees unknown", def: "Stays contested and is scored structurally with no incumbency or candidate term (Louisiana's open all-party primaries)." },
          { term: "Unaligned independents", def: "An independent standing in for a missing party (Osborn in Nebraska and six others) stays contested: structural margin, their own track record, and polls. A win counts toward the slot's party in the seat totals." },
          { term: "Louisiana House", def: "All six seats are a Nov 3 all-party primary with a Dec 12 runoff. The modeled margin is the party-summed R-vs-D quantity, so an R-vs-R runoff is still the modeled Republican win." },
          { term: "Exact tie", def: "If the blend lands on exactly 0 the side is taken from the Model, then the polls, then the pre-money lean." },
        ]} />
      </Section>

      <Section id="chambers" kicker="Aggregation" title="Seat counts and chamber control"
        lede={<>Summing win probabilities gives the expected seats but not their spread, because races miss together. Chamber totals come from {sims.house.sims.toLocaleString()} seeded simulations (the same seed on server and client, so the numbers never flicker).</>}>
        <Formula lines={[
          "simulated margin = margin + β* × z  +  load_nonwhite × z_nw  +  load_college × z_col  +  ε",
          `z ~ N(0, σ_E)                         one national shock per run, shared by every race`,
          `z_nw ~ N(0, ${F.DEMOGRAPHIC_SHOCK.nonwhite}) · z_col ~ N(0, ${F.DEMOGRAPHIC_SHOCK.college})       one shock per demographic axis per run`,
          "load = (race's share − average share of its kind) / 10      districts vs the 435, states vs the 50",
          "ε ~ N(0, idio)     idio² = max( ½² × raceVar, raceVar − demographic variance ),  raceVar = σ² − (β*·σ_E)²",
        ]} note="The demographic shock is carved OUT of each race's own noise, so a race's total spread and win probability are identical with or without it; only how seats move together changes. Decided races add their seat with no noise." />
        <DataTable align="lrrrrr" head={["Chamber", "Not up (D / R)", "Expected D seats", "80% range", "D control needs", "P(D control)"]} rows={(["house", "senate", "governor"] as const).map((t) => [
          t === "house" ? "House" : t === "senate" ? "Senate" : "Governors", `${SEAT_HOLDOVERS[t].dem} / ${SEAT_HOLDOVERS[t].rep}`, `${sims[t].meanDem.toFixed(1)} of ${TOTAL_SEATS_BY_TYPE[t]}`, `${sims[t].lo80}–${sims[t].hi80}`,
          sims[t].controlThreshold ?? "—", sims[t].pDemControl == null ? "—" : <span key="p" className="font-bold" style={{ color: sims[t].pDemControl! >= 0.5 ? "var(--party-dem)" : "var(--party-rep)" }}>{pct(sims[t].pDemControl!)}</span>,
        ])} caption="Senate control needs 51 Democratic seats: a 50–50 tie goes to the Republican vice president. Independents who caucus with the Democrats are counted with them." />
        <Constants rows={[
          { name: "DEMOGRAPHIC_SHOCK", value: `nonwhite ${F.DEMOGRAPHIC_SHOCK.nonwhite} · college ${F.DEMOGRAPHIC_SHOCK.college}`, basis: "measured", meaning: "sd of the per-cycle slope, in pts of margin per 10 pts of share (nonwhite = 100 − White alone non-Hispanic; college = adults 25+ with a BA).", source: "Nonwhite 1.5 = rms of the 2022 and 2024 House residual slopes (+1.3, +1.6). College 1.0 sits between the 0.5 those residuals show and the 3.0 rms of county presidential swings." },
          { name: "Simulations / seed", value: `${sims.house.sims.toLocaleString()} / 20261103`, basis: "designed", meaning: "Deterministic PRNG so every render agrees." },
        ]} />
        <P>A shock, not a trend: carrying 2022&rsquo;s nonwhite slope into 2024 would have helped, but the slope has flipped sign across cycles and the 2025 Governor results reversed 2024&rsquo;s. No demographic term enters the mean projection.</P>
      </Section>

      <Section id="calibration" kicker={`Backtest · generated ${CAL.generatedAt}`} title="Calibration"
        lede={<>The forward backtest predicts every eligible Senate and Governor race, and every House race on lines that have not since been redrawn, in {CAL.years.join(", ")} the way the site would have in mid-September of that year: lean, β*, E and incumbency are all re-fitted on years before the one being scored, candidate effects are rebuilt from earlier races only, and no national shift is removed before scoring. Model alone unless stated.</>}>
        <Block label="Pooled accuracy" meta="bias = actual − predicted, R-positive">
          <DataTable align="lrrrrrrr" maxWidth="max-w-4xl" head={["Office", "Races", "MAE", "Winner called", "Mean bias", "|Bias| per year", "80% range covers", "Brier"]} rows={CAL.pooled.map((p) => [
            officeName(p.office), p.n, p.mae.toFixed(2), pct(p.calledRight), <M key="b" v={p.bias} digits={2} />, p.meanAbsYearBias.toFixed(2), pct(p.cover80), p.brier.toFixed(3),
          ])} caption="Brier score of P(D wins) under the live spreads; a coin flip scores 0.250. A positive bias means results ran more Republican than predicted." />
        </Block>
        <Block label="Are the probabilities honest?" meta="all three offices pooled, live spreads">
          <DataTable align="lrrr" maxWidth="max-w-xl" head={["Forecast P(D wins)", "Races", "Mean forecast", "Democrat actually won"]} rows={CAL.calibration.map((b) => [
            `${pct(b.lo)} – ${pct(b.hi)}`, b.n, b.meanP == null ? "—" : pct(b.meanP, 1), b.demWon == null ? "—" : pct(b.demWon, 1),
          ])} />
        </Block>
        <Block label="What each term is worth" meta="pooled MAE when a term is dropped">
          <DataTable align="lrrr" maxWidth="max-w-xl" head={["Variant", "Senate", "Governor", "House"]} rows={CAL.ablation.map((a) => [a.variant, a.mae.S?.toFixed(2) ?? "—", a.mae.G?.toFixed(2) ?? "—", a.mae.H?.toFixed(2) ?? "—"])} />
        </Block>
        <Block label="What polls add" meta="polled races only, blend at the live POLL_K, no aging or house effects">
          <DataTable align="llrrrrr" maxWidth="max-w-4xl" head={["As of", "Office", "Polled / all", "MAE model", "MAE polls", "MAE blend", "Mean w"]} rows={CAL.polls.map((p) => [p.horizon, officeName(p.office), `${p.polled} / ${p.all}`, p.maeModel.toFixed(2), p.maePoll.toFixed(2), <N key="b">{p.maeBlend.toFixed(2)}</N>, p.meanW.toFixed(2)])} />
        </Block>
        <Block label="By year">
          <DataTable align="rlrrrrr" head={["Year", "Office", "Races", "E used", "MAE", "Bias", "r"]} rows={CAL.byYear.map((y) => [y.year, officeName(y.office), y.n, <M key="e" v={y.E} />, y.mae.toFixed(2), <M key="b" v={y.bias} digits={2} />, y.r.toFixed(2)])}
            caption="House rows exist only where no redraw is on file after that year — a handful of districts in 2018 and 2020. The backtest scores money with full-cycle receipts, a mild optimism against a September snapshot." />
        </Block>
      </Section>

      <Section id="rejected" kicker="So they are not re-tested blind" title="Tested, not adopted">
        <Defs items={[
          { term: "Open-seat carryover", def: "Points toward the outgoing holder's party: Senate −0.4 ± 1.2, House −1.1 ± 0.8, Governor −4.2 (−0.7 to −6.4 across folds). The sign is a retirement slump, and out-of-sample error does not improve." },
          { term: "Freshman-incumbent effect", def: "Senate −0.9 ± 1.0, House −1.0 ± 0.7, Governor +4.4 driven by 2018, when Baker, Hogan and Scott had no record on file. No out-of-sample gain." },
          { term: "Prior-office quality prior", def: "Net of the full money gap, holding prior office predicts nothing (state legislators −0.78 vs novices −0.77 as House challengers). The quality-challenger effect is expressed through receipts." },
          { term: "\"Impute, never zero\" money", def: "Giving every race with missing receipts the structural gap under the raw basis raised error in all three offices." },
          { term: "Pollster-accuracy weights", def: "Weighting polls by exp(−λ × rating score) moves no poll average at any strength; nor does subtracting a pollster's HISTORICAL house effect." },
          { term: "Dropping or shifting partisan polls", def: "Costs House coverage (104 → 68 polled races) and error (3.68 → 4.16); shifting them 3 or 6 pts toward the opponent also hurts." },
          { term: "Demographic trend term", def: "The nonwhite-share slope is real within a cycle but has flipped sign across cycles; kept as a simulation shock only." },
          { term: "Appointed-incumbent penalty", def: "Appointees ran a mean 5.6 pts behind an open-seat generic, but on n = 9; a negative share would be an extrapolation. Share stays 0." },
          { term: "Special-election over-performance", def: "Rejected as a metric by decision; not built." },
          { term: `Raw fundraising strip (k ${FF_K}, cap ${FF_MAX}) in the forecast`, def: "Still what TPL strips backward, but forward it was worse than no money term at all for the House." },
        ]} />
      </Section>

      <Section id="limits" kicker="Open items" title="Known limitations">
        <Defs items={[
          { term: "House bias", def: `The backtest shows House results running more Republican than predicted in 2022 and 2024 (pooled ${signed(CAL.pooled.find((p) => p.office === "H")?.bias ?? 0, 2)}).` },
          { term: "Governor", def: "The structural model is weakest here (personal brands, cross-party governors), which is why polls carry Governor races fastest. Governor money k and the partial-cycle scale are borrowed from House/Senate, and 15 of the 2026 races have no state filings on file." },
          { term: "House backtest coverage", def: "District presidential data is on 2026 lines only, so 2018 and 2020 contribute a handful of House rows; a wave-year district elasticity cannot be tested." },
          { term: "Environment history", def: "Five even years identify c, s and σ_E, and the mid-September generic-ballot values are approximate." },
          { term: "Pre-2016 records", def: "Candidate effects start in 2016, so long-tenured incumbents' earlier over-performance is invisible." },
          { term: "Poll freshness", def: "2026 polls are scraped from Wikipedia and need periodic re-scraping; expert ratings and state-legislature track records are not inputs." },
        ]} />
      </Section>

      <Section id="files" kicker="Reference" title="Code and commands">
        <Block label="Constant index" meta="every key of FORECAST_CONSTANTS, and where it is documented above">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            {Object.entries(DOCUMENTED_IN).map(([name, id]) => <a key={name} href={`#${id}`} className="hover:underline"><Code>{name}</Code></a>)}
          </div>
        </Block>
        <FilesAndCommands files={[
          { path: "lib/forecast.ts", role: "forecastRace (margin, σ, probability, rating, contest), seat totals, chamber simulation." },
          { path: "lib/tplCompute.ts", role: "projectRace, environment, incumbency, raceMoneyTerm, candidateQuality, raceSigma, winProbabilityD, racePollingFor." },
          { path: "lib/racePollAverage.ts · lib/pollsterHouseEffects.ts · lib/genericBallotAverage.ts", role: "Poll averaging, aging, house effects, generic ballot." },
          { path: "data/tplModelData.ts", role: "FORECAST_CONSTANTS — every tunable above, with its provenance comment." },
          { path: "lib/colorScale.ts", role: "marginToRating bands and colors." },
          { path: "data-entry/*.csv → data/*.ts", role: "Seats and nominees (build.js), race polls (build-race-polls.js), fundraising (generate-fundraising-data.py), environment history (build-national-environment.js)." },
        ]} commands={[
          { cmd: "npx tsx scripts/forwardBacktest.ts --env struct --emit", does: "Re-score the model and regenerate the Calibration tables on this page (data/forecastCalibration.ts)." },
          { cmd: "… --ablate · --money · --sept-money · --quality · --polls · --pollsters · --seat-status · --appointed · --decay-sweep · --prior-sweep", does: "The sweep behind each calibrated constant; run the matching one before changing it." },
          { cmd: "npx tsx scripts/tplBacktest.ts", does: "TPL tracking harness — must still PASS after any change to strips or the fit." },
          { cmd: "npx playwright test tests/e2e/forecast-derived.spec.ts", does: "Rating = band of the displayed margin on every list; race-page derived rows." },
        ]} />
      </Section>
    </>
  );
}

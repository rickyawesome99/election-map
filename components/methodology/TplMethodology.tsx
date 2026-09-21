import Link from "next/link";
import type { ReactNode } from "react";
import { TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { TPL_VALIDATION } from "@/data/tplValidation";
import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { houseData } from "@/data/forecastData";
import { ALIGNED_INDEPENDENTS } from "@/data/raceEligibility";
import {
  getTplFit, calculateStateModel, calculateDistrictModel, calculateCountyModel, getMedianStateTpl, incumbentAdvantage,
  FF_K, FF_MAX, IMPUTED_RACE_WEIGHT, type ComputedRace, type YearAggregation,
} from "@/lib/tplCompute";
import { Block, Code, Constants, DataTable, Defs, FilesAndCommands, Formula, Ledger, M, N, P, Section, pct, signed, type ConstantRow, type LedgerLine } from "./kit";

const TYPE_NAME: Record<string, string> = { P: "President", S: "Senate", H: "House", L: "State Legislature", G: "Governor" };
const link = (href: string, text: ReactNode) => <Link href={href} className="underline underline-offset-2">{text}</Link>;

// Every TPL_GLOBAL_CONSTANTS key and where it is documented (tab#section). `satisfies` makes the
// type-check fail when a constant is added without being documented here.
const DOCUMENTED_IN = {
  RACE_TYPE_WEIGHTS: "state-tpl#aggregation", YEAR_WEIGHTS: "state-tpl#aggregation", YEARS: "state-tpl#aggregation",
  HUBER_C: "state-tpl#fit", FIT_ITERATIONS: "state-tpl#fit", SPARSE_YEAR_K: "state-tpl#fit",
  BETA_SHRINK: "state-tpl#fit", BETA_MIN: "state-tpl#fit", BETA_MAX: "state-tpl#fit",
  BS_WEIGHT_K: "district-tpl#boundary",
} satisfies Record<keyof typeof G, string>;

// ── Pieces shared by the three lean models ───────────────────────────────────

function raceLedger(r: ComputedRace, opts: { bs?: boolean } = {}): LedgerLine[] {
  return [
    { label: r.imputed ? "Adjusted (imputed)" : "Raw margin", note: r.imputed ? `${r.imputedSourceDesc}, ${r.imputedSourceYear}` : "R% − D% of the full total vote", value: <M v={r.adjustedMargin} /> },
    { op: "+", label: "Incumbency strip", note: r.incumbent === "R" || r.incumbent === "D" ? `${r.incumbent} incumbent` : "open seat", value: <M v={r.incumbencyPts} /> },
    { op: "+", label: "Fundraising strip", note: r.ffDetail ? `receipts D $${(r.ffDetail.dem / 1e6).toFixed(1)}M · R $${(r.ffDetail.rep / 1e6).toFixed(1)}M` : "no receipts on file → 0", value: <M v={r.FF_pts} /> },
    ...(opts.bs ? [{ op: "+" as const, label: "Boundary shift", note: r.boundaryShift == null ? "run on today's lines" : `old lines ${signed(r.boundaryShift)} vs 2026 lines`, value: <M v={r.BS_pts ?? 0} /> }] : []),
    { op: "+", label: "Environment strip", note: "−β* × E(year)", value: <M v={r.envPts} /> },
    { op: "=", label: "Neutral margin (NM)", note: `aggregation weight ${r.aggWeight.toFixed(2)}`, value: <M v={r.NM} />, total: true },
  ];
}

function YearTable({ aggs }: { aggs: YearAggregation[] }) {
  const present = aggs.filter((a) => a.racesPresent.length > 0);
  return (
    <DataTable align="rlrrrr" head={["Year", "Offices present", "Coverage", "Recency", "Final weight", "Year margin (WRS)"]}
      rows={present.map((a) => [a.year, a.racesPresent.map((t) => `${t} ${pct(a.redistributedWeights[t])}`).join(" · "), a.coverage.toFixed(2), (G.YEAR_WEIGHTS[a.year] ?? 0).toFixed(3), pct(a.finalWeight, 1), <M key="w" v={a.WRS} />])}
      caption="Offices present shows each type's redistributed share within the year. Final weight = recency × coverage, normalized over the years with data." />
  );
}

const stripConstants = (): ConstantRow[] => {
  const inc = incumbentAdvantage();
  return [
    { name: "incumbency", value: `H ${inc.H.toFixed(1)} · S ${inc.S.toFixed(1)} · G ${inc.G.toFixed(1)}`, basis: "fitted", meaning: "Points the incumbent's party is worth, stripped toward the other party. Senate and Governor are fitted inside the fit; House is a fixed 3. President and State Legislature carry none.", source: <>See {link("/methodology/forecast#incumbency", "Forecast → Incumbency")}.</> },
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
        ["fragmented", "Louisiana jungle general decided without a runoff: the top candidate of each party understates split fields. Detected as D% + R% < 90 in LA", "Imputed"],
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
  const downweighted = allRaces.filter((r) => !r.imputed && r.aggWeight < 0.999).length;
  const betas = Object.entries(fit.beta).filter(([, b]) => b.n > 0).sort((a, b) => a[1].shrunk - b[1].shrunk);
  const oh = models.find((m) => m.abbr === "OH")!;
  const exRace = oh.calc.races.find((r) => r.race === "Senate" && r.year === 2022) ?? oh.calc.races.find((r) => r.raceType === "S")!;
  const ranked = [...models].sort((a, b) => a.calc.tpl - b.calc.tpl);

  return (
    <>
      <Section id="overview" kicker="State TPL · True Partisan Lean" title="A state's lean in a neutral year"
        lede={<>State TPL is the margin a generic Republican against a generic Democrat would produce in a neutral national year. It is built from every eligible race from 2016 to 2025 — President, Senate, Governor, House and State Legislature, odd years included — by stripping three additive distortions from each and averaging across offices and years. It is the lean the {link("/methodology/forecast", "Senate and Governor forecasts")} start from. Live ledgers: {link("/model/state", "TPL tab")}.</>}>
        <Formula lines={[
          "margin(state, race, year) = lean + β*·E(year) + incumbency + fundraising + residual",
          "NM   = Adjusted margin + incumbency strip + fundraising strip − β*·E(year)      each strip additive, applied once",
          "TPL  = Σ year weight × WRS(year)        WRS = type-weighted mean of that year's NMs",
          "Centered TPL = TPL − median of the 50 state TPLs",
        ]} note={<>R-positive throughout. Candidate quality is deliberately not a term: outlier candidates are downweighted instead, and their residuals become {link("/methodology/war", "WAR")}.</>} />
        <DataTable align="lr" maxWidth="max-w-md" head={["Now", ""]} rows={[
          ["Races in the fit", fit.rowsUsed.toLocaleString()],
          ["Races aggregated / imputed / Huber-downweighted", `${allRaces.length.toLocaleString()} / ${imputedN} / ${downweighted}`],
          ["Median state TPL", <M key="m" v={median} />],
          ["Most Democratic · most Republican", <span key="x">{ranked[0].abbr} <M v={ranked[0].calc.tpl} /> · {ranked.at(-1)!.abbr} <M v={ranked.at(-1)!.calc.tpl} /></span>],
        ]} />
      </Section>

      <Eligibility />

      <Section id="adjusted" kicker="Step 1" title="Adjusted margin and imputation">
        <Defs items={[
          { term: "Eligible race", def: "Adjusted = Raw, untouched." },
          { term: "Ineligible race (⊘)", def: <>Adjusted is imputed from the seat&rsquo;s nearest presidential result: district-level for a House seat (restricted to the boundary vintage the race was run on), statewide otherwise. Imputed rows skip the incumbency and fundraising strips, strip the environment of the SOURCE presidential year, and enter aggregation at weight <N>{IMPUTED_RACE_WEIGHT}</N>.</> },
          { term: "State Legislature", def: "One row per year: the chamber-aggregate margin over every chamber on the ballot that year, as a share of the full total vote. A year counts once every chamber that WAS on the ballot is sourced (staggered senates sit out some years; Nebraska is unicameral)." },
          { term: "Senate specials", def: "A state with a regular and a special Senate race in one year carries both rows; both feed that year's Senate mean." },
        ]} />
      </Section>

      <Section id="strips" kicker="Steps 2–3" title="Incumbency and fundraising strips"
        lede="Each strip removes what the incumbent's party, or a money advantage, added to the margin — so what remains describes the seat, not the candidates' circumstances. The forecast adds incumbency back for 2026 from the same table.">
        <Constants rows={stripConstants()} />
      </Section>

      <Section id="fit" kicker="Step 4" title="The fit: environment, elasticity, incumbency"
        lede="One national environment number per year, one elasticity per state, and the Senate and Governor incumbency values are estimated together by Huber-weighted alternating least squares over the full eligible panel.">
        <Formula lines={[
          "adj  = margin + fundraising strip + incumbency strip   ≈   lean(state) + β(state) × E(year)",
          "row base weight = RACE_TYPE_WEIGHTS[type] / count(state, year, type)",
          `w    = base × min(1, HUBER_C / |residual|)                                 HUBER_C = ${G.HUBER_C}`,
          `E(y) = Σ w·β·(adj − lean) / Σ w·β²  ×  n / (n + SPARSE_YEAR_K)             SPARSE_YEAR_K = ${G.SPARSE_YEAR_K}`,
          `β*   = clamp(1 + BETA_SHRINK × (β̂ − 1), BETA_MIN, BETA_MAX)               = clamp(1 + ${G.BETA_SHRINK}(β̂ − 1), ${G.BETA_MIN}, ${G.BETA_MAX})`,
          "inc(office) = Σ w·sign·(margin + FF strip − lean − β*·E) / Σ w            over incumbent-held Senate / Governor rows",
        ]} note={`${G.FIT_ITERATIONS} alternating rounds (converged by round 4). The base weight makes a state-year's House rows share the House weight instead of outvoting its single presidential row, so the fitted lean answers the same question TPL does.`} />
        <Block label="Fitted national environment E(year)" meta="identified from within-state changes, so which seats happen to be up cannot skew it">
          <DataTable align={"l" + "r".repeat(fit.years.length)} maxWidth="max-w-4xl" head={["", ...fit.years]} rows={[["E", ...fit.years.map((y) => <M key={y} v={fit.E[y]} />)]]}
            caption="Centered so the period average is about zero. Odd years get their own E from the VA / NJ / KY / LA / MS races, shrunk hard by the sparse-year factor." />
        </Block>
        <Block label="State elasticity β*" meta="how strongly a state moves with the nation">
          <DataTable align="lrrlrr" head={["Least elastic", "β*", "raw β̂", "Most elastic", "β*", "raw β̂"]} rows={[0, 1, 2, 3, 4].map((i) => {
            const lo = betas[i], hi = betas[betas.length - 1 - i];
            return [lo[0], lo[1].shrunk.toFixed(2), lo[1].raw.toFixed(2), hi[0], hi[1].shrunk.toFixed(2), hi[1].raw.toFixed(2)];
          })} caption="The forecast multiplies the national environment by the same β*; counties and districts use their parent state's." />
        </Block>
        <Constants rows={[
          { name: "HUBER_C", value: G.HUBER_C, basis: "designed", meaning: "Residual size (pts) beyond which a race is downweighted, in the fit and again in aggregation. This is what keeps Manchin, Scott and Hogan from dragging a state's lean.", source: "tplCalibrate: 4–10 move the objective ≤ 0.01. Disabling Huber won ~0.02 on presidential targets at the cost of Senate accuracy and robustness — rejected by design." },
          { name: "SPARSE_YEAR_K", value: G.SPARSE_YEAR_K, basis: "designed", meaning: "E(y) shrink n/(n + K): reins in thin odd years.", source: "2–8 move the objective ≤ 0.01." },
          { name: "BETA_SHRINK · MIN · MAX", value: `${G.BETA_SHRINK} · ${G.BETA_MIN} · ${G.BETA_MAX}`, basis: "designed", meaning: "Halfway shrink of each state's raw elasticity toward 1, then clamped. No negative elasticity is possible.", source: "0.3–0.7 move the objective ≤ 0.01." },
          { name: "FIT_ITERATIONS", value: G.FIT_ITERATIONS, basis: "designed", meaning: "Alternating least-squares rounds." },
        ]} />
      </Section>

      <Section id="aggregation" kicker="Steps 5–6" title="Robust weighting and aggregation">
        <Formula lines={[
          `aggWeight   = (imputed ? ${IMPUTED_RACE_WEIGHT} : 1) × min(1, HUBER_C / |NM − fitted lean|)`,
          "type NM     = aggWeight-weighted mean of the type's NMs that year",
          "WRS(year)   = Σ type weight × type NM      base weights redistributed among the types present",
          `year weight ∝ ${(G.YEAR_WEIGHTS[2024] / G.YEAR_WEIGHTS[2025]).toFixed(2)}^(2026 − year) × coverage    coverage = Σ base type weights present that year`,
          "TPL         = Σ normalized year weight × WRS",
        ]} note="Coverage is what stops a sparse odd year (one governor race) from dominating through redistribution. A year with no races drops out and the rest renormalize." />
        <Block label="Race-type weights">
          <DataTable align="lrr" maxWidth="max-w-md" head={["Office", "Base weight", "Floor"]} rows={(["P", "H", "S", "L", "G"] as const).map((t) => [TYPE_NAME[t], G.RACE_TYPE_WEIGHTS[t].toFixed(2), { P: ".20", H: ".10", S: ".05", L: ".03", G: ".02" }[t]])}
            caption="Calibrated (tplCalibrate, leakage-free two-round holdout): the knee of the presidential-weight curve. The objective marginally preferred P .65–.70, driven almost entirely by the 2024 presidential target; declined to keep the multi-office identity. A later re-run proposed P .70 / S .08 / H .12 and was also declined." />
        </Block>
        <Block label="Year weights" meta="recency only, before coverage">
          <DataTable align={"l" + "r".repeat(G.YEARS.length)} maxWidth="max-w-4xl" head={["", ...G.YEARS]} rows={[["weight", ...G.YEARS.map((y) => G.YEAR_WEIGHTS[y].toFixed(3))]]}
            caption="Geometric decay per year, anchored on 2026. Calibrated: monotone improvement from 1.0 down to 0.75 on both holdout rounds; 0.65–0.70 no better." />
        </Block>
        <Constants rows={[{ name: "IMPUTED_RACE_WEIGHT", value: IMPUTED_RACE_WEIGHT, basis: "designed", meaning: "An imputed row is a lean borrowed from a presidential result, not an observation of its own.", source: "0.25–1.0 move the calibration objective ≤ 0.01." }]} />
      </Section>

      <Section id="example" kicker="Worked example · live" title={`${oh.name}`}
        lede={<>One race taken through the strips, then the state&rsquo;s year aggregation. Full ledger: {link("/model/state?modelState=OH", "Ohio State TPL")}.</>}>
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

      <Section id="validation" kicker={`Holdout · generated ${TPL_VALIDATION.generatedAt}`} title="Validation"
        lede="Each predictor is built from information through 2022 and scored on the 2024 results across the states, after removing a uniform national shift (the median residual). The full pipeline should beat its own ablations.">
        <DataTable align="llrrrr" maxWidth="max-w-4xl" head={["Target", "Predictor", "States", "MAE", "r", "Shift removed"]} rows={TPL_VALIDATION.rows.map((r) => [r.target, r.predictor, r.n, r.predictor.startsWith("TPL") ? <N key="m">{r.mae.toFixed(2)}</N> : r.mae.toFixed(2), r.r.toFixed(3), <M key="s" v={r.shift} digits={2} />])}
          caption={`Acceptance against the recorded reference values: ${TPL_VALIDATION.pass ? "PASS" : "FAIL"}. 2020 presidential alone still beats TPL on the 2024 presidential target — TPL trades that for being the better predictor of Senate and multi-office results. House TPL trails "Adjusted only" because the raw House target still contains the incumbency and money that TPL strips.`} />
      </Section>

      <Section id="limits" kicker="Open items" title="Known limitations">
        <Defs items={[
          { term: "State Legislature aggregates", def: "Still contain unopposed-seat skew; per-district imputation from the presidential-by-legislative-district data is future work." },
          { term: "House incumbency", def: "Fixed, not fitted, in this state-anchored fit." },
          { term: "Tracking harness", def: "The holdout does not re-fit E and β inside the window (the calibration script does); a strict refit-per-holdout harness is open." },
          { term: "No national TPL", def: "The model is built state-up; the median state is the stand-in national baseline." },
        ]} />
      </Section>

      <Section id="files" kicker="Reference" title="Code and commands">
        <Block label="Constant index" meta="every key of TPL_GLOBAL_CONSTANTS, and where it is documented">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            {Object.entries(DOCUMENTED_IN).map(([name, where]) => <Link key={name} href={`/methodology/${where}`} className="hover:underline"><Code>{name}</Code></Link>)}
          </div>
        </Block>
        <FilesAndCommands files={[
          { path: "lib/tplCompute.ts", role: "generateRaceList, getRawMargin, getTplFit, calculateStateModel, aggregateYears." },
          { path: "data/tplModelData.ts", role: "TPL_GLOBAL_CONSTANTS with calibration provenance." },
          { path: "data/raceEligibility.ts", role: "classifyEligibility, ALIGNED_INDEPENDENTS, the Louisiana jungle rule." },
          { path: "data/fundraisingData.ts ← data-entry/fundraising_2016_2026.csv", role: "Receipts behind the fundraising strip." },
          { path: "components/TplModelPage.tsx", role: "The ledger UI on the TPL tab." },
          { path: "docs/TPL_MODEL_SPEC.md", role: "Long-form design history." },
        ]} commands={[
          { cmd: "npx tsx scripts/tplBacktest.ts --emit", does: "Tracking holdout with acceptance test; regenerates the Validation table. Re-baseline its reference values after an intentional change." },
          { cmd: "npx tsx scripts/tplCalibrate.ts --baseline", does: "Leakage-free objective for decay, type weights, Huber, shrinkage and imputed weight." },
          { cmd: "npx tsx scripts/tplBacktest.ts --matrix · --fit", does: "Cross-office predictiveness matrix; fitted E and β* extremes." },
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
        lede={<>District TPL runs the {link("/methodology/state-tpl", "State TPL")} pipeline at district level: the same additive strips, the parent state&rsquo;s β*, the same decay, coverage and Huber weighting — so district and state leans sit on one scale. Its inputs are the district&rsquo;s presidential results re-aggregated onto the 2026 map, plus every House race from 2016 to 2024, each relocated onto today&rsquo;s lines. It is the lean every {link("/methodology/forecast", "House forecast")} starts from.</>}>
        <Formula lines={[
          "President rows (2016 · 2020 · 2024, on 2026 lines):   NM = Raw − β*·E(year)",
          "House rows (2016–2024):                               NM = Raw + incumbency strip + fundraising strip + BS − β*·E(year)",
          `District TPL = the State TPL aggregation over those rows   (P ${G.RACE_TYPE_WEIGHTS.P} / H ${G.RACE_TYPE_WEIGHTS.H} redistributed; year decay ${(G.YEAR_WEIGHTS[2024] / G.YEAR_WEIGHTS[2025]).toFixed(2)} × coverage)`,
          "Centered     = TPL − median of the 435 district TPLs",
        ]} />
        <DataTable align="lr" maxWidth="max-w-md" head={["Now", ""]} rows={[
          ["Districts", calcs.length],
          ["House rows used", houseRows.length.toLocaleString()],
          ["…relocated across a redraw (|shift| ≥ 0.5)", `${moved.length.toLocaleString()} (mean weight ${(moved.reduce((a, r) => a + (r.boundaryWeight ?? 1), 0) / Math.max(1, moved.length)).toFixed(2)})`],
          ["Presidential-only districts", presOnly],
          ["Median district TPL", <M key="m" v={median} />],
        ]} />
      </Section>

      <Section id="differences" kicker="Against State TPL" title="What differs">
        <Defs items={[
          { term: "Inputs", def: "President and House only. Senate, Governor and State Legislature results are not available by congressional district." },
          { term: "Ineligible House races", def: "Skipped, not imputed: the presidential rows already carry the district's lean, so imputing from them would count it twice." },
          { term: "Elasticity", def: "The parent state's β*. A district-level elasticity cannot be tested — the only wave year with House rows on current lines is 2018, with five of them." },
          { term: "Robust weighting", def: `Two-pass Huber: aggregate once unweighted to anchor the lean, then downweight each row by min(1, ${G.HUBER_C} / |NM − that anchor|) and aggregate again. (The state model anchors on the fitted lean instead.)` },
          { term: "Appointed incumbents", def: "Not distinguished at district level; a House incumbent always gets the full strip." },
          { term: "Presidential data", def: <>2016, 2020 and 2024 presidential votes re-aggregated to the 2026 boundaries (<Code>data/districtPresidentialData.ts</Code>), full-total-vote basis. Verified on the new maps of all ten redrawn states.</> },
        ]} />
      </Section>

      <Section id="boundary" kicker="Step 3b" title="Boundary shift"
        lede="A House margin is a fact about the map that race was run on; District TPL is a property of the 2026 map. Rebuilding an old race on new lines is impossible even in principle — today's NC-14 is assembled from pieces of three 2022 districts, each of which held a different contest. So the race is relocated instead, by the presidential difference between the two maps.">
        <Formula lines={[
          "shift  = pres_P(lines used in year Y) − pres_P(2026 lines)        same election P, two maps",
          "BS pts = −shift",
          `weight = 1 / (1 + (|shift| / BS_WEIGHT_K)²)                        BS_WEIGHT_K = ${K}`,
          "aggWeight = weight × Huber factor",
        ]} note="P is the presidential election contemporaneous with the map; a midterm uses both neighbours weighted by distance (2018 = ½·2016 + ½·2020). Each term is a same-election, two-map difference, so no election-to-election trend leaks in." />
        <P>What transfers is performance relative to the presidential baseline, not the margin: &ldquo;ran a point behind the top of the ticket&rdquo; carries over, &ldquo;won by 15&rdquo; does not. The uniform shift assumes that relative performance is constant across the district&rsquo;s territory, which is weakest exactly where the shift is largest — hence the weight.</P>
        <DataTable align="rr" maxWidth="max-w-xs" head={["|shift| (pts)", "Weight"]} rows={[0, 2, 5, 10, 20, 32].map((s) => [s, (1 / (1 + (s / K) ** 2)).toFixed(2)])} />
        <Constants rows={[{ name: "BS_WEIGHT_K", value: K, basis: "designed", meaning: "Shift (pts) at which a relocated race counts half.", source: "NOT calibrated: the TPL harnesses exercise only the state model, so there is no district-level target to fit it against. Fitting it needs a district holdout (predict each district's House margin from a TPL built without that race)." }]} />
        <Defs items={[{ term: "Old-lines presidential data", def: <><Code>data/presByBoundaryVintage.ts</Code>, per map and presidential year. Two cells had no published source and were built from precinct returns: 2020 president on North Carolina&rsquo;s 2018 map, and 2024 president on the 2022 maps of AL / GA / LA / NC / NY. A neighbour missing on the old map drops out and the rest renormalize.</> }]} />
      </Section>

      <Section id="strips" kicker="Shared with State TPL" title="Strips and constants">
        <Constants rows={stripConstants().filter((c) => c.name !== "APPOINTED_INCUMBENCY_SHARE")} />
        <P>Environment E(year), β*, year decay, type weights and HUBER_C are exactly those documented under {link("/methodology/state-tpl#fit", "State TPL")}. With only President and House present, the base weights P {G.RACE_TYPE_WEIGHTS.P} / H {G.RACE_TYPE_WEIGHTS.H} redistribute to {pct(G.RACE_TYPE_WEIGHTS.P / (G.RACE_TYPE_WEIGHTS.P + G.RACE_TYPE_WEIGHTS.H))} / {pct(G.RACE_TYPE_WEIGHTS.H / (G.RACE_TYPE_WEIGHTS.P + G.RACE_TYPE_WEIGHTS.H))} in a presidential year, and a midterm year is House alone at coverage {G.RACE_TYPE_WEIGHTS.H}.</P>
      </Section>

      {exRace && (
        <Section id="example" kicker="Worked example · live" title={exName}
          lede={<>The most heavily relocated seat on the map. Full ledger: {link("/model/district", "District TPL")}.</>}>
          <Block label={`${exRace.year} House`} meta={`${exRace.repCandidate ?? ""} (R) vs ${exRace.demCandidate ?? ""} (D)`}><Ledger lines={raceLedger(exRace, { bs: true })} /></Block>
          <Block label="Year aggregation"><YearTable aggs={nc14.calc.yearAggregations} /></Block>
          <Ledger lines={[{ label: "District TPL", value: <M v={nc14.calc.tpl} />, total: true }, { op: "=", label: "Centered", note: "− median district", value: <M v={nc14.calc.tpl - median} />, total: true }]} />
        </Section>
      )}

      <Section id="limits" kicker="Open items" title="Known limitations">
        <Defs items={[
          { term: "No district holdout", def: "Neither BS_WEIGHT_K nor the district weighting has its own validation target; the forward backtest's House error is the only indirect check." },
          { term: "Self-influence", def: <>A member&rsquo;s own House margins feed their district&rsquo;s TPL, which slightly shrinks House {link("/methodology/war", "WAR")}.</> },
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
        lede={<>County TPL takes the same statewide races the {link("/methodology/state-tpl", "State TPL")} uses and reads them at county granularity. Every formula, strip and weight is the shared code path, so a change to the state model changes every county with it. It appears on each county page (Historical → a county) and feeds no forecast.</>}>
        <Formula lines={[
          "NM         = county Adjusted margin + incumbency strip + fundraising strip − β*(parent state) × E(year)",
          "County TPL = the State TPL aggregation over the county's rows",
        ]} />
      </Section>

      <Section id="differences" kicker="Against State TPL" title="What differs">
        <Defs items={[
          { term: "President, Senate, Governor", def: "Genuinely the same statewide race, so the incumbent, the appointed flag and the candidates' receipts are inherited from the state's race list. Only the margin is the county's own." },
          { term: "House", def: "A county's House figure is a same-year aggregate across every district touching it, so there is no single incumbent or pair of candidates: no incumbency strip, no fundraising strip, always eligible." },
          { term: "State Legislature", def: "Not included — no county-level legislature results." },
          { term: "Imputation", def: `An ineligible statewide race is imputed from the COUNTY'S nearest presidential result, at weight ${IMPUTED_RACE_WEIGHT}, stripping the source year's environment.` },
          { term: "No Huber weighting", def: "A county sitting far from its STATE's lean is not an outlier, it is a county. Only the imputed discount applies." },
          { term: "Elasticity", def: "The parent state's β*; no county elasticity is estimated." },
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
        <P>Eligibility, E(year), β*, race-type weights, year decay and coverage are exactly those documented under {link("/methodology/state-tpl", "State TPL")}.</P>
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

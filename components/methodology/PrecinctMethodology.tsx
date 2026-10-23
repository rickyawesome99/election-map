import Link from "next/link";
import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { getTplFit, getNationalEnvironment, getWarMoneyModel } from "@/lib/tplCompute";
import { getPrecinctDistrict, precinctDistrictSlugs } from "@/lib/precinctDistrict/registry";
import { projectDistrict, PROJECTION_CONSTANTS } from "@/lib/precinctDistrict/project";
import { Block, Code, Constants, DataTable, Defs, FilesAndCommands, Formula, Ledger, M, N, P, Section, pct, signed, type ConstantRow, type LedgerLine } from "./kit";

// Every PROJECTION_CONSTANTS key and where it is documented on this tab.
const DOCUMENTED_IN = {
  BASELINE_PRES_WEIGHT: "precinct-district#precincts", PRECINCT_TPL_DECAY: "precinct-district#precincts",
  MARGIN_CLAMP: "precinct-district#precincts",
} satisfies Record<keyof typeof PROJECTION_CONSTANTS, string>;
void DOCUMENTED_IN;

export default function PrecinctMethodology() {
  const fit = getTplFit();
  const env = getNationalEnvironment();
  const slugs = precinctDistrictSlugs();
  const examples = slugs.map((slug) => ({ slug, data: getPrecinctDistrict(slug)!, p: projectDistrict(getPrecinctDistrict(slug)!) }));
  const ex = examples[0];

  const constants: ConstantRow[] = [
    { name: "PRECINCT_TPL_DECAY", value: PROJECTION_CONSTANTS.PRECINCT_TPL_DECAY, meaning: "Precinct TPL year weight per year back from the latest year on file: 2024 = 1, 2022 = 0.25, 2020 = 0.06, a two-year half-life. Far steeper than the district lean's 0.75, by design: the list is for deciding where to knock this year, and a precinct's drift since 2016 is noise for that.", basis: "designed" },
    { name: "BASELINE_PRES_WEIGHT", value: PROJECTION_CONSTANTS.BASELINE_PRES_WEIGHT, meaning: "Share of a precinct's latest-year baseline taken from its presidential margin; the rest is its State House margin. The baseline is the fallback for a precinct with no relative lean and the explorer's comparison column.", basis: "designed" },
    { name: "MARGIN_CLAMP", value: `±${PROJECTION_CONSTANTS.MARGIN_CLAMP}`, meaning: "Projected precinct margins are kept inside this range.", basis: "fixed" },
  ];

  const ledger = (p: typeof ex.p): LedgerLine[] => [
    { label: "Structural lean", note: `${p.rows.filter((r) => r.included).length} race-years`, value: <M v={p.lean} /> },
    { op: "+", label: "2026 environment", note: `β* ${p.beta.toFixed(2)} × E(2026) ${signed(p.eHat)}`, value: <M v={p.envPts} /> },
    { op: "+", label: "Incumbency", note: "open seat", value: <M v={0} /> },
    ...(p.money ? [{ op: "+" as const, label: "Campaign money", note: `gap ${signed(p.money.gapPct)}% × ${p.money.scale} − typical ${signed(p.money.structuralGapPct)}% → × K ${p.money.calibration.K}${Math.abs(p.money.pts) >= p.money.calibration.CAP ? `, cap ±${p.money.calibration.CAP}` : ""}`, value: <M v={p.money.pts} /> }] : []),
    { op: "=", label: "Projected margin", note: `σ ${p.sigma.toFixed(1)} · P(D) ${pct(p.pD)}`, value: <M v={p.margin} />, total: true },
  ];

  return (
    <>
      <Section id="scope" kicker="Precinct districts" title="One page per district, one folder per district"
        lede={<>A precinct-district page (<Link href={`/analysis/districts/${ex.slug}`} className="underline underline-offset-2">{ex.data.config.shortName}</Link> is the first) shows a state legislative district precinct by precinct: results and swings since 2016, demographics, targeting metrics and a 2026 outlook. Nothing about a district lives in code; it is all read from <Code>data/precinct-districts/&lt;slug&gt;/</Code>, which <Code>scripts/build-precinct-district.py</Code> writes from the county&apos;s precinct CSVs, one precinct geography per boundary era, and a demographics layer.</>}>
        <Block label="Files">
          <FilesAndCommands
            files={[
              { path: "data-entry/precinct-districts/<slug>/district.json", role: "hand-authored: name, subdivisions, boundary eras, CSV column mapping per year, candidates, 2026 status, sources" },
              { path: "data-entry/precinct-districts/<slug>/<year>.csv", role: "one row per precinct per election year, as compiled from the county canvass" },
              { path: "data/precinct-districts/<slug>/results.json", role: "long-format results: year → offices (labels, candidates, districts) + precinct rows {id, sub, reg, ballots, races}" },
              { path: "data/precinct-districts/<slug>/crosswalk.json", role: "older era → current era population weights, per-precinct coverage, composition of each current precinct" },
              { path: "data/precinct-districts/<slug>/demographics.json", role: "current-era precinct → 2020 Census / ACS fields" },
              { path: "data/precinct-districts/<slug>/finance.json", role: "hand-entered from the state filings: the 2026 nominees' receipts (as of a report date) and past nominees' receipts by office and year; optional — without it there is no money term" },
              { path: "data-entry/state-leg-finance/<ST>-house-<years>.csv", role: "every nominee's cycle receipts for the state's House races (Transparency USA), the calibration input" },
              { path: "data/precinct-districts/money/<ST>.json", role: "the state's money calibration (K, cap, typical-gap model, fit diagnostics), shared by every district in the state" },
              { path: "public/precinct-districts/<slug>/precincts-<era>.geojson", role: "geometry with {id, subdivision} only" },
              { path: "lib/precinctDistrict/{aggregate,explorer,project}.ts", role: "sums and margins · explorer rows, swing, targeting · 2026 outlook" },
            ]}
            commands={[
              { cmd: "python3 scripts/build-precinct-district.py <slug>", does: "rebuilds the results, crosswalk, demographics and geometry for one district (needs CENSUS_API_KEY once, for block populations)" },
              { cmd: "npx tsx scripts/fitStateLegMoney.ts <ST>", does: "refits the state's money calibration from its receipts file and legislative results" },
            ]}
          />
        </Block>
      </Section>

      <Section id="eras" kicker="Boundaries" title="Precinct eras and the crosswalk"
        lede="Counties redraw precincts, and the new precincts often keep the old names. A page therefore treats each set of lines as an era, and shows older years on today's lines by carrying each old precinct's votes across in proportion to the 2020 population it shares with each current precinct.">
        <Block label="Method">
          <P>Every 2020 census block in the county (TIGER/Line PL geometry; P1 total population from the 2020 Census API) is assigned to the old-era precinct and the current-era precinct its representative point falls in. An old precinct&apos;s weight toward a current precinct is the population they share divided by the old precinct&apos;s whole population, so population that now lies outside the district is dropped rather than redistributed; a precinct with no populated block falls back to area shares. Weights that land in a neighbouring township or city are folded back into same-subdivision targets, because precincts nest inside municipalities and a border block is placement noise — which also keeps every subdivision total exact on both universes. Votes, ballots and registration all move by the same weights, and every value built this way carries a ≈ mark on the page.</P>
          {examples.map(({ slug, data }) => {
            const cur = data.config.eras.find((e) => e.current)!;
            return Object.entries(data.crosswalk.eras).map(([eraId, x]) => (
              <DataTable key={`${slug}-${eraId}`} head={["District", "From", "To", "Old precincts", "≥95% into one current precinct", "Area fallback", "Outside current lines"]} align="lllrrrr"
                rows={[[data.config.shortName, data.config.eras.find((e) => e.id === eraId)?.label ?? eraId, cur.label, x.summary.oldPrecincts, x.summary.oldMappingMostlyToOne, x.summary.areaFallback, x.excluded.map((e) => e.precinct).join(", ") || "none"]]}
                caption="Read live from crosswalk.json. Same-name overlap is not used anywhere: in Summit County only 3 of 85 current precincts share more than 95% of their area with the 2022 precinct of the same name." />
            ));
          })}
        </Block>
        <Block label="What is exact and what is estimated">
          <Defs items={[
            { term: "Exact", def: "Any single year on its own lines; every township / city / village total in every year; the district total of any year on its own lines." },
            { term: "Estimated (≈)", def: "A pre-current-era precinct value shown on today's lines, and anything derived from it: cross-era precinct swings, midterm drop-off, presidential trend, and the older rows of the precinct panel." },
            { term: "Left out", def: "Old precincts whose 2020 population sits mostly outside the current district (coverage < 0.5). They remain under original lines and in the exact subdivision totals of their own year." },
          ]} />
        </Block>
      </Section>

      <Section id="outlook" kicker="2026" title="The district outlook"
        lede="A district TPL in the site's sense, built from the district's own precinct sums and projected with the shared environment fit. It is deliberately the simple version: no polling or candidate-quality term, and a fundraising term only where the nominees' receipts and a state calibration are on file.">
        <Block label="Neutral margin per race-year">
          <Formula lines={["NM(race, year) = raw + incumbency strip − β*(state) × E(year) − money(race, year)", "raw = two-party margin of the footprint on today's lines (R-positive)", "incumbency strip = −adv if the incumbent was R, +adv if D; adv from the TPL fit (House advantage stands in for State House)"]}
            note={<>Statewide races always enter. A House or State House year enters only when the footprint was a single race; when it summed several districts (different candidates, some uncontested) it is excluded. The money strip applies only to races whose nominees&apos; receipts are in finance.json (priced as in Campaign money below, full-cycle, on the nearest presidential margin at or before that year); every other row carries none. β* and E(year) are read from <Link href="/analysis/internal-methodology/state-tpl" className="underline">the State TPL fit</Link>.</>} />
        </Block>
        <Block label="Lean">
          <Formula lines={["year NM   = Σ_type w[type] × mean NM of that type  /  coverage", "w[type]   = RACE_TYPE_WEIGHTS[type], except State House = TYPE_WEIGHTS.L (× RECENT_SEAT_BOOST in the latest State House year)", "coverage  = Σ w over the types present that year", "lean      = Σ_year YEAR_WEIGHTS[year] × coverage × year NM  /  Σ_year YEAR_WEIGHTS[year] × coverage", "Huber     = min(1, HUBER_C / |NM − lean₀|) per race, second pass"]}
            note={<>Statewide and U.S. House rows take the state model&apos;s RACE_TYPE_WEIGHTS: P {G.RACE_TYPE_WEIGHTS.P} · S {G.RACE_TYPE_WEIGHTS.S} · H {G.RACE_TYPE_WEIGHTS.H} · G {G.RACE_TYPE_WEIGHTS.G}. State House rows take the <Link href="/analysis/internal-methodology/state-leg" className="underline">state legislature model&apos;s</Link> seat weight, TYPE_WEIGHTS.L {ex.p.seatRows.typeWeight} × RECENT_SEAT_BOOST {ex.p.seatRows.boost} in the latest year with a single-race State House row (so that year&apos;s seat row carries as much of its year as the presidential row), rather than the TPL&apos;s L {G.RACE_TYPE_WEIGHTS.L}: the seat&apos;s own results are what the two projections share, and weighting them alike is what lets the pages be compared term by term. Until 2026-10-20 the seat rows carried the TPL weight and a separate down-ballot gap term (mean State House NM − same-year top-of-ticket NM, shrunk n/(n+1)) added back what that weight left out; the seat rows now carry it directly. YEAR_WEIGHTS decay {G.YEAR_WEIGHTS[2024].toFixed(3)} (2024) → {G.YEAR_WEIGHTS[2016].toFixed(3)} (2016); HUBER_C {G.HUBER_C}.</>} />
        </Block>
        <Block label="Projection">
          <Formula lines={["margin = lean + β* × E(2026) + incumbency + campaign money", "σ²     = (β* × σ_E)² + STATE_SHOCK² + SIGMA²          the state legislature model's chamber shock and seat noise", "P(D)   = Φ(−margin / σ)"]}
            note={<>E(2026) is the live national environment estimate, {signed(env.eHat)} with σ_E {env.sigmaE.toFixed(2)} today (<Link href="/analysis/internal-methodology" className="underline">Forecast → environment</Link>). An open seat carries no incumbency term; an incumbent on the ballot adds the state legislature model&apos;s INCUMBENCY_PTS. A single seat sees the chamber shock as noise, so σ carries both fitted terms.</>} />
          {examples.map(({ slug, data, p }) => (
            <div key={slug}>
              <div className="mb-1 text-xs font-semibold" style={{ color: "var(--app-text-primary)" }}>{data.config.shortName} today</div>
              <Ledger lines={ledger(p)} />
            </div>
          ))}
        </Block>
        {ex.data.moneyCalibration && ex.p.money && (() => {
          const cal = ex.data.moneyCalibration!;
          return (
            <Block label="Campaign money" meta={`${cal.state} calibration · fitted ${cal.fitted}`}>
              <Formula lines={[
                "gap%          = (R$ − D$) / (R$ + D$) × 100          gross receipts: cash + in-kind, net of refunds",
                "typical gap%  = a + b × incSign + c × presidential margin",
                "money         = clamp(MONEY_K × (scale × gap% − typical gap%), ±MONEY_CAP)          K and cap from the state legislature model",
                "scale         = PARTIAL_CYCLE_GAP_SCALE for receipts mid-cycle; 1 for a finished cycle",
              ]}
                note={<>The site&apos;s residual money basis (<Link href="/analysis/internal-methodology" className="underline">Forecast → money</Link>), re-fitted on the state&apos;s own legislative races, because state House money behaves differently from congressional money: in {cal.state} an incumbent&apos;s typical edge is {cal.structural.incSign.toFixed(0)} points of gap against {(getWarMoneyModel().H?.incSign ?? 0).toFixed(0)} for U.S. House. Only the edge beyond what a generic pair in the seat raises is information; the typical part is already in the lean and the incumbency term. The fit uses the one year with both a presidential result by legislative district and receipts ({cal.fitYear}): {cal.n} contested D-vs-R races, margin = α + β × pres + γ × incSign + K × residual gap. Only the typical gap (a, b, c) is taken from it. Its own K, {ex.data.moneyCalibration!.kOls.toFixed(3)} ± {ex.data.moneyCalibration!.kSe.toFixed(3)} (error {ex.data.moneyCalibration!.rmse.noMoney.toFixed(2)} → {ex.data.moneyCalibration!.rmse.withMoney.toFixed(2)} points), is in-sample on a single end-of-cycle year, where some of K is money following races that already looked winnable; the page prices the residual gap at the state legislature model&apos;s MONEY_K {cal.K} and MONEY_CAP {cal.CAP} instead, swept out of sample on two holdout years across every chamber, where larger caps over-predicted. The partial-cycle scale ({ex.p.money.scale}) is the same model&apos;s: no per-report history of state receipts is on file.</>} />
              <DataTable head={["K", ...cal.looGrid.map((g) => g.k.toFixed(2))]} align={"l" + "r".repeat(cal.looGrid.length)}
                rows={[["Leave-one-out MAE", ...cal.looGrid.map((g) => g.looMae.toFixed(2))]]}
                caption={`${cal.state} House ${cal.fitYear}, the state fit's own cap applied, typical-gap model and baseline refitted without each held-out race. Read live from data/precinct-districts/money/${cal.state}.json; shown for the record, not used.`} />
              <DataTable head={["Typical gap", "a (intercept)", "b (incSign)", "c (pres margin)"]} align="lrrr"
                rows={[[`${cal.state} House ${cal.fitYear}`, cal.structural.intercept.toFixed(1), cal.structural.incSign.toFixed(1), cal.structural.pres.toFixed(2)]]} />
            </Block>
          );
        })()}
        <Block label="Constants">
          <Constants rows={constants} />
          <P>Four values are borrowed from the <Link href="/analysis/internal-methodology/state-leg" className="underline">state legislature model</Link>, where they are fitted or swept on its 2022 and 2024 holdouts, rather than set here: INCUMBENCY_PTS <N>{ex.p.constants.incumbencyPts}</N> (stripped from State House rows; the TPL fit has no state-legislative tier), SIGMA <N>{ex.p.constants.SEAT_SIGMA}</N> and STATE_SHOCK <N>{ex.p.constants.STATE_SHOCK}</N> (seat noise and the chamber shock behind σ), and MONEY_K <N>{ex.p.constants.MONEY_K}</N> with MONEY_CAP <N>{ex.p.constants.MONEY_CAP}</N>. Until 2026-10-20 the page used the congressional House incumbency (<N>{(fit.incumbency.H ?? 0).toFixed(1)}</N>), RACE_SIGMA.H × 1.5 and the state money fit&apos;s own in-sample K and cap.</P>
        </Block>
      </Section>

      <Section id="precincts" kicker="Precincts" title="From the district to its precincts"
        lede="The projected district margin is spread back over the precincts as a precinct TPL, so the map, the door-knocking list and the 2026 turnout estimate can be read precinct by precinct.">
        <Block label="Precinct TPL">
          <Formula lines={["rel(p)       = Σ w × (precinct margin − district margin)  /  Σ w          over the included race-years, on today's lines", "w            = PRECINCT_TPL_DECAY^(latest year − year) × the district lean's race-type weight", "TPL(p)       = district projected margin + rel(p) − mean_v rel          clamped to ±MARGIN_CLAMP", "baseline(p)  = BASELINE_PRES_WEIGHT × latest presidential margin(p) + (1 − w) × latest State House margin(p)"]}
            note={<>Subtracting the district&apos;s own margin in the same race strips the environment, the incumbency effect and the candidates in one step, since those are the same for every precinct in the race, so a precinct&apos;s relative lean needs no strips of its own. The mean is weighted by each precinct&apos;s 2026 two-party votes, so the precinct TPLs sum to the district projection. A precinct with no race on file falls back to its baseline plus the district&apos;s uniform shift. Until 2026-10-20 every precinct was its baseline plus that uniform shift, which ignored every year before the latest.</>} />
        </Block>
        <Block label="2026 turnout estimate">
          <Formula lines={["rate_y(p) = ballots_y(p) ÷ registered_y(p)          each past midterm y, on today's lines", "ballots_2026(p) = mean_y rate_y(p) × today's registered(p)          capped at 100%"]}
            note="Each basis midterm alone gives the range shown beside the estimate. Ballots become votes at the precinct's latest State House two-party rate and projected margin; &quot;net votes to flip&quot; is the trailing side's deficit. Because midterm drop-off is spread almost evenly across precincts, the estimate sets the size of the race, not the margin — the margin is the district projection. Within-precinct shifts in who votes in a midterm are not modelled here." />
        </Block>
        <Block label="Targeting metrics" meta="explorer → Targeting">
          <Defs items={[
            { term: "Average Republican share (≈)", def: "Mean over every year on file of that year's mean two-party Republican share across its races, on today's lines, so each year counts once however many races it had." },
            { term: "Priority (≈)", def: "Net votes available = split-ticket votes + max(0, turnout votes), where turnout votes = (latest presidential-year ballots − most recent midterm ballots) × average margin (2 × average R share − 100%). Units are ranked by it at the level shown. The category comes from the average Republican share: Base 58%+, Turnout 52–58%, Contested 48–52%, Persuasion 42–48%, Opponent base under 42%. Below 50% turnout votes are negative, so a Democratic-leaning unit's available votes are split-ticket votes only." },
            { term: "Republican floor / ceiling", def: "Lowest and highest two-party Republican share across the latest year's races in the precinct." },
            { term: "Split-ticket votes", def: "(ceiling − floor) × ballots cast." },
            { term: "Down-ballot gap", def: "State House margin − top-of-ticket margin, same year (R-positive)." },
            { term: "Midterm drop-off", def: "1 − most recent midterm ballots ÷ latest presidential-year ballots, the midterm on today's lines (≈)." },
            { term: "Presidential trend", def: "Latest presidential margin − earliest presidential margin on file, both on today's lines (≈)." },
          ]} />
        </Block>
        <Block label="Door-knocking targets" meta="page → Door-knocking targets">
          <P>The same Priority ranking, as a list: every precinct on today&apos;s lines with its rank, net votes available, split-ticket and turnout votes, the latest State House and presidential margins, registration and the 2026 turnout estimate; sortable on every column, filterable by area, by Priority category and by a competitiveness band, with two CSVs: the full district in Priority order, and a custom list of exactly the precincts shown after the filters and sort. Ranks are district-wide and do not change with a filter.</P>
          <Defs items={[
            { term: "Precinct TPL and its rating", def: "The precinct TPL above, printed as a margin, with the site's rating bands on it: Safe at 15 points or more, Likely 5 to 15, Lean 1 to 5, Tilt under 1, each side. A different lens from the Priority categories, which name the task (bank, turn out, persuade) on the all-years average R share." },
            { term: "Category totals", def: "Precincts, 2026 estimated ballots (the turnout estimate's precinct ballots summed) and net votes available (Priority summed) in each Priority category, as tiles above the list; the rating bands are a filter row." },
          ]} />
        </Block>
      </Section>

      <Section id="models" kicker="Comparison" title="Against the state legislature model"
        lede="Every precinct-district page shows its own projection beside the site's general state legislature projection for the same seat, term by term.">
        <P>The two share the TPL fit (β*, incumbency, the 2026 environment) and the nominees&apos; receipts, and differ in what they read the lean from and how they price money. The legislature model (Methodology → State legislatures) weights the seat&apos;s own State House rows against presidential results alone, relocating pre-2022 rows through its redistricting crosswalk with a presidential correction; this page&apos;s lean adds every statewide race as counted in these precincts, each stripped of incumbency and environment, with the State House rows at the legislature model&apos;s own seat weight. Since 2026-10-20 the two also share the legislature model&apos;s fitted incumbency, seat noise, chamber shock, money K and cap; what remains of this page&apos;s own is the statewide rows in the lean and the state-fitted typical money gap. The section prints both ledgers and the gap between the margins; neither is adjusted toward the other.</P>
      </Section>
    </>
  );
}

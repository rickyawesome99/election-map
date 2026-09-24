import Link from "next/link";
import { TPL_GLOBAL_CONSTANTS as G, FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { getTplFit, getNationalEnvironment } from "@/lib/tplCompute";
import { getPrecinctDistrict, precinctDistrictSlugs } from "@/lib/precinctDistrict/registry";
import { projectDistrict, PROJECTION_CONSTANTS } from "@/lib/precinctDistrict/project";
import { Block, Code, Constants, DataTable, Defs, FilesAndCommands, Formula, Ledger, M, N, P, Section, pct, signed, type ConstantRow, type LedgerLine } from "./kit";

// Every PROJECTION_CONSTANTS key and where it is documented on this tab.
const DOCUMENTED_IN = {
  BASELINE_PRES_WEIGHT: "precinct-district#precincts", GAP_SHRINK_K: "precinct-district#outlook",
  LEG_INCUMBENCY_TIER: "precinct-district#outlook", LEG_SIGMA_TIER: "precinct-district#outlook",
  LEG_SIGMA_MULTIPLIER: "precinct-district#outlook", MARGIN_CLAMP: "precinct-district#precincts",
} satisfies Record<keyof typeof PROJECTION_CONSTANTS, string>;
void DOCUMENTED_IN;

export default function PrecinctMethodology() {
  const fit = getTplFit();
  const env = getNationalEnvironment();
  const slugs = precinctDistrictSlugs();
  const examples = slugs.map((slug) => ({ slug, data: getPrecinctDistrict(slug)!, p: projectDistrict(getPrecinctDistrict(slug)!) }));
  const ex = examples[0];

  const constants: ConstantRow[] = [
    { name: "BASELINE_PRES_WEIGHT", value: PROJECTION_CONSTANTS.BASELINE_PRES_WEIGHT, meaning: "Share of a precinct's baseline taken from its latest presidential margin; the rest is its latest State House margin.", basis: "designed" },
    { name: "GAP_SHRINK_K", value: PROJECTION_CONSTANTS.GAP_SHRINK_K, meaning: <>Down-ballot gap shrink n / (n + K): one observed year counts half, three count three-quarters.</>, basis: "designed" },
    { name: "LEG_INCUMBENCY_TIER", value: PROJECTION_CONSTANTS.LEG_INCUMBENCY_TIER, meaning: <>State House rows are stripped of the fitted <em>House</em> incumbency advantage (<N>{(fit.incumbency.H ?? 0).toFixed(1)}</N> pts); the TPL fit has no state-legislative incumbency term.</>, basis: "designed" },
    { name: "LEG_SIGMA_TIER", value: PROJECTION_CONSTANTS.LEG_SIGMA_TIER, meaning: <>Race noise starts from RACE_SIGMA.H (<N>{F.RACE_SIGMA.H}</N>).</>, basis: "designed" },
    { name: "LEG_SIGMA_MULTIPLIER", value: PROJECTION_CONSTANTS.LEG_SIGMA_MULTIPLIER, meaning: <>Scales that noise up for a state legislative race. In OH-31 the State House column has sat a standard deviation of about 7 points from the same-year top of the ticket (2016–2024), against the ~{F.RACE_SIGMA.H} the site fits for congressional races, so the multiplier is set at 1.5 pending a fitted value from state-legislative track records.</>, basis: "designed" },
    { name: "MARGIN_CLAMP", value: `±${PROJECTION_CONSTANTS.MARGIN_CLAMP}`, meaning: "Projected precinct margins are kept inside this range.", basis: "fixed" },
  ];

  const ledger = (p: typeof ex.p): LedgerLine[] => [
    { label: "Structural lean", note: `${p.rows.filter((r) => r.included).length} race-years`, value: <M v={p.lean} /> },
    { op: "+", label: "2026 environment", note: `β* ${p.beta.toFixed(2)} × E(2026) ${signed(p.eHat)}`, value: <M v={p.envPts} /> },
    { op: "+", label: "Incumbency", note: "open seat", value: <M v={0} /> },
    { op: "+", label: "Down-ballot gap", note: p.gap.raw == null ? "no single-race State House year" : `${signed(p.gap.raw)} over ${p.gap.n} yr × ${p.gap.shrink.toFixed(2)}`, value: <M v={p.gap.value} /> },
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
              { path: "public/precinct-districts/<slug>/precincts-<era>.geojson", role: "geometry with {id, subdivision} only" },
              { path: "lib/precinctDistrict/{aggregate,explorer,project}.ts", role: "sums and margins · explorer rows, swing, targeting · 2026 outlook" },
            ]}
            commands={[{ cmd: "python3 scripts/build-precinct-district.py <slug>", does: "rebuilds every file above for one district (needs CENSUS_API_KEY once, for block populations)" }]}
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
        lede="A district TPL in the site's sense, built from the district's own precinct sums and projected with the shared environment fit. It is deliberately the simple version: no polling, fundraising or candidate-quality term until those inputs exist for state legislative races.">
        <Block label="Neutral margin per race-year">
          <Formula lines={["NM(race, year) = raw + incumbency strip − β*(state) × E(year)", "raw = two-party margin of the footprint on today's lines (R-positive)", "incumbency strip = −adv if the incumbent was R, +adv if D; adv from the TPL fit (House advantage stands in for State House)"]}
            note={<>Statewide races always enter. A House or State House year enters only when the footprint was a single race; when it summed several districts (different candidates, some uncontested) it is excluded. No fundraising strip: no receipts are on file for these races. β* and E(year) are read from <Link href="/methodology/state-tpl" className="underline">the State TPL fit</Link>.</>} />
        </Block>
        <Block label="Lean">
          <Formula lines={["year NM   = Σ_type RACE_TYPE_WEIGHTS[type] × mean NM of that type  /  coverage", "coverage  = Σ RACE_TYPE_WEIGHTS over the types present that year", "lean      = Σ_year YEAR_WEIGHTS[year] × coverage × year NM  /  Σ_year YEAR_WEIGHTS[year] × coverage", "Huber     = min(1, HUBER_C / |NM − lean₀|) per race, second pass"]}
            note={<>Same constants as the state model: RACE_TYPE_WEIGHTS P {G.RACE_TYPE_WEIGHTS.P} · S {G.RACE_TYPE_WEIGHTS.S} · H {G.RACE_TYPE_WEIGHTS.H} · L {G.RACE_TYPE_WEIGHTS.L} · G {G.RACE_TYPE_WEIGHTS.G}; YEAR_WEIGHTS decay {G.YEAR_WEIGHTS[2024].toFixed(3)} (2024) → {G.YEAR_WEIGHTS[2016].toFixed(3)} (2016); HUBER_C {G.HUBER_C}.</>} />
        </Block>
        <Block label="Projection">
          <Formula lines={["margin = lean + β* × E(2026) + incumbency + down-ballot gap", "gap    = mean over single-race State House years of (State House NM − same-year top-of-ticket NM) × n / (n + GAP_SHRINK_K)", "σ²     = (β* × σ_E)² + (RACE_SIGMA[LEG_SIGMA_TIER] × LEG_SIGMA_MULTIPLIER)²", "P(D)   = Φ(−margin / σ)"]}
            note={<>E(2026) is the live national environment estimate, {signed(env.eHat)} with σ_E {env.sigmaE.toFixed(2)} today (<Link href="/methodology" className="underline">Forecast → environment</Link>). An open seat carries no incumbency term. The gap captures a district&apos;s habit of voting differently for the legislature than for the top of the ticket, net of the incumbency already stripped.</>} />
          {examples.map(({ slug, data, p }) => (
            <div key={slug}>
              <div className="mb-1 text-xs font-semibold" style={{ color: "var(--app-text-primary)" }}>{data.config.shortName} today</div>
              <Ledger lines={ledger(p)} />
            </div>
          ))}
        </Block>
        <Block label="Constants">
          <Constants rows={constants} />
        </Block>
      </Section>

      <Section id="precincts" kicker="Precincts" title="From the district to its precincts"
        lede="The projected district margin is spread back over the precincts so the map and the turnout scenarios can be read precinct by precinct.">
        <Block label="Baseline and shift">
          <Formula lines={["baseline(p) = BASELINE_PRES_WEIGHT × latest presidential margin(p) + (1 − w) × latest State House margin(p)", "projected(p) = baseline(p) + (district margin − district baseline)          clamped to ±MARGIN_CLAMP"]}
            note="The shift is uniform for now: every precinct moves by the same number of points. A precinct elasticity (how much each precinct historically moved per point of district movement) is the natural next step once more within-era pairs are available." />
        </Block>
        <Block label="Turnout scenarios">
          <P>Each scenario assigns every precinct a ballot count — the latest presidential year&apos;s ballots as cast, or a past midterm&apos;s turnout rate (that precinct&apos;s ballots ÷ registered, on today&apos;s lines) applied to today&apos;s registration — and converts the precinct&apos;s projected margin into votes at its latest two-party rate. The district margin therefore moves only through which precincts turn out; &quot;net votes to flip&quot; is the trailing side&apos;s deficit under that scenario.</P>
        </Block>
        <Block label="Targeting metrics" meta="explorer → Targeting">
          <Defs items={[
            { term: "Democratic floor / ceiling", def: "Lowest and highest two-party Democratic share across the latest year's races in the precinct." },
            { term: "Split-ticket votes", def: "(ceiling − floor) × ballots cast." },
            { term: "Down-ballot gap", def: "State House margin − top-of-ticket margin, same year (R-positive)." },
            { term: "Midterm drop-off", def: "1 − most recent midterm ballots ÷ latest presidential-year ballots, the midterm on today's lines (≈)." },
            { term: "Presidential trend", def: "Latest presidential margin − earliest presidential margin on file, both on today's lines (≈)." },
          ]} />
        </Block>
      </Section>
    </>
  );
}

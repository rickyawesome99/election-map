import Link from "next/link";
import type { ReactNode } from "react";
import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { STATE_LEG_TPL_VALIDATION as V } from "@/data/stateLegTplValidation";
import { IMPUTED_RACE_WEIGHT } from "@/lib/tplCompute";
import { STATE_LEG_FORECAST_CONSTANTS as LC } from "@/lib/stateLegForecast";
import { MAX_MISSING } from "@/lib/stateLegDistrictRowsConstants";
import EXAMPLE from "@/data/stateLegTplExample.json";
import { Block, Constants, DataTable, Defs, FilesAndCommands, Formula, Ledger, M, P, Section, type ConstantRow } from "./kit";

// Internal Methodology → Legislative TPL: the TPL of every state House / Senate district (lib/stateLegTpl.ts).
// Prose is hand-written; constants and the validation table are read live, the worked example from
// data/stateLegTplExample.json (written by scripts/buildStateLegAtlasSlices.ts; tracked, since data/generated/ is rebuilt by prebuild and this is not). No file reads here:
// they would make Vercel ship the folders they read with this page's function.

const link = (href: string, text: ReactNode) => <Link href={href} className="underline decoration-dotted underline-offset-2" prefetch={false}>{text}</Link>;

export default function LegTplMethodology() {
  const ex = EXAMPLE;
  const constants: ConstantRow[] = [
    { name: "INCUMBENCY_PTS (legislature)", value: LC.INCUMBENCY_PTS, basis: "calibrated", meaning: "Points stripped for the incumbent's party on a legislature row, vote-weighted over the seats the district's votes came from. The legislature's own fitted value (scripts/stateLegBacktest.ts), not the U.S. House's 3." },
    { name: "MONEY_K · MONEY_CAP (legislature)", value: `${LC.MONEY_K} · ±${LC.MONEY_CAP}`, basis: "calibrated", meaning: "The legislature's money strip, raceMoneyTerm in lib/stateLegMoneyModel.ts: clamp(K × (gap% − structural gap%), ±cap) per seat, vote-weighted. 0 where either side's money is not on file." },
    { name: "IMPUTED_RACE_WEIGHT", value: IMPUTED_RACE_WEIGHT, basis: "decision", meaning: "Weight of a fully imputed row (County TPL's). A partly contested U.S. House or legislature row weighs c + (1 − c) × this, c its coverage." },
    { name: "HUBER_C", value: G.HUBER_C, basis: "decision", meaning: "The U.S. House and legislature years are each checked as a whole against the district's own statewide lean: the year's weight × min(1, HUBER_C / |NM − anchor|)." },
    { name: "MAX_MISSING", value: MAX_MISSING, basis: "decision", meaning: "A district row is dropped when more than this share of the district (by votes in the year's other races) has no votes for the race on file: an uncontested U.S. House seat left off the ballot, or a source placed town by town elsewhere." },
  ];
  const rows = V.rows.map((r) => [r.year, r.n, <M key="e" v={r.environment} />, r.tplAlone.toFixed(2), <b key="t">{r.tplFull.toFixed(2)}</b>, r.presAlone.toFixed(2), r.presFull.toFixed(2), r.tplFullByChamberEnv.toFixed(2), r.presFullByChamberEnv.toFixed(2), "frozenFull" in r && r.frozenFull != null ? `${r.frozenFull.toFixed(2)} / ${(r as { frozenFullByChamberEnv?: number }).frozenFullByChamberEnv?.toFixed(2)}` : "—"]);
  rows.push(["All", V.pooled.n, "", V.pooled.tplAlone.toFixed(2), <b key="t">{V.pooled.tplFull.toFixed(2)}</b>, V.pooled.presAlone.toFixed(2), V.pooled.presFull.toFixed(2), V.pooled.tplFullByChamberEnv.toFixed(2), V.pooled.presFullByChamberEnv.toFixed(2), ""]);

  return (
    <>
      <Section id="overview" kicker="Legislative TPL" title="County TPL's pipeline, in every state-legislative district"
        lede={<>The partisan baseline of each of the 6,814 state House and Senate districts on today&apos;s lines, built the way {link("/analysis/internal-methodology/county-tpl", "County TPL")} is built, with the chamber&apos;s own race added as a fifth office. It is a measurement, not a forecast, and it is separate from the frozen 2026 state-legislative lean (the Forecast Calculation on a district page), which stays as published. Shown on each district view (Chambers → a district → District TPL) and as the District TPL colour mode of the chamber map. Built 2026-11-26.</>}>
        <Formula lines={[
          "row NM     = district margin (today's lines) + incumbency strip + money strip − E(year)",
          "  partial  = c × (contested-part NM) + (1 − c) × (uncontested part's presidential margin − E(that year))",
          "anchor     = the TPL aggregation over the district's President, Senate and Governor rows",
          "TPL        = aggregateYears over all rows; each U.S. House and legislature year × min(1, HUBER_C / |NM − anchor|)",
        ]} />
      </Section>

      <Section id="rows" kicker="Rows" title="Office by office">
        <Defs items={[
          { term: "President", def: "The district's own margin, no strips. From the precinct files like every other office (not the area-weighted era overlay the frozen lean uses)." },
          { term: "U.S. Senate, Governor", def: <>The district&apos;s margin; eligibility, incumbent, appointed flag and receipts are the statewide race&apos;s (generateRaceList), as in County TPL. An ineligible race (an independent in the Democratic slot, a same-party final, an unopposed race) is imputed from the district&apos;s nearest presidential margin with that year&apos;s environment, at weight {IMPUTED_RACE_WEIGHT}. Senate specials held beside a regular race are their own row. Alaska&apos;s 2022 Senate final round was Murkowski v. Tshibaka, both Republicans, so it is imputed.</> },
          { term: "U.S. House", def: "Each contested congressional district takes out its own incumbency (the House district TPL's fixed value) and money strip, weighted by its share of the row's contested votes (LEG_HOUSE_STRIPS, adopted 2026-11-27 with the same change to County TPL; mean leftover 6.19 → 6.00). A write-in-scale opponent is no contest. The races table lists the congressional districts the votes were cast in, and the map when it is not today's. Each precinct knows its congressional district: the part of the legislative district in a Democrat-v-Republican race counts as cast, the uncontested part is imputed from its own presidential margin (nearest presidential year, ties to the later one), blended by coverage c. A district with no contested part is imputed whole." },
          { term: "State House / State Senate", def: `The chamber's own race. In a year held on today's map the district is the seat: each precinct's votes go to the seat they were cast in (the precinct file's own label, and a precinct shared between seats by each part's own votes), so the row is the seat's result. In a year held on an older map it is summed onto today's lines by population like every other office, so old maps need no relocation step; the races table names that map and the seats the votes came from ("2012 map: seats 37, 34, 36"). Coverage of 99.5% or more counts as fully contested. Strips as in the U.S. House district TPL (and, since 2026-11-27, as on the U.S. House rows): an incumbency strip (${LC.INCUMBENCY_PTS} points, the legislature's fitted value) and the legislature's money term, each vote-weighted over the seats the district's votes came from. Coverage blending as for the House. A seat counts as contested when the site's own result for it has both parties above write-in scale (classifyEligibility's 5% / 2% rule) and the precinct file holds both sides too; precinct seat codes are resolved to the site's seats by name, position or sub-seat, then vote totals (resolveSiteSeats); a multi-member seat with unequal slates counts the average nominee of each party (the frozen model's contestedMargin rule); Washington's and Idaho's posts count only the posts with a Democrat against a Republican; a nominee on both major lines is no contest. The district page's Electoral history still shows the races as run.` },
          { term: "Outlier check", def: `County TPL checks each House year against the county's statewide lean; here both the U.S. House and the legislature years are checked against the district's own statewide lean (President, Senate, Governor aggregated alone), HUBER_C ${G.HUBER_C}. Statewide rows are not checked: a district far from its state is not an outlier.` },
          { term: "No quality weight", def: "Rows placed by precinct name or by town (all of 2022, New Jersey's legislature, odd years) count like the rest (user decision 2026-11-26)." },
          { term: "2026", def: "Rows appear for every state with a 2026 precinct file, through the same code; a state without one has no 2026 row until its file arrives. Rerun the atlas build after each certification batch." },
          { term: "Weights, environment", def: "Race-type weights, the midterm set, year decay, coverage and E(year) are the live State TPL's (data/tplModelData.ts, getTplFit), not the locked 2026 fit." },
        ]} />
      </Section>

      <Section id="data" kicker="Inputs" title="How a district gets its votes">
        <Defs items={[
          { term: "Precinct files", def: <>public/precincts/results/&#123;ST&#125;/&#123;year&#125;.json, every year on the 2024 precinct layer ({link("/analysis/internal-methodology/precinct-district", "Precinct districts")}). lib/stateLegDistrictRows.ts sums them into one row per district, year and office.</> },
          { term: "Placement on today's lines", def: "Past years: each precinct is divided among today's districts by its 2020 block population (data-entry/precincts/district-shares/{ST}-{chamber}.json, scripts/precincts/build_district_shares.py --all, keyed by district GEOID; a precinct holding no block point goes by a point inside its own shape). Checked against vote-exact 2024 labels in 45 chambers: median district difference 0.0 points. 2026 with the chamber on the ballot: the precinct's own label, split precincts by each part's legislative votes. The chamber's own race in any year held on today's map: by the seat each vote was cast in (from 2026-11-27; population had pulled slivers of neighbouring seats in, e.g. Ohio House 34 in 2024 read D+5.9 at 99% contested instead of its certified D+6.4)." },
          { term: "Seat-bounded spreading", def: "Where a source line matches no precinct, scripts/precincts/build_results_medsl.py spreads it within the county. Since 2026-11-26 a legislative or U.S. House seat's votes stay inside the seat as drawn that year (historical legislative maps; congressional maps by year), and each party's votes go where that party votes (a nearby top-of-ticket result). Before, a staggered chamber's spread landed in precincts whose seat was not up (Missouri 2018 Senate 8 in Kansas City)." },
          { term: "Rounds", def: "Georgia 2020 Senate races and 2022 Senate are the runoffs the site counts; Mississippi's 2018 special is its runoff; Louisiana's November U.S. House rows are all-party primaries. Alaska's ranked-choice races are final rounds, rebuilt from the Division of Elections' cast vote record (scripts/precincts/build_alaska_rcv.py); Maine's 2nd district still reports first choices by precinct." },
          { term: "Dropped rows", def: `A district row is left out when more than ${Math.round(MAX_MISSING * 100)}% of the district has no votes for the race on file.` },
        ]} />
      </Section>

      <Section id="validation" kicker="Validation" title="The conditional test, legislative version"
        lede={<>As for State TPL: TPL is a measurement, so its one predictive claim is conditional. Every clean legislative race of year Y (one contested seat making up the district on today&apos;s lines; for 2026 the counted result) is taken apart as result = TPL built from earlier years + the year&apos;s environment (one number per year, solved exactly) + the race&apos;s incumbency and money terms + leftover. Each figure is the mean leftover in points; lower is better. Generated {V.generatedAt} by scripts/stateLegTplValidation.ts --emit.</>}>
        <DataTable
          head={["Year", "Races", "Env", "TPL alone", "TPL + terms", "Pres alone", "Pres + terms", "TPL, env per chamber", "Pres, env per chamber", "Frozen lean + terms (2026)"]}
          rows={rows}
          align="lrrrrrrrrr"
          maxWidth="max-w-5xl"
          caption={<>Pres = the district&apos;s last presidential margin before the race, on today&apos;s lines. TPL is lower in {V.pooled.tplBetterIn} of {V.pooled.years} years. In 2026 the frozen 2026 lean (built for seat forecasting, with each seat&apos;s own last race weighted three times) does better than TPL on the same races; TPL measures how the district votes across every office.</>}
        />
      </Section>

      {ex && (
        <Section id="example" kicker="Worked example · live" title="Pennsylvania State House District 151"
          lede={<>District page: {link("/states/pa/legislature/house#hd-151", "PA House 151")}.</>}>
          <Block label="Year aggregation" meta="margin before the environment · WRS after">
            <DataTable head={["Year", "Offices", "Margin", "Env", "WRS", "Weight"]} align="llrrrr"
              rows={[...ex.years].sort((a, b) => b.year - a.year).map((y) => [y.year, y.racesPresent.join(" "), <M key="m" v={y.WRS + y.env} />, (-y.env).toFixed(1), <M key="w" v={y.WRS} />, `${Math.round(y.finalWeight * 100)}%`])} />
          </Block>
          <Ledger lines={[{ label: "District TPL", value: <M v={ex.tpl} />, total: true }, { op: "", label: "Pennsylvania State TPL", value: <M v={ex.stateTpl} /> }, { op: "", label: "Statewide anchor (P/S/G rows alone)", value: <M v={ex.anchor} /> }]} />
          <P>The 2016 State House row is R+11 (a Republican incumbent in a D+19 district); its year is checked against the anchor and its weight cut accordingly.</P>
        </Section>
      )}

      <Section id="constants" kicker="Constants" title="What is set where">
        <Constants rows={constants} />
        <P>Everything else is documented under {link("/analysis/internal-methodology/state-tpl", "State TPL")} and {link("/analysis/internal-methodology/county-tpl", "County TPL")}.</P>
      </Section>

      <Section id="files" kicker="Reference" title="Code and commands">
        <FilesAndCommands files={[
          { path: "lib/stateLegDistrictRows.ts", role: "District race rows from the precinct files: coverage, uncontested part, seats, slate and post rules." },
          { path: "lib/stateLegTpl.ts", role: "legDistrictModel / legChamberModels: the model." },
          { path: "lib/stateLegTplPage.ts", role: "The district view's data (one file per district)." },
          { path: "components/tpl/StateLegTplSection.tsx", role: "The District TPL section on a district view." },
          { path: "public/state-leg-tpl/{chamber}/{ST}/{key}.json", role: "Per-district files, written by the atlas build." },
        ]} commands={[
          { cmd: "npx tsx --conditions=react-server scripts/buildStateLegAtlasSlices.ts", does: "Rebuilds the chamber slices (with each district's TPL) and the per-district TPL files." },
          { cmd: "npx tsx --conditions=react-server scripts/stateLegTplValidation.ts --emit", does: "The conditional test above (data/stateLegTplValidation.ts); --by-state lists the worst states." },
          { cmd: "npx tsx --conditions=react-server scripts/checkStateLegTpl.ts", does: "Timing and how TPL sits against the 2024 presidential margin and the frozen lean." },
          { cmd: "npx tsx --conditions=react-server scripts/checkDistrictRowSuspects.ts", does: "Rows far from the district's other results: placement errors and real crossovers." },
          { cmd: "python3 scripts/precincts/rebuild_legislature.py", does: "Rebuilds every precinct office build_results_medsl.py owns with the inputs each was built from." },
          { cmd: "npx tsx --conditions=react-server scripts/auditStateLegTpl.ts", does: "The arithmetic audit (rows, weights, TPL) over every district, plus the state comparison." },
          { cmd: "npx tsx --conditions=react-server scripts/checkStateLegSeatTotals.ts", does: "Precinct seat totals against the site's certified seat results, through the model's seat resolver." },
        ]} />
      </Section>
    </>
  );
}

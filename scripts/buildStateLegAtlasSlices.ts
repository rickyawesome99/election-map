/**
 * Builds the per-chamber JSON slices the Legislative District Atlas pages read:
 * public/state-leg-atlas/{house,senate}/{ST}.json - one file per chamber holding every district's
 * roster, demographics, presidential results on every map era, legislative results 2016-2025 and
 * redistricting history. Assembled server-side from the big data modules so no client component
 * ever imports them (the perf rule from the 2026-09 audit).
 *
 * Usage: npx tsx --conditions=react-server scripts/buildStateLegAtlasSlices.ts [OH ...]
 * (the react-server condition because the projection module is server-only)
 * Rerun after any of its inputs change: stateLegDistricts, stateLegDemographics, stateLegPres2024,
 * stateLegPresByEra, stateLegResults, stateLegRedistricting, stateLegHistoricalMaps, stateLegCalendar,
 * stateLegCandidates2026, stateLegOutgoing2026, stateLegFinance, and the turnout inputs behind lib/stateLegPopularVote.ts.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "../data/stateLegDistricts";
import { stateLegDemographics } from "../data/stateLegDemographics";
import { stateLegPres2024 } from "../data/stateLegPres2024";
import { stateLegPresByEra } from "../data/stateLegPresByEra";
import { stateLegResults } from "../data/stateLegResults";
import { stateLegRedistricting } from "../data/stateLegRedistricting";
import { stateLegHistoricalMaps } from "../data/stateLegHistoricalMaps";
import { stateLegCalendar } from "../data/stateLegCalendar";
import { stateLegCandidates2026, stateLegCandidates2026Fetched } from "../data/stateLegCandidates2026";
import { stateLegOutgoing2026 } from "../data/stateLegOutgoing2026";
import { projectChamber, projectDistrict } from "../lib/stateLegForecast";
import { projectChamberPopularVote } from "../lib/stateLegPopularVote";
import { stateLegMoneyHistory } from "../lib/stateLegMoney";
import { getNationalEnvironment } from "../lib/tplCompute";
import { compareDistrictKeys, type AtlasChamber, type AtlasDistrict, type AtlasEra, type AtlasPresVote, type AtlasResult } from "../lib/stateLegAtlas";
import { indexByNormalizedKey, lookupByDistrictCode } from "../lib/stateLegDistrictKey";

const OUT_ROOT = join(process.cwd(), "public", "state-leg-atlas");
const PRES_YEARS = ["2016", "2020", "2024"] as const;

function presVote(v: { demPct: number; repPct: number; margin: number; totalVotes?: number | null; estimated?: boolean } | undefined): AtlasPresVote | undefined {
  if (!v) return undefined;
  const out: AtlasPresVote = { demPct: v.demPct, repPct: v.repPct, margin: v.margin, totalVotes: v.totalVotes ?? null };
  if (v.estimated) out.estimated = true;
  return out;
}

function buildChamber(abbr: string, chamber: Chamber): AtlasChamber | null {
  const roster = stateLegDistricts[abbr]?.[chamber];
  if (!roster || roster.length === 0) return null;
  const calendar = stateLegCalendar[abbr]?.[chamber];
  const yearToVintage = stateLegHistoricalMaps[abbr]?.[chamber] ?? {};
  const presByEra = stateLegPresByEra[abbr]?.[chamber] ?? {};
  const pres2024 = stateLegPres2024[abbr]?.[chamber] ?? {};
  const demographics = stateLegDemographics[abbr]?.[chamber] ?? {};
  const redistricting = stateLegRedistricting[abbr]?.[chamber] ?? {};
  const resultsByYear = stateLegResults[abbr] ?? {};
  const candidates2026 = stateLegCandidates2026[abbr]?.[chamber];
  const outgoing2026 = stateLegOutgoing2026[abbr]?.[chamber];
  const chamberProjection = projectChamber(abbr, chamber);
  // A chamber with nothing on the 2026 ballot has no chamber projection, but every district still
  // gets its lean ledger (contest "not-up") for the district page's lean trend.
  const popularVote = projectChamberPopularVote(abbr, chamber);
  const votesByKey = new Map((popularVote?.districts ?? []).filter((d) => d.counted).map((d) => [d.key, { total: Math.round(d.votes), dem: Math.round(d.dem), rep: Math.round(d.rep), oth: Math.round(d.oth) }]));
  const projectionByKey = new Map((chamberProjection?.districts ?? (UNICAMERAL_STATES.has(abbr) && chamber === "house" ? [] : roster.map((d) => projectDistrict(abbr, chamber, d)))).map((d) => [d.key, d]));

  // Era list: superseded vintages oldest first, then the current map.
  const vintageYears = new Map<string, number[]>();
  for (const [year, vintage] of Object.entries(yearToVintage)) {
    const k = String(vintage);
    vintageYears.set(k, [...(vintageYears.get(k) ?? []), Number(year)].sort());
  }
  const eraKeys = [...vintageYears.keys()].sort((a, b) => Number(a) - Number(b)).concat("current");
  const calendarEras = calendar?.eras ?? [];
  const eras: AtlasEra[] = eraKeys.map((key, i) => {
    const years = key === "current"
      ? (calendar?.electionYears ?? []).filter((y) => !(String(y) in yearToVintage))
      : vintageYears.get(key) ?? [];
    // The calendar's eras are in the same chronological order; match by position from the end.
    const cal = calendarEras[calendarEras.length - (eraKeys.length - i)];
    const label = key === "current" ? "current" : years.length === 1 ? String(years[0]) : years.length ? `${years[0]}–${years[years.length - 1]}` : key;
    return { key, label, years, source: cal?.source, enactedDate: cal?.enactedDate, note: cal?.note, verified: cal?.verified ?? false };
  });

  const districts: AtlasDistrict[] = [...roster]
    .sort((a, b) => compareDistrictKeys(a.number, b.number))
    .map((d) => {
      const key = d.number;
      const current = presByEra["current"]?.[key];
      const presCurrent: AtlasDistrict["presCurrent"] = {};
      if (current?.["2016"]) presCurrent["2016"] = presVote(current["2016"]);
      if (current?.["2020"]) presCurrent["2020"] = presVote(current["2020"]);
      const exact2024 = pres2024[key];
      if (exact2024) presCurrent["2024"] = presVote(exact2024);
      else if (current?.["2024"]) presCurrent["2024"] = presVote(current["2024"]);

      const byEra = eraKeys
        .map((era) => {
          const rec = presByEra[era]?.[key];
          if (!rec) return null;
          const pres: AtlasDistrict["presByEra"][number]["pres"] = {};
          for (const y of PRES_YEARS) if (rec[y]) pres[y] = presVote(rec[y]);
          if (era === "current" && exact2024) pres["2024"] = presVote(exact2024);
          return { era, years: eras.find((e) => e.key === era)?.years ?? [], pres, pop2020: rec.pop2020 };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);

      const results: AtlasResult[] = [];
      for (const [year, chambers] of Object.entries(resultsByYear)) {
        const block = chambers[chamber];
        if (!block) continue;
        const index = indexByNormalizedKey(block.districts);
        const row = lookupByDistrictCode(index, abbr, chamber, key);
        if (!row) continue;
        results.push({ ...row, year: Number(year), era: year in yearToVintage ? String(yearToVintage[year]) : "current" });
      }
      results.sort((a, b) => b.year - a.year);

      const history = eraKeys
        .map((era) => redistricting[era]?.[key])
        .filter((x): x is NonNullable<typeof x> => x != null);

      const out: AtlasDistrict = {
        key,
        label: d.label,
        incumbents: d.incumbents ?? [],
        lastElection: d.lastElection ?? null,
        nextElection: d.nextElection ?? null,
        presCurrent,
        presByEra: byEra,
        results,
        redistricting: history,
      };
      if (d.geoid) out.geoid = d.geoid;
      if (d.seats != null) out.seats = d.seats;
      if (d.overlay) { out.overlay = true; out.components = d.components ?? []; }
      if (demographics[key]) out.demographics = demographics[key];
      if (candidates2026?.[key]) out.candidates2026 = candidates2026[key];
      if (outgoing2026?.[key]) out.outgoing2026 = outgoing2026[key];
      const money = stateLegMoneyHistory(abbr, chamber, key);
      if (money.length) out.money = money.map((m) => ({
        year: m.year, source: m.source, dataThrough: m.dataThrough,
        candidates: m.candidates.map((c) => ({ name: c.name, party: c.party, contributions: c.contributions, matched: c.matched })),
        unmatched: m.unmatched.map((c) => ({ name: c.name, party: c.party, contributions: c.contributions, matched: false })),
        demTotal: m.demTotal, repTotal: m.repTotal, gapPct: m.gapPct == null ? null : +m.gapPct.toFixed(1),
      }));
      const pr = projectionByKey.get(key);
      if (pr) {
        out.projection = {
          lean: pr.lean, beta: pr.beta, envPts: pr.envPts, incSign: pr.incSign, incPts: pr.incPts, margin: pr.margin, sigma: pr.sigma, pD: pr.pD,
          money: pr.money ? { gapPct: +pr.money.gapPct.toFixed(1), structuralGapPct: +pr.money.structuralGapPct.toFixed(1), scale: pr.money.scale, pts: +pr.money.pts.toFixed(2) } : null,
          rating: pr.rating, contest: pr.contest, seats: pr.seats, guaranteed: pr.guaranteed, contestedSeats: pr.contestedSeats,
          ...(pr.pI != null ? { pI: pr.pI } : {}),
          ...(votesByKey.has(key) ? { votes: votesByKey.get(key)! } : {}),
          ...(pr.indep ? { indep: { ...pr.indep, personal: +pr.indep.personal.toFixed(2), advantage: +pr.indep.advantage.toFixed(2), record: pr.indep.record.map((r) => ({ ...r, share: +r.share.toFixed(1), advantage: +r.advantage.toFixed(2), expected: +r.expected.toFixed(2), residual: +r.residual.toFixed(2) })) } } : {}),
          rows: pr.rows.map((r) => ({ ...r, raw: +r.raw.toFixed(2), presDelta: +r.presDelta.toFixed(2), incSign: +r.incSign.toFixed(2), incPts: +r.incPts.toFixed(2), envPts: +r.envPts.toFixed(2), moneyPts: +r.moneyPts.toFixed(2), gapPts: +r.gapPts.toFixed(2), NM: +r.NM.toFixed(2), huber: +r.huber.toFixed(3), weight: +r.weight.toFixed(4), coverage: +r.coverage.toFixed(3) })),
        };
      }
      return out;
    });

  return {
    abbr,
    chamber,
    built: new Date().toISOString().slice(0, 10),
    ...(candidates2026 ? { candidates2026Fetched: stateLegCandidates2026Fetched } : {}),
    ...(chamberProjection ? { projection: {
      year: chamberProjection.year, totalSeats: chamberProjection.totalSeats, seatsUp: chamberProjection.seatsUp, holdover: chamberProjection.holdover, decided: chamberProjection.decided,
      expectedDem: +chamberProjection.expectedDem.toFixed(1), expectedRep: +chamberProjection.expectedRep.toFixed(1), expectedOth: +chamberProjection.expectedOth.toFixed(1), lo80: chamberProjection.lo80, hi80: chamberProjection.hi80,
      majority: chamberProjection.majority, supermajority: chamberProjection.supermajority, pDemControl: chamberProjection.pDemControl, pRepControl: chamberProjection.pRepControl,
      pDemSuper: chamberProjection.pDemSuper, pRepSuper: chamberProjection.pRepSuper, unprojected: chamberProjection.unprojected,
      eHat: +getNationalEnvironment().eHat.toFixed(2), sigmaE: +getNationalEnvironment().sigmaE.toFixed(2),
    } } : {}),
    eras,
    electionYears: calendar?.electionYears ?? [],
    districts,
  };
}

const only = process.argv.slice(2).map((s) => s.toUpperCase());
const abbrs = (only.length ? only : Object.keys(stateLegDistricts)).sort();
let files = 0, bytes = 0;
for (const abbr of abbrs) {
  const chambers: Chamber[] = UNICAMERAL_STATES.has(abbr) ? ["senate"] : ["house", "senate"];
  for (const chamber of chambers) {
    const slice = buildChamber(abbr, chamber);
    if (!slice) continue;
    const dir = join(OUT_ROOT, chamber);
    mkdirSync(dir, { recursive: true });
    const text = JSON.stringify(slice);
    writeFileSync(join(dir, `${abbr}.json`), text);
    files += 1;
    bytes += text.length;
  }
}
console.log(`wrote ${files} chamber slices to public/state-leg-atlas/ (${(bytes / 1e6).toFixed(1)} MB total, ${(bytes / files / 1e3).toFixed(0)} KB average)`);

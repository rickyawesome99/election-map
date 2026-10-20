// Our state legislative forecast against State Navigate's and ElectIndex's, district by district,
// for /analysis/state-leg-models. Reads data-entry/state-leg-comparison/*.json (written by
// scripts/fetch-state-leg-comparison.mjs), joins every external seat row to our district keys,
// folds per-seat rows onto the district (mean margin and probability), and writes:
//
//   public/state-leg-comparison/summary.json     toplines, agreement statistics, chamber and state tables
//   public/state-leg-comparison/districts.json   one row per district with all three calls (the page's table)
//
//   npx tsx --conditions=react-server scripts/buildStateLegComparison.ts
//
// Re-run after any model change (ours is computed here, like the atlas slices) or a fresh fetch.
import fs from "node:fs";
import path from "node:path";
import { projectAllChambers, type DistrictProjection } from "@/lib/stateLegForecast";
import { stateLegDistricts, type Chamber } from "@/data/stateLegDistricts";
import { statesData } from "@/data/statesData";
import { indexByNormalizedKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";
import { districtHash, shortDistrictName } from "@/lib/stateLegAtlas";
import type { ComparisonDistrict, ComparisonSummary, ModelCall, ModelId } from "@/lib/stateLegComparison";

const IN = path.join(process.cwd(), "data-entry", "state-leg-comparison");
const OUT = path.join(process.cwd(), "public", "state-leg-comparison");
fs.mkdirSync(OUT, { recursive: true });

type SnRow = { district: string; name: string; margin: number; pR: number | null; rating: string; current: string | null; leading: string | null; noElection: boolean; uncontested: boolean };
type SnFile = { fetched: string; hero: { seats: number; demPickups: number; repPickups: number } | null; chambers: { abbr: string; chamber: Chamber; pDemControl: number | null; runDate: string | null; rows: SnRow[] }[] };
type EiRow = { raceCode: string; abbr: string; chamber: Chamber; district: string; seat: string | null; numSeats: number; margin: number | null; pD: number | null; rating: string; uncontested: string | null; incumbentParty: string | null };
type EiFile = { fetched: string; runDate: string | null; chambers: { abbr: string; chamber: Chamber; total: number | null; curDem: number | null; curRep: number | null; projDemMean: number | null; pDemControl: number | null }[]; rows: EiRow[] };

const sn = JSON.parse(fs.readFileSync(path.join(IN, "statenavigate.json"), "utf8")) as SnFile;
const ei = JSON.parse(fs.readFileSync(path.join(IN, "electindex.json"), "utf8")) as EiFile;

const ORD: Record<string, string> = { "1st": "First", "2nd": "Second", "3rd": "Third", "4th": "Fourth", "5th": "Fifth", "6th": "Sixth", "7th": "Seventh", "8th": "Eighth", "9th": "Ninth", "10th": "Tenth" };

/** Every spelling an external key might take for one of our district keys. */
function keyCandidates(key: string, name: string): string[] {
  const nm = name.trim();
  const out = [key, nm,
    key.replace(/^(HD|SD|AD|LD)-/, ""),                                                   // ElectIndex HD-1 -> 1
    key.replace(/[AB]$/, ""), key.replace(/s\d$/, ""),                                     // Idaho seat A/B, Washington pos 1/2
    key.replace(/^([A-Z]{2})(\d)$/, "$10$2"),                                              // NH HI3 -> HI03
    nm.replace(/^(\d+)(st|nd|rd|th) /, (m, n, o) => (ORD[n + o] ?? m) + " "),              // MA 2nd Worcester -> Second Worcester
    nm.replace(/ (\d+)$/, "-$1"), nm.replace(/ 1$/, ""),                                    // VT Addison-Rutland 1 -> Addison-Rutland(-1)
    nm.replace(/-1$/, ""),
    nm.replace(/^[A-Z]{2} (Senate|House) /, ""),                                            // ElectIndex's malformed "HI Senate 19" / "WY Senate 6" keys
  ];
  const m = nm.normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/^([A-Za-z]+)[ -](\d+)( s\d)?$/);   // Coös -> Coos                                      // NH Belknap 8 / Belknap-8 -> BE8, BE08
  if (m) { const c2 = m[1].slice(0, 2).toUpperCase(); out.push(`${c2}${m[2]}`, `${c2}${m[2].padStart(2, "0")}`); }
  return [...new Set(out)];
}

const byAbbr = new Map(statesData.map((s) => [s.abbr, s]));
const chambers = projectAllChambers();
const districts: ComparisonDistrict[] = [];
const unmatched: Record<ModelId, string[]> = { ours: [], sn: [], ei: [] };

type Fold = { margins: number[]; pDs: number[]; ratings: string[]; unc: boolean[]; current: string[]; leading: string[] };
const foldInit = (): Fold => ({ margins: [], pDs: [], ratings: [], unc: [], current: [], leading: [] });
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function callOf(f: Fold | undefined): ModelCall | null {
  if (!f || !f.margins.length) return null;
  const pD = mean(f.pDs);
  return { m: +mean(f.margins)!.toFixed(2), pD: pD == null ? null : +pD.toFixed(3), rating: f.ratings.sort((a, b) => f.ratings.filter((x) => x === a).length - f.ratings.filter((x) => x === b).length).pop() ?? "", unc: f.unc.every(Boolean), n: f.margins.length, cur: f.current.find((x) => x === "D" || x === "R") ?? null, lead: f.leading.find((x) => x === "D" || x === "R") ?? null };
}

const chamberRows: ComparisonSummary["chambers"] = [];
const ourProjection = new Map(chambers.flatMap((c) => c.districts.map((d) => [`${c.abbr}-${c.chamber}-${d.key}`, d] as const)));
for (const c of chambers) {
  const state = byAbbr.get(c.abbr)!;
  const roster = stateLegDistricts[c.abbr]?.[c.chamber] ?? [];
  const ourByKey: Record<string, DistrictProjection> = Object.fromEntries(c.districts.map((d) => [d.key, d]));
  const idx = indexByNormalizedKey(ourByKey);
  const find = (key: string, name: string): DistrictProjection | null => { for (const k of keyCandidates(key, name)) { const h = lookupByDistrictCode(idx, c.abbr, c.chamber, k); if (h) return h; } return null; };

  // State Navigate: one row per seat; holdovers ("no election") are not compared but count for the chamber.
  const snC = sn.chambers.find((x) => x.abbr === c.abbr && x.chamber === c.chamber);
  const snFold = new Map<string, Fold>();
  let snDemAll = 0, snRepAll = 0;
  for (const r of snC?.rows ?? []) {
    if (r.leading === "D") snDemAll += 1; else if (r.leading === "R") snRepAll += 1;
    if (r.noElection) continue;
    const d = find(r.district, r.name);
    if (!d) { unmatched.sn.push(`${c.abbr}-${c.chamber} ${r.district} / ${r.name}`); continue; }
    const f = snFold.get(d.key) ?? foldInit(); snFold.set(d.key, f);
    f.margins.push(r.margin); if (r.pR != null) f.pDs.push(1 - r.pR); f.ratings.push(r.rating); f.unc.push(r.uncontested); f.current.push(r.current ?? ""); f.leading.push(r.leading ?? "");
  }
  // ElectIndex: one row per seat in the A/B states, one per district elsewhere (num_seats).
  const eiC = ei.chambers.find((x) => x.abbr === c.abbr && x.chamber === c.chamber);
  const eiFold = new Map<string, Fold>();
  for (const r of ei.rows.filter((x) => x.abbr === c.abbr && x.chamber === c.chamber)) {
    // The district token is the district (Idaho HD-10 + seat A; Maryland's HD-11B is a subdistrict with
    // seats A/B); South Dakota's HD-26A/B subdistricts come as HD-26 + seat, so district+seat is the fallback.
    const sub = r.raceCode.replace(/^[A-Z]{2}-/, "");                                       // SD-HD-26A: the A/B lives only in the race code
    const d = find(r.district, r.district) ?? (r.seat ? find(`${r.district}${r.seat}`, `${r.district}${r.seat}`) : null) ?? find(sub, sub);
    if (!d) { unmatched.ei.push(`${c.abbr}-${c.chamber} ${r.raceCode}`); continue; }
    const f = eiFold.get(d.key) ?? foldInit(); eiFold.set(d.key, f);
    if (r.margin != null) { f.margins.push(r.margin); if (r.pD != null) f.pDs.push(r.pD); f.ratings.push(r.rating); f.unc.push(!!r.uncontested); f.current.push(r.incumbentParty ?? ""); f.leading.push(r.pD == null ? "" : r.pD >= 0.5 ? "D" : "R"); }
  }

  for (const d of c.districts) {
    if (d.contest === "not-up") continue;
    const rd = roster.find((x) => x.number === d.key);
    const sitting = (rd?.incumbents ?? []).map((i) => i.party);
    const cur = sitting.length === 0 ? "vac" : new Set(sitting).size === 1 ? (sitting[0] === "D" || sitting[0] === "R" ? sitting[0] : "O") : "mixed";
    const ours: ModelCall | null = d.margin == null ? null : {
      m: +d.margin.toFixed(2), pD: d.pD == null ? null : +d.pD.toFixed(3), rating: d.rating ?? (d.contest === "uncontested-D" ? "Uncontested D" : d.contest === "uncontested-R" ? "Uncontested R" : d.contest === "independent" ? "Independent race" : d.contest === "split" ? "Split" : "—"),
      unc: d.contest === "uncontested-D" || d.contest === "uncontested-R", n: d.seats, cur: cur === "D" || cur === "R" ? cur : null,
      lead: d.contest === "independent" ? ((d.pI ?? 0) >= 0.5 ? "I" : d.indep!.slot === "D" ? "R" : "D") : d.contest === "split" ? (d.guaranteed.dem >= d.guaranteed.rep ? "D" : "R") : d.pD == null ? null : d.pD >= 0.5 ? "D" : "R",
    };
    districts.push({
      abbr: c.abbr, chamber: c.chamber, key: d.key, label: shortDistrictName(c.chamber, d.key), href: `/states/${state.id}/legislature/${c.chamber}${districtHash(c.chamber, d.key)}`,
      seats: d.seats, cur, contest: d.contest, ours, sn: callOf(snFold.get(d.key)), ei: callOf(eiFold.get(d.key)),
    });
  }

  const sittingD = roster.reduce((s, r) => s + (r.incumbents ?? []).filter((i) => i.party === "D").length, 0);
  const sittingR = roster.reduce((s, r) => s + (r.incumbents ?? []).filter((i) => i.party === "R").length, 0);
  chamberRows.push({
    abbr: c.abbr, chamber: c.chamber, state: state.name, href: `/states/${state.id}/legislature/${c.chamber}`, totalSeats: c.totalSeats, seatsUp: c.seatsUp, nowD: sittingD, nowR: sittingR,
    ours: { d: +c.expectedDem.toFixed(1), r: +c.expectedRep.toFixed(1), pD: c.pDemControl },
    sn: snC ? { d: snDemAll, r: snRepAll, pD: snC.pDemControl } : null,
    ei: eiC && eiC.projDemMean != null ? { d: eiC.projDemMean, r: eiC.total != null ? +(eiC.total - eiC.projDemMean).toFixed(1) : null, pD: eiC.pDemControl } : null,
  });
}

// ── agreement statistics ──────────────────────────────────────────────────────
const MODELS: Exclude<ModelId, "ours">[] = ["sn", "ei"];
function agreement(model: Exclude<ModelId, "ours">): ComparisonSummary["agreement"][number] {
  const both = districts.filter((d) => d.ours && d[model] && d.contest === "contested" && !d[model]!.unc && d.ours.pD != null && d[model]!.pD != null);
  const diffs = both.map((d) => d.ours!.m - d[model]!.m);
  const n = both.length;
  const mx = both.reduce((s, d) => s + d[model]!.m, 0) / n, my = both.reduce((s, d) => s + d.ours!.m, 0) / n;
  const cov = both.reduce((s, d) => s + (d[model]!.m - mx) * (d.ours!.m - my), 0);
  const vx = both.reduce((s, d) => s + (d[model]!.m - mx) ** 2, 0), vy = both.reduce((s, d) => s + (d.ours!.m - my) ** 2, 0);
  const bandOf = (m: number) => Math.min(5, Math.floor(Math.abs(m) / 5));
  const bands = Array.from({ length: 6 }, (_, b) => ({ band: b === 5 ? "25+" : `${b * 5}–${b * 5 + 5}`, ours: [] as number[], theirs: [] as number[] }));
  for (const d of both) {
    bands[bandOf(d.ours!.m)].ours.push(Math.max(d.ours!.pD!, 1 - d.ours!.pD!));
    bands[bandOf(d[model]!.m)].theirs.push(Math.max(d[model]!.pD!, 1 - d[model]!.pD!));
  }
  const states = new Map<string, number[]>();
  for (const d of both) states.set(d.abbr, [...(states.get(d.abbr) ?? []), d.ours!.m - d[model]!.m]);
  return {
    model, n,
    bias: +(diffs.reduce((a, b) => a + b, 0) / n).toFixed(2),
    mad: +(diffs.reduce((a, b) => a + Math.abs(b), 0) / n).toFixed(2),
    corr: +(cov / Math.sqrt(vx * vy)).toFixed(3),
    favoredDisagree: both.filter((d) => (d.ours!.pD! >= 0.5) !== (d[model]!.pD! >= 0.5)).length,
    within10: both.filter((d) => Math.abs(d.ours!.m) <= 10 || Math.abs(d[model]!.m) <= 10).length,
    bands: bands.map((b) => ({ band: b.band, ours: b.ours.length ? +(mean(b.ours)! ).toFixed(3) : null, oursN: b.ours.length, theirs: b.theirs.length ? +(mean(b.theirs)!).toFixed(3) : null, theirsN: b.theirs.length })),
    states: [...states.entries()].filter(([, v]) => v.length >= 10).map(([abbr, v]) => ({ abbr, n: v.length, bias: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), mad: +(v.reduce((a, b) => a + Math.abs(b), 0) / v.length).toFixed(1) })).sort((a, b) => a.bias - b.bias),
  };
}

// ── toplines: favored seats and pickups by each model's own reckoning ──────────
function topline(model: ModelId): ComparisonSummary["toplines"][number] {
  let demFav = 0, repFav = 0, othFav = 0, demPick = 0, repPick = 0, n = 0;
  for (const d of districts) {
    const c = d[model];
    if (!c || c.lead == null) continue;
    n += d.seats;
    if (model === "ours") {
      // Seats the field decides go to their party; the rest follow the favorite.
      const p = ourProjection.get(`${d.abbr}-${d.chamber}-${d.key}`)!;
      demFav += p.guaranteed.dem + (c.lead === "D" ? p.contestedSeats || (d.contest === "contested" ? 0 : d.seats) : 0);
      repFav += p.guaranteed.rep + (c.lead === "R" ? p.contestedSeats || (d.contest === "contested" ? 0 : d.seats) : 0);
      if (c.lead === "I") othFav += d.seats;
    }
    else if (c.lead === "D") demFav += d.seats; else if (c.lead === "R") repFav += d.seats; else othFav += d.seats;
    if (c.cur && c.lead !== c.cur) { if (c.lead === "D") demPick += d.seats; else if (c.lead === "R") repPick += d.seats; }
  }
  const demChambers = chamberRows.filter((c) => (c[model]?.pD ?? 0) >= 0.5).length;
  return { model, seats: n, demFav, repFav, othFav, demPick, repPick, demChambers };
}

const summary: ComparisonSummary = {
  built: new Date().toISOString().slice(0, 10),
  sources: {
    sn: { name: "State Navigate", url: "https://projects.statenavigate.com/25-26/national/", fetched: sn.fetched, run: sn.chambers.find((c) => c.runDate)?.runDate ?? null, hero: sn.hero },
    ei: { name: "ElectIndex", url: "https://electindex.com/forecasts/#legislatures", fetched: ei.fetched, run: ei.runDate, hero: null },
  },
  districts: districts.length,
  toplines: (["ours", "sn", "ei"] as ModelId[]).map(topline),
  agreement: MODELS.map(agreement),
  chambers: chamberRows,
  unmatched: { sn: unmatched.sn.length, ei: unmatched.ei.length },
};

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary));
fs.writeFileSync(path.join(OUT, "districts.json"), JSON.stringify(districts));
console.log(`${districts.length} districts; matched SN ${districts.filter((d) => d.sn).length}, EI ${districts.filter((d) => d.ei).length}; unmatched SN ${unmatched.sn.length}, EI ${unmatched.ei.length}`);
for (const m of MODELS) { const a = summary.agreement.find((x) => x.model === m)!; console.log(`${m}: n=${a.n} corr ${a.corr} mad ${a.mad} bias ${a.bias} favored-side disagreements ${a.favoredDisagree}`); }
console.log("toplines", summary.toplines);
if (unmatched.sn.length) console.log("unmatched SN:", unmatched.sn.slice(0, 20).join("; "));
if (unmatched.ei.length) console.log("unmatched EI:", unmatched.ei.slice(0, 30).join("; "));

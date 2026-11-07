// The 2026 results snapshot behind /analysis/post-election: every Senate, governor and House race's
// current count, by seat and by county, read fresh from civicAPI and run through the same steps as
// the Results page (normalizeRace → night fit → needle), so the figures are the ones /results shows.
//
//   npm run results-snapshot
//
// Writes data-entry/results_2026_seats.csv and data-entry/results_2026_counties.csv (R-positive
// margins in points of all votes). dem_/rep_ votes are the race's two slots, as on the Results page:
// a multi-field race's are party blocs (AK and ME first choices, the Louisiana jungle), and in a
// same-party contest both are one party's. Sum party_d_votes / party_r_votes for a popular vote;
// `candidates` has everyone. feed_pct_reporting is the percent the needle reads, which is held at the
// feed's old figure until votes arrive (lib/resultsFeed.ts heldPct), so a held row isn't what the feed sent. In the
// county file blank votes mean the feed sent no row for that county, 0 means it sent a zero, and
// blank forecast columns mark a row the feed sent that the county projection lacks.
//
// The feed can go backward: on Nov 5 it re-served Indiana's races at older counts (IN-03 199,872 at
// R+9.8, matching AP, to 152,963 at D+18.0, with the race called R). A race more than HOLD_DROP below
// the saved file keeps the newest archived payload at the saved total (source = held) and is named in
// the log. Review those: a real correction is taken with --accept IN-03,FL-08 (race labels). The all-time
// high is no guide, since the feed's New York races once ran at exactly three times the real count.
//
// A race that keeps failing falls back to the local intake's copy (data-entry/results-live/), and
// is named in the log; with no copy either, nothing is written.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { resultsPriors } from "@/lib/resultsPriors";
import { CIVIC_BASE, normalizeRace } from "@/lib/resultsFeed";
import { nightObservations, partyVotes, projectRace } from "@/lib/resultsNeedle";
import { fitNight } from "@/lib/resultsNight";
import { parseCsv } from "@/lib/turnout";
import { RESULTS_OFFICES, type LiveRace, type RacePrior, type ResultsOffice } from "@/lib/resultsTypes";

const CONCURRENCY = 8;
const ROUNDS = 4;
const AUDIT_GAP = 0.005;
const HOLD_DROP = 0.005;

const UA = { "User-Agent": "election-map-snapshot/1.0 (+https://github.com/rickyawesome99/election-map)", Accept: "application/json" };
const SEATS_FILE = join(process.cwd(), "data-entry", "results_2026_seats.csv");
const COUNTIES_FILE = join(process.cwd(), "data-entry", "results_2026_counties.csv");

const SEAT_COLUMNS = [
  "office", "race_id", "label", "state", "state_name", "special", "civic_id", "contest",
  "dem_name", "dem_party", "dem_incumbent", "rep_name", "rep_party", "rep_incumbent", "seat_party", "seat_holder",
  "dem_votes", "rep_votes", "other_votes", "total_votes", "party_d_votes", "party_r_votes", "margin", "feed_pct_reporting", "counted_share",
  "called", "called_at", "winner_party", "winner_name", "flip",
  "forecast_margin", "forecast_rating", "projected_margin", "projected_sigma", "projected_total", "projection_tier",
  "county_votes", "candidates", "last_updated", "fetched_at", "source",
] as const;
const COUNTY_COLUMNS = [
  "office", "race_id", "label", "state", "fips", "county", "region_type", "feed_pct_reporting",
  "dem_votes", "rep_votes", "other_votes", "total_votes", "party_d_votes", "party_r_votes", "margin",
  "expected_votes", "forecast_margin", "projected_margin", "projected_total", "done",
] as const;

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (columns: readonly string[], rows: Record<string, unknown>[]) =>
  [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
const round = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? "" : Number(v.toFixed(d)));
const marginOf = (dem: number, rep: number, total: number) => (total > 0 ? ((rep - dem) / total) * 100 : null);

async function fetchRaw(civicId: number): Promise<unknown> {
  const res = await fetch(`${CIVIC_BASE}race/${civicId}`, { headers: UA, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Every race's full payload: rounds of bounded fetches over whatever is still missing. */
async function fetchAll(priors: RacePrior[]): Promise<Map<number, { raw: unknown; at: number }>> {
  const got = new Map<number, { raw: unknown; at: number }>();
  let todo = priors.filter((p) => p.civicId);
  for (let round = 1; round <= ROUNDS && todo.length; round++) {
    let i = 0, last = "";
    const worker = async () => {
      while (i < todo.length) {
        const p = todo[i++];
        try { got.set(p.civicId!, { raw: await fetchRaw(p.civicId!), at: Date.now() }); }
        catch (e) { last = `${p.office} ${p.id}: ${(e as Error).message}`; }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    todo = todo.filter((p) => !got.has(p.civicId!));
    console.log(`  round ${round}: ${got.size} fetched, ${todo.length} left${last ? ` (last error: ${last})` : ""}`);
    if (todo.length && round < ROUNDS) await new Promise((r) => setTimeout(r, 5000 * round));
  }
  // The local intake's copy, for a race the feed will not serve.
  const missing: string[] = [];
  for (const p of todo) {
    const local = join(process.cwd(), "data-entry", "results-live", `${p.civicId}.json`);
    if (!existsSync(local)) { missing.push(`${p.office} ${p.id}`); continue; }
    got.set(p.civicId!, { raw: JSON.parse(readFileSync(local, "utf8")), at: Date.now() });
    console.warn(`  ${p.office} ${p.id}: feed failed, using the local intake's copy`);
  }
  if (missing.length) throw new Error(`no data for ${missing.length} races (${missing.slice(0, 8).join(", ")}…); nothing written`);
  return got;
}

type Payload = { raw: unknown; at: number };

/** Races that fell more than HOLD_DROP below the saved file, each with the newest archived payload at
 *  its saved total. A race the archive has no such payload for stays on the feed, with a warning. */
function holdBackDrops(all: RacePrior[], raw: Map<number, Payload>): Map<number, Payload> {
  const held = new Map<number, Payload>();
  if (!existsSync(SEATS_FILE)) return held;
  const flag = process.argv.indexOf("--accept");
  const accepted = new Set(flag > 0 ? process.argv[flag + 1].split(",") : []);
  const saved = new Map(parseCsv(readFileSync(SEATS_FILE, "utf8")).map((r) => [Number(r.civic_id), Number(r.total_votes)]));
  const waiting = new Map<number, { prior: RacePrior; total: number }>();
  for (const prior of all) {
    const hit = prior.civicId ? raw.get(prior.civicId) : undefined, total = saved.get(prior.civicId ?? 0);
    if (!hit || !total) continue;
    const now = normalizeRace(prior, hit.raw as never, hit.at).total;
    if (total - now <= HOLD_DROP * total) continue;
    if (accepted.has(prior.label)) { console.warn(`  ${prior.label}: ${total} → ${now} accepted as a correction`); continue; }
    waiting.set(prior.civicId!, { prior, total });
  }
  if (!waiting.size) return held;
  const archive = join(process.cwd(), "data-entry", "results-archive");
  const files = existsSync(archive) ? readdirSync(archive).filter((d) => d.startsWith("2026-11-03")).flatMap((d) => readdirSync(join(archive, d)).filter((f) => f.endsWith(".json.gz")).map((f) => ({ f, path: join(archive, d, f) }))) : [];
  files.sort((a, b) => b.f.localeCompare(a.f));
  for (const { path } of files) {
    if (held.size === waiting.size) break;
    const snap = JSON.parse(gunzipSync(readFileSync(path)).toString()) as { fetchedAt: string; races: Record<string, unknown> };
    const at = Date.parse(snap.fetchedAt);
    for (const [id, { prior, total }] of waiting) {
      if (held.has(id) || !snap.races[id]) continue;
      if (normalizeRace(prior, snap.races[id] as never, at).total === total) held.set(id, { raw: snap.races[id], at });
    }
  }
  for (const [id, { prior, total }] of waiting) {
    const now = normalizeRace(prior, raw.get(id)!.raw as never, raw.get(id)!.at).total;
    if (held.has(id)) console.warn(`  HELD ${prior.office} ${prior.label}: feed fell ${total.toLocaleString("en-US")} → ${now.toLocaleString("en-US")}; kept the ${new Date(held.get(id)!.at).toISOString()} payload`);
    else console.warn(`  NOT HELD ${prior.office} ${prior.label}: feed fell ${total.toLocaleString("en-US")} → ${now.toLocaleString("en-US")}, and no archived payload has the saved total`);
  }
  return held;
}

async function main() {
  const priors = Object.fromEntries(RESULTS_OFFICES.map((o) => [o, resultsPriors(o).races])) as Record<ResultsOffice, RacePrior[]>;
  const all = RESULTS_OFFICES.flatMap((o) => priors[o]);
  const unmapped = all.filter((p) => !p.civicId);
  if (unmapped.length) console.warn(`  no civicAPI id: ${unmapped.map((p) => p.id).join(", ")}`);
  console.log(`Fetching ${all.length} races from civicAPI…`);
  const raw = await fetchAll(all);
  const held = holdBackDrops(all, raw);

  // As the Results page: test payloads read as nothing in; the night fit is over every race at once.
  const pairs = all.map((prior) => {
    const hit = prior.civicId ? held.get(prior.civicId) ?? raw.get(prior.civicId) : undefined;
    const live: LiveRace | null = hit ? normalizeRace(prior, hit.raw as never, hit.at) : null;
    // A held race keeps any call the feed has made since.
    const latest = prior.civicId && held.has(prior.civicId) ? normalizeRace(prior, raw.get(prior.civicId)!.raw as never) : null;
    if (live && latest?.called && !live.called) { live.called = true; live.calledAt = latest.calledAt; live.winner = latest.winner; }
    return { prior, live: live?.testData ? null : live };
  });
  const fit = fitNight(pairs.flatMap(({ prior, live }) => nightObservations(prior, live)));

  const seats: Record<string, unknown>[] = [];
  const counties: Record<string, unknown>[] = [];
  const gaps: string[] = [];
  const order = (o: ResultsOffice) => (o === "senate" ? 0 : o === "governor" ? 1 : 2);
  pairs.sort((a, b) => a.prior.state.localeCompare(b.prior.state) || order(a.prior.office) - order(b.prior.office) || a.prior.id.localeCompare(b.prior.id, "en", { numeric: true }));
  for (const { prior, live } of pairs) {
    const proj = projectRace(prior, live, undefined, fit);
    const won = proj.locked ? proj.winner : null;
    const liveCounties = live?.counties ?? [];
    const countyVotes = liveCounties.reduce((a, c) => a + c.total, 0);
    if (live && live.total > 0 && Math.abs(countyVotes - live.total) > AUDIT_GAP * live.total) {
      gaps.push(`${prior.office} ${prior.label}: race ${live.total.toLocaleString("en-US")}, counties ${countyVotes.toLocaleString("en-US")} (${liveCounties.length} rows)`);
    }
    seats.push({
      office: prior.office, race_id: prior.id, label: prior.label, state: prior.state, state_name: prior.stateName, special: prior.special ? 1 : 0, civic_id: prior.civicId, contest: prior.forecast.contest,
      dem_name: prior.dem.name, dem_party: prior.dem.party, dem_incumbent: prior.dem.incumbent ? 1 : 0, rep_name: prior.rep.name, rep_party: prior.rep.party, rep_incumbent: prior.rep.incumbent ? 1 : 0, seat_party: prior.seatParty, seat_holder: prior.seatHolder,
      dem_votes: live?.dem ?? 0, rep_votes: live?.rep ?? 0, other_votes: live?.oth ?? 0, total_votes: live?.total ?? 0, party_d_votes: live ? partyVotes(prior, live).dem : 0, party_r_votes: live ? partyVotes(prior, live).rep : 0, margin: round(marginOf(live?.dem ?? 0, live?.rep ?? 0, live?.total ?? 0)), feed_pct_reporting: live ? round(live.percentReporting, 2) : "", counted_share: round(proj.countedShare, 4),
      called: proj.locked ? 1 : 0, called_at: live?.calledAt, winner_party: won, winner_name: live?.candidates.find((c) => c.winner)?.name, flip: won && prior.seatParty && won !== prior.seatParty ? 1 : 0,
      forecast_margin: round(prior.forecast.margin), forecast_rating: prior.forecast.rating, projected_margin: round(proj.margin), projected_sigma: round(proj.sigma), projected_total: proj.projectedTotal, projection_tier: proj.tier,
      county_votes: live?.counties ? countyVotes : "", candidates: live?.candidates.map((c) => `${c.name} (${c.party}) ${c.votes}`).join("; "), last_updated: live?.lastUpdated, fetched_at: live ? new Date(live.fetchedAt).toISOString() : "", source: prior.civicId && held.has(prior.civicId) ? "held" : "feed",
    });

    const base = { office: prior.office, race_id: prior.id, label: prior.label, state: prior.state };
    const byFips = new Map(liveCounties.filter((c) => c.fips).map((c) => [c.fips!, c]));
    const projected = new Map(proj.counties.map((c) => [c.fips, c]));
    for (const c of prior.counties) {
      const l = byFips.get(c.fips), p = projected.get(c.fips);
      byFips.delete(c.fips);
      counties.push({
        ...base, fips: c.fips, county: c.name, region_type: l?.type, feed_pct_reporting: l?.pct,
        dem_votes: l?.dem, rep_votes: l?.rep, other_votes: l?.oth, total_votes: l?.total, party_d_votes: l ? partyVotes(prior, l).dem : "", party_r_votes: l ? partyVotes(prior, l).rep : "", margin: l ? round(marginOf(l.dem, l.rep, l.total)) : "",
        expected_votes: p?.expected ?? c.votes, forecast_margin: c.margin, projected_margin: round(p?.projectedMargin), projected_total: p?.projectedTotal, done: p?.done ? 1 : 0,
      });
    }
    // Rows the feed sent that the projection lacks: their votes are real, so they are kept.
    const known = new Set(prior.counties.map((c) => c.fips));
    for (const l of liveCounties) {
      if (l.fips && known.has(l.fips)) continue;
      counties.push({
        ...base, fips: l.fips, county: l.name, region_type: l.type, feed_pct_reporting: l.pct,
        dem_votes: l.dem, rep_votes: l.rep, other_votes: l.oth, total_votes: l.total, party_d_votes: partyVotes(prior, l).dem, party_r_votes: partyVotes(prior, l).rep, margin: round(marginOf(l.dem, l.rep, l.total)), done: "",
      });
    }
  }

  writeFileSync(SEATS_FILE, csv(SEAT_COLUMNS, seats));
  writeFileSync(COUNTIES_FILE, csv(COUNTY_COLUMNS, counties));
  const called = seats.filter((s) => s.called === 1).length, withVotes = seats.filter((s) => Number(s.total_votes) > 0).length;
  console.log(`Wrote ${seats.length} seats (${withVotes} with votes, ${called} called, ${held.size} held) and ${counties.length} county rows.`);
  if (gaps.length) console.log(`County rows differ from the race total by over ${AUDIT_GAP * 100}% in ${gaps.length} races:\n  ${gaps.join("\n  ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

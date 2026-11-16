import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { houseData as corrected, type RaceForecast } from "@/data/forecastData";
import { lockedHousePast } from "@/data/housePastLocked2026";

// The U.S. House past results the 2026 model reads. Ten Texas 2024 results were corrected to the House
// Clerk's official statistics after the forecast was locked (scripts/precincts/correct_site_house_certified.py).
// The model is locked and graded as published, so it keeps the figures it was built on; race pages, past-election
// pages and everything else read the corrected data directly. Later models should import data/forecastData instead.

const byId = new Map(lockedHousePast.map((l) => [l.id, l.result]));

export const houseData: RaceForecast[] = corrected.map((race) => {
  const old = byId.get(race.id);
  if (!old || !race.pastResults) return race;
  return { ...race, pastResults: race.pastResults.map((p) => (p.year === old.year && p.electionType === old.electionType ? old : p)) };
});

/** data-entry/house_past_results.csv as it stood at the lock (the ten corrected rows put back). */
export function housePastCsvAtLock(): string {
  const now = readFileSync(join(process.cwd(), "data-entry", "house_past_results.csv"), "utf8");
  const locked = readFileSync(join(process.cwd(), "data-entry", "house_past_results_locked2026.csv"), "utf8").split(/\r?\n/).slice(1).filter((l) => l.length > 0);
  const key = (l: string) => { const c = l.split(","); return `${c[0]}|${c[4]}`; };
  const old = new Map(locked.map((l) => [key(l), l]));
  return now.split("\n").map((l) => { const o = old.get(key(l.replace(/\r$/, ""))); return o ? o + (l.endsWith("\r") ? "\r" : "") : l; }).join("\n");
}

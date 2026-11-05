import { countyGovernorData as correctedGovernor } from "@/data/countyGovernorData";
import { countySenateData as correctedSenate } from "@/data/countySenateData";
import { lockedGovernorRows, lockedSenateRows, type LockedRow } from "@/data/countyRowsLocked2026";

// The county Senate and governor data the 2026 model reads. The 2026 forecast is locked and graded as
// published, so its county figures (County TPL, the turnout split) keep the rows as they stood at the lock;
// every historical page reads the corrected data directly. Later models should import data/ instead.

function atLock<T extends { years: Record<number, unknown> }>(data: Record<string, T>, rows: LockedRow[]): Record<string, T> {
  const out = { ...data };
  for (const { fips, bucket, year, row } of rows) {
    const county = out[fips] as T & Record<string, Record<number, unknown>>;
    out[fips] = { ...county, [bucket]: { ...county[bucket], [year]: row } };
  }
  return out;
}

export const countySenateData = atLock(correctedSenate, lockedSenateRows);
export const countyGovernorData = atLock(correctedGovernor, lockedGovernorRows);

import { stateLegResults as corrected } from "@/data/stateLegResults";
import { lockedStateLegBlocks } from "@/data/stateLegResultsLocked2026";

// The state-legislative results the 2026 projection reads. The projection is locked and graded as
// published, so it keeps the seven 2024 chamber blocks as they stood at the lock; every historical page
// reads the corrected data directly. Later models should import data/stateLegResults instead.

type Results = typeof corrected;

function atLock(data: Results): Results {
  const out: Record<string, Record<string, Record<string, unknown>>> = { ...(data as unknown as Record<string, Record<string, Record<string, unknown>>>) };
  for (const { abbr, year, chamber, block } of lockedStateLegBlocks) {
    out[abbr] = { ...out[abbr], [year]: { ...out[abbr]?.[year], [chamber]: block } };
  }
  return out as unknown as Results;
}

export const stateLegResults = atLock(corrected);

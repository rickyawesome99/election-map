import type { Chamber } from "@/data/stateLegDistricts";
import { districtHash } from "@/lib/stateLegAtlas";

/** Where a chamber's district opens in the explorer. Client-safe; lib/statePage.ts is server-only. */
export function chamberDistrictHref(stateId: string, chamber: Chamber, key: string): string {
  return `/states/${stateId}/legislature/${chamber}${districtHash(chamber, key)}`;
}

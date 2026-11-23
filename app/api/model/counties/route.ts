import { NextResponse } from "next/server";
import { countySlice } from "@/lib/modelSlices";

// County TPL for every county (~3,100 rows) — fetched only when the TPL hub's Counties view is opened.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(countySlice(), { headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" } });
}

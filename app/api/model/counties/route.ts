import { NextResponse } from "next/server";
import { countySlice } from "@/lib/modelSlices";
import { STATIC_JSON_CACHE } from "@/lib/staticJsonCache";

// County TPL for every county (~3,100 rows) — fetched only when the TPL hub's Counties view is opened.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(countySlice(), { headers: { "Cache-Control": STATIC_JSON_CACHE } });
}

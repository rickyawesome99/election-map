import { NextResponse } from "next/server";
import { projectionCountySlice } from "@/lib/final2026";
import { STATIC_JSON_CACHE } from "@/lib/staticJsonCache";

// Static JSON: every county's 2026 turnout estimate by office (lib/turnoutModel.ts), for the map.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(projectionCountySlice(), {
    headers: { "Cache-Control": STATIC_JSON_CACHE },
  });
}

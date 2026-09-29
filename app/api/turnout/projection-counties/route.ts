import { NextResponse } from "next/server";
import { projectionCountySlice } from "@/lib/turnoutModel";

// Static JSON: every county's 2026 turnout estimate by office (lib/turnoutModel.ts), for the map.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(projectionCountySlice(), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" },
  });
}

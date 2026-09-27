import { NextResponse } from "next/server";
import { warSlice } from "@/lib/modelSlices";

// The full WAR table (~2.5 MB of JSON, a few hundred KB compressed) — fetched only when the
// WAR sub-tab is opened.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(warSlice(), { headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" } });
}

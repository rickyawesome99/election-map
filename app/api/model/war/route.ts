import { NextResponse } from "next/server";
import { warSlice } from "@/lib/modelSlices";
import { STATIC_JSON_CACHE } from "@/lib/staticJsonCache";

// The full WAR table (~2.5 MB of JSON, a few hundred KB compressed) — fetched only when the
// WAR sub-tab is opened.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(warSlice(), { headers: { "Cache-Control": STATIC_JSON_CACHE } });
}

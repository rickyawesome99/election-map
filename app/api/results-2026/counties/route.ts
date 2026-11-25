import { NextResponse } from "next/server";
import { results2026Counties } from "@/lib/results2026Page";
import { STATIC_JSON_CACHE } from "@/lib/staticJsonCache";

// Static JSON: every county's 2026 Senate, governor and summed House vote with its 2024
// presidential margin, for the Results page's county map (lib/results2026Page.ts).
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(results2026Counties(), {
    headers: { "Cache-Control": STATIC_JSON_CACHE },
  });
}

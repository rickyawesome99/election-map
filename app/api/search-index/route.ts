import { NextResponse } from "next/server";
import { searchIndex } from "@/lib/searchIndex";

// Static JSON written at build time; the search bar fetches it once on first focus.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(searchIndex, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" },
  });
}

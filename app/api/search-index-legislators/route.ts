import { NextResponse } from "next/server";
import { legislatorSearchRows } from "@/lib/searchIndex";

// The ~38,000 state legislative candidates, as compact rows the search bar expands client-side
// (lib/searchQuery.ts expandLegislatorRows). Separate from /api/search-index so the main index
// stays small; fetched only once a query is three characters long.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(legislatorSearchRows, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" },
  });
}

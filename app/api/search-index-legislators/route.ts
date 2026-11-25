import { NextResponse } from "next/server";
import { legislatorSearchRows } from "@/lib/searchIndex";
import { STATIC_JSON_CACHE } from "@/lib/staticJsonCache";

// The ~38,000 state legislative candidates, as compact rows the search bar expands client-side
// (lib/searchQuery.ts expandLegislatorRows). Separate from /api/search-index so the main index
// stays small; fetched only once a query is three characters long.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(legislatorSearchRows, {
    headers: { "Cache-Control": STATIC_JSON_CACHE },
  });
}

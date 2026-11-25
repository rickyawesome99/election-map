import { NextResponse } from "next/server";
import { searchIndex } from "@/lib/searchIndex";
import { STATIC_JSON_CACHE } from "@/lib/staticJsonCache";

// Static JSON written at build time; the search bar fetches it once on first focus.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(searchIndex, {
    headers: { "Cache-Control": STATIC_JSON_CACHE },
  });
}

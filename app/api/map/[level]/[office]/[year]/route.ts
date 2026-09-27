import { NextResponse } from "next/server";
import { allMapSliceParams, buildMapSlice, MAP_LEVELS, MAP_OFFICES, yearsForLevel, type MapLevel, type MapOffice } from "@/lib/mapSlices";

// Static JSON: every slice is rendered once at build time from the county / district / state
// datasets and served as a file, so the /historical map fetches ~100–350 KB per selection
// instead of bundling ~9 MB of TypeScript literals into the browser.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return allMapSliceParams();
}

export async function GET(_req: Request, { params }: { params: Promise<{ level: string; office: string; year: string }> }) {
  const { level, office, year } = await params;
  const y = Number(year);
  if (!MAP_LEVELS.includes(level as MapLevel) || !MAP_OFFICES.includes(office as MapOffice) || !yearsForLevel(office as MapOffice, level as MapLevel).includes(y)) {
    return NextResponse.json({ error: "unknown slice" }, { status: 404 });
  }
  return NextResponse.json(buildMapSlice(level as MapLevel, office as MapOffice, y), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" },
  });
}

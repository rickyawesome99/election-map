import { NextResponse } from "next/server";
import { MAP_OFFICES, YEARS_BY_OFFICE, type MapOffice } from "@/lib/mapSliceTypes";
import { pastRaceTableRows } from "@/lib/pastElections";

// Static JSON: the /historical races table for one office and year, written once at build time
// from the forecast dataset's past results so none of it enters the browser bundle.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return MAP_OFFICES.flatMap((office) => YEARS_BY_OFFICE[office].map((year) => ({ office, year: String(year) })));
}

export async function GET(_req: Request, { params }: { params: Promise<{ office: string; year: string }> }) {
  const { office, year } = await params;
  const y = Number(year);
  if (!MAP_OFFICES.includes(office as MapOffice) || !YEARS_BY_OFFICE[office as MapOffice].includes(y)) {
    return NextResponse.json({ error: "unknown table" }, { status: 404 });
  }
  return NextResponse.json({ office, year: y, rows: pastRaceTableRows(office as MapOffice, y) }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" },
  });
}

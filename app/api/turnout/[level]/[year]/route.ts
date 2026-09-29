import { NextResponse } from "next/server";
import { allTurnoutSliceParams, buildTurnoutSlice } from "@/lib/turnout";
import { TURNOUT_LEVELS, yearsForTurnoutLevel, type TurnoutLevel } from "@/lib/turnoutTypes";

// Static JSON: one turnout slice per (level, year), rendered at build time from the county /
// district / state datasets and CVAP, so /analysis/turnout fetches ~20–400 KB per selection
// instead of bundling the data.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return allTurnoutSliceParams();
}

export async function GET(_req: Request, { params }: { params: Promise<{ level: string; year: string }> }) {
  const { level, year } = await params;
  const y = Number(year);
  if (!TURNOUT_LEVELS.includes(level as TurnoutLevel) || !yearsForTurnoutLevel(level as TurnoutLevel).includes(y)) {
    return NextResponse.json({ error: "unknown slice" }, { status: 404 });
  }
  return NextResponse.json(buildTurnoutSlice(level as TurnoutLevel, y), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" },
  });
}

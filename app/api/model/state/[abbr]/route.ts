import { NextResponse } from "next/server";
import { modelStateParams, stateModelSlice } from "@/lib/modelSlices";

// One state's full TPL calculation (~70 KB), written once at build time per state.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return modelStateParams();
}

export async function GET(_req: Request, { params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params;
  const slice = stateModelSlice(abbr.toUpperCase());
  if (!slice) return NextResponse.json({ error: "unknown state" }, { status: 404 });
  return NextResponse.json(slice, { headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" } });
}

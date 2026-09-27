import { NextResponse } from "next/server";
import { modelDistrictParams, districtModelSlice } from "@/lib/modelSlices";

// One district's full TPL calculation (~5 KB), written once at build time per district.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return modelDistrictParams();
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slice = districtModelSlice(id);
  if (!slice) return NextResponse.json({ error: "unknown district" }, { status: 404 });
  return NextResponse.json(slice, { headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" } });
}

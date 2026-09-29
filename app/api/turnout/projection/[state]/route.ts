import { NextResponse } from "next/server";
import { projectionStates, projectionStateSlice } from "@/lib/turnoutModel";

// Static JSON: one state's 2026 turnout estimates with their county splits (lib/turnoutModel.ts).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return projectionStates().map((state) => ({ state }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  if (!projectionStates().includes(state)) return NextResponse.json({ error: "unknown state" }, { status: 404 });
  return NextResponse.json(projectionStateSlice(state), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" },
  });
}

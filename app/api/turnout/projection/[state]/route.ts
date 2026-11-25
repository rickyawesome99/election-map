import { NextResponse } from "next/server";
import { projectionStates, projectionStateSlice } from "@/lib/final2026";
import { STATIC_JSON_CACHE } from "@/lib/staticJsonCache";

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
    headers: { "Cache-Control": STATIC_JSON_CACHE },
  });
}

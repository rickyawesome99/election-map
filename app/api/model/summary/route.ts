import { NextResponse } from "next/server";
import { buildModelSummary } from "@/lib/modelSlices";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(buildModelSummary());
}

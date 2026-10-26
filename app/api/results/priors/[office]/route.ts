import { NextResponse } from "next/server";
import { resultsPriors } from "@/lib/resultsPriors";
import { RESULTS_OFFICES, type ResultsOffice } from "@/lib/resultsTypes";

// Static JSON: the Results page's priors for one office, rendered once at build time. The page
// fetches these three files and never the forecast or the county datasets behind them.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return RESULTS_OFFICES.map((office) => ({ office }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ office: string }> }) {
  const { office } = await params;
  if (!RESULTS_OFFICES.includes(office as ResultsOffice)) return NextResponse.json({ error: "unknown office" }, { status: 404 });
  return NextResponse.json(resultsPriors(office as ResultsOffice), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400" },
  });
}

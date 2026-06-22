import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    x: lng,
    y: lat,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });

  const res = await fetch(
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?${params}`
  );

  const text = await res.text();

  if (!res.ok) {
    console.error("Census geocoder error:", res.status, text.slice(0, 300));
    return NextResponse.json({ error: "Census geocoder error" }, { status: 500 });
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    console.error("Census returned non-JSON:", text.slice(0, 300));
    return NextResponse.json({ error: "Invalid response from Census" }, { status: 500 });
  }
}

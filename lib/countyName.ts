// A county's display name from its FIPS code and the bare name in the map files ("Waynesboro",
// "Carson City", "Southeast Fairbanks"). Appending "County" to every name was wrong for
// Louisiana parishes, Alaska's boroughs and census areas, and the independent cities of
// Virginia, Maryland, Missouri and Nevada. Client-safe.

// Alaska county-equivalents by FIPS: B = Borough, CA = Census Area, M = Municipality,
// CB = City and Borough.
const ALASKA: Record<string, "B" | "CA" | "M" | "CB"> = {
  "013": "B", "016": "CA", "020": "M", "050": "CA", "060": "B", "063": "CA", "066": "CA", "068": "B",
  "070": "CA", "090": "B", "100": "B", "105": "CA", "110": "CB", "122": "B", "130": "B", "150": "B",
  "158": "CA", "164": "B", "170": "B", "180": "CA", "185": "B", "188": "B", "195": "B", "198": "CA",
  "220": "CB", "230": "M", "240": "CA", "261": "CA", "275": "CB", "282": "CB", "290": "CA",
};
const ALASKA_SUFFIX = { B: "Borough", CA: "Census Area", M: "Municipality", CB: "City and Borough" } as const;

export function countyDisplayName(fips: string, name: string): string {
  const st = fips.slice(0, 2);
  const code = fips.slice(2);
  if (/\b(County|Parish|Borough|Census Area|Municipality)$/.test(name)) return name;
  if (st === "22") return `${name} Parish`;
  if (st === "02") {
    const kind = ALASKA[code];
    return kind ? `${name} ${ALASKA_SUFFIX[kind]}` : name;
  }
  // Independent cities carry county codes from 500 up (VA 510–840, Baltimore 24510, St. Louis
  // 29510, Carson City 32510). Below 500 a name ending in "City" is still a county (Charles
  // City County, VA).
  if (Number(code) >= 500) return /\bcity$/i.test(name) ? name : `${name} City`;
  return `${name} County`;
}

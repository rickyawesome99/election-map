import {
  houseData,
  senateData,
  senateNoElection,
  senateHoldovers,
  governorData,
  governorNoElection,
} from "@/data/forecastData";

export type SearchEntry = {
  label: string;
  sublabel: string;
  href: string;
  terms: string; // single lowercased string to match against
};

function slug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function buildIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];

  // Collect all unique states (abbr → name)
  // Strip any "-2" seat suffix from senate ids before keying
  const baseAbbr = (id: string) => id.replace(/-\d+$/, "");
  const stateMap = new Map<string, string>();
  for (const r of senateData)         stateMap.set(baseAbbr(r.id), r.name);
  for (const e of senateNoElection)   stateMap.set(e.abbr, e.state);
  for (const e of senateHoldovers)    stateMap.set(e.abbr, e.state);
  for (const r of governorData)       stateMap.set(baseAbbr(r.id), r.name);
  for (const e of governorNoElection) stateMap.set(e.abbr, e.state);

  // States
  for (const [abbr, name] of stateMap) {
    entries.push({
      label: name,
      sublabel: "State",
      href: `/states/${slug(name)}`,
      terms: `${name} ${abbr} state`.toLowerCase(),
    });
  }

  // Senate — active races
  for (const r of senateData) {
    entries.push({
      label: `${r.name} Senate`,
      sublabel: "Senate Race",
      href: `/senate/${r.id.toLowerCase()}`,
      terms: `${r.name} ${r.id} senate`.toLowerCase(),
    });
  }

  // Senate — seat 1 not up in 2026
  for (const e of senateNoElection) {
    entries.push({
      label: `${e.state} Senate`,
      sublabel: "Senate (No Election)",
      href: `/senate/${e.abbr.toLowerCase()}`,
      terms: `${e.state} ${e.abbr} senate`.toLowerCase(),
    });
  }

  // Senate — holdover seat 2
  for (const e of senateHoldovers) {
    entries.push({
      label: `${e.state} Senate (Seat 2)`,
      sublabel: "Senate Holdover",
      href: `/senate/${e.abbr.toLowerCase()}-2`,
      terms: `${e.state} ${e.abbr} senate seat 2`.toLowerCase(),
    });
  }

  // Governor — active races
  for (const r of governorData) {
    entries.push({
      label: `${r.name} Governor`,
      sublabel: "Governor Race",
      href: `/governor/${r.id.toLowerCase()}`,
      terms: `${r.name} ${r.id} governor`.toLowerCase(),
    });
  }

  // Governor — no election
  for (const e of governorNoElection) {
    entries.push({
      label: `${e.state} Governor`,
      sublabel: "Governor (No Election)",
      href: `/governor/${e.abbr.toLowerCase()}`,
      terms: `${e.state} ${e.abbr} governor`.toLowerCase(),
    });
  }

  // House districts
  for (const r of houseData) {
    const abbr = r.name.split("-")[0];
    entries.push({
      label: r.name,
      sublabel: "House District",
      href: `/house/${r.id}`,
      terms: `${r.name} ${r.state} ${abbr} house district`.toLowerCase(),
    });
  }

  return entries;
}

export const searchIndex = buildIndex();

export function queryIndex(raw: string, maxResults = 8): SearchEntry[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];

  const words = q.split(/\s+/);

  const scored: { entry: SearchEntry; score: number }[] = [];

  for (const entry of searchIndex) {
    if (!words.every((w) => entry.terms.includes(w))) continue;

    let score = 0;
    if (entry.label.toLowerCase() === q) score = 4;
    else if (entry.label.toLowerCase().startsWith(q)) score = 3;
    else if (entry.terms.startsWith(q)) score = 2;
    else score = 1;

    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.entry);
}

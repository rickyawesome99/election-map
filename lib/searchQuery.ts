// Client-safe matcher; the data-heavy index is fetched only when search is used.
export type SearchEntry = {
  label: string;
  sublabel: string;
  href: string;
  terms: string;
  kind?: "state" | "seat" | "race" | "candidate";
  year?: number;
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b([a-z]{2})(\d{1,2})\b/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b0+(\d+)\b/g, "$1")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\b(senator|sen)\b/g, "senate")
    .replace(/\bgov\b/g, "governor")
    .replace(/\b(congress|congressional|representative)\b/g, "house")
    .trim();
}

export function queryIndex(entries: SearchEntry[], raw: string, maxResults = 12): SearchEntry[] {
  const q = normalize(raw);
  if (!q) return [];
  const words = q.split(/\s+/);
  const hasYear = words.some((word) => /^\d{4}$/.test(word));
  const scored = entries.flatMap((entry) => {
    const terms = normalize(entry.terms).split(/\s+/);
    if (!words.every((word) => terms.some((term) => term === word || (!/^\d+$/.test(word) && word.length > 2 && term.startsWith(word))))) return [];
    const label = normalize(entry.label);
    const score = (label === q ? 100 : label.startsWith(q) ? 40 : 0)
      + words.filter((word) => label.split(" ").includes(word)).length * 5
      + (hasYear ? entry.kind === "race" ? 30 : 0 : entry.kind === "state" ? 20 : entry.kind === "candidate" ? 10 : entry.kind === "seat" ? 15 : 0);
    return [{ entry, score }];
  });
  scored.sort((a, b) => b.score - a.score || (b.entry.year ?? 0) - (a.entry.year ?? 0) || a.entry.label.localeCompare(b.entry.label));
  // A current race and its general seat share a URL. Show the most relevant one.
  const seen = new Set<string>();
  return scored.filter(({ entry }) => {
    if (seen.has(entry.href)) return false;
    seen.add(entry.href);
    return true;
  }).slice(0, maxResults).map(({ entry }) => entry);
}

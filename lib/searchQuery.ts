// Client-safe half of the site search: the entry shape and the matcher. The index itself is
// built on the server (lib/searchIndex.ts) from forecastData and served as static JSON by
// app/api/search-index, so the 1.9 MB forecast dataset stays out of every page's bundle.

export type SearchEntry = {
  label: string;
  sublabel: string;
  href: string;
  terms: string; // single lowercased string to match against
};

export function queryIndex(entries: SearchEntry[], raw: string, maxResults = 8): SearchEntry[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];

  const words = q.split(/\s+/);

  const scored: { entry: SearchEntry; score: number }[] = [];

  for (const entry of entries) {
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

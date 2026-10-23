/** People who share a full name with another candidate on file. The one the data met first
 *  (Alabama's Mike Rogers, the 12-term congressman) keeps the bare slug; everyone else gets their
 *  state appended, so each has their own page, photo and record. Keyed by the name exactly as it
 *  appears in the data; a lookup matches the state by abbreviation or full name. */
const SHARED_NAMES: Record<string, { abbr: string; state: string }[]> = {
  "Mike Rogers": [{ abbr: "MI", state: "Michigan" }],
};

/** One person on file under more than one spelling (a nickname in an old result, the full ballot
 *  name in the current race). Every spelling maps to the name the page uses, so the records share
 *  one page and every link lands there, even if a re-scraped source brings the old spelling back. */
export const SAME_PERSON: Record<string, string> = {
  "Nick Begich": "Nicholas Begich III", // AK-01: 2024 results file him as Nick Begich
};

/** The name a candidate's page goes by: the SAME_PERSON spelling, or the name itself. */
export function canonicalCandidateName(name: string): string {
  return SAME_PERSON[name] ?? name;
}

/** The candidate page slug for a name. With the race's state, a person who shares their name with
 *  another candidate (SHARED_NAMES) gets their own slug: "mike-rogers-mi". */
export function candidateSlug(name: string, state?: string | null): string {
  name = canonicalCandidateName(name);
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const shared = state ? SHARED_NAMES[name]?.find((s) => s.abbr === state || s.state === state) : undefined;
  return shared ? `${base}-${shared.abbr.toLowerCase()}` : base;
}

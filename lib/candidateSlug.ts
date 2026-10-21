/** People who share a full name with another candidate on file. The one the data met first
 *  (Alabama's Mike Rogers, the 12-term congressman) keeps the bare slug; everyone else gets their
 *  state appended, so each has their own page, photo and record. Keyed by the name exactly as it
 *  appears in the data; a lookup matches the state by abbreviation or full name. */
const SHARED_NAMES: Record<string, { abbr: string; state: string }[]> = {
  "Mike Rogers": [{ abbr: "MI", state: "Michigan" }],
};

/** The candidate page slug for a name. With the race's state, a person who shares their name with
 *  another candidate (SHARED_NAMES) gets their own slug: "mike-rogers-mi". */
export function candidateSlug(name: string, state?: string | null): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const shared = state ? SHARED_NAMES[name]?.find((s) => s.abbr === state || s.state === state) : undefined;
  return shared ? `${base}-${shared.abbr.toLowerCase()}` : base;
}

import { statesData } from "@/data/statesData";

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
  "Michael V. Lawler": "Mike Lawler", // NY-17: his 2020 Assembly (AD-97) race. Not plain "Michael Lawler": a Maine legislator goes by that
};

/** SAME_PERSON scoped to one state, keyed "AB|spelling on file" — for spellings too common to map
 *  nationwide. The canonical name is the 2026 ballot name, else the most recent spelling. Without
 *  it the WAR key (lib/tplCompute.ts warCandidateKey) splits the person's record, and a 2026
 *  nominee filed under a new spelling forecasts with no track record (final audit 2026-11-03). */
export const SAME_PERSON_IN_STATE: Record<string, string> = {
  // 2026 nominees
  "AZ|Raúl Grijalva": "Raul Grijalva",
  "CA|Luz Maria Rivas": "Luz Rivas",
  "CA|Gil Cisneros": "Gilbert Cisneros",
  "CA|Gilbert Ray Cisneros": "Gilbert Cisneros",
  "CA|Luis Correa": "Lou Correa",
  "CA|Nanette Diaz Barragán": "Nanette Barragan",
  "CT|James Himes": "Jim Himes",
  "FL|L. J. Holloway": "LaShonda Holloway",
  "FL|LJ Holloway": "LaShonda Holloway",
  "FL|Maria Elvira Salazar": "Maria Salazar",
  "GA|Sanford Bishop": "Sanford Bishop Jr.",
  "IL|Jim Marter": "James Marter",
  "IN|André Carson": "Andre Carson",
  "IN|Cinde Wirth": "Cynthia Wirth",
  "IN|Rudy Yakym III": "Rudy Yakym",
  "MD|April McClain Delaney": "April Delaney",
  "MD|Johnny O Olszewski, Jr.": "John Olszewski",
  "NH|Lily Tang Williams": "Lily Williams",
  "NJ|Jefferson Van Drew": "Jeff Van Drew",
  "NM|Debra Haaland": "Deb Haaland",
  "NY|Michael LiPetri": "Mike LiPetri",
  "OH|Mike Turner": "Michael Turner",
  "PA|Beth Farnham": "Elizabeth Farnham",
  "PA|Mary Gay Scanlon": "Mary Scanlon",
  "TN|Victoria Isabel Broderick": "Victoria Broderick",
  "TX|Patrick David Gillespie": "Patrick Gillespie",
  "VT|Becca Balint": "Rebecca Balint",
  // past candidates only
  "CA|Chris Bish": "Christine Bish",
  "CA|Daniel Bocic Martinez": "Daniel Jose Bocic Martinez",
  "CA|Justin Donald Fareed": "Justin Fareed",
  "CA|Kenneth Weston Wright": "Kenneth Wright",
  "CO|Charles Casper Stockham": "Casper Stockham",
  "FL|Cindy Lyn Banyai": "Cindy Banyai",
  "FL|Dana Marie Cottrell": "Dana Cottrell",
  "FL|Greg Steube": "Gregory Steube",
  "FL|Jesus Navarro": "Jesus Gabriel Navarro",
  "FL|Maxwell Alejandro Frost": "Maxwell Frost",
  "FL|Val Butler Demings": "Val Demings",
  "GA|Rich McCormick": "Richard McCormick",
  "IA|Cindy Axne": "Cynthia Axne",
  "IL|Brad Schneider": "Bradley Scott Schneider",
  "IL|Tom Hanson": "Tommy Hanson",
  "IN|Jim Baird": "James Baird",
  "MA|Lori Loureiro Trahan": "Lori Trahan",
  "MD|Kimberly Klacik": "Kim Klacik",
  "MN|Timothy Walz": "Tim Walz",
  "MO|Henry Robert Martin": "Henry Martin",
  "MS|Dianne Black": "Dianne Dodson Black",
  "MT|Matt Rosendale": "Matthew Rosendale",
  "NJ|Joshua Gottheimer": "Josh Gottheimer",
  "NM|Alexis Johnson": "Alexis Martinez Johnson",
  "NM|Gabriel Vasquez": "Gabe Vasquez",
  "NM|Stevan Pearce": "Steve Pearce",
  "NY|Marc Molinaro": "Marcus Molinaro",
  "NY|Miriam Flisser": "Miriam Levitt Flisser",
  "NY|Nicholas LaLota": "Nick LaLota",
  "NY|Nick Langworthy": "Nicholas Langworthy",
  "OH|Emilia Sykes": "Emilia Strong Sykes",
  "OH|Matthew Diemer": "Matt Diemer",
  "PA|Chris Deluzio": "Christopher Deluzio",
  "PA|Dan Meuser": "Daniel Meuser",
  "PA|Daniel Philip Meuser": "Daniel Meuser",
  "PA|Susan Ellis Wild": "Susan Wild",
  "RI|Allen Waters": "Allen Rodney Waters",
  "TN|Andy Ogles": "Andrew Ogles",
  "TX|Lizzie Pannill Fletcher": "Lizzie Fletcher",
  "UT|Blake David Moore": "Blake Moore",
  "VA|Abigail Davis Spanberger": "Abigail Spanberger",
  "VA|Jen Kiggans": "Jennifer Kiggans",
  "WA|David Reichert": "Dave Reichert",
};

/** The name a candidate's page goes by: the SAME_PERSON spelling, or the name itself. `state`
 *  (abbreviation or full name) also applies the state-scoped spellings. */
export function canonicalCandidateName(name: string, state?: string | null): string {
  const abbr = state ? (state.length === 2 ? state : statesData.find((s) => s.name === state)?.abbr) : undefined;
  return (abbr && SAME_PERSON_IN_STATE[`${abbr}|${name}`]) ?? SAME_PERSON[name] ?? name;
}

/** The candidate page slug for a name. With the race's state, a person who shares their name with
 *  another candidate (SHARED_NAMES) gets their own slug: "mike-rogers-mi". */
export function candidateSlug(name: string, state?: string | null): string {
  name = canonicalCandidateName(name, state);
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const shared = state ? SHARED_NAMES[name]?.find((s) => s.abbr === state || s.state === state) : undefined;
  return shared ? `${base}-${shared.abbr.toLowerCase()}` : base;
}

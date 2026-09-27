// Kept apart from data/stateLegDistricts.ts (2.7 MB of district literals) so a client component
// can ask "is this state unicameral?" without pulling that whole file into its bundle.
export const UNICAMERAL_STATES: ReadonlySet<string> = new Set(["NE"]);

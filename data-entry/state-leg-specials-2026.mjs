// Reader for data-entry/state-leg-specials-2026.csv: the state legislative special elections on the
// November 3, 2026 ballot (Ballotpedia's "State legislative special elections, 2026" + each
// district page, cross-checked against Wikipedia). Shared by build-state-leg-incumbents.mjs (the
// seat is up in 2026) and build-state-leg-candidates-2026.mjs (its field).
//
// Columns: state, chamber, district, concurrent_with_regular ("yes": a special for the weeks left
// of a term whose regular race is on the same ballot, which changes nothing after the election and
// is skipped), seat_of (in a multi-member district, the member whose seat the special fills; blank
// = the whole district), candidates ("Name (D)(i); Name (R); Name (Constitution)").
import { readFileSync, existsSync } from "fs";

const FILE = "data-entry/state-leg-specials-2026.csv";

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** Specials that put a seat on the 2026 ballot it would not otherwise be on. */
export function specials2026() {
  if (!existsSync(FILE)) return [];
  return parseCsv(readFileSync(FILE, "utf8"))
    .filter((r) => r.concurrent_with_regular !== "yes")
    .map((r) => ({
      ...r,
      field: r.candidates.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
        const incumbent = /\(i\)/.test(s);
        const label = (s.match(/\(([^)]+)\)(?:\(i\))?\s*$/) ?? [])[1]?.replace(/^i$/, "") ?? "";
        const name = s.replace(/\s*\([^)]*\)/g, "").trim();
        const party = label === "D" ? "D" : label === "R" ? "R" : label === "NP" ? null : "O";
        return { name, party, partyLabel: party === "O" ? (label === "Constitution" ? "Constitution Party" : label) : undefined, incumbent };
      }),
    }));
}

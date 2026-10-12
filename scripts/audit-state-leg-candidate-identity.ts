/**
 * The review list for state legislative candidate identity: every pair of spellings with agreeing
 * first names that the candidate index merged, held apart, or blocked, and why.
 *
 *   npx tsx --conditions=react-server scripts/audit-state-leg-candidate-identity.ts [--samples N]
 *
 * Writes data-entry/state-leg-candidate-identity-review.csv (the `review` rows are the ones to
 * rule on in data/stateLegCandidateIdentityOverrides.ts) and prints counts plus samples per outcome.
 * Rules: lib/stateLegCandidateIdentity.ts. Seat links: scripts/build-state-leg-seat-links.py.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getStateLegIdentityAudit } from "@/lib/stateLegCandidateIndex";

const samples = Number(process.argv[process.argv.indexOf("--samples") + 1]) || 12;
const rows = getStateLegIdentityAudit();

const counts = new Map<string, number>();
for (const r of rows) counts.set(`${r.outcome} · ${r.reason}`, (counts.get(`${r.outcome} · ${r.reason}`) ?? 0) + 1);
console.log([...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `${String(n).padStart(6)}  ${k}`).join("\n"));

const short = (seats: string[]) => seats.map((s) => { const [c, era, d] = s.split("|"); return `${c[0].toUpperCase()}${d}${era === "current" ? "" : `@${era}`}`; }).join(" ");
for (const outcome of ["merged:territory", "review", "blocked"]) {
  console.log(`\n── ${outcome} (sample) ──`);
  for (const r of rows.filter((x) => x.outcome === outcome).slice(0, samples)) {
    console.log(`${r.abbr}  ${r.a} [${r.aParties.join("")} ${short(r.aSeats)} ${r.aYears.join(",")}]  ~  ${r.b} [${r.bParties.join("")} ${short(r.bSeats)} ${r.bYears.join(",")}]  — ${r.reason}`);
  }
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = ["state,outcome,reason,spelling_a,party_a,seats_a,years_a,spelling_b,party_b,seats_b,years_b"];
for (const r of rows.sort((a, b) => a.outcome.localeCompare(b.outcome) || a.abbr.localeCompare(b.abbr) || a.a.localeCompare(b.a))) {
  csv.push([r.abbr, r.outcome, r.reason, r.a, r.aParties.join("/"), short(r.aSeats), r.aYears.join(" "), r.b, r.bParties.join("/"), short(r.bSeats), r.bYears.join(" ")].map(esc).join(","));
}
const out = join(process.cwd(), "data-entry", "state-leg-candidate-identity-review.csv");
writeFileSync(out, `${csv.join("\n")}\n`);
console.log(`\nwrote ${out} (${rows.length} rows)`);

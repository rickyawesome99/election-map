// Final-lock audit: 2026 nominees' WAR identity. Flags (1) nominees with no WAR record,
// (2) past federal/statewide candidates in the same state+party whose surnames match but
// whose WAR keys differ (one person split under two spellings), (3) SAME_PERSON aliases
// that would still split a WAR record.
import { computeCandidateEffects, computeWarTable, warCandidateKey } from "@/lib/tplCompute";
import { senateData, governorData, houseData } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { SAME_PERSON, SAME_PERSON_IN_STATE } from "@/lib/candidateSlug";

const effects = computeCandidateEffects();
const war = computeWarTable();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/;
const surname = (n: string) => { const p = norm(n).split(" ").filter((x) => !SUFFIX.test(x)); return p[p.length - 1] ?? ""; };

// Every past spelling per state|party|surname.
const byKey = new Map<string, { names: Set<string>; races: string[] }>();
for (const r of war) {
  const k = warCandidateKey(r.state, r.party, r.candidate);
  const e = byKey.get(k) ?? { names: new Set(), races: [] };
  e.names.add(r.candidate); e.races.push(`${r.year} ${r.office} ${r.race}`);
  byKey.set(k, e);
}
const bySurname = new Map<string, string[]>();
for (const k of byKey.keys()) {
  const [st, pa, nm] = k.split("|");
  const sk = `${st}|${pa}|${surname(nm)}`;
  bySurname.set(sk, [...(bySurname.get(sk) ?? []), k]);
}

console.log("── 1. 2026 nominees without a WAR record (with same-surname past keys) ──");
let noRec = 0;
for (const race of [...senateData, ...governorData, ...houseData]) {
  const abbr = race.raceType === "house" ? statesData.find((s) => s.name === race.state)?.abbr ?? "" : race.id.replace(/-\d+$/, "");
  for (const c of [race.candidates?.dem, race.candidates?.rep]) {
    if (!c?.name || /candidate|^tbd$/i.test(c.name)) continue;
    const k = warCandidateKey(abbr, c.party, c.name);
    if (effects.has(k)) continue;
    noRec++;
    const sk = `${abbr}|${c.party}|${surname(c.name)}`;
    const near = (bySurname.get(sk) ?? []).filter((x) => x !== k);
    // Also any party, same state + surname (party switchers / independents).
    const anyParty = [...bySurname.entries()].filter(([s]) => s.startsWith(`${abbr}|`) && s.endsWith(`|${surname(c.name)}`) && s !== sk).flatMap(([, v]) => v);
    if (c.incumbent || near.length || anyParty.length)
      console.log(`${race.id.padEnd(10)} ${c.party} ${c.incumbent ? "INC " : "    "}${c.name.padEnd(30)} near: ${[...near, ...anyParty].map((x) => `${x} [${byKey.get(x)!.races.join("; ")}]`).join(" | ") || "—"}`);
  }
}
console.log(`(${noRec} nominees with no record in total; only incumbents or surname matches printed)`);

console.log("\n── 2. Past same-state/party/surname key pairs (possible split person) ──");
for (const [sk, keys] of bySurname) {
  if (keys.length < 2) continue;
  const first = (k: string) => k.split("|")[2].split(" ")[0];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = first(keys[i]), b = first(keys[j]);
    const similar = a[0] === b[0] || a.startsWith(b) || b.startsWith(a);
    if (similar) console.log(`${sk.padEnd(22)} ${[...byKey.get(keys[i])!.names][0]} [${byKey.get(keys[i])!.races.join("; ")}]  ⟷  ${[...byKey.get(keys[j])!.names][0]} [${byKey.get(keys[j])!.races.join("; ")}]`);
  }
}

console.log("\n── 3. SAME_PERSON aliases still present in WAR rows ──");
for (const [alias, canon] of [...Object.entries(SAME_PERSON), ...Object.entries(SAME_PERSON_IN_STATE).map(([k, v]) => [k.slice(3), v])]) {
  const hits = war.filter((r) => norm(r.candidate) === norm(alias) && warCandidateKey(r.state, r.party, r.candidate) !== warCandidateKey(r.state, r.party, canon));
  console.log(`${alias} → ${canon}: ${hits.length ? hits.map((r) => `${r.year} ${r.race}`).join("; ") : "none (OK)"}`);
}

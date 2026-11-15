/**
 * One-time relabel of the redistricting sentences in data-entry/state-leg-redistricting/{ABBR}.json:
 * an old map's name changes from the span of its elections in the results window ("2016–2020") to
 * the first year it was used ("2012"), per lib/stateLegMapLabel.ts. Rewrites only "the <label> "
 * phrases (the only way scripts/build-state-leg-redistricting.py writes a map label), so a bare
 * year such as "2020 presidential margin" is untouched. Idempotent. Rebuild data/stateLegRedistricting.ts after:
 *   npx tsx scripts/relabel-state-leg-redistricting-maps.ts && node scripts/build-state-leg-redistricting.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegOldMapLabel } from "@/lib/stateLegMapLabel";
import type { Chamber } from "@/data/stateLegDistricts";

const DIR = join(process.cwd(), "data-entry/state-leg-redistricting");
let changed = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const abbr = f.replace(".json", "");
  const path = join(DIR, f);
  // Edited as raw text: the files are Python's json.dump (\u2013 escapes, 100.0 floats), which a
  // JS re-serialize would churn. "the <label> " only occurs inside the "text" sentences.
  const raw = readFileSync(path, "utf8");
  const esc = (x: string) => x.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  // Split at the top-level keys (one-space indent) so each chamber's swaps touch only its own sentences.
  const parts = raw.split(/(?=^ "[a-z]+": \{$)/m);
  let n = 0;
  const out = parts.map((part) => {
  const chamber = (/^ "(house|senate)": \{$/m.exec(part)?.[1] ?? null) as Chamber | null;
  if (!chamber) return part;
  let text = part;
  {
    const map = stateLegHistoricalMaps[abbr]?.[chamber] ?? {};
    for (const v of new Set(Object.values(map).map(String))) {
      const ys = Object.entries(map).filter(([, x]) => String(x) === v).map(([y]) => Number(y)).sort();
      const oldLabel = ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`;
      const newLabel = stateLegOldMapLabel(abbr, chamber, v, oldLabel);
      if (newLabel === oldLabel) continue;
      const from = esc(`the ${oldLabel} `), to = esc(`the ${newLabel} `);
      n += text.split(from).length - 1;
      text = text.split(from).join(to);
    }
  }
  return text;
  }).join("");
  if (n) { writeFileSync(path, out); changed += n; console.log(`${abbr}: ${n} phrases`); }
}
console.log(`${changed} phrases relabeled`);

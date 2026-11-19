// Guards the frozen 2026 forecast (data/forecast-final-2026/frozen/, written once by
// scripts/freezeFinal2026.ts): every file listed in its manifest must still hash to what was frozen,
// and no unlisted file may sit beside them. It never runs the model, so it keeps passing however the
// live model changes; it fails only if someone edits or regenerates the record.
//
// Run: npm run check-final-2026   (a CI step)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DIR = path.join(process.cwd(), "data", "forecast-final-2026", "frozen");
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")) as { files: Record<string, { bytes: number; sha256: string }> };
const problems: string[] = [];
for (const [name, want] of Object.entries(manifest.files)) {
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) { problems.push(`${name}: missing`); continue; }
  const sha = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== want.sha256) problems.push(`${name}: changed since it was frozen`);
}
for (const name of fs.readdirSync(DIR)) if (name !== "manifest.json" && !manifest.files[name]) problems.push(`${name}: not in the manifest`);
if (problems.length) {
  console.error(`Frozen 2026 forecast FAILED:\n  ${problems.join("\n  ")}\nThe 2026 forecast is a record: restore these files from git rather than regenerating them.`);
  process.exit(1);
}
console.log(`Frozen 2026 forecast OK: ${Object.keys(manifest.files).length} files match their hashes`);

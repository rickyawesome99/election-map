// The legislative record of every candidate who also has a federal or statewide WAR row:
// data/generated/war-cross.json, read by lib/warCross.ts for the federal table.
//
//   npm run war-cross      (part of predev / prebuild, after state-leg-ballot and before candidate-pages)
//
// WAR is one statistic across offices, and a candidate's record in a federal race starts from their
// legislative record at a discount (lib/tplCompute.ts, "One WAR, two tables"). The federal table reads
// that record from this small file so lib/tplCompute.ts never imports the state legislative model.
// The strengths are the legislative table's on its own (lib/stateLegWar.ts, no federal record in it).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { legislativeStrengthsByFederalKey } from "../lib/stateLegWar";

const people = legislativeStrengthsByFederalKey();
const outDir = join(process.cwd(), "data", "generated");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "war-cross.json"), JSON.stringify({ built: new Date().toISOString().slice(0, 10), people }));
console.log(`WAR cross records: ${Object.keys(people).length} candidates with both a legislative and a federal row → data/generated/war-cross.json`);

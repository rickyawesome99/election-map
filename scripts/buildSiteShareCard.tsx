// The site-wide link-preview card, drawn once into app/opengraph-image.png (+ .alt.txt).
//
//   npx tsx --conditions=react-server scripts/buildSiteShareCard.tsx
//
// A static file so that no page's server function has to carry an image renderer or the data
// behind one; re-run (and commit the PNG) after changing siteShareCard in lib/shareCard.tsx or the
// election year. The race pages' cards stay dynamic (app/house/[id]/opengraph-image.tsx etc.).

import fs from "node:fs";
import path from "node:path";
import { siteShareCard, SITE_CARD_ALT } from "@/lib/shareCard";

async function main() {
  const png = Buffer.from(await siteShareCard().arrayBuffer());
  const out = path.join(process.cwd(), "app", "opengraph-image.png");
  fs.writeFileSync(out, png);
  fs.writeFileSync(path.join(process.cwd(), "app", "opengraph-image.alt.txt"), SITE_CARD_ALT + "\n");
  console.log(`Site share card: ${(png.length / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

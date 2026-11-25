// The site-wide link-preview card, drawn once into app/opengraph-image.png (the short
// banner) and app/twitter-image.png (the full-height card for X), each with its .alt.txt.
//
//   npx tsx --conditions=react-server scripts/buildSiteShareCard.tsx
//
// A static file so that no page's server function has to carry an image renderer or the data
// behind one; re-run (and commit the PNG) after changing siteShareCard in lib/shareCard.tsx or the
// election year. The race pages' cards stay dynamic (app/house/[id]/opengraph-image.tsx etc.).

import fs from "node:fs";
import path from "node:path";
import { siteShareCard, SITE_CARD_ALT, SHARE_CARD_SIZE, TWITTER_CARD_SIZE } from "@/lib/shareCard";

async function main() {
  for (const [name, size] of [["opengraph-image", SHARE_CARD_SIZE], ["twitter-image", TWITTER_CARD_SIZE]] as const) {
    const png = Buffer.from(await siteShareCard(size).arrayBuffer());
    const out = path.join(process.cwd(), "app", `${name}.png`);
    fs.writeFileSync(out, png);
    fs.writeFileSync(path.join(process.cwd(), "app", `${name}.alt.txt`), SITE_CARD_ALT + "\n");
    console.log(`${name} ${size.width}×${size.height}: ${(png.length / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), out)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

// The preview card a link shows when it is shared (text messages, X, Slack…): 1200×630, one card
// for every page — the site's name, centered, in the header wordmark's serif on the page's
// background. Drawn once into a static PNG (app/opengraph-image.png) by
// scripts/buildSiteShareCard.tsx, so no page's server function carries an image renderer.

export const SHARE_CARD_SIZE = { width: 1200, height: 630 };
export const SITE_CARD_ALT = "CT Strategies";

// A warmer tan than the page's #f9f8f5, which on its own in a preview reads white.
const INK = "#1f2328", BG = "#f5f1e8";

// The site's serif is Georgia; the build machine has none, so Gelasio, an open font drawn to
// Georgia's metrics (app/fonts; the renderer reads TTF, not woff2).
export function siteShareCard() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BG, color: INK }}>
        <div style={{ display: "flex", fontFamily: "Gelasio", fontWeight: 700, fontSize: 136, letterSpacing: -3 }}>CT Strategies</div>
      </div>
    ),
    {
      ...SHARE_CARD_SIZE,
      fonts: [{ name: "Gelasio", data: fs.readFileSync(path.join(process.cwd(), "app", "fonts", "og-Gelasio-Bold.ttf")), weight: 700, style: "normal" }],
    },
  );
}

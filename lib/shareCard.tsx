import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

// The preview card a link shows when it is shared (text messages, X, Slack…): one card for every
// page — the site's name, centered, in the header wordmark's serif on the page's background.
// Drawn once into static PNGs by scripts/buildSiteShareCard.tsx, so no page's server function
// carries an image renderer.
//
// Two shapes. og:image (app/opengraph-image.png) is a 1200×315 banner: Messages, Slack and Discord
// draw the image at its own shape, so half the height is half the box. The wordmark stays inside
// the middle 1.91:1 (602px), which is all that Facebook and LinkedIn keep when they crop.
// twitter:image (app/twitter-image.png) stays 1200×630, the shape X's large card expects.

export const SHARE_CARD_SIZE = { width: 1200, height: 315 };
export const TWITTER_CARD_SIZE = { width: 1200, height: 630 };
export const SITE_CARD_ALT = "CT Strategies";

// A warmer tan than the page's #f9f8f5, which on its own in a preview reads white.
const INK = "#1f2328", BG = "#f5f1e8";

// The site's serif is Georgia; the build machine has none, so Gelasio, an open font drawn to
// Georgia's metrics (app/fonts; the renderer reads TTF, not woff2).
export function siteShareCard(size = SHARE_CARD_SIZE) {
  const fontSize = size.height >= 600 ? 136 : 88;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BG, color: INK }}>
        <div style={{ display: "flex", fontFamily: "Gelasio", fontWeight: 700, fontSize, letterSpacing: fontSize >= 136 ? -3 : -2 }}>CT Strategies</div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Gelasio", data: fs.readFileSync(path.join(process.cwd(), "app", "fonts", "og-Gelasio-Bold.ttf")), weight: 700, style: "normal" }],
    },
  );
}

/**
 * Map candidate names to image paths under /public/candidates/.
 * Drop any image file into public/candidates/ and add an entry here.
 * Supported formats: .jpg, .jpeg, .png, .webp
 *
 * Example:
 *   "Susan Collins": "/candidates/susan-collins.jpg",
 */
export const candidatePhotos: Record<string, string> = {
  // ── Democrats ──────────────────────────────────────────────────────────────
  "Amy Acton": "/candidates/amy-acton.png",
  "Fredrick Love": "/candidates/fredrick-love.jpg",
  "JB Pritzker": "/candidates/jb-pritzker.jpg",

  // ── Republicans ────────────────────────────────────────────────────────────
  "Darren Bailey": "/candidates/darren-bailey.jpg",
  "Sarah Huckabee Sanders": "/candidates/sarah-huckabee-sanders.jpg",
  "Susan Collins": "/candidates/susan-collins.jpg",
  "Vivek Ramaswamy": "/candidates/vivek-ramaswamy.jpg",
};

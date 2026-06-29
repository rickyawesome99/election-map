// margin: positive = R advantage, negative = D advantage (e.g. +5 = R+5, -5 = D+5)
export function getRaceColor(margin: number): string {
  if (margin >= 15)  return "#be1c29"; // Safe R   (R+15+)
  if (margin >= 5)   return "#ff5864"; // Likely R (R+5–R+15)
  if (margin >= 1)   return "#ff8b98"; // Lean R   (R+1–R+5)
  if (margin >= 0)   return "#cf8980"; // Tilt R   (R+0–R+1)
  if (margin > -1)   return "#959bb3"; // Tilt D   (D+0–D+1)
  if (margin > -5)   return "#8bafff"; // Lean D   (D+1–D+5)
  if (margin > -15)  return "#587ccc"; // Likely D (D+5–D+15)
  return "#1b408c";                    // Safe D   (D+15+)
}

const RATING_COLORS: Record<string, { bg: string; text: string }> = {
  "Safe D":   { bg: "#1b408c", text: "#ffffff" },
  "Likely D": { bg: "#587ccc", text: "#ffffff" },
  "Lean D":   { bg: "#8bafff", text: "#0a1a3a" },
  "Tilt D":   { bg: "#959bb3", text: "#0a1a3a" },
  "Tilt R":   { bg: "#cf8980", text: "#2a0a0a" },
  "Lean R":   { bg: "#ff8b98", text: "#2a0a0a" },
  "Likely R": { bg: "#ff5864", text: "#ffffff" },
  "Safe R":   { bg: "#be1c29", text: "#ffffff" },
};

export function getRatingColors(rating: string): { bg: string; text: string } {
  return RATING_COLORS[rating] ?? { bg: "#555", text: "#fff" };
}

export function marginToRating(margin: number): string {
  if (margin >= 15)  return "Safe R";
  if (margin >= 5)   return "Likely R";
  if (margin >= 1)   return "Lean R";
  if (margin >= 0)   return "Tilt R";
  if (margin > -1)   return "Tilt D";
  if (margin >= -5)  return "Lean D";
  if (margin >= -15) return "Likely D";
  return "Safe D";
}

// Keep old export for any remaining references
export function getStateColor(margin: number): string {
  return getRaceColor(margin);
}

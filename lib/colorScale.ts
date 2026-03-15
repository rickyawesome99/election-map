export function getRaceColor(prob: number): string {
  if (prob >= 0.85) return "#1a4480"; // Safe D
  if (prob >= 0.70) return "#4275b5"; // Likely D
  if (prob >= 0.55) return "#82b4f0"; // Lean D
  if (prob >= 0.45) return "#c8a800"; // Toss-up
  if (prob >= 0.30) return "#f08282"; // Lean R
  if (prob >= 0.15) return "#c04040"; // Likely R
  return "#8b1a1a";                   // Safe R
}

export function getRatingColors(rating: string): { bg: string; text: string } {
  if (rating.includes("Safe D") || rating.includes("Likely D") || rating.includes("Lean D")) {
    return { bg: "#1e3a5f", text: "#93c5fd" };
  }
  if (rating === "Toss-up") {
    return { bg: "#3d3200", text: "#fbbf24" };
  }
  return { bg: "#4a1515", text: "#fca5a5" };
}

// Keep old export for any remaining references
export function getStateColor(probability: number): string {
  return getRaceColor(probability);
}

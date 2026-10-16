// Diagonal stripes over a seat's projected colour mark a projected flip — the seat (or chamber)
// is projected to change hands from one party to the other. Shared by the forecast maps and the
// state legislatures control map so the convention reads the same everywhere.

const STRIPE = "rgba(255,255,255,0.5)";

export const flipPatternId = (color: string) => `flip-${color.replace(/[^0-9a-zA-Z]/g, "")}`;
export const flipFill = (color: string) => `url(#${flipPatternId(color)})`;

/** Pattern definitions for every base colour a map can stripe. Render inside the map's <svg>. */
export function FlipPatternDefs({ colors }: { colors: string[] }) {
  return (
    <defs>
      {[...new Set(colors)].map((color) => (
        <pattern key={color} id={flipPatternId(color)} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" style={{ fill: color }} />
          <rect width="2.5" height="6" fill={STRIPE} />
        </pattern>
      ))}
    </defs>
  );
}

/** The same stripes as a CSS background, for HTML swatches and boxes (no pattern needed). */
export const flipBackground = (color: string) => `repeating-linear-gradient(45deg, ${STRIPE} 0 1.5px, transparent 1.5px 4px), ${color}`;

/** Legend swatch (plain CSS, so it needs no pattern in the document). */
export function FlipSwatch({ size = 12, color = "#6e7781" }: { size?: number; color?: string }) {
  return (
    <span
      className="inline-block rounded-sm shrink-0"
      style={{ width: size, height: size, background: flipBackground(color) }}
    />
  );
}

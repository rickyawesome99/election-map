// The one content column for the detail pages: state, House/Senate/Governor race, past election
// and county pages. Same max width (56rem = 896px) and side padding everywhere, so every one of
// those pages has identical side margins at any window width. Change it here, not per page.
export const PAGE_CONTAINER = "max-w-4xl mx-auto px-4 sm:px-6";

// The top-level tabs' page titles (Overview, Forecast, Legislatures, Historical, TPL + Candidates,
// Analysis): one serif size, 36px on phones up to 48px on desktop, no kicker or pill above, and
// the same top padding in every header. Change it here, not per page.
export const PAGE_TITLE_STYLE = {
  fontFamily: "var(--font-serif)",
  fontSize: "clamp(2.25rem, 5vw, 3rem)",
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: "-0.02em",
} as const;
export const PAGE_HERO_TOP = "pt-5";

// Header backgrounds. Every tinted header on the site fades top-down: the colour is strongest under
// the nav bar and is gone by the foot of the header, so it never ends on a hard edge.
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, var(--app-bg))`;

/** One colour (a party, a candidate's accent, a projected margin's colour) for a detail page's header. */
export const heroTint = (color: string) =>
  `linear-gradient(to bottom, ${tint(color, 24)} 0%, ${tint(color, 11)} 50%, var(--app-bg) 100%)`;

/** The same fade with no party to show. */
export const HERO_NEUTRAL_BG = "linear-gradient(to bottom, var(--app-tab-bg) 0%, var(--app-bg) 100%)";

// The top-level tabs' header: both parties, Democrats on the left and Republicans on the right,
// under the same top-down fade.
export const PAGE_HERO_BG =
  `linear-gradient(to bottom, transparent 0%, var(--app-bg) 100%), linear-gradient(to right, ${tint("var(--party-dem)", 22)} 0%, ${tint("var(--party-rep)", 22)} 100%)`;

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

// The same tabs' header background: the red-to-blue party tint, faded into the page background
// over its lower half (the race pages' fade) so the header never ends on a hard edge.
export const PAGE_HERO_BG =
  "linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(105deg, color-mix(in srgb, var(--party-rep) 7%, var(--app-bg)) 0%, var(--app-bg) 48%, color-mix(in srgb, var(--party-dem) 6%, var(--app-bg)) 100%)";

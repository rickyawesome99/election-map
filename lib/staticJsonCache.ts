// Cache-Control for the build-time JSON slices under app/api (routes with `dynamic = "force-static"`).
//
// In production a slice only changes with a deploy, so the CDN keeps it for a year and a browser
// may show its stored copy while it checks for a newer one (stale-while-revalidate).
// On the dev server the slices are recomputed on every request, and that same header made the
// browser show the PREVIOUS figures on the first load after a model change (the fresh copy only
// appeared on the load after that). Dev sends no-store instead.
export const STATIC_JSON_CACHE = process.env.NODE_ENV === "development"
  ? "no-store"
  : "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400";
